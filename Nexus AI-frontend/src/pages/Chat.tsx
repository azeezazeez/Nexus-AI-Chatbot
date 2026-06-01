import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { User, Session, Message } from '../types';
import Sidebar from '../components/Sidebar';
import { chatApi, authApi, wakeUpServer } from '../lib/api';
import type { ProcessedFile } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import StormLogo from '../components/StormLogo';
import UserAvatar from '../components/UserAvatar';
import ConfirmationModal from '../components/ConfirmationModal';
import {
  ArrowDown, ArrowUp,
  Copy, Check, Edit2, Sun, Moon, Menu,
  Paperclip, X, FileText, Camera, Image as ImageIcon,
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

// Blinking cursor component
const BlinkingCursor = () => (
  <motion.span
    animate={{ opacity: [1, 0, 1] }}
    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    className="inline-block w-[2px] h-[1.1em] bg-indigo-500 align-middle ml-0.5 rounded-full"
    style={{ verticalAlign: 'text-bottom' }}
  />
);

// ── localStorage helpers ──────────────────────────────────────────────────────
const SESSION_KEY = 'scout_current_session_id';

const persistSessionId = (id: number | null) => {
  if (id === null) {
    localStorage.removeItem(SESSION_KEY);
  } else {
    localStorage.setItem(SESSION_KEY, String(id));
  }
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

// ── Theme helper ──────────────────────────────────────────────────────────────
const getInitialTheme = (): boolean => {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem('theme');
  if (stored) return stored === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

// ── File helpers ──────────────────────────────────────────────────────────────
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
};

const processFile = (file: File): Promise<ProcessedFile> =>
  new Promise((resolve, reject) => {
    const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));

    if (file.type.startsWith('image/')) {
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        resolve({
          id,
          name: file.name,
          type: 'image',
          content: dataUrl.split(',')[1],
          mimeType: file.type,
          size: file.size,
          preview: dataUrl,
        });
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = (e) => {
        resolve({
          id,
          name: file.name,
          type: 'text',
          content: e.target?.result as string,
          mimeType: file.type || 'text/plain',
          size: file.size,
        });
      };
      reader.readAsText(file);
    }
  });

export default function Chat({ user, onLogout }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
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

  // ── File upload state ─────────────────────────────────────────────────────
  const [uploadedFiles, setUploadedFiles] = useState<ProcessedFile[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── NEW: Attachment menu state ────────────────────────────────────────────
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // ── NEW: Camera & photo input refs ────────────────────────────────────────
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  // ── Theme state ───────────────────────────────────────────────────────────
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
  const isSendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const skipMessageLoadRef = useRef(false);

  // ── Wrapped session setter ────────────────────────────────────────────────
  const updateCurrentSessionId = useCallback((id: number | null) => {
    setCurrentSessionId(id);
    persistSessionId(id);
  }, []);

  // ── NEW: Close attach menu when clicking outside ──────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    if (showAttachMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAttachMenu]);

  // ── Data Loading ──────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    try {
      wakeUpServer();
      const response = await chatApi.getSessions() as any;
      setSessions(response.sessions || []);
    } catch (err: unknown) {
      console.error('Failed to load sessions:', err);
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  const loadMessages = useCallback(async (sid: number) => {
    try {
      const response = await chatApi.getMessages(sid) as any;
      setMessages(response.messages || []);
    } catch (err: unknown) {
      console.error('Failed to load messages:', err);
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) onLogout();
    }
  }, [onLogout]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (loading) return;
    if (currentSessionId !== null) {
      const stillExists = sessions.some(s => s.id === currentSessionId);
      if (!stillExists) {
        updateCurrentSessionId(null);
        setMessages([]);
      }
    }
  }, [sessions, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentSessionId) {
      if (skipMessageLoadRef.current) {
        skipMessageLoadRef.current = false;
        return;
      }
      loadMessages(currentSessionId);
    } else {
      setMessages([]);
    }
  }, [currentSessionId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── Scroll ────────────────────────────────────────────────────────────────
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 100);
  };

  // ── File handlers ─────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setIsProcessingFiles(true);
    try {
      const processed = await Promise.all(files.map(processFile));
      setUploadedFiles(prev => [...prev, ...processed]);
    } catch (err) {
      console.error('File processing error:', err);
    } finally {
      setIsProcessingFiles(false);
      // Reset all three inputs so the same file can be picked again
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const removeFile = (id: string) =>
    setUploadedFiles(prev => prev.filter(f => f.id !== id));

  // ── Core send ─────────────────────────────────────────────────────────────
  const sendMessage = async (
    messageText: string,
    messagesSnapshot?: Message[],
    filesToSend?: ProcessedFile[]
  ) => {
    if (!messageText.trim() && (!filesToSend || !filesToSend.length)) return;
    if (isSendingRef.current) return;

    isSendingRef.current = true;
    setIsTyping(true);
    setJustFinished(false);
    setServerWaking(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const tempUserMsg: Message = {
      id: 'temp-' + Date.now(),
      sessionId: currentSessionId || 0,
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
    };

    if (messagesSnapshot) {
      setMessages([...messagesSnapshot, tempUserMsg]);
    } else {
      setMessages(prev => [...prev, tempUserMsg]);
    }

    setInput('');

    const isNewSession = !currentSessionId;

    const wakingTimer = setTimeout(() => {
      if (isSendingRef.current) setServerWaking(true);
    }, 4000);

    try {
      const response = await chatApi.sendMessage(
        messageText,
        currentSessionId,
        controller.signal,
        'default',
        filesToSend,
      ) as any;

      clearTimeout(wakingTimer);
      setServerWaking(false);

      const activeSessionId = response.sessionId || currentSessionId;

      if (isNewSession && activeSessionId) {
        skipMessageLoadRef.current = true;
        updateCurrentSessionId(activeSessionId);
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
        if (prev.some(m => m.id === aiMsg.id)) return prev;
        return [...prev, aiMsg];
      });

      if (isNewSession && activeSessionId) {
        try {
          const { title } = await chatApi.generateTitle(messageText) as any;
          await chatApi.renameSession(activeSessionId, title);
          await loadSessions();
        } catch (renameErr: unknown) {
          console.error('Rename failed:', renameErr);
        }
      }
    } catch (err: unknown) {
      clearTimeout(wakingTimer);
      setServerWaking(false);
      setIsTyping(false);
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') {
        console.log('Chat aborted');
      } else {
        console.error('Chat error:', err);
        const errMsg = err instanceof Error ? err.message : 'Sorry, I encountered an error. Please try again.';
        setMessages(prev => [...prev, {
          id: 'error-' + Date.now(),
          sessionId: currentSessionId || 0,
          role: 'assistant',
          content: errMsg,
          timestamp: new Date().toISOString(),
        }]);
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
    const text = directMessage || input.trim();
    if (!text && !uploadedFiles.length) return;
    const filesToSend = [...uploadedFiles];
    setUploadedFiles([]);
    await sendMessage(text, undefined, filesToSend);
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
    updateCurrentSessionId(null);
    setMessages([]);
    setInput('');
    setEditingMessage(null);
    setUploadedFiles([]);
  };

  const deleteSession = (sid: number) => {
    setSessionIdToDelete(sid);
    setModalType('delete-single');
  };

  const confirmDeleteSession = async () => {
    if (!sessionIdToDelete) return;
    try {
      await chatApi.deleteSession(sessionIdToDelete);
      if (currentSessionId === sessionIdToDelete) {
        updateCurrentSessionId(null);
        setMessages([]);
      }
      await loadSessions();
    } catch (err: unknown) {
      console.error('Failed to delete session:', err);
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) onLogout();
    } finally {
      setSessionIdToDelete(null);
      setModalType('none');
    }
  };

  const renameSession = async (sid: number, newName: string) => {
    if (!newName.trim()) return;
    try {
      await chatApi.renameSession(sid, newName);
      await loadSessions();
    } catch (err: unknown) {
      console.error('Failed to rename session:', err);
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) onLogout();
    }
  };

  const confirmClearAll = async () => {
    try {
      await chatApi.clearSessions();
      updateCurrentSessionId(null);
      setMessages([]);
      await loadSessions();
    } catch (err: unknown) {
      console.error('Failed to clear sessions:', err);
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) onLogout();
    } finally {
      setModalType('none');
    }
  };

  const handleLogout = async () => {
    try { await authApi.logout(); } catch (err: unknown) { console.error('Logout failed:', err); }
    finally {
      updateCurrentSessionId(null);
      onLogout();
    }
  };

  const cleanMessageContent = (content: string): string =>
    content.replace(/\n?\n?\[Attached Files:.*?\]/g, '').trim();

  // ── Edit handlers ─────────────────────────────────────────────────────────
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
    await sendMessage(editedText, messagesBeforeEdit);
  };

  // ── Derived values ────────────────────────────────────────────────────────
  // Only show blinking cursor when there's no typed input yet
  const showBlinkingCursor = !input && (isTyping || justFinished);

  // ── Loading Screen ────────────────────────────────────────────────────────
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
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-white dark:bg-zinc-950 relative transition-colors duration-300 font-sans">

      {/* Ambient background glow */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-500/5 rounded-full blur-[160px] pointer-events-none" />

      {/* ── SIDEBAR ── */}
      <Sidebar
        user={user}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={(id) => { updateCurrentSessionId(id); }}
        onNewSession={createNewSession}
        onDeleteSession={deleteSession}
        onRenameSession={renameSession}
        onClearAll={() => setModalType('delete-all')}
        onLogout={handleLogout}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* ── MAIN CONTENT AREA ── */}
      <main className="flex-1 flex flex-col min-w-0 bg-transparent relative z-20 lg:pl-14">

        {/* ── HEADER ── */}
        <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/90 dark:bg-zinc-950/80 backdrop-blur-2xl border-b border-zinc-200 dark:border-zinc-800 shrink-0 transition-colors duration-300">
          <div className="flex items-center justify-between h-full px-3 md:px-5">

            <div className="w-9 md:w-10 shrink-0 flex items-center justify-center">
              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl
                           text-zinc-600 dark:text-zinc-400
                           hover:bg-zinc-100 dark:hover:bg-zinc-800
                           transition-all duration-200"
                aria-label="Open sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>

            {/* Centre — Logo + App name + session title */}
            <div className="flex flex-col items-center gap-0.5 max-w-[60vw] sm:max-w-xs md:max-w-sm">
              <div className="flex items-center gap-1.5">
                <StormLogo className="w-4 h-4 md:w-5 md:h-5 text-indigo-600 dark:text-indigo-500 shrink-0" />
                <span className="text-[10px] md:text-xs font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-widest leading-none transition-colors">
                  Nexus AI
                </span>
                <div className="hidden sm:flex items-center gap-1 ml-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              </div>
              <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 truncate leading-none max-w-full transition-colors">
                {sessions.find(s => s.id === currentSessionId)?.sessionName || 'New Chat'}
              </span>
            </div>

            {/* Right — Theme toggle button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-9 h-9 md:w-10 md:h-10 shrink-0 flex items-center justify-center rounded-full
                         bg-zinc-100 dark:bg-zinc-800
                         border border-zinc-200 dark:border-zinc-700
                         text-zinc-500 dark:text-zinc-400
                         hover:text-indigo-600 dark:hover:text-indigo-400
                         hover:border-indigo-300 dark:hover:border-indigo-600
                         shadow-sm transition-all duration-200"
            >
              <AnimatePresence mode="wait" initial={false}>
                {isDark ? (
                  <motion.span
                    key="sun"
                    initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center justify-center"
                  >
                    <Sun className="w-4 h-4 md:w-4.5 md:h-4.5" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="moon"
                    initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center justify-center"
                  >
                    <Moon className="w-4 h-4 md:w-4.5 md:h-4.5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

          </div>
        </header>

        {/* ── MESSAGES SCROLL AREA ── */}
        <div
          className="flex-1 overflow-y-auto scroll-hide"
          onScroll={handleScroll}
        >
          <div className="max-w-3xl mx-auto px-3 sm:px-4 md:px-6 py-6 md:py-10">
            {messages.length === 0 && !isTyping ? (
              /* ── Empty state / welcome screen ── */
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-2 max-w-2xl mx-auto">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center justify-center mb-8 text-indigo-600"
                >
                  <StormLogo className="w-12 h-12 md:w-14 md:h-14" />
                </motion.div>
                <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-6 tracking-tight transition-colors">
                  How can I help you today?
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                  {[
                    'Plan a 3-day trip to Tokyo',
                    'How to build a SaaS with React?',
                    'Write a professional covering letter',
                    'Explain the theory of relativity',
                  ].map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(undefined, s)}
                      className="group p-3.5 md:p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-400 dark:hover:border-indigo-600/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all text-left shadow-sm"
                    >
                      <span className="block truncate">{s}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* ── Message list ── */
              <div className="space-y-6 md:space-y-8 pb-6 pt-2">
                {messages.map((msg, index) => {
                  const isEditing = editingMessage?.id === msg.id;
                  const shouldSpin = isTyping && msg.role === 'assistant' && index === messages.length - 1;
                  return (
                    <div
                      key={msg.id || `msg-${index}`}
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} group`}
                    >
                      <div className={`flex gap-2.5 md:gap-3 w-full ${msg.role === 'user' ? 'flex-row-reverse justify-start' : 'flex-row'}`}>
                        {/* Avatar */}
                        <div className="w-7 h-7 md:w-8 md:h-8 shrink-0 flex items-center justify-center mt-1">
                          {msg.role === 'user' ? (
                            <div className="w-full h-full rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm overflow-hidden">
                              <UserAvatar name={user?.username || 'User'} className="w-full h-full text-[10px]" />
                            </div>
                          ) : (
                            <StormLogo
                              className={`w-6 h-6 text-indigo-500 dark:text-indigo-400 ${shouldSpin ? 'animate-spin' : ''}`}
                            />
                          )}
                        </div>

                        {/* Bubble + actions */}
                        <div className={`flex flex-col gap-1 min-w-0 ${msg.role === 'user' ? 'max-w-[85%] md:max-w-[75%] items-end' : 'max-w-[90%] md:max-w-[80%] items-start'}`}>
                          <div className={`px-4 py-3 rounded-2xl shadow-sm border transition-all duration-300 backdrop-blur-xl ${
                            msg.role === 'assistant'
                              ? 'bg-white/80 dark:bg-zinc-900/60 border-zinc-200/60 dark:border-zinc-700/50 text-zinc-900 dark:text-zinc-100 rounded-tl-none'
                              : 'bg-zinc-100/80 dark:bg-zinc-800/60 border-zinc-200/40 dark:border-zinc-700/40 text-zinc-900 dark:text-zinc-100 rounded-tr-none'
                          }`}>
                            <div className="text-sm md:text-base leading-relaxed markdown-body max-w-none">
                              {isEditing ? (
                                <div className="flex flex-col gap-3 min-w-[200px] sm:min-w-[340px] p-1">
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
                                    className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 transition-all resize-none font-medium min-h-[100px] ${
                                      msg.role === 'user'
                                        ? 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
                                        : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
                                    }`}
                                    autoFocus
                                  />
                                  <div className="flex justify-end items-center gap-2">
                                    <span className="text-[9px] text-zinc-400 mr-auto">⌘↵ to send · Esc to cancel</span>
                                    <button
                                      onClick={handleCancelEdit}
                                      className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={handleSaveEdit}
                                      disabled={!editInput.trim() || isTyping}
                                      className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20"
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
                                        <div className="my-6 overflow-hidden rounded-xl border border-indigo-200/40 dark:border-indigo-500/20 shadow-lg bg-gradient-to-br from-indigo-50/80 to-violet-50/60 dark:from-indigo-950/50 dark:to-violet-950/40 backdrop-blur-xl">
                                          <div className="flex items-center gap-2 px-4 py-2 border-b border-indigo-200/30 dark:border-indigo-500/15 bg-indigo-100/40 dark:bg-indigo-900/20">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 dark:text-indigo-500">Architecture</span>
                                          </div>
                                          <pre
                                            className="p-5 overflow-x-auto text-[0.82rem] leading-relaxed font-mono text-indigo-700 dark:text-indigo-300 whitespace-pre"
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
                                          className={`${className || ''} bg-zinc-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 px-1 py-0.5 rounded font-mono text-[0.85em]`}
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

                          {/* Actions row */}
                          <div className="flex items-center gap-1 mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {msg.role === 'assistant' && (
                              <span className="text-[10px] font-black text-indigo-500/50 uppercase tracking-[0.2em] mr-auto pl-1">Nexus AI</span>
                            )}
                            <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest whitespace-nowrap mr-1">
                              {msg.timestamp
                                ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : 'Now'}
                            </span>
                            <div className="flex items-center gap-0.5">
                              {msg.role === 'user' && !isEditing && !isTyping && (
                                <button
                                  onClick={() => handleStartEdit(msg)}
                                  className="p-1 px-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-600 transition-all"
                                  title="Edit and resend message"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(cleanMessageContent(msg.content));
                                  setCopiedId(msg.id);
                                  setTimeout(() => setCopiedId(null), 2000);
                                }}
                                className={`p-1 px-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all ${
                                  copiedId === msg.id ? 'text-emerald-500' : 'text-zinc-400 hover:text-indigo-600'
                                }`}
                                title="Copy message"
                              >
                                {copiedId === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Typing indicator */}
                {isTyping && (
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 md:w-8 md:h-8 shrink-0 flex items-center justify-center mt-1">
                      <StormLogo className="w-6 h-6 text-indigo-500 animate-spin" />
                    </div>
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex flex-col gap-2 backdrop-blur-xl">
                      <div className="flex items-center gap-2">
                        <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                        <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                        <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                      </div>
                      <AnimatePresence>
                        {serverWaking && (
                          <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500"
                          >
                            Server is waking up, please wait...
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Anchor for empty-state scroll too */}
            {(messages.length === 0 && !isTyping) && <div ref={messagesEndRef} />}
          </div>
        </div>

        {/* ── INPUT BAR ── */}
        <div className="shrink-0 bg-white dark:bg-zinc-950 border-t border-zinc-200/50 dark:border-zinc-800/50 px-3 sm:px-4 md:px-6 py-3 md:py-4 transition-colors duration-300">
          <div className="max-w-3xl mx-auto relative">

            {/* Scroll-to-bottom fab */}
            <AnimatePresence>
              {showScrollBottom && (
                <motion.button
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.8 }}
                  onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="absolute -top-14 right-2 p-2.5 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-500/30 hover:bg-indigo-700 transition-all z-10 group hover:scale-110 active:scale-90 border border-indigo-500"
                  aria-label="Scroll to bottom"
                >
                  <ArrowDown className="w-4 h-4 md:w-5 md:h-5" />
                </motion.button>
              )}
            </AnimatePresence>

            {/* ── Hidden file inputs (three: camera, photos, files) ── */}
            {/* Camera — opens device camera directly on mobile */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
            {/* Photos — image picker (gallery) */}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            {/* Files — any supported file type */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/gif,image/webp,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.html,.css"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* ── Main input container ── */}
            {/*
              NOTE: overflow-hidden intentionally removed so the
              attach menu (positioned absolute, above the container)
              is not clipped by this wrapper.
            */}
            <div className={`relative flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-lg transition-all ${justFinished ? 'animate-blink' : ''}`}>

              {/* ── File preview strip ── */}
              <AnimatePresence>
                {uploadedFiles.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex flex-wrap gap-2 px-3 pt-2.5 pb-2 border-b border-zinc-100 dark:border-zinc-800/70 overflow-hidden"
                  >
                    {uploadedFiles.map(file => (
                      <div
                        key={file.id}
                        className="relative flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-xl px-2.5 py-1.5 max-w-[180px]"
                      >
                        {file.type === 'image' && file.preview ? (
                          <>
                            <img
                              src={file.preview}
                              alt={file.name}
                              className="w-7 h-7 rounded-lg object-cover shrink-0"
                            />
                            <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 truncate max-w-[100px]">
                              {file.name}
                            </span>
                          </>
                        ) : (
                          <>
                            <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 truncate max-w-[90px]">
                                {file.name}
                              </span>
                              <span className="text-[9px] font-medium text-zinc-400">
                                {formatFileSize(file.size)}
                              </span>
                            </div>
                          </>
                        )}
                        <button
                          onClick={() => removeFile(file.id)}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center
                                     bg-zinc-500 dark:bg-zinc-600 text-white shadow-sm
                                     hover:bg-red-500 dark:hover:bg-red-500 transition-colors"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Textarea row: [paperclip LEFT] [textarea] [send RIGHT] ── */}
              <div className="flex flex-row items-end">

                {/* ── LEFT: Paperclip + expandable attach menu ── */}
                <div
                  ref={attachMenuRef}
                  className="relative flex items-center pl-2 pb-2.5 md:pb-3 shrink-0"
                >
                  {/* Expandable attach options menu — appears above the button */}
                  <AnimatePresence>
                    {showAttachMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.95 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="absolute bottom-full left-0 mb-2 z-50
                                   bg-white dark:bg-zinc-800
                                   border border-zinc-200 dark:border-zinc-700
                                   rounded-2xl shadow-xl dark:shadow-zinc-900/60
                                   min-w-[148px] overflow-hidden"
                      >
                        {/* Camera */}
                        <button
                          type="button"
                          onClick={() => {
                            cameraInputRef.current?.click();
                            setShowAttachMenu(false);
                          }}
                          className="flex items-center gap-3 w-full px-4 py-3
                                     text-[13px] font-semibold
                                     text-zinc-700 dark:text-zinc-200
                                     hover:bg-zinc-50 dark:hover:bg-zinc-700/60
                                     transition-colors"
                        >
                          <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-indigo-100 dark:bg-indigo-950/60">
                            <Camera className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          </span>
                          Camera
                        </button>

                        {/* Divider */}
                        <div className="h-px bg-zinc-100 dark:bg-zinc-700/50" />

                        {/* Photos */}
                        <button
                          type="button"
                          onClick={() => {
                            photoInputRef.current?.click();
                            setShowAttachMenu(false);
                          }}
                          className="flex items-center gap-3 w-full px-4 py-3
                                     text-[13px] font-semibold
                                     text-zinc-700 dark:text-zinc-200
                                     hover:bg-zinc-50 dark:hover:bg-zinc-700/60
                                     transition-colors"
                        >
                          <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-emerald-100 dark:bg-emerald-950/60">
                            <ImageIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          </span>
                          Photos
                        </button>

                        {/* Divider */}
                        <div className="h-px bg-zinc-100 dark:bg-zinc-700/50" />

                        {/* Files */}
                        <button
                          type="button"
                          onClick={() => {
                            fileInputRef.current?.click();
                            setShowAttachMenu(false);
                          }}
                          className="flex items-center gap-3 w-full px-4 py-3
                                     text-[13px] font-semibold
                                     text-zinc-700 dark:text-zinc-200
                                     hover:bg-zinc-50 dark:hover:bg-zinc-700/60
                                     transition-colors"
                        >
                          <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-violet-100 dark:bg-violet-950/60">
                            <FileText className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                          </span>
                          Files
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Paperclip toggle button */}
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.88 }}
                    onClick={() => setShowAttachMenu(prev => !prev)}
                    disabled={isProcessingFiles}
                    title="Attach — camera, photos or files"
                    aria-label="Open attach menu"
                    className={`flex items-center justify-center w-9 h-9 rounded-full
                               transition-all duration-200
                               disabled:opacity-40 disabled:cursor-not-allowed
                               ${showAttachMenu
                                 ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                                 : 'text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                               }`}
                  >
                    <motion.span
                      animate={{ rotate: showAttachMenu ? 45 : 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="flex items-center justify-center"
                    >
                      <Paperclip className={`w-4 h-4 ${isProcessingFiles ? 'animate-spin' : ''}`} />
                    </motion.span>
                  </motion.button>
                </div>

                {/* ── CENTRE: Textarea ── */}
                <div className="relative flex-1 min-w-0">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !isTyping) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    // ── NOT disabled while isTyping — user can pre-type their next message ──
                    placeholder={showBlinkingCursor ? '' : 'Write a message...'}
                    rows={1}
                    className="w-full px-3 md:px-4 py-3.5 md:py-4 bg-transparent focus:outline-none font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-sm md:text-base leading-relaxed resize-none min-h-[52px] max-h-[180px] overflow-y-auto transition-colors"
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${Math.min(target.scrollHeight, 180)}px`;
                    }}
                  />
                  {/* Blinking cursor placeholder — only shown when input is empty and not focused */}
                  {showBlinkingCursor && !inputFocused && (
                    <div className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                      <BlinkingCursor />
                      <span className="text-sm md:text-base font-medium text-zinc-400 dark:text-zinc-500">Write a message</span>
                    </div>
                  )}
                </div>

                {/* ── RIGHT: Send / Stop button ── */}
                <div className="flex items-center px-2 pb-2.5 md:pb-3 shrink-0">
                  <motion.button
                    whileHover={{ scale: isTyping || input.trim() || uploadedFiles.length ? 1.08 : 1.02 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={isTyping ? handleStopResponse : () => handleSendMessage()}
                    disabled={!input.trim() && !uploadedFiles.length && !isTyping}
                    aria-label={isTyping ? 'Stop response' : 'Send message'}
                    className={`relative flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full transition-all duration-200 border-2 ${
                      isTyping
                        ? 'bg-white dark:bg-zinc-800 border-indigo-400 dark:border-indigo-500 shadow-lg shadow-indigo-200/50'
                        : 'bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 shadow-md hover:border-indigo-400 dark:hover:border-indigo-500'
                    }`}
                  >
                    {isTyping ? (
                      <span className="relative flex items-center justify-center w-full h-full">
                        <svg className="absolute inset-0 w-full h-full animate-spin" viewBox="0 0 40 40">
                          <circle cx="20" cy="20" r="16" fill="none" stroke="#6366f1" strokeWidth="3" strokeDasharray="55 45" strokeLinecap="round" opacity="1" />
                        </svg>
                        <span className="w-3 h-3 rounded-sm bg-zinc-800 dark:bg-zinc-200 block relative z-10" />
                      </span>
                    ) : (
                      <ArrowUp className={`w-4 h-4 transition-all ${input.trim() || uploadedFiles.length ? 'text-zinc-800 dark:text-zinc-100 scale-110' : 'text-zinc-400 dark:text-zinc-500 scale-90'}`} />
                    )}
                  </motion.button>
                </div>

              </div>
            </div>

            {/* Disclaimer */}
            <p className="mt-2.5 text-center text-[10px] font-medium text-zinc-500/40 dark:text-zinc-400/40 transition-colors">
              Nexus is AI and can make mistakes. Please double-check responses.
            </p>
          </div>
        </div>
      </main>

      {/* ── MODALS ── */}
      <ConfirmationModal
        isOpen={modalType === 'delete-single'}
        onClose={() => setModalType('none')}
        onConfirm={confirmDeleteSession}
        title="Delete Chat"
        message="Are you sure you want to delete this chat? This action cannot be undone."
        confirmText="Delete"
      />
      <ConfirmationModal
        isOpen={modalType === 'delete-all'}
        onClose={() => setModalType('none')}
        onConfirm={confirmClearAll}
        title="Clear All Chats"
        message="Are you sure you want to delete all chats? This action is permanent."
        confirmText="Clear All"
      />
    </div>
  );
}
