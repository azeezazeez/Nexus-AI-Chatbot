import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { User, Session, Message } from '../types';
import Sidebar from '../components/Sidebar';
import { chatApi, authApi } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import StormLogo from '../components/StormLogo';
import UserAvatar from '../components/UserAvatar';
import { Send, ArrowDown, Menu, X } from 'lucide-react';

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

  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      console.log('Loading messages for session:', sid);
      const response = await chatApi.getMessages(sid);
      console.log('Messages response:', response);
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

  const handleLogout = async () => {
    try {
      await authApi.logout();
      onLogout();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    setInput('');

    const tempUserMsg: Message = {
      id: Date.now(),
      sessionId: currentSessionId || 0,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setIsTyping(true);

    try {
      // Send to backend - backend will handle AI response
      const response = await chatApi.sendMessage(userMessage, currentSessionId);
      const activeSessionId = response.sessionId || currentSessionId;

      if (!currentSessionId && activeSessionId) {
        setCurrentSessionId(activeSessionId);
      }

      // Smart Naming: if this is a new chat, generate a title using Groq (via backend)
      const currentSession = sessions.find(s => s.id === activeSessionId);
      if ((!currentSessionId || (currentSession && currentSession.sessionName === "New Chat")) && activeSessionId) {
        try {
          const { title } = await chatApi.generateTitle(userMessage);
          await chatApi.renameSession(activeSessionId, title);
          await loadSessions();
        } catch (renameErr) {
          console.error("Smart renaming failed:", renameErr);
          if (response.isNewSessionHeader) await loadSessions();
        }
      }

      // The backend response already contains the AI response
      const aiMsg: Message = {
        id: Date.now() + 1,
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
        id: Date.now() + 1,
        sessionId: currentSessionId || 0,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const createNewSession = async () => {
    try {
      const response = await chatApi.createSession();
      setCurrentSessionId(response.id);
      await loadSessions();
      setIsSidebarOpen(false); // Close sidebar on mobile after creating new chat
    } catch (err: any) {
      console.error('Failed to create session:', err);
      if (err.status === 401) {
        onLogout();
      }
    }
  };

  const deleteSession = async (sid: number) => {
    try {
      await chatApi.deleteSession(sid);
      if (currentSessionId === sid) setCurrentSessionId(null);
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
        <header className="h-20 bg-white/70 dark:bg-black/20 backdrop-blur-xl border-b border-[--border] flex items-center justify-between px-4 md:px-10 shrink-0">
          <div className="flex items-center gap-4 md:gap-6 min-w-0">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2.5 -ml-1 bg-black/5 dark:bg-white/5 rounded-xl border border-[--border] text-[--text-muted] hover:text-indigo-600 transition-all flex items-center gap-2 active:scale-95 shrink-0"
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
          <div className="flex items-center gap-4">
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
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(suggestion)}
                      className="p-4 md:p-5 bg-[--surface] dark:bg-white/5 border border-[--border] rounded-2xl md:rounded-[1.5rem] text-[9px] md:text-[10px] font-black uppercase tracking-widest text-[--text-muted] hover:text-[--text-main] hover:border-indigo-500/50 transition-all shadow-sm hover:shadow-lg"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 md:gap-6 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    <div className={`w-9 h-9 md:w-12 md:h-12 rounded-xl md:rounded-2xl shrink-0 flex items-center justify-center border shadow-xl transition-all ${msg.role === 'user'
                      ? 'p-0 shadow-indigo-500/10'
                      : 'bg-[--surface] dark:bg-zinc-800 border-[--border] text-indigo-500 p-2 md:p-2.5'
                      }`}>
                      {msg.role === 'user' ? <UserAvatar name={user?.username || 'User'} className="w-full h-full text-sm md:text-lg" /> : <StormLogo className="w-full h-full" />}
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
                        initial={{ width: "auto" }}
                        animate={{ width: "auto" }}
                        className="p-6 rounded-[2rem] bg-white dark:bg-white/5 border border-indigo-500/20 text-[--text-main] leading-relaxed rounded-tl-none flex items-center gap-4 shadow-sm"
                      >
                        <div className="flex gap-1.5">
                          <motion.div
                            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 1 }}
                            className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
                          />
                          <motion.div
                            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                            className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
                          />
                          <motion.div
                            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                            className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
                          />
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
            <form onSubmit={handleSendMessage} className="relative group">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isTyping}
                placeholder={isTyping ? "Thinking..." : "Type a message..."}
                className="w-full pl-6 md:pl-8 pr-16 md:pr-20 py-4 md:py-6 bg-white dark:bg-white/5 border border-[--border] rounded-2xl md:rounded-[2.5rem] shadow-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium text-[--text-main] placeholder:text-[--text-muted]/30 tracking-wide text-xs md:text-sm"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
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
