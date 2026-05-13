import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { User, Session, Message } from '../types';
import Sidebar from '../components/Sidebar';
import { chatApi, authApi } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import StormLogo from '../components/StormLogo';
import UserAvatar from '../components/UserAvatar';
import ConfirmationModal from '../components/ConfirmationModal';
import {
  ArrowDown, ArrowUp, Menu,
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

export default function Chat({ user, onLogout }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string | number; content: string } | null>(null);
  const [editInput, setEditInput] = useState('');
  const [modalType, setModalType] = useState<'none' | 'delete-all' | 'delete-single'>('none');
  const [sessionIdToDelete, setSessionIdToDelete] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // FIX: prevents useEffect from re-fetching messages we already have after first send
  const skipMessageLoadRef = useRef(false);

  // ── Data Loading ──────────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    try {
      const response = await chatApi.getSessions();
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
      const response = await chatApi.getMessages(sid);
      setMessages(response.messages || []);
    } catch (err: unknown) {
      console.error('Failed to load messages:', err);
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) onLogout();
    }
  }, [onLogout]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // FIX: skip re-fetch when currentSessionId was just set inside handleSendMessage
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

  // ── Send Message ──────────────────────────────────────────────────────────

  const handleSendMessage = async (e?: React.FormEvent, directMessage?: string) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }

    const messageText = directMessage || input.trim();
    if (!messageText) return;
    if (isSendingRef.current) return;

    isSendingRef.current = true;
    setIsTyping(true);
    setJustFinished(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const tempUserMsg: Message = {
      id: 'temp-' + Date.now(),
      sessionId: currentSessionId || 0,
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempUserMsg]);
    setInput('');

    const isNewSession = !currentSessionId;

    try {
      const response = await chatApi.sendMessage(
        messageText,
        currentSessionId,
        [],
        controller.signal,
        'default'
      );

      const activeSessionId = response.sessionId || currentSessionId;

      if (isNewSession && activeSessionId) {
        // FIX: tell the effect to skip so it doesn't wipe messages we already have
        skipMessageLoadRef.current = true;
        setCurrentSessionId(activeSessionId);
        await loadSessions();
      }

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
          const { title } = await chatApi.generateTitle(messageText);
          await chatApi.renameSession(activeSessionId, title);
          await loadSessions();
        } catch (renameErr: unknown) {
          console.error('Rename failed:', renameErr);
        }
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') {
        console.log('Chat aborted');
      } else {
        console.error('Chat error:', err);
        setMessages(prev => [...prev, {
          id: 'error-' + Date.now(),
          sessionId: currentSessionId || 0,
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date().toISOString(),
        }]);
      }
    } finally {
      setIsTyping(false);
      isSendingRef.current = false;
      abortControllerRef.current = null;
      setJustFinished(true);
      setTimeout(() => setJustFinished(false), 3000);
      inputRef.current?.focus();
    }
  };

  const handleStopResponse = () => {
    abortControllerRef.current?.abort();
    setIsTyping(false);
    isSendingRef.current = false;
    abortControllerRef.current = null;
    window.speechSynthesis?.cancel();
  };

  const createNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setInput('');
    setIsSidebarOpen(false);
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
        setCurrentSessionId(null);
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
      setCurrentSessionId(null);
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
    finally { onLogout(); }
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

  const handleSaveEdit = () => {
    if (!editingMessage || !editInput.trim()) return;
    setMessages(prev =>
      prev.map(m => m.id === editingMessage.id ? { ...m, content: editInput } : m)
    );
    setEditingMessage(null);
    setEditInput('');
  };

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
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-[--bg-main] relative transition-colors duration-300 font-sans">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-500/5 rounded-full blur-[160px] pointer-events-none" />

      <Sidebar
        user={user}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={(id) => { setCurrentSessionId(id); setIsSidebarOpen(false); }}
        onNewSession={createNewSession}
        onDeleteSession={deleteSession}
        onRenameSession={renameSession}
        onClearAll={() => setModalType('delete-all')}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-transparent relative z-20">

        {/* ── Header ── */}
        <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/80 dark:bg-black/40 backdrop-blur-2xl border-b border-[--border] flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 bg-black/5 dark:bg-white/5 rounded-lg border border-[--border] text-[--text-muted]"
            >
              <Menu className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <div className="flex items-center gap-2 md:gap-3">
              <StormLogo className="w-6 h-6 text-indigo-600 dark:text-indigo-500 transition-all" />
              <div className="hidden sm:flex flex-col">
                <span className="text-[10px] font-black text-[--text-main] uppercase tracking-widest leading-none mb-1">Scout AI</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[8px] font-bold text-[--text-muted]/60 uppercase tracking-widest">Scout Active</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 text-center px-4 overflow-hidden">
            <span className="text-[10px] md:text-xs font-bold text-[--text-main] truncate block max-w-[200px] md:max-w-md mx-auto">
              {sessions.find(s => s.id === currentSessionId)?.sessionName || 'New Chat'}
            </span>
          </div>
          <div className="w-10 md:w-20" />
        </header>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-4 py-8 md:py-12 scroll-hide" onScroll={handleScroll}>
          <div className="max-w-3xl mx-auto">
            {messages.length === 0 && !isTyping ? (
              <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4 max-w-2xl mx-auto">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center justify-center mb-10 text-indigo-600"
                >
                  <StormLogo className="w-14 h-14" />
                </motion.div>
                <h2 className="text-3xl font-bold text-[--text-main] mb-8 tracking-tight">
                  How can I help you today?
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                  {[
                    'Plan a 3-day trip to Tokyo',
                    'How to build a SaaS with React?',
                    'Write a professional covering letter',
                    'Explain the theory of relativity',
                  ].map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(undefined, s)}
                      className="group p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-medium text-[--text-muted] hover:text-indigo-600 hover:border-indigo-600/30 transition-all text-left shadow-sm"
                    >
                      <span className="block truncate">{s}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-8 pb-32 pt-4">
                {messages.map((msg, index) => {
                  const isEditing = editingMessage?.id === msg.id;
                  return (
                    <div
                      key={msg.id || `msg-${index}`}
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} group`}
                    >
                      <div className={`flex gap-3 max-w-[90%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

                        {/* Avatar — no background behind AI logo */}
                        <div className="w-7 h-7 md:w-8 md:h-8 shrink-0 flex items-center justify-center mt-1">
                          {msg.role === 'user' ? (
                            <div className="w-full h-full rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm overflow-hidden">
                              <UserAvatar name={user?.username || 'User'} className="w-full h-full text-[10px]" />
                            </div>
                          ) : (
                            <StormLogo
                              className={`w-6 h-6 text-indigo-500 dark:text-indigo-400 ${
                                isTyping && index === messages.length - 1 ? 'animate-spin' : ''
                              }`}
                            />
                          )}
                        </div>

                        <div className="flex flex-col gap-1 min-w-0 max-w-full">
                          <div className={`px-4 py-3 rounded-2xl shadow-sm border transition-all duration-300 w-fit backdrop-blur-xl ${
                            msg.role === 'assistant'
                              ? 'bg-white/80 dark:bg-zinc-900/40 border-zinc-200/40 dark:border-zinc-800/40 text-[--text-main]'
                              : 'bg-white/50 dark:bg-white/5 border-zinc-200/30 dark:border-white/10 text-[--text-main]'
                          } ${msg.role === 'user' ? 'rounded-tr-none ml-auto' : 'rounded-tl-none mr-auto'}`}>
                            <div className="text-sm md:text-base leading-relaxed markdown-body max-w-none">
                              {isEditing ? (
                                <div className="flex flex-col gap-3 min-w-[240px] sm:min-w-[400px] p-1">
                                  <textarea
                                    value={editInput}
                                    onChange={(e) => setEditInput(e.target.value)}
                                    className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 transition-all resize-none font-medium min-h-[120px] ${
                                      msg.role === 'user'
                                        ? 'bg-black/20 border-white/10 text-white placeholder:text-white/30'
                                        : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
                                    }`}
                                    autoFocus
                                  />
                                  <div className="flex justify-end gap-2">
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
                                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-lg ${
                                        msg.role === 'user'
                                          ? 'bg-white text-indigo-600 hover:bg-zinc-100'
                                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20'
                                      }`}
                                    >
                                      Save Changes
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
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

                          {/* Actions & Timestamp */}
                          <div className="flex justify-end items-center gap-1 mt-1.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {msg.role === 'assistant' && (
                              <span className="text-[10px] font-black text-indigo-500/50 uppercase tracking-[0.2em] mr-auto pl-1">Scout AI</span>
                            )}
                            <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest whitespace-nowrap mr-1">
                              {msg.timestamp
                                ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : 'Now'}
                            </span>
                            <div className="flex items-center gap-0.5">
                              {msg.role === 'user' && !isEditing && (
                                <button
                                  onClick={() => handleStartEdit(msg)}
                                  className="p-1 px-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-600 transition-all"
                                  title="Edit message"
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
                    <div className="bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2 backdrop-blur-xl">
                      <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                      <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                      <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── Input Area ── */}
        <div className="p-4 md:p-8 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className={`relative flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl shadow-2xl transition-all overflow-visible ${justFinished ? 'animate-blink' : ''}`}>

              {/* Scroll-to-bottom */}
              <AnimatePresence>
                {showScrollBottom && (
                  <motion.button
                    initial={{ opacity: 0, y: 10, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.8 }}
                    onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                    className="absolute -top-16 right-4 md:right-6 p-2.5 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-500/30 hover:bg-indigo-700 transition-all z-50 group hover:scale-110 active:scale-90 border border-indigo-500"
                  >
                    <ArrowDown className="w-5 h-5" />
                    <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 text-white text-[10px] font-black uppercase tracking-widest rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                      Scroll to bottom
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isTyping) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isTyping}
                placeholder="Write a message..."
                rows={1}
                className="w-full px-5 pt-5 pb-2 bg-transparent focus:outline-none font-medium text-[--text-main] placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-base leading-relaxed resize-none min-h-[60px] max-h-[200px]"
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
              />

              <div className="flex items-center justify-end px-3 pb-3 pt-1">
                {/* Send / Stop button */}
                <motion.button
                  whileHover={{ scale: isTyping || input.trim() ? 1.05 : 1 }}
                  whileTap={{ scale: isTyping || input.trim() ? 0.95 : 1 }}
                  onClick={isTyping ? handleStopResponse : () => handleSendMessage()}
                  disabled={!input.trim() && !isTyping}
                  aria-label={isTyping ? 'Stop response' : 'Send message'}
                  className={`relative flex items-center justify-center w-10 h-10 rounded-xl transition-all border ${
                    isTyping
                      ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/60 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 shadow-sm'
                      : input.trim()
                        ? 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-700 shadow-md shadow-indigo-500/20'
                        : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  {isTyping ? (
                    <span className="relative flex items-center justify-center w-full h-full">
                      {/* Pulsing ring around the stop button */}
                      <span className="absolute inset-1 rounded-lg border border-red-400/50 animate-ping" />
                      {/* Stop square */}
                      <span className="w-3.5 h-3.5 rounded-sm bg-red-500 block relative z-10" />
                    </span>
                  ) : (
                    <ArrowUp className={`w-4 h-4 transition-transform ${input.trim() ? 'scale-110' : 'scale-90 opacity-40'}`} />
                  )}
                </motion.button>
              </div>
            </div>

            <p className="mt-4 text-center text-[10px] font-medium text-[--text-muted]/40">
              Scout AI can make mistakes. Check important info.
            </p>
          </div>
        </div>
      </main>

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
        message="Are you sure you want to delete ALL chats? This action is permanent."
        confirmText="Clear All"
      />
    </div>
  );
}
