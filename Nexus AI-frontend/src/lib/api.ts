/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Auth strategy: Spring HttpSession (cookie-based).
 * The backend sets a JSESSIONID cookie on login.
 * All requests send credentials: 'include' so the browser
 * attaches that cookie automatically — NO Bearer token needed.
 */

const API_BASE = 'https://nexus-ai-chatbot-arhr.onrender.com/api';

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
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
    fetchWithAuth(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  signup: (data: any) =>
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
    fileIds?: string[],
    signal?: AbortSignal
  ) =>
    fetchWithAuth(`${API_BASE}/chat/send`, {
      method: 'POST',
      body: JSON.stringify({ message, sessionId, fileIds: fileIds || [] }),
      signal,
    }),

  searchSessions: (query: string) =>
    fetchWithAuth(`${API_BASE}/chat/search?q=${encodeURIComponent(query)}`),

  // ── File Upload ──────────────────────────────────────────────────────────
  uploadFile: async (file: File): Promise<{ file: UploadedFile }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/files/upload`, {
      method: 'POST',
      credentials: 'include',
      // ⚠️ Do NOT set Content-Type header here — browser sets it with boundary
      body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.error || 'Upload failed') as any;
      error.status = response.status;
      throw error;
    }

    return data;
  },
};

// ── Types ────────────────────────────────────────────────────────────────────
export interface UploadedFile {
  id: string;
  originalName: string;
  fileName: string;
  contentType: string;
  size: number;
  url: string;
  isImage: boolean;
}
