/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const API_BASE = 'https://nexus-ai-chatbot-arhr.onrender.com/api';

type ApiError = Error & {
  data?: any;
  email?: string;
  status?: number;
};

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
) {
  const token = localStorage.getItem('auth_token');

  const headers: HeadersInit = {
    ...(options.headers || {}),
  };

  // Don't force Content-Type for FormData
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers,
    });
  } catch (networkError) {
    throw new Error(
      'Unable to connect to server. Please check your internet connection.'
    );
  }

  // Handle non-JSON responses safely
  let data: any = {};

  const contentType = response.headers.get('content-type');

  if (contentType?.includes('application/json')) {
    data = await response.json().catch(() => ({}));
  } else {
    const text = await response.text().catch(() => '');
    data = {
      message: text || 'Invalid server response',
    };
  }

  // Special handling for auth status endpoint
  if (!response.ok) {
    if (url.includes('/status') && response.status === 401) {
      return data;
    }

    const error: ApiError = new Error(
      data.error ||
        data.message ||
        `Request failed with status ${response.status}`
    );

    error.data = data;
    error.email = data.email;
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
      body: JSON.stringify({
        email: email.trim(),
      }),
    }),

  forgotPassword: (email: string) =>
    fetchWithAuth(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (
    email: string,
    otpCode: string,
    newPassword: string
  ) =>
    fetchWithAuth(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      body: JSON.stringify({
        email,
        otpCode,
        newPassword,
      }),
    }),

  logout: () =>
    fetchWithAuth(`${API_BASE}/auth/logout`, {
      method: 'POST',
    }),

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
    fetchWithAuth(`${API_BASE}/chat/new-session`, {
      method: 'POST',
    }),

  deleteSession: (sessionId: number) =>
    fetchWithAuth(`${API_BASE}/chat/session/${sessionId}`, {
      method: 'DELETE',
    }),

  renameSession: (
    sessionId: number,
    name: string
  ) =>
    fetchWithAuth(`${API_BASE}/chat/rename`, {
      method: 'PATCH',
      body: JSON.stringify({
        sessionId,
        name,
      }),
    }),

  generateTitle: (firstMessage: string) =>
    fetchWithAuth(`${API_BASE}/chat/generate-title`, {
      method: 'POST',
      body: JSON.stringify({
        firstMessage,
      }),
    }),

  clearSessions: () =>
    fetchWithAuth(`${API_BASE}/chat/sessions`, {
      method: 'DELETE',
    }),

  sendMessage: (
    message: string,
    sessionId: number | null,
    fileIds?: number[],
    signal?: AbortSignal,
    model?: string
  ) =>
    fetchWithAuth(`${API_BASE}/chat/send`, {
      method: 'POST',
      signal,
      body: JSON.stringify({
        message,
        sessionId,
        fileIds,
        model,
      }),
    }),

  searchSessions: (query: string) =>
    fetchWithAuth(
      `${API_BASE}/chat/search?q=${encodeURIComponent(query)}`
    ),

  uploadFile: async (file: File) => {
    const MAX_SIZE = 10 * 1024 * 1024;

    if (file.size > MAX_SIZE) {
      throw new Error(
        `File too large. Maximum size is 10MB. Your file is ${(
          file.size /
          1024 /
          1024
        ).toFixed(2)}MB`
      );
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error(
        `File type not allowed. Allowed types: ${allowedTypes.join(
          ', '
        )}`
      );
    }

    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('auth_token');

    const headers: HeadersInit = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response: Response;

    try {
      response = await fetch(
        `${API_BASE}/files/upload`,
        {
          method: 'POST',
          headers,
          credentials: 'include',
          body: formData,
        }
      );
    } catch (networkError) {
      throw new Error(
        'File upload failed. Please check your connection.'
      );
    }

    let data: any = {};

    const contentType =
      response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      data = await response.json().catch(() => ({}));
    } else {
      const text = await response.text().catch(() => '');
      data = {
        message: text || 'Invalid upload response',
      };
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
          data.message ||
          `Upload failed with status ${response.status}`
      );
    }

    return {
      success: true,
      file: data.file,
      message:
        data.message || 'Upload successful',
    };
  },
};
