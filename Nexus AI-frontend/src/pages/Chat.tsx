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
  Copy, Check, Edit2,
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

export default function Chat({ user, onLogout }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(readPersistedSessionId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionsLoaded, setSessionsLoaded] = useState(false); // FIX: track successful load
  const [justFinished, setJustFinished] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string | number; content: string } | null>(null);
  const [editInput, setEditInput] = useState('');
  const [modalType, setModalType] = useState<'none' | 'delete-all' | 'delete-single'>('none');
  const [sessionIdToDelete, setSessionIdToDelete] = useState<number | null>(null);
  const [serverWaking, setServerWaking] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

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

  // ── Data Loading ──────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    try {
      wakeUpServer();
      const response = await chatApi.getSessions() as any;
      setSessions(response.sessions || []);
      setSessionsLoaded(true); // FIX: only mark loaded on success
    } catch (err: unknown) {
      console.error('Failed to load sessions:', err);
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) onLogout();
      // FIX: do NOT set sessionsLoaded on error — preserves currentSessionId
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
    if (!sessionsLoaded) return; // FIX: only clear session after a successful sessions load
    if (currentSessionId !== null) {
      const stillExists = sessions.some(s => s.id === currentSessionId);
      if (!stillExists) {
        updateCurrentSessionId(null);
        setMessages([]);
      }
    }
  }, [sessions, loading, sessionsLoaded]); // FIX: added sessionsLoaded to deps

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

  // ── Core send ─────────────────────────────────────────────────────────────
  const sendMessage = async (messageText: string, messagesSnapshot?: Message[]) => {
    if (!messageText.trim()) return;
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
        'default'
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

      if (
        (isNewSession || sessions.find(s => s.id === activeSessionId)?.sessionName === 'New Chat') &&
        activeSessionId
      ) {
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
      setJustFinished(true);
      setTimeout(() => setJustFinished(false), 3000);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, directMessage?: string) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const text = directMessage || input.trim();
    await sendMessage(text);
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

  // ── Derived values & stable callbacks — MUST be before any early return ───
  // Rule of Hooks: hooks and values derived from hooks cannot appear after
  // a conditional return. Keep ALL of them here, above the loading guard.
  const showBlinkingCursor = !input && (isTyping || justFinished);

  // ── Loading Screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen font-sans text-zinc-400 bg-[--bg-main]">
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
    // FIX: Use h-[100dvh] for mobile browser chrome, flex layout root
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-[--bg-main] relative transition-colors duration-300 font-sans">

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
      />

      {/*
        ── MAIN CONTENT AREA ──
        FIX: pl-14 on all screens to account for the collapsed sidebar rail (w-14).
        On mobile when sidebar is open, we also show the backdrop overlay below.
      */}
      <main className="flex-1 flex flex-col min-w-0 bg-transparent relative z-20 pl-14">

        {/* ── HEADER ── */}
        <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/80 dark:bg-black/40 backdrop-blur-2xl border-b border-[--border] shrink-0">
          <div className="flex items-center justify-center h-full px-3 md:px-5">
            {/* Centre — Logo + App name + session title */}
            <div className="flex flex-col items-center gap-0.5 max-w-[70vw] sm:max-w-xs md:max-w-sm">
              <div className="flex items-center gap-1.5">
                <StormLogo className="w-4 h-4 md:w-5 md:h-5 text-indigo-600 dark:text-indigo-500 shrink-0" />
                <span className="text-[10px] md:text-xs font-black text-[--text-main] uppercase tracking-widest leading-none">
                  Nexus AI
                </span>
                <div className="hidden sm:flex items-center gap-1 ml-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              </div>
              <span className="text-[10px] font-semibold text-[--text-muted] truncate leading-none max-w-full">
                {sessions.find(s => s.id === currentSessionId)?.sessionName || 'New Chat'}
              </span>
            </div>
          </div>
        </header>

        {/* ── MESSAGES SCROLL AREA ── */}
        {/*
          FIX: flex-1 + overflow-y-auto ensures this fills available height between
          header and input bar, and scrolls independently. pb-4 gives breathing room
          above the sticky input bar.
        */}
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
                <h2 className="text-2xl md:text-3xl font-bold text-[--text-main] mb-6 tracking-tight">
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
                      className="group p-3.5 md:p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-medium text-[--text-muted] hover:text-indigo-600 hover:border-indigo-600/30 transition-all text-left shadow-sm"
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
                              ? 'bg-white/80 dark:bg-zinc-900/40 border-zinc-200/40 dark:border-zinc-800/40 text-[--text-main] rounded-tl-none'
                              : 'bg-white/50 dark:bg-white/5 border-zinc-200/30 dark:border-white/10 text-[--text-main] rounded-tr-none'
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
                                        ? 'bg-black/20 border-white/10 text-white placeholder:text-white/30'
                                        : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
                                    }`}
                                    autoFocus
                                  />
                                  <div className="flex justify-end items-center gap-2">
                                    <span className="text-[9px] text-zinc-400 mr-auto">⌘↵ to send · Esc to cancel</span>
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
                                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed ${
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
                        className={`${className || ''} bg-zinc-100/50 dark:bg-white/5 text-indigo-500 px-1 py-0.5 rounded font-mono text-[0.85em]`}
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
                    <div className="bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex flex-col gap-2 backdrop-blur-xl">
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
        {/*
          FIX: shrink-0 keeps the input bar at the bottom and prevents it from
          being squeezed by the message area. No absolute/fixed positioning needed
          because the parent is a flex column with overflow on the message area.
        */}
        <div className="shrink-0 bg-[--bg-main] border-t border-[--border]/50 px-3 sm:px-4 md:px-6 py-3 md:py-4">
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

            {/* Input container */}
            <div className={`relative flex flex-row items-end bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-lg transition-all overflow-hidden ${justFinished ? 'animate-blink' : ''}`}>
              {/* Textarea */}
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
                  disabled={isTyping}
                  placeholder={showBlinkingCursor ? '' : 'Write a message...'}
                  rows={1}
                  className="w-full px-4 md:px-5 py-3.5 md:py-4 bg-transparent focus:outline-none font-medium text-[--text-main] placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-sm md:text-base leading-relaxed resize-none min-h-[52px] max-h-[180px] overflow-y-auto"
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${Math.min(target.scrollHeight, 180)}px`;
                  }}
                />
                {/* Blinking cursor placeholder */}
                {showBlinkingCursor && !inputFocused && (
                  <div className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                    <span className="text-sm md:text-base font-medium text-zinc-400 dark:text-zinc-500">Write a message</span>
                    <BlinkingCursor />
                  </div>
                )}
              </div>

              {/* Send / Stop button */}
              <div className="flex items-center px-2.5 md:px-3 pb-2.5 md:pb-3 shrink-0">
                <motion.button
                  whileHover={{ scale: isTyping || input.trim() ? 1.08 : 1.02 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={isTyping ? handleStopResponse : () => handleSendMessage()}
                  disabled={!input.trim() && !isTyping}
                  aria-label={isTyping ? 'Stop response' : 'Send message'}
                  className={`relative flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full transition-all duration-200 border-2 ${
                    isTyping
                      ? 'bg-white border-indigo-400 dark:bg-zinc-800 dark:border-indigo-500 shadow-lg shadow-indigo-200/50'
                      : 'bg-white border-zinc-300 dark:bg-zinc-800 dark:border-zinc-600 shadow-md hover:border-indigo-400 dark:hover:border-indigo-500'
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
                    <ArrowUp className={`w-4 h-4 transition-all ${input.trim() ? 'text-zinc-800 dark:text-zinc-100 scale-110' : 'text-zinc-400 dark:text-zinc-500 scale-90'}`} />
                  )}
                </motion.button>
              </div>
            </div>

            {/* Disclaimer */}
            <p className="mt-2.5 text-center text-[10px] font-medium text-[--text-muted]/40">
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
