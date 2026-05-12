/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const API_BASE = 'https://nexus-ai-chatbot-arhr.onrender.com/api';

export async function fetchWithAuth(url, options = {}) {
  const fetchUrl = url;
  
  const token = localStorage.getItem('auth_token');
  const headers = {
    ...(options.headers || {}),
  };

  // Only set Content-Type for non-FormData requests
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(fetchUrl, {
      ...options,
      credentials: 'include',
      headers,
    });

    // Handle empty responses
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
      if (url.includes('/status') && response.status === 401) {
        return data;
      }
      const error = new Error(data.error || data.message || 'Something went wrong');
      error.data = data;
      error.email = data.email;
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

export const authApi = {
  login: (data) => fetchWithAuth(`${API_BASE}/auth/login`, { method: 'POST', body: JSON.stringify(data) }),
  signup: (data) => fetchWithAuth(`${API_BASE}/auth/signup`, { method: 'POST', body: JSON.stringify(data) }),
  verifyOtp: (email, otpCode) => fetchWithAuth(`${API_BASE}/auth/verify-otp`, { method: 'POST', body: JSON.stringify({ email, otpCode }) }),
  resendOtp: (email) => fetchWithAuth(`${API_BASE}/auth/resend-otp`, { method: 'POST', body: JSON.stringify({ email: email.trim() }) }),
  forgotPassword: (email) => fetchWithAuth(`${API_BASE}/auth/forgot-password`, { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (email, otpCode, newPassword) => fetchWithAuth(`${API_BASE}/auth/reset-password`, { method: 'POST', body: JSON.stringify({ email, otpCode, newPassword }) }),
  logout: () => fetchWithAuth(`${API_BASE}/auth/logout`, { method: 'POST' }),
  getStatus: () => fetchWithAuth(`${API_BASE}/auth/status`),
  getProfile: () => fetchWithAuth(`${API_BASE}/auth/me`),
};

export const chatApi = {
  getSessions: () => fetchWithAuth(`${API_BASE}/chat/sessions`),
  getMessages: (sessionId) => fetchWithAuth(`${API_BASE}/chat/history/${sessionId}`),
  createSession: () => fetchWithAuth(`${API_BASE}/chat/new-session`, { method: 'POST' }),
  deleteSession: (sessionId) => fetchWithAuth(`${API_BASE}/chat/session/${sessionId}`, { method: 'DELETE' }),
  renameSession: (sessionId, name) => fetchWithAuth(`${API_BASE}/chat/rename`, { method: 'PATCH', body: JSON.stringify({ sessionId, name }) }),
  generateTitle: (firstMessage) => fetchWithAuth(`${API_BASE}/chat/generate-title`, { method: 'POST', body: JSON.stringify({ firstMessage }) }),
  clearSessions: () => fetchWithAuth(`${API_BASE}/chat/sessions`, { method: 'DELETE' }),
  sendMessage: (message, sessionId, fileIds, signal, model) => 
    fetchWithAuth(`${API_BASE}/chat/send`, { 
      method: 'POST', 
      body: JSON.stringify({ message, sessionId, fileIds, model }),
      signal
    }),
  searchSessions: (query) => fetchWithAuth(`${API_BASE}/chat/search?q=${encodeURIComponent(query)}`),
  
  uploadFile: async (file) => {
    // Frontend validation
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      throw new Error(`File too large. Maximum size is 10MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`File type not allowed. Allowed: ${allowedTypes.join(', ')}`);
    }

    const formData = new FormData();
    formData.append('file', file);
    
    const token = localStorage.getItem('auth_token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        headers: headers,
        credentials: 'include',
        body: formData,
      });

      // Handle response properly
      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        data = { error: 'Invalid response from server' };
      }
      
      if (!response.ok) {
        const errorMsg = data.error || data.message || `Upload failed with status ${response.status}`;
        throw new Error(errorMsg);
      }
      
      // Check if response has the expected structure
      if (!data.file) {
        console.warn('Unexpected response structure:', data);
      }
      
      return {
        file: data.file || data,
        success: true,
        message: data.message || 'Upload successful'
      };
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  },
};

// Export a function to check API health
export const checkApiHealth = async () => {
  try {
    const response = await fetch(`${API_BASE.replace('/api', '')}/api/files/health`);
    const data = await response.json();
    return { status: 'ok', data };
  } catch (error) {
    console.error('API health check failed:', error);
    return { status: 'error', error: error.message };
  }
};

// Export a function to get the API base URL (useful for debugging)
export const getApiBaseUrl = () => API_BASE;
