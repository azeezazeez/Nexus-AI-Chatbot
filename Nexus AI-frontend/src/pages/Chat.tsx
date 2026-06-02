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
  Paperclip, X, FileText, Camera, Mic,
  RotateCcw, // FIX 1: Added for retry button
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

// FIX 3: Helper to convert a File to a persistent base64 data URL
const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
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

  // FIX 3: Persistent map of message ID → base64 image data URLs
  const [messageAttachments, setMessageAttachments] = useState<Record<string | number, string[]>>({});

  // File upload
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{ id: string; file: File; preview?: string }[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Attach menu
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  // Speech recognition
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
  const isSendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const skipMessageLoadRef = useRef(false);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  // Close attach menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    if (showAttachMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAttachMenu]);

  // Clean up object URLs on unmount only (not on every filePreviews change)
  const filePreviewsRef = useRef(filePreviews);
  useEffect(() => { filePreviewsRef.current = filePreviews; }, [filePreviews]);
  useEffect(() => {
    return () => {
      filePreviewsRef.current.forEach(fp => {
        if (fp.preview) URL.revokeObjectURL(fp.preview);
      });
    };
  }, []);

  // Speech recognition
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

  // Load sessions & messages
  const loadSessions = useCallback(async () => {
    try {
      wakeUpServer();
      const response = await chatApi.getSessions() as any;
      setSessions(response.sessions || []);
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
      if (err.status === 401) onLogout();
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  const loadMessages = useCallback(async (sid: number) => {
    try {
      const response = await chatApi.getMessages(sid) as any;
      setMessages(response.messages || []);
    } catch (err: any) {
      console.error('Failed to load messages:', err);
      if (err.status === 401) onLogout();
    }
  }, [onLogout]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (loading) return;
    if (currentSessionId !== null) {
      const stillExists = sessions.some(s => s.id === currentSessionId);
      if (!stillExists) {
        setCurrentSessionId(null);
        persistSessionId(null);
        setMessages([]);
      }
    }
  }, [sessions, loading]);

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

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 100);
  };

  // File handlers
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

  // FIX 3 + FIX 1: sendMessage now accepts persistent previewUrls to display in the message bubble
  const sendMessage = async (
    messageText: string,
    messagesSnapshot?: Message[],
    filesToSend?: File[],
    previewUrls?: string[]
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
      content: messageText.trim() || (filesToSend?.some(f => f.type.startsWith('image/')) ? 'What is in this image?' : 'Please analyse the attached file.'),
      timestamp: new Date().toISOString(),
    };

    if (messagesSnapshot) setMessages([...messagesSnapshot, tempUserMsg]);
    else setMessages(prev => [...prev, tempUserMsg]);

    // FIX 3: Store base64 preview URLs keyed by this message's temp ID
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
      const finalMessage = messageText.trim() || (hasFiles && filesToSend.some(f => f.type.startsWith('image/')) ? 'What is in this image?' : 'Please analyse the attached file.');

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

      const activeSessionId = response.sessionId || currentSessionId;

      if (isNewSession && activeSessionId) {
        skipMessageLoadRef.current = true;
        setCurrentSessionId(activeSessionId);
        persistSessionId(activeSessionId);
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
          const { title } = await chatApi.generateTitle(messageText.trim() || 'File analysis') as any;
          await chatApi.renameSession(activeSessionId, title);
          await loadSessions();
        } catch (renameErr) { console.error('Rename failed:', renameErr); }
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

  // FIX 3: Capture base64 data URLs BEFORE clearing filePreviews, so they persist in the message bubble
  const handleSendMessage = async (e?: React.FormEvent, directMessage?: string) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const text = directMessage !== undefined ? directMessage : input;
    if (!text.trim() && selectedFiles.length === 0) return;

    const filesToSend = selectedFiles.length > 0 ? [...selectedFiles] : undefined;

    // Convert image files to base64 data URLs now — these won't be revoked like object URLs
    let previewUrls: string[] | undefined;
    if (filesToSend) {
      const imageFiles = filesToSend.filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        previewUrls = await Promise.all(imageFiles.map(fileToDataUrl));
      }
    }

    await sendMessage(text, undefined, filesToSend, previewUrls);
  };

  // FIX 1: Retry handler — resends the user's message, trimming everything after it
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
      if (currentSessionId === sessionIdToDelete) {
        setCurrentSessionId(null);
        persistSessionId(null);
        setMessages([]);
      }
      await loadSessions();
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
      setCurrentSessionId(null);
      persistSessionId(null);
      setMessages([]);
      await loadSessions();
    } catch (err) { console.error('Clear sessions failed:', err); }
    finally { setModalType('none'); }
  };

  const handleLogout = async () => {
    try { await authApi.logout(); } catch (err) { console.error('Logout failed:', err); }
    finally {
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
    await sendMessage(editedText, messagesBeforeEdit);
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
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-white dark:bg-zinc-950 relative transition-colors duration-300 font-sans">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-500/5 rounded-full blur-[160px] pointer-events-none" />

      <Sidebar
        user={user}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={(id) => { setCurrentSessionId(id); persistSessionId(id); }}
        onNewSession={createNewSession}
        onDeleteSession={deleteSession}
        onRenameSession={renameSession}
        onClearAll={() => setModalType('delete-all')}
        onLogout={handleLogout}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-transparent relative z-20 lg:pl-14">
        {/* Header */}
        <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/90 dark:bg-zinc-950/80 backdrop-blur-2xl border-b border-zinc-200 dark:border-zinc-800 shrink-0 transition-colors duration-300">
          <div className="flex items-center justify-between h-full px-3 md:px-5">
            <div className="w-9 md:w-10 shrink-0 flex items-center justify-center">
              <button onClick={() => setMobileOpen(true)} className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
                <Menu className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col items-center gap-0.5 max-w-[60vw] sm:max-w-xs md:max-w-sm">
              <div className="flex items-center gap-1.5">
                <StormLogo className="w-4 h-4 md:w-5 md:h-5 text-indigo-600 dark:text-indigo-500 shrink-0" />
                <span className="text-[10px] md:text-xs font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-widest">Nexus AI</span>
                <div className="hidden sm:flex items-center gap-1 ml-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              </div>
              <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 truncate">
                {sessions.find(s => s.id === currentSessionId)?.sessionName || 'New Chat'}
              </span>
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              onClick={toggleTheme}
              className="w-9 h-9 md:w-10 md:h-10 shrink-0 flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
            >
              <AnimatePresence mode="wait" initial={false}>
                {isDark
                  ? <motion.span key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}><Sun className="w-4 h-4" /></motion.span>
                  : <motion.span key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}><Moon className="w-4 h-4" /></motion.span>
                }
              </AnimatePresence>
            </motion.button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scroll-hide" onScroll={handleScroll}>
          <div className="max-w-3xl mx-auto px-3 sm:px-4 md:px-6 py-6 md:py-10">
            {messages.length === 0 && !isTyping ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-2 max-w-2xl mx-auto">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mb-8">
                  <StormLogo className="w-12 h-12 md:w-14 md:h-14 text-indigo-600" />
                </motion.div>
                <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">How can I help you today?</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                  {['Plan a 3-day trip to Tokyo', 'How to build a SaaS with React?', 'Write a professional covering letter', 'Explain the theory of relativity'].map((s, i) => (
                    <button key={i} onClick={() => handleSendMessage(undefined, s)} className="group p-3.5 md:p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-400 transition-all text-left shadow-sm">
                      <span className="block truncate">{s}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 md:space-y-8 pb-6 pt-2">
                {messages.map((msg, index) => {
                  const isEditing = editingMessage?.id === msg.id;
                  const shouldSpin = isTyping && msg.role === 'assistant' && index === messages.length - 1;
                  // FIX 3: Look up any stored image attachments for this message
                  const attachedImages = messageAttachments[msg.id] || [];

                  return (
                    <div key={msg.id || `msg-${index}`} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} group`}>
                      <div className={`flex gap-2.5 md:gap-3 w-full ${msg.role === 'user' ? 'flex-row-reverse justify-start' : 'flex-row'}`}>
                        <div className="w-7 h-7 md:w-8 md:h-8 shrink-0 flex items-center justify-center mt-1">
                          {msg.role === 'user' ? (
                            <div className="w-full h-full rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm overflow-hidden">
                              <UserAvatar name={user?.username || 'User'} className="w-full h-full text-[10px]" />
                            </div>
                          ) : (
                            <StormLogo className={`w-6 h-6 text-indigo-500 dark:text-indigo-400 ${shouldSpin ? 'animate-spin' : ''}`} />
                          )}
                        </div>

                        <div className={`flex flex-col gap-1 min-w-0 ${msg.role === 'user' ? 'max-w-[85%] md:max-w-[75%] items-end' : 'max-w-[90%] md:max-w-[80%] items-start'}`}>
                          <div className={`px-4 py-3 rounded-2xl shadow-sm border backdrop-blur-xl ${
                            msg.role === 'assistant'
                              ? 'bg-white/80 dark:bg-zinc-900/60 border-zinc-200/60 dark:border-zinc-700/50 text-zinc-900 dark:text-zinc-100 rounded-tl-none'
                              : 'bg-zinc-100/80 dark:bg-zinc-800/60 border-zinc-200/40 dark:border-zinc-700/40 text-zinc-900 dark:text-zinc-100 rounded-tr-none'
                          }`}>
                            {/* FIX 3: Render attached images above the message text */}
                            {attachedImages.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-3">
                                {attachedImages.map((url, i) => (
                                  <div key={i} className="relative group/img">
                                    <img
                                      src={url}
                                      alt={`Attachment ${i + 1}`}
                                      className="max-w-[220px] max-h-[180px] rounded-xl object-cover border border-zinc-200/50 dark:border-zinc-600/40 shadow-sm"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="text-sm md:text-base leading-relaxed markdown-body max-w-none">
                              {isEditing ? (
                                <div className="flex flex-col gap-3 min-w-[200px] sm:min-w-[340px] p-1">
                                  <textarea
                                    value={editInput}
                                    onChange={(e) => setEditInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); }
                                      if (e.key === 'Escape') handleCancelEdit();
                                    }}
                                    className="w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 resize-none min-h-[100px] bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700"
                                    autoFocus
                                  />
                                  <div className="flex justify-end gap-2">
                                    <span className="text-[9px] text-zinc-400 mr-auto">⌘↵ to send · Esc to cancel</span>
                                    <button onClick={handleCancelEdit} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg text-zinc-500 hover:text-zinc-900">Cancel</button>
                                    <button onClick={handleSaveEdit} disabled={!editInput.trim() || isTyping} className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg disabled:opacity-40 bg-indigo-600 text-white hover:bg-indigo-700">Send</button>
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
                                          <pre className="p-5 overflow-x-auto text-[0.82rem] leading-relaxed font-mono text-indigo-700 dark:text-indigo-300 whitespace-pre" {...props}>{children}</pre>
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
                                        <code className={`${className || ''} bg-zinc-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 px-1 py-0.5 rounded font-mono text-[0.85em]`} {...props}>{children}</code>
                                      );
                                    }
                                  } as Components}
                                >
                                  {cleanMessageContent(msg.content)}
                                </ReactMarkdown>
                              )}
                            </div>
                          </div>

                          {/* Message action buttons */}
                          <div className="flex items-center gap-1 mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {msg.role === 'assistant' && (
                              <span className="text-[10px] font-black text-indigo-500/50 uppercase tracking-[0.2em] mr-auto pl-1">Nexus AI</span>
                            )}
                            <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest whitespace-nowrap mr-1">
                              {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                            </span>

                            <div className="flex items-center gap-0.5">
                              {/* FIX 1: Retry button — shown next to copy for user messages */}
                              {msg.role === 'user' && !isEditing && !isTyping && (
                                <>
                                  <button
                                    onClick={() => handleRetryMessage(msg)}
                                    title="Retry"
                                    className="p-1 px-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleStartEdit(msg)}
                                    className="p-1 px-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}

                              {/* Copy button — shown for all messages */}
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(cleanMessageContent(msg.content));
                                  setCopiedId(msg.id);
                                  setTimeout(() => setCopiedId(null), 2000);
                                }}
                                className={`p-1 px-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all ${copiedId === msg.id ? 'text-emerald-500' : 'text-zinc-400 hover:text-indigo-600'}`}
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
                          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-[10px] font-medium text-zinc-400">
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
        <div className="shrink-0 bg-white dark:bg-zinc-950 border-t border-zinc-200/50 dark:border-zinc-800/50 px-3 sm:px-4 md:px-6 py-3 md:py-4">
          <div className="max-w-3xl mx-auto relative">
            <AnimatePresence>
              {showScrollBottom && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="absolute -top-14 right-2 p-2.5 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-500/30 hover:bg-indigo-700 transition-all z-10 hover:scale-110"
                >
                  <ArrowDown className="w-4 h-4 md:w-5 md:h-5" />
                </motion.button>
              )}
            </AnimatePresence>

            {/* FIX 2: Added onClick to reset value so the same file can be selected again */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
              onChange={(e) => handleFileSelection(e.target.files)}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/gif,image/webp,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.html,.css"
              className="hidden"
              onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
              onChange={(e) => handleFileSelection(e.target.files)}
            />

            <div className={`relative flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-lg transition-all ${justFinished ? 'animate-blink' : ''}`}>
              {/* File preview strip */}
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
                            <FileText className="w-6 h-6 text-indigo-500" />
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
                {/* Attach button + menu */}
                <div ref={attachMenuRef} className="relative flex items-center pl-2 pb-2.5 md:pb-3 shrink-0">
                  <AnimatePresence>
                    {showAttachMenu && (
                      <motion.div initial={{ opacity: 0, y: 6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.95 }} className="absolute bottom-full left-0 mb-2 z-50 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl min-w-[148px] overflow-hidden">
                        <button type="button" onClick={() => { cameraInputRef.current?.click(); setShowAttachMenu(false); }} className="flex items-center gap-3 w-full px-4 py-3 text-[13px] font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/60">
                          <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-indigo-100 dark:bg-indigo-950/60">
                            <Camera className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          </span>
                          Camera
                        </button>
                        <div className="h-px bg-zinc-100 dark:bg-zinc-700/50" />
                        <button type="button" onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }} className="flex items-center gap-3 w-full px-4 py-3 text-[13px] font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/60">
                          <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-violet-100 dark:bg-violet-950/60">
                            <FileText className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                          </span>
                          Files
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={() => setShowAttachMenu(prev => !prev)}
                    disabled={isProcessingFiles}
                    className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 disabled:opacity-40 ${showAttachMenu ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600' : 'text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                  >
                    <Paperclip className={`w-4 h-4 ${isProcessingFiles ? 'animate-spin' : ''}`} />
                  </motion.button>
                </div>

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
                    className="w-full px-3 md:px-4 py-3.5 md:py-4 bg-transparent focus:outline-none font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-sm md:text-base leading-relaxed resize-none min-h-[52px] max-h-[180px] overflow-y-auto"
                    onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 180)}px`; }}
                  />
                  {showBlinkingCursor && !inputFocused && !isListening && (
                    <div className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                      <BlinkingCursor />
                      <span className="text-sm md:text-base font-medium text-zinc-400">Write a message</span>
                    </div>
                  )}
                </div>

                {/* Mic + Send */}
                <div className="flex items-center gap-1 px-2 pb-2.5 md:pb-3 shrink-0">
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={toggleListening}
                    className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ${isListening ? 'bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400 ring-2 ring-red-300 dark:ring-red-700' : 'text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                  >
                    {isListening && <motion.span animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }} transition={{ repeat: Infinity, duration: 1.4 }} className="absolute inset-0 rounded-full bg-red-400/30" />}
                    <Mic className="w-4 h-4 relative z-10" />
                  </motion.button>

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
            <p className="mt-2.5 text-center text-[10px] font-medium text-zinc-500/40 dark:text-zinc-400/40">Nexus AI can analyse images and files you attach.</p>
          </div>
        </div>
      </main>

      <ConfirmationModal isOpen={modalType === 'delete-single'} onClose={() => setModalType('none')} onConfirm={confirmDeleteSession} title="Delete Chat" message="This action cannot be undone." confirmText="Delete" />
      <ConfirmationModal isOpen={modalType === 'delete-all'} onClose={() => setModalType('none')} onConfirm={confirmClearAll} title="Clear All Chats" message="All chats will be permanently deleted." confirmText="Clear All" />
    </div>
  );
}
