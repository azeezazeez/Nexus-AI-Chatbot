/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const API_BASE = 'https://nexus-ai-chatbot-arhr.onrender.com/api';

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  // Some endpoints (like /status) intentionally return 401 — let callers handle it
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Allow /status 401 to pass through silently so callers can check auth state
    if (url.includes('/status') && response.status === 401) {
      return data;
    }
    const error = new Error(data.error || data.message || 'Something went wrong') as any;
    error.data = data;
    error.email = data.email;
    error.status = response.status;
    throw error;
  }

  return data;
}

export const authApi = {
  login: (data: any) =>
    fetchWithAuth(`${API_BASE}/auth/login`, { method: 'POST', body: JSON.stringify(data) }),

  signup: (data: any) =>
    fetchWithAuth(`${API_BASE}/auth/signup`, { method: 'POST', body: JSON.stringify(data) }),

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

  // NOTE: createSession is kept for any future direct use,
  // but Chat.tsx no longer calls it on "New Chat" —
  // the backend creates a session automatically on the first sendMessage.
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

  sendMessage: (message: string, sessionId: number | null) =>
    fetchWithAuth(`${API_BASE}/chat/send`, {
      method: 'POST',
      body: JSON.stringify({ message, sessionId }),
    }),

  // searchSessions is available for future use (e.g. a search UI),
  // but is intentionally NOT called on every keystroke.
  searchSessions: (query: string) =>
    fetchWithAuth(`${API_BASE}/chat/search?q=${encodeURIComponent(query)}`),
};
