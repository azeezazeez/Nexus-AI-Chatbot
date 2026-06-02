const API_BASE = 'https://nexus-ai-chatbot-arhr.onrender.com/api';

const CHAT_RETRIES   = 6;      
const RETRY_DELAY_MS = 5_000;   
const WAKE_ATTEMPTS  = 8;     
const WAKE_DELAY_MS  = 4_000;   

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
 * Delay that cancels immediately when the AbortSignal fires.
 *
 * KEY FIX: The old code had no abort-aware delay, so once a 503 retry loop
 * started, clicking "Stop" didn't cancel the in-progress wait. This fixes
 * that — the delay rejects with AbortError the instant the signal fires.
 */
const signalAwareDelay = (ms: number, signal?: AbortSignal | null): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });

/**
 * Wake up the Render server and wait for it to be ready.
 * Called once on mount via loadSessions(); individual endpoints handle
 * their own retries via attemptFetch.
 */
export async function wakeUpServer(): Promise<void> {
  for (let attempt = 1; attempt <= WAKE_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/chat/status`, {
        credentials: 'include',
        signal: AbortSignal.timeout(8_000),
      });
      if (res.status !== 503 && res.status !== 502) return; // server is up ✓
    } catch {
      // server still starting — swallow and continue polling
    }
    if (attempt < WAKE_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, WAKE_DELAY_MS));
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
    for (const [key, value] of init) result[key] = value;
  } else {
    Object.assign(result, init);
  }
  return result;
}

/**
 * Core fetch with automatic retry.
 *
 * KEY FIX: Previously the function only retried inside `catch` (network
 * errors). But Render's cold-start returns a valid HTTP 503 response —
 * which never triggers `catch`. This version explicitly checks for 503/502
 * and retries with a delay, identical to how it handles network errors.
 *
 * Two retry triggers:
 *   1. HTTP 503 / 502  — Render's proxy response before Spring Boot is up.
 *                        Uses RETRY_DELAY_MS (5s) between attempts.
 *   2. Network errors  — ECONNREFUSED, timeout, etc.
 *                        Uses a 3s delay between attempts.
 *
 * Both paths respect the AbortSignal via signalAwareDelay and cancel the
 * moment the user clicks "Stop".
 */
const attemptFetch = async (
  url: string,
  options: RequestInit,
  headers: Record<string, string>,
  retries: number
): Promise<Response> => {
  const signal = options.signal as AbortSignal | null | undefined;

  try {
    const response = await fetch(url, { ...options, credentials: 'include', headers });

    // ── KEY FIX ──────────────────────────────────────────────────────────
    // Render cold-start: infrastructure returns 503/502 before Spring Boot
    // handles anything. The old code fell through to !response.ok and threw
    // immediately. Now we wait and retry, just like a network error.
    if ((response.status === 503 || response.status === 502) && retries > 0) {
      await signalAwareDelay(RETRY_DELAY_MS, signal);
      return attemptFetch(url, options, headers, retries - 1);
    }
    // ─────────────────────────────────────────────────────────────────────

    return response;
  } catch (err: any) {
    // Never retry an intentional abort — bubble it up immediately
    if (err?.name === 'AbortError') throw err;

    if (retries > 0) {
      await signalAwareDelay(3_000, signal);
      return attemptFetch(url, options, headers, retries - 1);
    }
    throw err;
  }
};

/**
 * Authenticated fetch wrapper.
 *
 * @param retries - How many times to retry on 503/502 or network errors.
 *                  Default 3 for auth/session calls; CHAT_RETRIES (6) for
 *                  chat send — giving the server up to 30s to wake up.
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  retries = 3
): Promise<unknown> {
  const token = localStorage.getItem('auth_token');
  const isFormData = options.body instanceof FormData;

  let headers = normalizeHeaders(options.headers);

  if (token) headers['Authorization'] = `Bearer ${token}`;

  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Let the browser set Content-Type + boundary for FormData
  if (isFormData && headers['Content-Type']) {
    delete headers['Content-Type'];
  }

  let response: Response;
  try {
    response = await attemptFetch(url, options, headers, retries);
  } catch (err: any) {
    // Propagate aborts so Chat.tsx can handle them cleanly
    if (err?.name === 'AbortError') throw err;
    throw new Error('Server is starting up, please wait a moment and try again.');
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

  /**
   * Text-only chat message.
   *
   * KEY FIX: passes CHAT_RETRIES (6) so fetchWithAuth → attemptFetch will
   * automatically retry 503s for up to 30 seconds, transparently surviving
   * Render's cold-start window without showing an error to the user.
   */
  sendMessage: (
    message: string,
    sessionId: number | null,
    signal?: AbortSignal,
    model?: string
  ) =>
    fetchWithAuth(
      `${API_BASE}/chat/send`,
      {
        method: 'POST',
        signal,
        body: JSON.stringify({ message, sessionId, model }),
      },
      CHAT_RETRIES // <── KEY FIX: was missing, so retries defaulted to 3 with no 503 handling
    ),

  /**
   * Multipart chat message with file attachments.
   * Same cold-start retry tolerance as sendMessage.
   */
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
    for (const file of files) formData.append('files', file);

    return fetchWithAuth(
      `${API_BASE}/chat/send`,
      { method: 'POST', signal, body: formData },
      CHAT_RETRIES // <── KEY FIX: same as sendMessage
    );
  },

  searchSessions: (query: string) =>
    fetchWithAuth(`${API_BASE}/chat/search?q=${encodeURIComponent(query)}`),

  shareSession: (sessionId: number) =>
    fetchWithAuth(`${API_BASE}/chat/session/${sessionId}/share`, {
      method: 'POST',
    }),
};
