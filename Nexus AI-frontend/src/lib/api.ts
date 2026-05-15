/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const API_BASE = 'https://nexus-ai-chatbot-arhr.onrender.com/api';

type ApiError = Error & {
  data?: unknown;
  email?: string;
  status?: number;
};

/**
 * Wake up the Render server and WAIT for it to be ready.
 * Returns a Promise so callers can await it before making API calls.
 * Previously this was fire-and-forget (void), which caused getSessions()
 * to fire before the server was awake → 401 → logout on refresh.
 */
export async function wakeUpServer(): Promise<void> {
  const MAX_ATTEMPTS = 5;
  const DELAY_MS = 3000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/chat/status`, {
        credentials: 'include',
        signal: AbortSignal.timeout(8000),
      });
      // Any response (including 401) means the server is awake
      if (res.status !== 503 && res.status !== 502) return;
    } catch {
      // Network error or timeout — server still starting
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise<void>(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
  // Give up waiting — proceed anyway and let individual calls handle errors
}

const attemptFetch = async (
  url: string,
  options: RequestInit,
  headers: HeadersInit,
  retries: number
): Promise<Response> => {
  try {
    return await fetch(url, { ...options, credentials: 'include', headers });
  } catch (err) {
    if (retries > 0) {
      await new Promise(res => setTimeout(res, 3000));
      return attemptFetch(url, options, headers, retries - 1);
    }
    throw err;
  }
};

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<unknown> {
  const token = localStorage.getItem('auth_token');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await attemptFetch(url, options, headers, 3);
  } catch {
    throw new Error(
      'Server is starting up, please wait a moment and try again.'
    );
  }

  let data: Record<string, unknown> = {};
  const contentType = response.headers.get('content-type');

  if (contentType?.includes('application/json')) {
    data = await response.json().catch(() => ({}));
  } else {
    const text = await response.text().catch(() => '');
    data = { message: text || 'Invalid server response' };
  }

  if (!response.ok) {
    const error: ApiError = new Error(
      (data.error as string) ||
        (data.message as string) ||
        `Request failed with status ${response.status}`
    );

    error.data = data;
    error.email = data.email as string | undefined;
    error.status = response.status;

    throw error;
  }

  return data;
}

export const authApi = {
  login: (data: unknown) =>
    fetchWithAuth(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  signup: (data: unknown) =>
    fetchWithAuth(`${API_BASE}/auth/signup`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  verifyOtp: (email: string, otpCode: string) =>
    fetchWithAuth(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      body: JSON.stringify({ email, otpCode }),
    }),

  resendOtp: (email: string) =>
    fetchWithAuth(`${API_BASE}/auth/resend-otp`, {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() }),
    }),

  forgotPassword: (email: string) =>
    fetchWithAuth(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (email: string, otpCode: string, newPassword: string) =>
    fetchWithAuth(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ email, otpCode, newPassword }),
    }),

  logout: () =>
    fetchWithAuth(`${API_BASE}/auth/logout`, { method: 'POST' }),

  getStatus: () =>
    fetchWithAuth(`${API_BASE}/auth/status`),

  getProfile: () =>
    fetchWithAuth(`${API_BASE}/auth/me`),
};

export const chatApi = {
  getSessions: () =>
    fetchWithAuth(`${API_BASE}/chat/sessions`),

  getMessages: (sessionId: number) =>
    fetchWithAuth(`${API_BASE}/chat/history/${sessionId}`),

  createSession: () =>
    fetchWithAuth(`${API_BASE}/chat/new-session`, { method: 'POST' }),

  deleteSession: (sessionId: number) =>
    fetchWithAuth(`${API_BASE}/chat/session/${sessionId}`, { method: 'DELETE' }),

  renameSession: (sessionId: number, name: string) =>
    fetchWithAuth(`${API_BASE}/chat/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ sessionId, name }),
    }),

  generateTitle: (firstMessage: string) =>
    fetchWithAuth(`${API_BASE}/chat/generate-title`, {
      method: 'POST',
      body: JSON.stringify({ firstMessage }),
    }),

  clearSessions: () =>
    fetchWithAuth(`${API_BASE}/chat/sessions`, { method: 'DELETE' }),

  sendMessage: (
    message: string,
    sessionId: number | null,
    signal?: AbortSignal,
    model?: string
  ) =>
    fetchWithAuth(`${API_BASE}/chat/send`, {
      method: 'POST',
      signal,
      body: JSON.stringify({ message, sessionId, model }),
    }),

  searchSessions: (query: string) =>
    fetchWithAuth(`${API_BASE}/chat/search?q=${encodeURIComponent(query)}`),

  shareSession: (sessionId: number) =>
    fetchWithAuth(`${API_BASE}/chat/session/${sessionId}/share`, {
      method: 'POST',
    }),
};
