import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { User, Session, Message } from '../types';
import Sidebar from '../components/Sidebar';
import { chatApi, authApi, wakeUpServer } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import StormLogo from '../components/StormLogo';
import UserAvatar from '../components/UserAvatar';
import ConfirmationModal from '../components/ConfirmationModal';
import { ArrowDown, ArrowUp, Copy, Check, Edit2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getErrorStatus = (err: unknown): number | null => {
  if (err && typeof err === 'object' && 'status' in err) {
    return (err as { status: number }).status;
  }
  return null;
};

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      return true;
    } catch {
      return false;
    }
  }
};

// ─── Session persistence ──────────────────────────────────────────────────────

const SESSION_KEY = 'nexus_current_session_id';

const persistSessionId = (id: number | null): void => {
  try {
    if (id === null) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, String(id));
  } catch { /* storage unavailable */ }
};

// FIX 1: Was missing () — was passing the function reference instead of
// calling it, so currentSessionId was always the function, never the stored ID.
// This caused every page refresh to start a new chat.
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function NexusLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="32" height="32" rx="8" ry="8" stroke="currentColor" strokeWidth="2.2" fill="none" />
      <line x1="10" y1="2" x2="10" y2="34" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

const CodeBlock = ({ language, value }: { language: string; value: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="group/code relative my-4 overflow-hidden rounded-xl border border-white/20 dark:border-white/10 shadow-xl backdrop-blur-xl bg-white/5 dark:bg-black/20 transition-all w-full">
      <div className="flex items-center justify-between px-3 py-2 bg-white/10 dark:bg-black/20 border-b border-white/10">
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px] font-black text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all hover:scale-105 active:scale-95 shrink-0"
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          <span className="uppercase tracking-widest hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="overflow-x-auto w-full bg-[#282c34]">
        <SyntaxHighlighter
          style={oneDark}
          language={language || 'text'}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: '1rem',
            fontSize: '0.8rem',
            background: 'transparent',
            lineHeight: '1.6',
            minWidth: 'max-content',
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
    className="inline-block w-[2px] h-[1.1em] bg-indigo-500 align-middle rounded-full"
    style={{ verticalAlign: 'text-bottom' }}
  />
);

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  user: User;
  onLogout: () => void;
}

export default function Chat({ user, onLogout }: Props) {

  // ── State ──────────────────────────────────────────────────────────────────
  const [sessions, setSessions]                     = useState<Session[]>([]);
  // FIX 1: readPersistedSessionId() — called with () to get the stored value,
  // not the function reference itself.
  const [currentSessionId, setCurrentSessionId]     = useState<number | null>(readPersistedSessionId());
  const [currentSessionName, setCurrentSessionName] = useState<string>('New Chat');
  const [messages, setMessages]                     = useState<Message[]>([]);
  const [input, setInput]                           = useState('');
  const [isTyping, setIsTyping]                     = useState(false);
  const [loading, setLoading]                       = useState(true);
  const [sessionsLoaded, setSessionsLoaded]         = useState(false);
  const [justFinished, setJustFinished]             = useState(false);
  const [showScrollBottom, setShowScrollBottom]     = useState(false);
  const [copiedId, setCopiedId]                     = useState<number | string | null>(null);
  const [editingMessage, setEditingMessage]         = useState<{ id: string | number; content: string } | null>(null);
  const [editInput, setEditInput]                   = useState('');
  const [modalType, setModalType]                   = useState<'none' | 'delete-all' | 'delete-single'>('none');
  const [sessionIdToDelete, setSessionIdToDelete]   = useState<number | null>(null);
  const [serverWaking, setServerWaking]             = useState(false);
  const [inputFocused, setInputFocused]             = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen]   = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const messagesEndRef     = useRef<HTMLDivElement>(null);
  const isSendingRef       = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef           = useRef<HTMLTextAreaElement>(null);
  const skipMessageLoadRef = useRef(false);

  // ── Central session setter ─────────────────────────────────────────────────

  /** Always updates state + localStorage atomically. */
  const updateCurrentSessionId = useCallback((id: number | null, name?: string) => {
    setCurrentSessionId(id);
    persistSessionId(id);
    setCurrentSessionName(name ?? 'New Chat');
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const loadSessions = useCallback(async (isInitialLoad = false): Promise<Session[]> => {
    try {
      if (isInitialLoad) {
        await wakeUpServer();
      }
      const response = await chatApi.getSessions() as { sessions: Session[] };
      const list = response.sessions ?? [];
      setSessions(list);
      return list;
    } catch (err: unknown) {
      console.error('Failed to load sessions:', err);
      const status = getErrorStatus(err);
      if (status === 401) onLogout();
      return [];
    } finally {
      setLoading(false);
      setSessionsLoaded(true);
    }
  }, [onLogout]);

  const loadMessages = useCallback(async (sid: number) => {
    try {
      const response = await chatApi.getMessages(sid) as {
        messages: Message[];
        stale?: boolean;
      };

      // FIX: Backend returns stale:true + 404 when the session no longer exists
      // (e.g. after a server restart). Clear localStorage and show empty state.
      if (response.stale) {
        updateCurrentSessionId(null);
        setMessages([]);
        return;
      }

      setMessages(response.messages ?? []);
    } catch (err: unknown) {
      console.error('Failed to load messages:', err);
      const status = getErrorStatus(err);
      if (status === 401) onLogout();
      // FIX: 404 means stale session — clear it from localStorage
      if (status === 404) {
        updateCurrentSessionId(null);
        setMessages([]);
      }
    }
  }, [onLogout, updateCurrentSessionId]);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => { loadSessions(true); }, [loadSessions]);

  // Sync header name from sessions list after initial load
  useEffect(() => {
    if (!sessionsLoaded) return;
    const found = sessions.find(s => s.id === currentSessionId);
    if (found?.sessionName) {
      setCurrentSessionName(found.sessionName);
    } else if (!currentSessionId) {
      setCurrentSessionName('New Chat');
    }
  }, [sessionsLoaded, sessions, currentSessionId]);

  // Staleness check: if persisted session ID no longer exists server-side, clear it
  useEffect(() => {
    if (!sessionsLoaded || sessions.length === 0) return;
    if (currentSessionId !== null && !sessions.some(s => s.id === currentSessionId)) {
      updateCurrentSessionId(null);
      setMessages([]);
    }
  }, [sessions, sessionsLoaded, currentSessionId, updateCurrentSessionId]);

  // Load messages when active session changes
  useEffect(() => {
    if (!currentSessionId) { setMessages([]); return; }
    if (skipMessageLoadRef.current) { skipMessageLoadRef.current = false; return; }
    loadMessages(currentSessionId);
  }, [currentSessionId, loadMessages]);

  // Scroll to bottom on new messages or typing indicator
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── Event handlers ─────────────────────────────────────────────────────────

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 100);
  };

  // FIX 2: Use updateCurrentSessionId (the central setter) so that state,
  // localStorage, and the header name all update atomically in one call —
  // no lag, no desync between the three pieces of state.
  const handleSelectSession = useCallback((id: number) => {
    const found = sessions.find(s => s.id === id);
    const name = found?.sessionName ?? 'New Chat';
    updateCurrentSessionId(id, name);
  }, [sessions, updateCurrentSessionId]);

  const sendMessage = async (
    messageText: string,
    messagesSnapshot?: Message[],
    isEdit = false,
  ) => {
    if (!messageText.trim() || isSendingRef.current) return;

    isSendingRef.current       = true;
    const controller           = new AbortController();
    abortControllerRef.current = controller;

    setIsTyping(true);
    setJustFinished(false);
    setServerWaking(false);

    const tempUserMsg: Message = {
      id:        'temp-' + Date.now(),
      sessionId: currentSessionId ?? 0,
      role:      'user',
      content:   messageText,
      timestamp: new Date().toISOString(),
    };

    setMessages(messagesSnapshot
      ? [...messagesSnapshot, tempUserMsg]
      : prev => [...prev, tempUserMsg]);

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const isNewSession = !currentSessionId;

    const wakingTimer = setTimeout(() => {
      if (isSendingRef.current) setServerWaking(true);
    }, 4000);

    try {
      const response = await chatApi.sendMessage(
        messageText, currentSessionId, controller.signal, 'default',
      ) as { sessionId?: number; messageId?: string; response: string };

      clearTimeout(wakingTimer);
      setServerWaking(false);

      const activeSessionId: number = response.sessionId ?? currentSessionId ?? 0;

      if (isNewSession && activeSessionId) {
        skipMessageLoadRef.current = true;
        persistSessionId(activeSessionId);
        setCurrentSessionId(activeSessionId);
        await loadSessions();
      }

      setIsTyping(false);

      if (!controller.signal.aborted) {
        const aiMsg: Message = {
          id:        response.messageId ?? 'ai-' + Date.now(),
          sessionId: activeSessionId,
          role:      'assistant',
          content:   response.response,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev =>
          prev.some(m => m.id === aiMsg.id) ? prev : [...prev, aiMsg],
        );
      }

      // Generate title for new sessions or after edits
      if (activeSessionId && (isNewSession || isEdit)) {
        try {
          const { title } = await chatApi.generateTitle(messageText) as { title: string };
          setCurrentSessionName(title);
          setSessions(prev =>
            prev.map(s => s.id === activeSessionId ? { ...s, sessionName: title } : s),
          );
          await chatApi.renameSession(activeSessionId, title);
        } catch (renameErr) {
          console.error('Title generation / rename failed:', renameErr);
        }
      }

    } catch (err: unknown) {
      clearTimeout(wakingTimer);
      setServerWaking(false);
      setIsTyping(false);

      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Chat aborted by user');
        return;
      }

      const status = getErrorStatus(err);

      // FIX: Handle stale session (404 from backend) — clear it and retry
      // as a fresh session so the user's message still goes through.
      if (status === 404 && currentSessionId) {
        console.warn('Stale session detected — clearing and retrying as new session');
        updateCurrentSessionId(null);
        setMessages([]);
        isSendingRef.current = false;
        abortControllerRef.current = null;
        // Small delay so state settles before retry
        await new Promise(resolve => setTimeout(resolve, 100));
        await sendMessage(messageText, [], isEdit);
        return;
      }

      console.error('Chat error:', err);
      const errMsg = err instanceof Error
        ? err.message
        : 'Sorry, I encountered an error. Please try again.';

      setMessages(prev => [...prev, {
        id:        'error-' + Date.now(),
        sessionId: currentSessionId ?? 0,
        role:      'assistant',
        content:   errMsg,
        timestamp: new Date().toISOString(),
      }]);

    } finally {
      // Only reset if we didn't do an early return (retry path resets itself)
      if (isSendingRef.current) {
        isSendingRef.current       = false;
        abortControllerRef.current = null;
        setJustFinished(true);
        setTimeout(() => setJustFinished(false), 3000);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, directMessage?: string) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const text = (directMessage ?? input).trim();
    if (text) await sendMessage(text);
  };

  const handleStopResponse = () => {
    abortControllerRef.current?.abort();
    setIsTyping(false);
    setServerWaking(false);
    isSendingRef.current       = false;
    abortControllerRef.current = null;
    window.speechSynthesis?.cancel();
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const createNewSession = () => {
    updateCurrentSessionId(null);
    setMessages([]);
    setInput('');
    setEditingMessage(null);
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
      if (getErrorStatus(err) === 401) onLogout();
    } finally {
      setSessionIdToDelete(null);
      setModalType('none');
    }
  };

  const renameSession = async (sid: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    // Optimistic update
    setSessions(prev =>
      prev.map(s => s.id === sid ? { ...s, sessionName: trimmed } : s),
    );
    if (sid === currentSessionId) setCurrentSessionName(trimmed);
    try {
      await chatApi.renameSession(sid, trimmed);
    } catch (err: unknown) {
      console.error('Failed to rename session:', err);
      if (getErrorStatus(err) === 401) onLogout();
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
      if (getErrorStatus(err) === 401) onLogout();
    } finally {
      setModalType('none');
    }
  };

  const handleLogout = async () => {
    try { await authApi.logout(); } catch (err) { console.error('Logout failed:', err); }
    finally {
      updateCurrentSessionId(null);
      onLogout();
    }
  };

  const cleanMessageContent = (content: string): string =>
    content.replace(/\n?\n?\[Attached Files:.*?\]/g, '').trim();

  const handleStartEdit = (msg: Message) => {
    const clean = cleanMessageContent(msg.content);
    setEditingMessage({ id: msg.id, content: clean });
    setEditInput(clean);
  };

  const handleCancelEdit = () => { setEditingMessage(null); setEditInput(''); };

  const handleSaveEdit = async () => {
    if (!editingMessage || !editInput.trim()) return;
    const editedText         = editInput.trim();
    const editedIndex        = messages.findIndex(m => m.id === editingMessage.id);
    const messagesBeforeEdit = editedIndex > 0 ? messages.slice(0, editedIndex) : [];
    setEditingMessage(null);
    setEditInput('');
    await sendMessage(editedText, messagesBeforeEdit, true);
  };

  // ── Derived UI flags ───────────────────────────────────────────────────────

  const showBlinkingCursor = !input && !inputFocused && (isTyping || justFinished);

  // ── Loading screen ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen font-sans text-zinc-400 bg-[--bg-main]">
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-4"
        >
          <StormLogo className="w-12 h-12 text-indigo-500/50" />
          <span className="tracking-widest text-[10px] font-black uppercase">Loading…</span>
        </motion.div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[--bg-main] relative transition-colors duration-300 font-sans">
      {/* Ambient glow */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[140px] pointer-events-none" />

      <Sidebar
        user={user}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={createNewSession}
        onDeleteSession={deleteSession}
        onRenameSession={renameSession}
        onClearAll={() => setModalType('delete-all')}
        onLogout={handleLogout}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-transparent relative z-20 lg:pl-14">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 h-14 bg-white/90 dark:bg-black/50 backdrop-blur-2xl border-b border-[--border] shrink-0">
          <div className="flex items-center h-full px-3 gap-2">

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="lg:hidden p-1.5 rounded-xl text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                aria-label="Open menu"
              >
                <NexusLogo className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center min-w-0">
              <div className="flex items-center gap-1.5">
                <StormLogo className="w-4 h-4 text-indigo-600 dark:text-indigo-500 shrink-0" />
                <span className="text-[10px] font-black text-[--text-main] uppercase tracking-widest leading-none">
                  Nexus AI
                </span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <span className="text-[10px] font-semibold text-[--text-muted] truncate leading-none max-w-[180px] sm:max-w-xs mt-0.5">
                {currentSessionName}
              </span>
            </div>

            <div className="shrink-0 lg:hidden">
              <UserAvatar
                name={user.username}
                className="w-7 h-7 text-[10px] shadow-sm cursor-pointer"
                onClick={() => setMobileSidebarOpen(true)}
              />
            </div>
          </div>
        </header>

        {/* ── Message list ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto scroll-hide" onScroll={handleScroll}>
          <div className="max-w-3xl mx-auto px-3 sm:px-4 md:px-6 py-6">

            {messages.length === 0 && !isTyping ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-2 max-w-xl mx-auto">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center justify-center mb-6 text-indigo-600"
                >
                  <StormLogo className="w-12 h-12" />
                </motion.div>
                <h2 className="text-xl sm:text-2xl font-bold text-[--text-main] mb-5 tracking-tight">
                  How can I help you today?
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                  {[
                    'Plan a 3-day trip to Tokyo',
                    'How to build a SaaS with React?',
                    'Write a professional covering letter',
                    'Explain the theory of relativity',
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(undefined, suggestion)}
                      className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-medium text-[--text-muted] hover:text-indigo-600 hover:border-indigo-600/30 transition-all text-left shadow-sm active:scale-[0.98]"
                    >
                      <span className="block truncate">{suggestion}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5 pb-6 pt-2">
                {messages.map((msg, index) => {
                  const isEditing  = editingMessage?.id === msg.id;
                  const shouldSpin = isTyping && msg.role === 'assistant' && index === messages.length - 1;

                  return (
                    <div
                      key={msg.id || `msg-${index}`}
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} group`}
                    >
                      <div className={`flex gap-2 w-full ${msg.role === 'user' ? 'flex-row-reverse justify-start' : 'flex-row'}`}>

                        <div className="w-7 h-7 shrink-0 flex items-center justify-center mt-1">
                          {msg.role === 'user' ? (
                            <div className="w-full h-full rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm overflow-hidden">
                              <UserAvatar name={user?.username || 'User'} className="w-full h-full text-[10px]" />
                            </div>
                          ) : (
                            <StormLogo className={`w-6 h-6 text-indigo-500 dark:text-indigo-400 ${shouldSpin ? 'animate-spin' : ''}`} />
                          )}
                        </div>

                        <div className={`flex flex-col gap-1 min-w-0 overflow-hidden ${
                          msg.role === 'user'
                            ? 'max-w-[88%] sm:max-w-[78%] items-end'
                            : 'flex-1 items-start'
                        }`}>
                          <div className={`w-full px-3 py-2.5 rounded-2xl shadow-sm border transition-all duration-300 backdrop-blur-xl ${
                            msg.role === 'assistant'
                              ? 'bg-white/80 dark:bg-zinc-900/40 border-zinc-200/40 dark:border-zinc-800/40 text-[--text-main] rounded-tl-none'
                              : 'bg-white/50 dark:bg-white/5 border-zinc-200/30 dark:border-white/10 text-[--text-main] rounded-tr-none'
                          }`}>
                            <div className="text-sm leading-relaxed markdown-body max-w-none">
                              {isEditing ? (
                                <div className="flex flex-col gap-3 min-w-[200px] p-1">
                                  <textarea
                                    value={editInput}
                                    onChange={e => setEditInput(e.target.value)}
                                    onKeyDown={e => {
                                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); }
                                      if (e.key === 'Escape') handleCancelEdit();
                                    }}
                                    className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 transition-all resize-none font-medium min-h-[80px] ${
                                      msg.role === 'user'
                                        ? 'bg-black/20 border-white/10 text-white placeholder:text-white/30'
                                        : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
                                    }`}
                                    autoFocus
                                  />
                                  <div className="flex justify-end items-center gap-2">
                                    <span className="text-[9px] text-zinc-400 mr-auto">⌘↵ send · Esc cancel</span>
                                    <button
                                      onClick={handleCancelEdit}
                                      className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg ${
                                        msg.role === 'user' ? 'text-white/60 hover:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                                      }`}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={handleSaveEdit}
                                      disabled={!editInput.trim() || isTyping}
                                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-lg disabled:opacity-40 ${
                                        msg.role === 'user'
                                          ? 'bg-white text-indigo-600 hover:bg-zinc-100'
                                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20'
                                      }`}
                                    >
                                      Send
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    pre({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) {
                                      return (
                                        <div className="my-4 overflow-hidden rounded-xl border border-indigo-200/40 dark:border-indigo-500/20 shadow-lg bg-gradient-to-br from-indigo-50/80 to-violet-50/60 dark:from-indigo-950/50 dark:to-violet-950/40 backdrop-blur-xl">
                                          <div className="flex items-center gap-2 px-4 py-2 border-b border-indigo-200/30 dark:border-indigo-500/15 bg-indigo-100/40 dark:bg-indigo-900/20">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 dark:text-indigo-500">Output</span>
                                          </div>
                                          <pre className="p-4 overflow-x-auto text-[0.8rem] leading-relaxed font-mono text-indigo-700 dark:text-indigo-300 whitespace-pre" {...props}>
                                            {children}
                                          </pre>
                                        </div>
                                      );
                                    },
                                    code({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) {
                                      const match   = /language-(\w+)/.exec(className || '');
                                      const content = String(children).replace(/\n$/, '');
                                      const isInline = !className;
                                      return !isInline && match ? (
                                        <CodeBlock language={match[1]} value={content} />
                                      ) : (
                                        <code
                                          className={`${className ?? ''} bg-zinc-100/50 dark:bg-white/5 text-indigo-500 px-1 py-0.5 rounded font-mono text-[0.85em] break-words`}
                                          {...props}
                                        >
                                          {children}
                                        </code>
                                      );
                                    },
                                    table({ children, ...props }: React.ComponentPropsWithoutRef<'table'>) {
                                      return (
                                        <div className="overflow-x-auto my-3 rounded-lg border border-zinc-200 dark:border-zinc-700">
                                          <table className="min-w-full text-sm" {...props}>{children}</table>
                                        </div>
                                      );
                                    },
                                  }}
                                >
                                  {cleanMessageContent(msg.content)}
                                </ReactMarkdown>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 mt-0.5 px-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                            {msg.role === 'assistant' && (
                              <span className="text-[9px] font-black text-indigo-500/50 uppercase tracking-[0.2em] mr-auto pl-1">
                                Nexus AI
                              </span>
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
                                  aria-label="Edit message"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  const ok = await copyToClipboard(cleanMessageContent(msg.content));
                                  if (ok) {
                                    setCopiedId(msg.id);
                                    setTimeout(() => setCopiedId(null), 2000);
                                  }
                                }}
                                className={`p-1 px-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all ${
                                  copiedId === msg.id ? 'text-emerald-500' : 'text-zinc-400 hover:text-indigo-600'
                                }`}
                                aria-label="Copy message"
                              >
                                {copiedId === msg.id
                                  ? <Check className="w-3.5 h-3.5" />
                                  : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isTyping && (
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 shrink-0 flex items-center justify-center mt-1">
                      <StormLogo className="w-6 h-6 text-indigo-500 animate-spin" />
                    </div>
                    <div className="bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex flex-col gap-2 backdrop-blur-xl">
                      <div className="flex items-center gap-2">
                        {[0, 0.2, 0.4].map(delay => (
                          <motion.div
                            key={delay}
                            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
                            transition={{ repeat: Infinity, duration: 1, delay }}
                            className="w-1.5 h-1.5 bg-indigo-600 rounded-full"
                          />
                        ))}
                      </div>
                      <AnimatePresence>
                        {serverWaking && (
                          <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500"
                          >
                            Server is waking up, please wait…
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}

            {messages.length === 0 && !isTyping && <div ref={messagesEndRef} />}
          </div>
        </div>

        {/* ── Input bar ──────────────────────────────────────────────────── */}
        <div className="shrink-0 bg-[--bg-main] border-t border-[--border]/50 px-3 sm:px-4 py-3">
          <div className="max-w-3xl mx-auto relative">

            <AnimatePresence>
              {showScrollBottom && (
                <motion.button
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.8 }}
                  onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="absolute -top-14 right-2 p-2.5 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-500/30 hover:bg-indigo-700 transition-all z-10 hover:scale-110 active:scale-90 border border-indigo-500"
                  aria-label="Scroll to bottom"
                >
                  <ArrowDown className="w-4 h-4" />
                </motion.button>
              )}
            </AnimatePresence>

            <div className={`relative flex flex-row items-end bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-lg transition-all overflow-hidden ${justFinished ? 'animate-blink' : ''}`}>
              <div className="relative flex-1 min-w-0">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (input.trim() && !isSendingRef.current) handleSendMessage();
                    }
                  }}
                  placeholder={showBlinkingCursor ? '' : 'Write a message…'}
                  rows={1}
                  className={`w-full px-4 py-3.5 bg-transparent focus:outline-none font-medium text-[--text-main] placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-sm leading-relaxed resize-none min-h-[52px] max-h-[160px] overflow-y-auto ${
                    showBlinkingCursor ? 'caret-transparent' : ''
                  }`}
                  onInput={e => {
                    const t = e.target as HTMLTextAreaElement;
                    t.style.height = 'auto';
                    t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
                  }}
                />
                {showBlinkingCursor && (
                  <div className="absolute left-4 top-0 bottom-0 flex items-center gap-1.5 pointer-events-none">
                    <BlinkingCursor />
                    <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">Write a message…</span>
                  </div>
                )}
              </div>

              <div className="flex items-center px-2.5 pb-2.5 shrink-0">
                <motion.button
                  whileHover={{ scale: isTyping || input.trim() ? 1.08 : 1.02 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={isTyping ? handleStopResponse : () => handleSendMessage()}
                  disabled={!isTyping && !input.trim()}
                  aria-label={isTyping ? 'Stop response' : 'Send message'}
                  className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 border-2 ${
                    isTyping
                      ? 'bg-white border-indigo-400 dark:bg-zinc-800 dark:border-indigo-500 shadow-lg shadow-indigo-200/50'
                      : 'bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600 shadow-md hover:border-indigo-400 dark:hover:border-indigo-500'
                  }`}
                >
                  {isTyping ? (
                    <span className="relative flex items-center justify-center w-full h-full">
                      <svg className="absolute inset-0 w-full h-full animate-spin" viewBox="0 0 40 40" aria-hidden="true">
                        <circle cx="20" cy="20" r="16" fill="none" stroke="#6366f1" strokeWidth="3" strokeDasharray="55 45" strokeLinecap="round" />
                      </svg>
                      <span className="w-3 h-3 rounded-sm bg-zinc-800 dark:bg-zinc-200 block relative z-10" />
                    </span>
                  ) : (
                    <ArrowUp className={`w-4 h-4 transition-all ${
                      input.trim() ? 'text-zinc-800 dark:text-zinc-100 scale-110' : 'text-zinc-400 dark:text-zinc-500 scale-90'
                    }`} />
                  )}
                </motion.button>
              </div>
            </div>

            <p className="mt-2 text-center text-[10px] font-medium text-[--text-muted]/40">
              Nexus AI can make mistakes. Please double-check responses.
            </p>
          </div>
        </div>
      </main>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
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
