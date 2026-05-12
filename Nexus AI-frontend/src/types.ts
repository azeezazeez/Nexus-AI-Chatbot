/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
}

export interface Session {
  id: number;
  sessionName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string | number;
  sessionId: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface UploadedFile {
  id: number;
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  isImage?: boolean; // Optional: whether the file is an image
}
