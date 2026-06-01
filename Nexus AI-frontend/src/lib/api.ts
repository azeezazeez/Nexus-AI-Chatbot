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

export interface ProcessedFile {
  id: string;
  name: string;
  type: 'image' | 'text';
  content: string;
  mimeType: string;
  size: number;
  preview?: string;
}

/**
 * Wake up the Render server and wait for it to be ready.
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
      if (res.status !== 503 && res.status !== 502) return;
    } catch {
      // server still starting
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
}

/**
 * Converts HeadersInit to a plain object for safe manipulation.
 */
function normalizeHeaders(init?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {};
  if (!init) return result;
  if (init instanceof Headers) {
    init.forEach((value, key) => { result[key] = value; });
  } else if (Array.isArray(init)) {
    for (const [key, value] of init) {
      result[key] = value;
    }
  } else {
    Object.assign(result, init);
  }
  return result;
}

const attemptFetch = async (
  url: string,
  options: RequestInit,
  headers: Record<string, string>,
  retries: number
): Promise<Response> => {
  try {
    // Merge options with our forced credentials and headers
    const fetchOptions: RequestInit = {
      ...options,
      credentials: 'include',
      headers,
    };
    return await fetch(url, fetchOptions);
  } catch (err) {
    // Only retry on network errors (e.g., ECONNREFUSED, timeout)
    if (retries > 0 && !(err instanceof Response) && !(err as any)?.response) {
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
  const isFormData = options.body instanceof FormData;

  // Start with headers from options (converted to plain object)
  let headers = normalizeHeaders(options.headers);

  // Add Authorization if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Set Content-Type only for JSON requests (not for FormData)
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Remove any user‑set Content-Type for FormData to let browser add boundary
  if (isFormData && headers['Content-Type']) {
    delete headers['Content-Type'];
  }

  let response: Response;
  try {
    response = await attemptFetch(url, options, headers, 3);
  } catch (err) {
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
  logout: () => fetchWithAuth(`${API_BASE}/auth/logout`, { method: 'POST' }),
  getStatus: () => fetchWithAuth(`${API_BASE}/auth/status`),
  getProfile: () => fetchWithAuth(`${API_BASE}/auth/me`),
};

export const chatApi = {
  getSessions: () => fetchWithAuth(`${API_BASE}/chat/sessions`),
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

  // Text‑only send (JSON)
  sendMessage: (
    message: string,
    sessionId: number | null,
    signal?: AbortSignal,
    model?: string
  ) => {
    return fetchWithAuth(`${API_BASE}/chat/send`, {
      method: 'POST',
      signal,
      body: JSON.stringify({ message, sessionId, model }),
    });
  },

  // Multipart file upload send
  sendMessageWithFiles: async (
    message: string,
    sessionId: number | null,
    signal: AbortSignal,
    model: string,
    files: File[]
  ): Promise<unknown> => {
    const formData = new FormData();
    formData.append('message', message);
    if (sessionId !== null) formData.append('sessionId', String(sessionId));
    formData.append('model', model);
    for (const file of files) {
      formData.append('files', file);
    }

    return fetchWithAuth(`${API_BASE}/chat/send`, {
      method: 'POST',
      signal,
      body: formData,
    });
  },

  searchSessions: (query: string) =>
    fetchWithAuth(`${API_BASE}/chat/search?q=${encodeURIComponent(query)}`),

  shareSession: (sessionId: number) =>
    fetchWithAuth(`${API_BASE}/chat/session/${sessionId}/share`, {
      method: 'POST',
    }),
};
