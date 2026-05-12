import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { User, Session, Message } from '../types';
import Sidebar from '../components/Sidebar';
import { chatApi, authApi } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import StormLogo from '../components/StormLogo';
import UserAvatar from '../components/UserAvatar';
import { Send, ArrowDown, Menu } from 'lucide-react';

interface Props {
  user: User;
  onLogout: () => void;
}

export default function Chat({ user, onLogout }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // ── Autocomplete state ──────────────────────────────────────────────────────
  const [suggestion, setSuggestion] = useState('');
  const autocompleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingSuggestionRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Use a more reliable lock with timestamp
  const lastSendTimeRef = useRef<number>(0);
  const isSendingRef = useRef(false);

  const loadSessions = useCallback(async () => {
    try {
      const response = await chatApi.getSessions();
      setSessions(response.sessions || []);
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
      if (err.status === 401) {
        onLogout();
      }
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  const loadMessages = useCallback(async (sid: number) => {
    try {
      const response = await chatApi.getMessages(sid);
      setMessages(response.messages || []);
    } catch (err: any) {
      console.error('Failed to load messages:', err);
      if (err.status === 401) onLogout();
    }
  }, [onLogout]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (currentSessionId) {
      loadMessages(currentSessionId);
    } else {
      setMessages([]);
    }
  }, [currentSessionId, loadMessages]);

  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, isTyping]);

  useEffect(() => {
    return () => {
      if (autocompleteTimeoutRef.current) clearTimeout(autocompleteTimeoutRef.current);
    };
  }, []);

  const fetchSuggestionFromBackend = useCallback(async (text: string) => {
    if (text.length < 3 || isFetchingSuggestionRef.current) {
      setSuggestion('');
      return;
    }

    isFetchingSuggestionRef.current = true;
    
    try {
      const response = await fetch('/api/chat/autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: text }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setSuggestion(data.suggestion || '');
      } else {
        setSuggestion('');
      }
    } catch (error) {
      console.error('Autocomplete error:', error);
      setSuggestion('');
    } finally {
      isFetchingSuggestionRef.current = false;
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    
    if (autocompleteTimeoutRef.current) {
      clearTimeout(autocompleteTimeoutRef.current);
    }
    
    if (val.length >= 3) {
      autocompleteTimeoutRef.current = setTimeout(() => {
        fetchSuggestionFromBackend(val);
      }, 300);
    } else {
      setSuggestion('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      setInput(input + suggestion);
      setSuggestion('');
    }
    if (e.key === 'Escape') setSuggestion('');
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      onLogout();
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Multiple layers of protection against double-sends
    const now = Date.now();
    
    // Check if we're already sending
    if (isSendingRef.current) {
      console.log('Already sending, ignoring duplicate');
      return;
    }
    
    // Check if we sent recently (within last 2 seconds)
    if (lastSendTimeRef.current && (now - lastSendTimeRef.current) < 2000) {
      console.log('Recent send detected, ignoring duplicate');
      return;
    }
    
    if (!input.trim()) return;
    
    // Set both locks
    isSendingRef.current = true;
    lastSendTimeRef.current = now;

    const userMessage = input.trim();
    setSuggestion('');
    setInput('');
    setIsTyping(true);

    const tempUserMsg: Message = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      sessionId: currentSessionId || 0,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const response = await chatApi.sendMessage(userMessage, currentSessionId);
      const activeSessionId = response.sessionId || currentSessionId;

      if (!currentSessionId && activeSessionId) {
        setCurrentSessionId(activeSessionId);
        await loadSessions();
      }

      const currentSession = sessions.find(s => s.id === activeSessionId);
      if (
        (!currentSessionId || (currentSession && currentSession.sessionName === 'New Chat')) &&
        activeSessionId
      ) {
        try {
          const { title } = await chatApi.generateTitle(userMessage);
          await chatApi.renameSession(activeSessionId, title);
          await loadSessions();
        } catch (renameErr) {
          console.error('Smart renaming failed:', renameErr);
          if (response.isNewSessionHeader) await loadSessions();
        }
      }

      const aiMsg: Message = {
        id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + 1).toString(),
        sessionId: activeSessionId,
        role: 'assistant',
        content: response.response,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);

    } catch (err: any) {
      console.error('Chat error:', err);
      if (err.status === 401) {
        onLogout();
        return;
      }
      const errMsg: Message = {
        id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + 1).toString(),
        sessionId: currentSessionId || 0,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
      // Release the send lock after a longer delay
      setTimeout(() => {
        isSendingRef.current = false;
      }, 1000);
    }
  };

  const createNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setInput('');
    setSuggestion('');
    setIsSidebarOpen(false);
  };

  const deleteSession = async (sid: number) => {
    try {
      await chatApi.deleteSession(sid);
      if (currentSessionId === sid) {
        setCurrentSessionId(null);
        setMessages([]);
      }
      await loadSessions();
    } catch (err: any) {
      console.error('Failed to delete session:', err);
      if (err.status === 401) {
        onLogout();
      }
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to delete all chats? This cannot be undone.')) return;
    try {
      await chatApi.clearSessions();
      setCurrentSessionId(null);
      setMessages([]);
      await loadSessions();
    } catch (err: any) {
      console.error('Failed to clear sessions:', err);
      if (err.status === 401) {
        onLogout();
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen font-sans text-zinc-400 bg-[--bg-main]">
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-4"
        >
          <StormLogo className="w-12 h-12 text-indigo-500/50" />
          <span className="tracking-widest text-[10px] font-black uppercase">Loading...</span>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-[--bg-main] relative transition-colors duration-300">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-500/5 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-0 left-80 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[140px] pointer-events-none" />

      <Sidebar
        user={user}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={(id) => {
          setCurrentSessionId(id);
          setIsSidebarOpen(false);
        }}
        onNewSession={createNewSession}
        onDeleteSession={deleteSession}
        onClearAll={handleClearAll}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-transparent relative z-20">
        <header className="sticky top-0 z-30 h-20 bg-white/80 dark:bg-black/40 backdrop-blur-2xl border-b border-[--border] flex items-center justify-between px-4 md:px-10 shrink-0">
          <div className="flex items-center gap-4 md:gap-6 min-w-0">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsSidebarOpen(true);
                loadSessions();
              }}
              className="lg:hidden p-2.5 -ml-1 bg-black/5 dark:bg-white/5 rounded-xl border border-[--border] text-[--text-muted] hover:text-indigo-600 transition-all flex items-center gap-2 active:scale-95 shrink-0 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline-block">Chats</span>
            </button>
            <div className="hidden sm:flex items-center gap-2.5 shrink-0">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)] animate-pulse" />
              <span className="text-[10px] font-black text-[--text-muted]/40 uppercase tracking-[0.25em]">Online</span>
            </div>
            {currentSessionId && (
              <>
                <div className="hidden sm:block h-4 w-px bg-[--border] shrink-0" />
                <span className="text-xs font-bold text-[--text-main] tracking-wide truncate max-w-[120px] sm:max-w-xs px-1">
                  {sessions.find(s => s.id === currentSessionId)?.sessionName || 'Chatting...'}
                </span>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 md:px-10 lg:px-20 py-8 md:py-12 scroll-hide">
          <div className="max-w-4xl mx-auto space-y-8 md:space-y-12">
            {messages.length === 0 && !isTyping ? (
              <div className="flex flex-col items-center justify-center h-full pt-10 md:pt-20 text-center px-4">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-16 h-16 md:w-24 md:h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl md:rounded-[2.5rem] shadow-2xl shadow-indigo-500/20 flex items-center justify-center mb-6 md:mb-10 relative text-white p-4 md:p-6"
                >
                  <div className="absolute inset-0 rounded-3xl md:rounded-[2.5rem] bg-indigo-500/20 animate-ping opacity-20" />
                  <StormLogo className="w-full h-full" />
                </motion.div>
                <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight text-[--text-main] mb-4">
                  Welcome, {user?.name?.split(' ')[0] || user?.username || 'User'}
                </h2>
                <p className="text-[--text-muted] max-w-sm md:max-w-md leading-relaxed text-xs md:text-sm font-medium">
                  I'm here to help you. What would you like to chat about today?
                </p>
                <div className="mt-8 md:mt-16 grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 w-full max-w-2xl text-left">
                  {[
                    "Healthy breakfast ideas",
                    "How to build a React app",
                    "Write a poem about rain",
                    "Explain quantum physics"
                  ].map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(s)}
                      className="p-4 md:p-5 bg-[--surface] dark:bg-white/5 border border-[--border] rounded-2xl md:rounded-[1.5rem] text-[9px] md:text-[10px] font-black uppercase tracking-widest text-[--text-muted] hover:text-[--text-main] hover:border-indigo-500/50 transition-all shadow-sm hover:shadow-lg"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((msg, index) => (
                  <motion.div
                    key={msg.id || index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 md:gap-6 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    <div className={`w-9 h-9 md:w-12 md:h-12 rounded-xl md:rounded-2xl shrink-0 flex items-center justify-center border shadow-xl transition-all ${msg.role === 'user'
                      ? 'p-0 shadow-indigo-500/10'
                      : 'bg-[--surface] dark:bg-zinc-800 border-[--border] text-indigo-500 p-2 md:p-2.5'
                      }`}>
                      {msg.role === 'user'
                        ? <UserAvatar name={user?.username || 'User'} className="w-full h-full text-sm md:text-lg" />
                        : <StormLogo className="w-full h-full" />}
                    </div>
                    <div className={`flex flex-col max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`p-4 md:p-6 rounded-2xl md:rounded-[2rem] border transition-colors shadow-sm ${msg.role === 'user'
                        ? 'bg-indigo-600 text-white border-indigo-500 font-medium'
                        : 'bg-white dark:bg-white/5 text-[--text-main] border-[--border] leading-relaxed'
                        } ${msg.role === 'user' ? 'rounded-tr-none' : 'rounded-tl-none'}`}>
                        <p className="text-sm md:text-base whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      <span className="mt-2 md:mt-3 text-[8px] md:text-[9px] font-black text-[--text-muted]/40 uppercase tracking-[0.2em] px-2 md:px-3">
                        {msg.role === 'user' ? 'You' : 'Nexus AI'} • {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                      </span>
                    </div>
                  </motion.div>
                ))}

                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-6"
                  >
                    <div className="w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center bg-[--surface] dark:bg-zinc-800 border border-[--border] text-indigo-500 p-2.5 shadow-xl">
                      <StormLogo className="w-full h-full" />
                    </div>
                    <div className="flex flex-col items-start max-w-[75%]">
                      <motion.div
                        className="p-6 rounded-[2rem] bg-white dark:bg-white/5 border border-indigo-500/20 text-[--text-main] leading-relaxed rounded-tl-none flex items-center gap-4 shadow-sm"
                      >
                        <div className="flex gap-1.5">
                          {[0, 0.2, 0.4].map((delay, i) => (
                            <motion.div
                              key={i}
                              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                              transition={{ repeat: Infinity, duration: 1, delay }}
                              className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
                            />
                          ))}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Thinking...</span>
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="p-4 md:p-10 lg:p-16 pt-2 shrink-0 bg-gradient-to-t from-[--bg-main] via-[--bg-main] to-transparent">
          <div className="max-w-4xl mx-auto relative">

            {/* Quick-reply chips */}
            {!isTyping && messages.length > 0 && !suggestion && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scroll-hide">
                {["Explain more", "Give an example", "Summarize this", "How to fix it?", "What are alternatives?"].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(s); fetchSuggestionFromBackend(s); }}
                    className="shrink-0 px-3 py-1.5 text-[9px] md:text-[10px] font-black uppercase tracking-widest bg-[--surface] dark:bg-white/5 border border-[--border] rounded-full text-[--text-muted] hover:text-indigo-500 hover:border-indigo-500/50 transition-all whitespace-nowrap"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Autocomplete suggestion pill */}
            <AnimatePresence>
              {suggestion && !isTyping && (
                <motion.div
                  key="suggestion-pill"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.18 }}
                  className="mb-2.5 flex items-center gap-2 overflow-x-auto scroll-hide"
                >
                  <span className="shrink-0 px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
                    AI
                  </span>
                  <button
                    onClick={() => {
                      setInput(input + suggestion);
                      setSuggestion('');
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white/60 dark:bg-white/[0.06] border border-indigo-300/40 dark:border-indigo-500/20 rounded-xl shadow-sm hover:border-indigo-400/60 hover:bg-indigo-50/60 dark:hover:bg-indigo-500/10 transition-all group max-w-[85%]"
                    title="Click or press Tab to accept"
                  >
                    <span className="text-[11px] md:text-xs font-medium text-[--text-muted]/40 truncate shrink-0 max-w-[120px] hidden sm:inline">
                      {input}
                    </span>
                    <span className="text-[11px] md:text-xs font-semibold text-indigo-500 dark:text-indigo-400 truncate">
                      {suggestion}
                    </span>
                    <span className="shrink-0 ml-1 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest border border-[--border] rounded-md text-[--text-muted]/50 group-hover:border-indigo-400/40 group-hover:text-indigo-400 transition-all hidden sm:inline-block">
                      Tab
                    </span>
                  </button>
                  <button
                    onClick={() => setSuggestion('')}
                    className="shrink-0 text-[--text-muted]/30 hover:text-[--text-muted]/60 text-xs transition-colors px-1"
                    aria-label="Dismiss suggestion"
                  >
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSendMessage} className="relative group">
              {/* Ghost-text layer */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center pl-6 md:pl-8 pr-16 md:pr-20 overflow-hidden rounded-2xl md:rounded-[2.5rem]"
              >
                <span className="font-medium text-xs md:text-sm tracking-wide whitespace-pre text-transparent select-none">
                  {input}
                </span>
                {suggestion && !isTyping && (
                  <span className="font-medium text-xs md:text-sm tracking-wide whitespace-pre text-[--text-muted]/30 select-none">
                    {suggestion}
                  </span>
                )}
              </div>

              <input
                type="text"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isTyping || isSendingRef.current}
                placeholder={isTyping ? "Thinking..." : "Type a message..."}
                className="w-full pl-6 md:pl-8 pr-16 md:pr-20 py-4 md:py-6 bg-white dark:bg-white/5 border border-[--border] rounded-2xl md:rounded-[2.5rem] shadow-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium text-[--text-main] placeholder:text-[--text-muted]/30 tracking-wide text-xs md:text-sm"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping || isSendingRef.current}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 md:w-14 md:h-14 bg-indigo-600 text-white dark:bg-white dark:text-black rounded-full flex items-center justify-center shadow-2xl hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 group"
              >
                <div className="group-hover:translate-x-0.5 transition-transform">
                  <Send className="w-4 h-4 md:w-5 md:h-5" />
                </div>
              </button>
            </form>
          </div>
          <div className="mt-4 md:mt-6 flex items-center justify-center gap-4 md:gap-6">
            <p className="text-[7px] md:text-[8px] font-bold text-[--text-muted]/30 uppercase tracking-[0.3em]">AI-Powered Assistant</p>
            <div className="w-1 h-1 rounded-full bg-[--border]" />
            <p className="text-[7px] md:text-[8px] font-bold text-[--text-muted]/30 uppercase tracking-[0.3em]">Built with Nexus AI</p>
          </div>
        </div>

        <AnimatePresence>
          {messages.length > 5 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="absolute bottom-40 right-10 p-4 bg-white dark:bg-zinc-800 border border-[--border] rounded-full shadow-2xl text-[--text-muted] hover:text-[--text-main] transition-all z-20 hover:border-indigo-500/50"
            >
              <ArrowDown className="w-5 h-5" />
            </motion.button>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
