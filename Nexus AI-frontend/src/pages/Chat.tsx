/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const isProduction =
  typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1';

/*
 * IMPORTANT:
 *
 * Production:
 *   Browser -> Vercel /api -> Render backend
 *
 * Development:
 *   Browser -> Render backend directly
 *
 * Using /api in production makes the browser request same-origin,
 * which prevents mobile browsers from treating the authentication
 * cookie as a third-party cross-site cookie.
 */
const API_BASE = isProduction
  ? '/api'
  : 'https://nexus-ai-chatbot-arhr.onrender.com/api';

type ApiError = Error & {
  status?: number;
  data?: unknown;
};

const createApiError = (
  message: string,
  status?: number,
  data?: unknown
): ApiError => {
  const error = new Error(message) as ApiError;
  error.status = status;
  error.data = data;
  return error;
};

const parseResponse = async (response: Response): Promise<any> => {
  const contentType = response.headers.get('content-type') || '';

  let data: any;

  try {
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text };
      }
    }
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      data?.details ||
      `Request failed with status ${response.status}`;

    throw createApiError(message, response.status, data);
  }

  return data;
};

const request = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<any> => {
  const headers = new Headers(options.headers);

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,

    /*
     * Keep cookies enabled.
     *
     * In production the request is same-origin through Vercel.
     */
    credentials: 'include',

    headers,

    cache: 'no-store',
  });

  return parseResponse(response);
};

/* ─────────────────────────────────────────────────────────────
 * Wake Render server
 * ───────────────────────────────────────────────────────────── */

export const wakeUpServer = async (): Promise<void> => {
  try {
    await fetch(`${API_BASE}/health`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    /*
     * Render may still be waking up.
     * The actual API request handles the real error.
     */
  }
};

/* ─────────────────────────────────────────────────────────────
 * Auth API
 * ───────────────────────────────────────────────────────────── */

export const authApi = {
  async login(username: string, password: string) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password,
      }),
    });
  },

  async signup(data: {
    username: string;
    email: string;
    password: string;
    [key: string]: unknown;
  }) {
    return request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async verifyOtp(email: string, otp: string) {
    return request('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({
        email,
        otp,
      }),
    });
  },

  async resendOtp(email: string) {
    return request('/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify({
        email,
      }),
    });
  },

  async forgotPassword(email: string) {
    return request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({
        email,
      }),
    });
  },

  async resetPassword(
    email: string,
    otp: string,
    newPassword: string
  ) {
    return request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email,
        otp,
        newPassword,
      }),
    });
  },

  async status() {
    return request('/auth/status', {
      method: 'GET',
    });
  },

  async me() {
    return request('/auth/me', {
      method: 'GET',
    });
  },

  async logout() {
    return request('/auth/logout', {
      method: 'POST',
    });
  },
};

/* ─────────────────────────────────────────────────────────────
 * Chat API
 * ───────────────────────────────────────────────────────────── */

export const chatApi = {
  async getSessions() {
    return request('/chat/sessions', {
      method: 'GET',
    });
  },

  async getMessages(sessionId: number) {
    return request(`/chat/history/${sessionId}`, {
      method: 'GET',
    });
  },

  async createSession() {
    return request('/chat/new-session', {
      method: 'POST',
    });
  },

  async deleteSession(sessionId: number) {
    return request(`/chat/session/${sessionId}`, {
      method: 'DELETE',
    });
  },

  async renameSession(sessionId: number, name: string) {
    return request(`/chat/session/${sessionId}/rename`, {
      method: 'PUT',
      body: JSON.stringify({
        name,
      }),
    });
  },

  async generateTitle(message: string) {
    return request('/chat/generate-title', {
      method: 'POST',
      body: JSON.stringify({
        message,
      }),
    });
  },

  async clearSessions() {
    return request('/chat/sessions/clear', {
      method: 'DELETE',
    });
  },

  async searchSessions(query: string) {
    return request(
      `/chat/search?query=${encodeURIComponent(query)}`,
      {
        method: 'GET',
      }
    );
  },

  /*
   * Normal text chat.
   *
   * IMPORTANT:
   * Do not send `model` because ChatRequest on your Spring backend
   * does not contain a model field.
   */
  async sendMessage(
    message: string,
    sessionId: number | null,
    signal?: AbortSignal,
    _model?: string
  ) {
    return request('/chat/send', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        message,
        sessionId,
      }),
    });
  },

  /*
   * File upload.
   *
   * Keep this as multipart because the backend expects uploaded files.
   */
  async sendMessageWithFiles(
    message: string,
    sessionId: number | null,
    signal?: AbortSignal,
    _model?: string,
    files: File[] = []
  ) {
    const formData = new FormData();

    formData.append('message', message);

    if (sessionId !== null && sessionId !== undefined) {
      formData.append('sessionId', String(sessionId));
    }

    files.forEach((file) => {
      formData.append('files', file);
    });

    return request('/chat/send-with-files', {
      method: 'POST',
      signal,
      body: formData,
    });
  },
};

export default {
  authApi,
  chatApi,
  wakeUpServer,
};
