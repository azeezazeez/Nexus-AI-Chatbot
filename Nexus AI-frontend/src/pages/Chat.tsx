import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { User, Session, Message } from '../types';
import Sidebar from '../components/Sidebar';
import { chatApi, authApi, wakeUpServer } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import StormLogo from '../components/StormLogo';
import UserAvatar from '../components/UserAvatar';
import ConfirmationModal from '../components/ConfirmationModal';

import {
  ArrowDown, ArrowUp,
  Copy, Check, Edit2, Sun, Moon, Menu,
  X, RotateCcw,
} from 'lucide-react';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
  user: User;
  onLogout: () => void;
}

const CodeBlock = ({ language, value }: { language: string; value: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="group/code relative my-6 overflow-hidden rounded-xl border border-white/20 dark:border-white/10 shadow-2xl backdrop-blur-xl bg-white/5 dark:bg-black/20 transition-all">
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/10 dark:bg-black/20 border-b border-white/10">
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px] font-black text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all hover:scale-105 active:scale-95"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          <span className="uppercase tracking-widest">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-0 bg-[#282c34]">
        <SyntaxHighlighter
          style={oneDark}
          language={language || 'text'}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: '1.25rem',
            fontSize: '0.85rem',
            background: 'transparent',
            lineHeight: '1.6',
          }}
        >
          {value}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

const BlinkingCursor = () => (
  <motion.span
    animate={{ opacity: [1, 0, 1] }}
    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    className="inline-block w-[2px] h-[1.1em] bg-indigo-500 align-middle ml-0.5 rounded-full"
    style={{ verticalAlign: 'text-bottom' }}
  />
);

const SESSION_KEY = 'scout_current_session_id';
const SESSIONS_CACHE_PREFIX = 'nexus_sessions_cache_v4_';
const MESSAGES_CACHE_PREFIX = 'nexus_messages_cache_v3_';

const normalizeSessionId = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const normalizeSessions = (value: unknown): Session[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw: any) => {
      const id = normalizeSessionId(raw?.id ?? raw?.sessionId);
      if (id === null) return null;
      return { ...raw, id } as Session;
    })
    .filter(Boolean) as Session[];
};

const getSessionsCacheKey = (userId: string | number | undefined) =>
  `${SESSIONS_CACHE_PREFIX}${String(userId ?? 'unknown')}`;

const readCachedSessions = (userId?: string | number): Session[] => {
  if (userId === undefined || userId === null) return [];
  try {
    return normalizeSessions(
      JSON.parse(localStorage.getItem(getSessionsCacheKey(userId)) || '[]')
    );
  } catch {
    return [];
  }
};

const cacheSessions = (userId: string | number | undefined, sessions: Session[]) => {
  if (userId === undefined || userId === null) return;
  try {
    localStorage.setItem(getSessionsCacheKey(userId), JSON.stringify(sessions));
  } catch {}
};

const readCachedMessages = (sessionId: number): Message[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(`${MESSAGES_CACHE_PREFIX}${sessionId}`) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const cacheMessages = (sessionId: number | null, messages: Message[]) => {
  if (sessionId === null) return;
  try {
    localStorage.setItem(`${MESSAGES_CACHE_PREFIX}${sessionId}`, JSON.stringify(messages));
  } catch {}
};

const persistSessionId = (id: number | null) => {
  if (id === null) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, String(id));
};
const readPersistedSessionId = (): number | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
};

const getInitialTheme = (): boolean => {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem('theme');
  if (stored) return stored === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

export default function Chat({ user, onLogout }: Props) {
  const [sessions, setSessions] = useState<Session[]>(() => readCachedSessions(user?.id));
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(readPersistedSessionId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [justFinished, setJustFinished] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string | number; content: string } | null>(null);
  const [editInput, setEditInput] = useState('');
  const [modalType, setModalType] = useState<'none' | 'delete-all' | 'delete-single'>('none');
  const [sessionIdToDelete, setSessionIdToDelete] = useState<number | null>(null);
  const [serverWaking, setServerWaking] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // File upload (UI removed, but state kept to avoid breaking existing logic)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{ id: string; file: File; preview?: string }[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [messageAttachments, setMessageAttachments] = useState<Record<string | number, string[]>>({});

  // Speech recognition (UI removed)
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const speechBaseRef = useRef('');

  // Theme
  const [isDark, setIsDark] = useState<boolean>(() => {
    const dark = getInitialTheme();
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', dark);
    }
    return dark;
  });

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Keeps the just-sent message visible below the fixed navbar on mobile/tablet.
  const pendingUserMessageRef = useRef<string | number | null>(null);
  const isSendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Stores the specific session ID that should skip one message load
  // (the newly created session after first send), so switching to any
  // OTHER existing session always loads its messages correctly.
  const skipMessageLoadRef = useRef<number | null>(null);
  const pendingSessionRef = useRef<number | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  // Clean up object URLs
  const filePreviewsRef = useRef(filePreviews);
  useEffect(() => { filePreviewsRef.current = filePreviews; }, [filePreviews]);
  useEffect(() => {
    return () => {
      filePreviewsRef.current.forEach(fp => {
        if (fp.preview) URL.revokeObjectURL(fp.preview);
      });
    };
  }, []);

  // Speech recognition handlers (kept but never called from UI)
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Your browser does not support speech recognition. Please use Chrome, Edge, or Safari.');
      return;
    }
    if (recognitionRef.current) recognitionRef.current.stop();
    speechBaseRef.current = inputRef.current?.value || '';

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      let finalSegment = '';
      let interimSegment = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalSegment += event.results[i][0].transcript;
        else interimSegment += event.results[i][0].transcript;
      }
      if (finalSegment) {
        speechBaseRef.current = speechBaseRef.current
          ? `${speechBaseRef.current} ${finalSegment}`.trim()
          : finalSegment.trim();
      }
      const display = interimSegment
        ? `${speechBaseRef.current} ${interimSegment}`.trim()
        : speechBaseRef.current;
      setInput(display);
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = (event: any) => {
      console.error('Speech error:', event.error);
      setIsListening(false);
      recognitionRef.current = null;
      if (event.error === 'not-allowed') alert('Microphone access denied.');
      else if (event.error === 'network') alert('Network error occurred.');
    };
    recognitionRef.current = recognition;
    recognition.start();
    inputRef.current?.focus();
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  // Switch the local session cache when the authenticated user changes.
  useEffect(() => {
    const cached = readCachedSessions(user?.id);
    setSessions(cached);
  }, [user?.id]);

  // Load sessions & messages
  const loadSessions = useCallback(async (preferredSession?: Session, allowAuthoritativeEmpty = false) => {
    try {
      wakeUpServer();
      const response = await chatApi.getSessions() as any;
      const authenticated = response?.authenticated !== false;
      const serverSessions = normalizeSessions(
        Array.isArray(response) ? response : (response?.sessions || [])
      );

      setSessions(prev => {
        // A 200 response with authenticated:false is NOT an instruction to
        // erase the local chat list. Keep the user's last known sessions
        // visible while the browser/server session is being restored.
        if (!authenticated) {
          return prev.length > 0 ? prev : readCachedSessions(user?.id);
        }

        let next = serverSessions;

        // Immediately preserve a just-created session if the backend's list
        // endpoint is briefly eventually-consistent. It will be replaced by
        // the authoritative server record on the next successful refresh.
        if (preferredSession && !next.some(s => s.id === preferredSession.id)) {
          const existing = prev.find(s => s.id === preferredSession.id);
          next = [existing || preferredSession, ...next];
        }

        // If the server says authenticated=true but briefly returns an empty
        // list, do not erase a known-good list. A preferred newly-created
        // session is still preserved above.
        if (next.length === 0 && prev.length > 0 && !allowAuthoritativeEmpty) {
          next = prev;
        }

        cacheSessions(user?.id, next);
        if (pendingSessionRef.current !== null && next.some(s => s.id === pendingSessionRef.current)) {
          pendingSessionRef.current = null;
        }
        return next;
      });
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
      // Keep cached/server-confirmed sessions visible during a transient
      // mobile network failure instead of replacing them with an empty list.
      setSessions(prev => prev.length ? prev : readCachedSessions(user?.id));
      if (err?.status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  }, [onLogout, user?.id]);

  const loadMessages = useCallback(async (sid: number) => {
    const normalizedSid = normalizeSessionId(sid);
    if (normalizedSid === null) return;

    const cached = readCachedMessages(normalizedSid);
    if (cached.length > 0) setMessages(cached);

    try {
      const response = await chatApi.getMessages(normalizedSid) as any;
      const serverMessages = Array.isArray(response?.messages) ? response.messages : [];
      setMessages(serverMessages);
      cacheMessages(normalizedSid, serverMessages);
    } catch (err: any) {
      console.error('Failed to load messages:', err);
      if (err?.status === 401) onLogout();
    }
  }, [onLogout]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (loading) return;
    if (currentSessionId !== null) {
      const stillExists = sessions.some(s => s.id === currentSessionId);
      // Do not clear a newly-created session while the server's sessions
      // endpoint is catching up. loadSessions(preferredSession) will confirm it.
      if (!stillExists && pendingSessionRef.current !== currentSessionId) {
        setCurrentSessionId(null);
        persistSessionId(null);
        setMessages([]);
      }
    }
  }, [sessions, loading]);

  // Only skip loading messages if the currentSessionId exactly matches the
  // ID we marked to skip (the newly created session). Any other session --
  // including ones selected on mobile -- always loads.
  useEffect(() => {
    if (currentSessionId) {
      const normalizedSid = normalizeSessionId(currentSessionId);
      if (normalizedSid === null) {
        setCurrentSessionId(null);
        persistSessionId(null);
        setMessages([]);
        return;
      }
      if (skipMessageLoadRef.current === normalizedSid) {
        // This is the new session we just created inline — messages are
        // already in state from the sendMessage flow, so skip the fetch.
        skipMessageLoadRef.current = null;
        return;
      }
      loadMessages(normalizedSid);
    } else {
      setMessages([]);
    }
  }, [currentSessionId, loadMessages]);

  // Scroll only the chat panel. Never use scrollIntoView(), because it can
  // move the page itself and hide the fixed navbar/composer on mobile.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const frame = requestAnimationFrame(() => {
      const pendingId = pendingUserMessageRef.current;
      if (pendingId !== null) {
        const target = container.querySelector<HTMLElement>(
          `[data-message-id=\"${String(pendingId).replace(/\"/g, '')}\"]`
        );
        if (target) {
          const containerRect = container.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const safeTop = containerRect.top + 12;
          const safeBottom = containerRect.bottom - 12;

          // The message scroller already starts below the fixed navbar.
          // Never subtract a second navbar offset here.
          if (targetRect.top < safeTop) {
            container.scrollTop -= safeTop - targetRect.top;
          } else if (targetRect.bottom > safeBottom) {
            container.scrollTop += targetRect.bottom - safeBottom;
          }
        }
        pendingUserMessageRef.current = null;
        return;
      }

      // While an answer is streaming, keep the newest answer visible only if
      // the user was already near the bottom. This prevents a long response
      // from immediately pushing the sent message under the navbar.
      if (isTyping) {
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom < 180) {
          container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
        }
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [messages, isTyping]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 100);
  };

  // File handlers (kept but no UI to trigger them)
  const handleFileSelection = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessingFiles(true);
    const newFiles = Array.from(files);
    const newPreviews = await Promise.all(
      newFiles.map(async (file) => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      }))
    );
    setFilePreviews(prev => [...prev, ...newPreviews]);
    setSelectedFiles(prev => [...prev, ...newFiles]);
    setIsProcessingFiles(false);
  };

  const removeFile = (id: string) => {
    const removed = filePreviews.find(fp => fp.id === id);
    if (removed?.preview) URL.revokeObjectURL(removed.preview);
    setFilePreviews(prev => prev.filter(fp => fp.id !== id));
    setSelectedFiles(prev => prev.filter((_, idx) => {
      const removedFile = removed?.file;
      return removedFile ? prev[idx] !== removedFile : true;
    }));
  };

  const sendMessage = async (
    messageText: string,
    messagesSnapshot?: Message[],
    filesToSend?: File[],
    previewUrls?: string[],
    regenerateTitle = false
  ) => {
    if ((!messageText.trim() && (!filesToSend || filesToSend.length === 0))) return;
    if (isSendingRef.current) return;
    if (isListening) stopListening();

    isSendingRef.current = true;
    setIsTyping(true);
    setJustFinished(false);
    setServerWaking(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const tempId = `temp-${Date.now()}`;
    const tempUserMsg: Message = {
      id: tempId,
      sessionId: currentSessionId || 0,
      role: 'user',
      content: messageText.trim() || (filesToSend?.some(f => f.type.startsWith('image/')) ? 'Image uploaded' : ''),
      timestamp: new Date().toISOString(),
    };

    pendingUserMessageRef.current = tempId;
    if (messagesSnapshot) setMessages([...messagesSnapshot, tempUserMsg]);
    else setMessages(prev => [...prev, tempUserMsg]);

    if (previewUrls && previewUrls.length > 0) {
      setMessageAttachments(prev => ({ ...prev, [tempId]: previewUrls }));
    }

    setInput('');
    setSelectedFiles([]);
    setFilePreviews([]);

    const isNewSession = !currentSessionId;
    const wakingTimer = setTimeout(() => {
      if (isSendingRef.current) setServerWaking(true);
    }, 10000);

    try {
      let response: any;
      const hasFiles = filesToSend && filesToSend.length > 0;
      const finalMessage = messageText.trim() || (hasFiles && filesToSend.some(f => f.type.startsWith('image/')) ? 'Image uploaded' : '');

      if (hasFiles) {
        response = await chatApi.sendMessageWithFiles(
          finalMessage,
          currentSessionId,
          controller.signal,
          'default',
          filesToSend
        );
      } else {
        response = await chatApi.sendMessage(
          finalMessage,
          currentSessionId,
          controller.signal,
          'default'
        );
      }

      clearTimeout(wakingTimer);
      setServerWaking(false);

      const activeSessionId = normalizeSessionId(
        response?.sessionId ?? response?.session?.id ?? currentSessionId
      );
      if (isNewSession && activeSessionId === null) {
        throw new Error('The server did not return a valid session ID.');
      }

      if (isNewSession && activeSessionId) {
        // Keep the newly created session selected immediately. The server
        // session list is refreshed as well, so it appears in the mobile
        // drawer without requiring a desktop refresh.
        skipMessageLoadRef.current = activeSessionId;
        pendingSessionRef.current = activeSessionId;
        setCurrentSessionId(activeSessionId);
        persistSessionId(activeSessionId);

        // Replace the optimistic sessionId=0 with the real database session ID.
        setMessages(prev =>
          prev.map(msg =>
            msg.id === tempId
              ? { ...msg, sessionId: activeSessionId }
              : msg
          )
        );

        const optimisticSession: Session = {
          ...(response?.session || {}),
          id: activeSessionId,
          sessionName: response?.session?.sessionName || response?.session?.name || 'New Chat',
        } as Session;
        await loadSessions(optimisticSession);
      } else if (activeSessionId) {
        // Refresh ordering/metadata for existing chats too.
        await loadSessions();
      }

      setIsTyping(false);

      const aiMsg: Message = {
        id: response.messageId || 'ai-' + Date.now(),
        sessionId: activeSessionId,
        role: 'assistant',
        content: response.response,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => {
        const next = prev.some(m => m.id === aiMsg.id) ? prev : [...prev, aiMsg];
        cacheMessages(activeSessionId, next);
        return next;
      });

      // Generate a fresh adaptive chat title for a new chat, and also when
      // an existing user message is edited and re-submitted. This keeps the
      // sidebar/chat header aligned with the latest direction of the chat.
      if ((isNewSession || regenerateTitle) && activeSessionId) {
        try {
          const titleSource = finalMessage || 'File analysis';
          const { title } = await chatApi.generateTitle(titleSource) as any;
          if (title?.trim()) {
            await chatApi.renameSession(activeSessionId, title.trim());
            await loadSessions();
          }
        } catch (renameErr) { console.error('Adaptive title rename failed:', renameErr); }
      }
    } catch (err: any) {
      clearTimeout(wakingTimer);
      setServerWaking(false);
      setIsTyping(false);
      if (err.name === 'AbortError') {
        console.log('Chat aborted');
      } else {
        console.error('Chat error:', err);
        const errMsg = err.message?.includes('starting up')
          ? 'The server is still warming up — please wait a moment and try again.'
          : err.message || 'Sorry, an error occurred. Please try again.';
        setMessages(prev => {
          const next = [...prev, {
            id: 'error-' + Date.now(),
            sessionId: currentSessionId || 0,
            role: 'assistant',
            content: errMsg,
            timestamp: new Date().toISOString(),
          }];
          cacheMessages(normalizeSessionId(currentSessionId), next);
          return next;
        });
      }
    } finally {
      isSendingRef.current = false;
      abortControllerRef.current = null;
      setIsTyping(false);
      setJustFinished(true);
      setTimeout(() => setJustFinished(false), 3000);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, directMessage?: string) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const text = directMessage !== undefined ? directMessage : input;
    if (!text.trim() && selectedFiles.length === 0) return;

    const filesToSend = selectedFiles.length > 0 ? [...selectedFiles] : undefined;
    let previewUrls: string[] | undefined;
    if (filesToSend) {
      const imageFiles = filesToSend.filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        previewUrls = await Promise.all(imageFiles.map(fileToDataUrl));
      }
    }

    await sendMessage(text, undefined, filesToSend, previewUrls);
  };

  // Retry a user message using the conversation state before that message.
  const handleRetryMessage = (msg: Message) => {
    if (isTyping) return;
    const msgIndex = messages.findIndex(m => m.id === msg.id);
    const messagesBeforeMsg = msgIndex > 0 ? messages.slice(0, msgIndex) : [];
    sendMessage(cleanMessageContent(msg.content), messagesBeforeMsg);
  };

  const handleStopResponse = () => {
    abortControllerRef.current?.abort();
    setIsTyping(false);
    setServerWaking(false);
    isSendingRef.current = false;
    abortControllerRef.current = null;
    window.speechSynthesis?.cancel();
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const createNewSession = () => {
    setCurrentSessionId(null);
    persistSessionId(null);
    setMessages([]);
    setInput('');
    setEditingMessage(null);
    setSelectedFiles([]);
    setFilePreviews([]);
  };

  const deleteSession = (sid: number) => {
    setSessionIdToDelete(sid);
    setModalType('delete-single');
  };

  const confirmDeleteSession = async () => {
    if (!sessionIdToDelete) return;
    try {
      await chatApi.deleteSession(sessionIdToDelete);
      try { localStorage.removeItem(`${MESSAGES_CACHE_PREFIX}${sessionIdToDelete}`); } catch {}
      if (currentSessionId === sessionIdToDelete) {
        setCurrentSessionId(null);
        persistSessionId(null);
        setMessages([]);
      }
      await loadSessions(undefined, true);
    } catch (err) { console.error('Delete session failed:', err); }
    finally {
      setSessionIdToDelete(null);
      setModalType('none');
    }
  };

  const renameSession = async (sid: number, newName: string) => {
    if (!newName.trim()) return;
    try {
      await chatApi.renameSession(sid, newName);
      await loadSessions();
    } catch (err) { console.error('Rename failed:', err); }
  };

  const confirmClearAll = async () => {
    try {
      await chatApi.clearSessions();
      sessions.forEach(s => { try { localStorage.removeItem(`${MESSAGES_CACHE_PREFIX}${s.id}`); } catch {} });
      try { localStorage.removeItem(getSessionsCacheKey(user?.id)); } catch {}
      setCurrentSessionId(null);
      persistSessionId(null);
      setMessages([]);
      await loadSessions(undefined, true);
    } catch (err) { console.error('Clear sessions failed:', err); }
    finally { setModalType('none'); }
  };

  const handleLogout = async () => {
    try { await authApi.logout(); } catch (err) { console.error('Logout failed:', err); }
    finally {
      try {
        localStorage.removeItem(getSessionsCacheKey(user?.id));
      } catch {}
      setSessions([]);
      setMessages([]);
      setCurrentSessionId(null);
      persistSessionId(null);
      onLogout();
    }
  };

  const cleanMessageContent = (content: string): string =>
    content.replace(/\n?\n?\[Attached Files:.*?\]/g, '').trim();

  const handleStartEdit = (msg: Message) => {
    setEditingMessage({ id: msg.id, content: cleanMessageContent(msg.content) });
    setEditInput(cleanMessageContent(msg.content));
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setEditInput('');
  };

  const handleSaveEdit = async () => {
    if (!editingMessage || !editInput.trim()) return;
    const editedText = editInput.trim();
    const editedIndex = messages.findIndex(m => m.id === editingMessage.id);
    const messagesBeforeEdit = editedIndex > 0 ? messages.slice(0, editedIndex) : [];
    setEditingMessage(null);
    setEditInput('');
    await sendMessage(editedText, messagesBeforeEdit, undefined, undefined, true);
  };

  const showBlinkingCursor = !input && (isTyping || justFinished);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen font-sans text-zinc-400 bg-white dark:bg-zinc-950 transition-colors duration-300">
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-4"
        >
          <StormLogo className="w-12 h-12 text-indigo-500/50" />
          <span className="tracking-widest text-[10px] font-black uppercase">Loading...</span>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen h-[100dvh] min-h-0 w-full max-w-full overflow-hidden bg-white dark:bg-zinc-950 relative transition-colors duration-300 font-sans">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-500/5 rounded-full blur-[160px] pointer-events-none" />

      <Sidebar
        user={user}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={(id) => { const sid = normalizeSessionId(id); if (sid === null) return; setCurrentSessionId(sid); persistSessionId(sid); }}
        onNewSession={createNewSession}
        onDeleteSession={deleteSession}
        onRenameSession={renameSession}
        onClearAll={() => setModalType('delete-all')}
        onLogout={handleLogout}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0 min-h-0 h-full w-0 max-w-full overflow-hidden bg-transparent relative z-0 lg:pl-14 pt-14 md:pt-16">
        {/* Header - fixed so mobile/tablet refresh or message scrolling can never push it away */}
        <header className="fixed top-0 left-0 right-0 lg:left-14 z-[10000] h-14 md:h-16 w-auto bg-white/95 dark:bg-zinc-950/95 backdrop-blur-2xl border-b border-zinc-200 dark:border-zinc-800 flex items-center shrink-0">
          {/* Mobile menu: fixed to the left edge so it never overlaps the chat title */}
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden absolute left-3 md:left-5 top-1/2 -translate-y-1/2 z-[10001] w-9 h-9 flex items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
            aria-label="Open chats"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Center title: reserves space for both left menu and right theme button */}
          <div className="absolute left-14 right-14 sm:left-16 sm:right-16 md:left-20 md:right-20 flex flex-col items-center gap-0.5 text-center min-w-0 overflow-hidden">
            <div className="flex items-center justify-center gap-1.5 min-w-0 max-w-full">
              <StormLogo className="w-4 h-4 md:w-5 md:h-5 text-indigo-600 dark:text-indigo-500 shrink-0" />
              <span className="text-[10px] md:text-xs font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-widest truncate">Nexus AI</span>
              <div className="hidden sm:flex items-center gap-1 ml-1 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </div>
            <span className="block w-full text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 truncate">
              {sessions.find(s => s.id === currentSessionId)?.sessionName || 'New Chat'}
            </span>
          </div>

          {/* Theme button: always pinned to the right-most edge */}
          <motion.button
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="absolute right-2 sm:right-3 md:right-4 top-1/2 -translate-y-1/2 z-[10001] w-9 h-9 md:w-10 md:h-10 shrink-0 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
          >
              <AnimatePresence mode="wait" initial={false}>
                {isDark
                  ? <motion.span key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}><Sun className="w-4 h-4" /></motion.span>
                  : <motion.span key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}><Moon className="w-4 h-4" /></motion.span>
                }
              </AnimatePresence>
            </motion.button>
        </header>

        {/* Messages */}
        <div
          className="flex-1 min-h-0 min-w-0 w-full max-w-full overflow-y-auto overflow-x-hidden overscroll-contain scroll-hide"
          ref={messagesContainerRef}
          onScroll={handleScroll}
        >
          <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 md:px-6 pt-6 md:pt-10 pb-8 md:pb-10">
            {messages.length === 0 && !isTyping ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-2 max-w-2xl mx-auto">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mb-8">
                  <StormLogo className="w-12 h-12 md:w-14 md:h-14 text-indigo-600" />
                </motion.div>
                <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">How can I help you today?</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                  {['Plan a 3-day trip to Tokyo', 'How to build a SaaS with React?', 'Write a professional covering letter', 'Explain the theory of relativity'].map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(undefined, s)}
                      className="group p-3.5 md:p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-400 transition-all text-left shadow-sm"
                    >
                      <span className="block truncate">{s}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5 md:space-y-7 pb-6 pt-2">
                {messages.map((msg, index) => {
                  const isEditing = editingMessage?.id === msg.id;
                  const shouldSpin = isTyping && msg.role === 'assistant' && index === messages.length - 1;
                  const attachedImages = messageAttachments[msg.id] || [];

                  return (
                    <div
                      key={msg.id || `msg-${index}`}
                      data-message-id={String(msg.id)}
                      className={`flex w-full min-w-0 ${
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`flex min-w-0 w-full items-start gap-2.5 md:gap-3 ${
                          msg.role === 'user'
                            ? 'flex-row-reverse max-w-[92%] sm:max-w-[88%]'
                            : 'max-w-full'
                        }`}
                      >
                        <div className="w-7 h-7 md:w-8 md:h-8 shrink-0 flex items-center justify-center mt-1">
                          {msg.role === 'user' ? (
                            <div className="w-full h-full rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm overflow-hidden">
                              <UserAvatar name={user?.username || 'User'} className="w-full h-full text-[10px]" />
                            </div>
                          ) : (
                            <StormLogo className={`w-6 h-6 text-indigo-500 dark:text-indigo-400 ${shouldSpin ? 'animate-spin' : ''}`} />
                          )}
                        </div>

                        <div className="flex flex-col gap-1 min-w-0 flex-1 max-w-full">
                          {/* Message card */}
                          <div
                            className={`min-w-0 max-w-full ${
                              msg.role === 'user'
                                ? 'w-fit max-w-[92%] sm:max-w-[88%] px-3.5 py-3 sm:px-4 sm:py-3.5 rounded-2xl shadow-sm border overflow-hidden bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-tr-none'
                                : 'w-full text-zinc-900 dark:text-zinc-100'
                            }`}
                          >
                            {attachedImages.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-3">
                                {attachedImages.map((url, i) => (
                                  <div key={i} className="relative group/img max-w-full">
                                    <img
                                      src={url}
                                      alt={`Attachment ${i + 1}`}
                                      className="max-w-full w-auto h-auto max-h-[180px] rounded-xl object-cover border border-zinc-200/50 dark:border-zinc-600/40 shadow-sm"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="text-sm md:text-base leading-relaxed markdown-body max-w-none min-w-0 w-full break-words [overflow-wrap:anywhere]">
                              {isEditing ? (
                                <div className="flex flex-col gap-3 w-full min-w-0 p-1">
                                  <textarea
                                    value={editInput}
                                    onChange={(e) => setEditInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveEdit();
                                      }
                                      if (e.key === 'Escape') handleCancelEdit();
                                    }}
                                    className="w-full max-w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none min-h-[100px] bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-700"
                                    autoFocus
                                  />
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <span className="text-[9px] text-zinc-400 mr-auto">Ctrl/⌘ + Enter to send · Esc to cancel</span>
                                    <button
                                      onClick={handleCancelEdit}
                                      className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={handleSaveEdit}
                                      disabled={!editInput.trim() || isTyping}
                                      className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg disabled:opacity-40 bg-indigo-600 text-white hover:bg-indigo-700"
                                    >
                                      Send
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    pre({ children, ...props }: any) {
                                      return (
                                        <div className="my-4 w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-indigo-200/40 dark:border-indigo-500/20 shadow-lg bg-gradient-to-br from-indigo-50/80 to-violet-50/60 dark:from-indigo-950/50 dark:to-violet-950/40">
                                          <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-indigo-200/30 dark:border-indigo-500/15 bg-indigo-100/40 dark:bg-indigo-900/20">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500 shrink-0" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 dark:text-indigo-500">Architecture</span>
                                          </div>
                                          <pre
                                            className="max-w-full overflow-x-auto p-3 sm:p-4 md:p-5 text-[0.75rem] sm:text-[0.82rem] leading-relaxed font-mono text-indigo-700 dark:text-indigo-300 whitespace-pre"
                                            {...props}
                                          >
                                            {children}
                                          </pre>
                                        </div>
                                      );
                                    },
                                    code({ className, children, ...props }: any) {
                                      const match = /language-(\w+)/.exec(className || '');
                                      const content = String(children).replace(/\n$/, '');
                                      const isInline = props.inline || !className;
                                      return !isInline && match ? (
                                        <CodeBlock language={match[1]} value={content} />
                                      ) : (
                                        <code
                                          className={`${className || ''} bg-zinc-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 px-1 py-0.5 rounded font-mono text-[0.85em] break-words [overflow-wrap:anywhere]`}
                                          {...props}
                                        >
                                          {children}
                                        </code>
                                      );
                                    }
                                  } as Components}
                                >
                                  {cleanMessageContent(msg.content)}
                                </ReactMarkdown>
                              )}
                            </div>
                          </div>

                          {/* Message action buttons.
                              Always visible so touch devices do not depend on hover. */}
                          <div
                            className={`flex flex-wrap items-center gap-1 mt-1 px-1 ${
                              msg.role === 'user' ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            {msg.role === 'assistant' && (
                              <span className="text-[10px] font-black text-indigo-500/60 uppercase tracking-[0.18em] mr-auto pl-1">
                                Nexus AI
                              </span>
                            )}

                            <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest whitespace-nowrap mr-1">
                              {msg.timestamp
                                ? new Date(msg.timestamp).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : 'Now'}
                            </span>

                            <div className="flex items-center gap-0.5">
                              {/* User: Re-send + Edit + Copy */}
                              {msg.role === 'user' && !isEditing && !isTyping && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRetryMessage(msg)}
                                    title="Retry message"
                                    aria-label="Retry message"
                                    className="p-2 md:p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700 text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all touch-manipulation"
                                  >
                                    <RotateCcw className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(msg)}
                                    title="Edit message"
                                    aria-label="Edit message"
                                    className="p-2 md:p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700 text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all touch-manipulation"
                                  >
                                    <Edit2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                  </button>
                                </>
                              )}

                              {/* Copy is available for EVERY message */}
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(cleanMessageContent(msg.content));
                                  setCopiedId(msg.id);
                                  setTimeout(() => setCopiedId(null), 2000);
                                }}
                                title="Copy message"
                                aria-label="Copy message"
                                className={`p-2 md:p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700 transition-all touch-manipulation ${
                                  copiedId === msg.id
                                    ? 'text-emerald-500'
                                    : 'text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400'
                                }`}
                              >
                                {copiedId === msg.id
                                  ? <Check className="w-4 h-4 md:w-3.5 md:h-3.5" />
                                  : <Copy className="w-4 h-4 md:w-3.5 md:h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isTyping && (
                  <div className="flex items-start gap-3 min-w-0 max-w-full">
                    <div className="w-7 h-7 md:w-8 md:h-8 shrink-0 flex items-center justify-center mt-1">
                      <StormLogo className="w-6 h-6 text-indigo-500 animate-spin" />
                    </div>
                    <div className="min-w-0 max-w-full px-1 py-2 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                          className="w-1.5 h-1.5 bg-indigo-600 rounded-full"
                        />
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                          className="w-1.5 h-1.5 bg-indigo-600 rounded-full"
                        />
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                          className="w-1.5 h-1.5 bg-indigo-600 rounded-full"
                        />
                      </div>
                      <AnimatePresence>
                        {serverWaking && (
                          <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="text-[10px] font-medium text-zinc-400"
                          >
                            {selectedFiles.length
                              ? 'Processing uploaded file — this may take 10–15 seconds…'
                              : 'Server is waking up, please wait a moment…'}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}

            {(messages.length === 0 && !isTyping) && <div ref={messagesEndRef} />}
          </div>
        </div>

        {/* Input bar */}
        <div className="shrink-0 flex-none w-full max-w-full overflow-hidden bg-white dark:bg-zinc-950 border-t border-zinc-200/50 dark:border-zinc-800/50 px-3 sm:px-4 md:px-6 pt-3 md:pt-4 pb-3 md:pb-4">
          <div className="w-full max-w-3xl mx-auto relative min-w-0">
            <AnimatePresence>
              {showScrollBottom && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  onClick={() => messagesContainerRef.current?.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior: 'smooth' })}
                  className="absolute -top-14 right-2 p-2.5 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-500/30 hover:bg-indigo-700 transition-all z-10 hover:scale-110"
                >
                  <ArrowDown className="w-4 h-4 md:w-5 md:h-5" />
                </motion.button>
              )}
            </AnimatePresence>

            <div className={`relative flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-lg transition-all ${justFinished ? 'animate-blink' : ''}`}>
              {/* File preview strip (kept for consistency but never shown without UI trigger) */}
              <AnimatePresence>
                {filePreviews.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap gap-3 px-3 pt-3 pb-2.5 border-b border-zinc-100 dark:border-zinc-800/70">
                    {filePreviews.map(fp => (
                      <div key={fp.id} className="relative flex flex-col items-center gap-1 shrink-0">
                        {fp.preview ? (
                          <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-700 shadow-sm border border-zinc-200/60">
                            <img src={fp.preview} alt={fp.file.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                            <X className="w-6 h-6 text-indigo-500" />
                          </div>
                        )}
                        <span className="text-[9px] font-medium text-zinc-400 truncate max-w-[64px]">{fp.file.name}</span>
                        <button onClick={() => removeFile(fp.id)} className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full flex items-center justify-center bg-zinc-600 dark:bg-zinc-500 text-white shadow-md hover:bg-red-500">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-row items-end">
                {/* Textarea */}
                <div className="relative flex-1 min-w-0">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => { setInput(e.target.value); if (isListening) speechBaseRef.current = e.target.value; }}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isTyping) { e.preventDefault(); handleSendMessage(); } }}
                    placeholder={showBlinkingCursor ? '' : isListening ? 'Listening…' : 'Write a message...'}
                    rows={1}
                    className="w-full min-w-0 max-w-full px-3 md:px-4 py-3.5 md:py-4 bg-transparent focus:outline-none font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-sm md:text-base leading-relaxed resize-none min-h-[52px] max-h-[180px] overflow-y-auto"
                    onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 180)}px`; }}
                  />
                  {showBlinkingCursor && !inputFocused && !isListening && (
                    <div className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                      <BlinkingCursor />
                      <span className="text-sm md:text-base font-medium text-zinc-400">Write a message</span>
                    </div>
                  )}
                </div>

                {/* Send / Stop button */}
                <div className="flex items-center gap-1 px-2 pb-2.5 md:pb-3 shrink-0">
                  <motion.button
                    whileHover={{ scale: isTyping || input.trim() || filePreviews.length ? 1.08 : 1.02 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={isTyping ? handleStopResponse : () => handleSendMessage()}
                    disabled={!input.trim() && filePreviews.length === 0 && !isTyping}
                    className={`relative flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full transition-all duration-200 border-2 ${isTyping ? 'bg-white dark:bg-zinc-800 border-indigo-400 dark:border-indigo-500 shadow-lg' : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 shadow-md hover:border-indigo-400'}`}
                  >
                    {isTyping ? (
                      <span className="relative flex items-center justify-center w-full h-full">
                        <svg className="absolute inset-0 w-full h-full animate-spin" viewBox="0 0 40 40">
                          <circle cx="20" cy="20" r="16" fill="none" stroke="#6366f1" strokeWidth="3" strokeDasharray="55 45" strokeLinecap="round" />
                        </svg>
                        <span className="w-3 h-3 rounded-sm bg-zinc-800 dark:bg-zinc-200 block relative z-10" />
                      </span>
                    ) : (
                      <ArrowUp className={`w-4 h-4 transition-all ${input.trim() || filePreviews.length ? 'text-zinc-800 dark:text-zinc-100 scale-110' : 'text-zinc-400 dark:text-zinc-500 scale-90'}`} />
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
            <p className="mt-2.5 px-2 text-center text-[10px] sm:text-[11px] leading-relaxed font-medium text-zinc-500/60 dark:text-zinc-400/60">
              Nexus AI is AI and can make mistakes. Please double-check responses.
            </p>
          </div>
        </div>
      </main>

      <ConfirmationModal isOpen={modalType === 'delete-single'} onClose={() => setModalType('none')} onConfirm={confirmDeleteSession} title="Delete Chat" message="This action cannot be undone." confirmText="Delete" />
      <ConfirmationModal isOpen={modalType === 'delete-all'} onClose={() => setModalType('none')} onConfirm={confirmClearAll} title="Clear All Chats" message="All chats will be permanently deleted." confirmText="Clear All" />
    </div>
  );
}
