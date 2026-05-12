import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { User, Session, Message } from '../types';
import Sidebar from '../components/Sidebar';
import { chatApi, authApi } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import StormLogo from '../components/StormLogo';
import UserAvatar from '../components/UserAvatar';
import { Send, Menu } from 'lucide-react';

interface Props {
  user: User;
  onLogout: () => void;
}

const SUGGESTIONS_BANK = [
  "How can I help you today?",
  "How to implement a responsive layout in React?",
  "How to fix common JavaScript errors?",
  "How to build a full-stack app with Node.js?",
  "What is the best way to learn TypeScript?",
  "What are the benefits of using Tailwind CSS?",
  "What does this code do in this context?",
  "Why is my application running slow?",
  "Why should I use functional components?",
  "Can you explain higher-order functions?",
  "Can you write a unit test for this?",
  "Explain the difference between SQL and NoSQL.",
  "Tell me about the latest web development trends.",
  "Write a clean code example for a login form.",
  "Generate a sample database schema for a blog.",
  "Fix this bug in my React hook.",
  "Debug this layout issue on mobile devices.",
  "I'm looking for healthy breakfast ideas.",
  "Draft a poem about the morning rain.",
  "Explain quantum physics to a five year old.",
  "How to deploy a website to the cloud?",
  "What are some creative gift ideas for developers?",
  "Can you tell me a joke about programming?",
  "Help me structure my project folders.",
  "Describe the concept of 'closure' in JS.",
  "How to optimize images for faster loading?",
  "What is the purpose of a Docker container?",
  "Write a professional email for a job application.",
];

// ── Helper: only log out on hard auth failures ────────────────────────────────
// A 401 on /auth/me or /auth/status means the session is truly gone.
// A 401 on chat routes is likely a transient error — do NOT log out.
function isHardAuthFailure(err: any, url?: string): boolean {
  if (err?.status !== 401) return false;
  // Only treat as hard failure when explicitly checking auth
  if (url?.includes('/auth/me') || url?.includes('/auth/status')) return true;
  return false;
}

export default function Chat({ user, onLogout }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // ── Autocomplete state ──────────────────────────────────────────────────────
  const [suggestion, setSuggestion] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const justCreatedSessionRef = useRef<number | null>(null);

  // ── Data loaders ────────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    try {
      const response = await chatApi.getSessions();
      setSessions(response.sessions || []);
    } catch (err: any) {
      console.error('Failed to load sessions:', err);
      // Only logout if the dedicated auth check confirms session is gone
      if (isHardAuthFailure(err)) onLogout();
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
      // Don't logout here — message load failure should NOT kick user out
    }
  }, []);

  // On mount: verify auth first, then load sessions
  useEffect(() => {
    const init = async () => {
      try {
        await authApi.getProfile(); // /auth/me — confirms cookie is valid
        await loadSessions();
      } catch (err: any) {
        if (err?.status === 401) {
          onLogout(); // Cookie genuinely expired/missing
        } else {
          setLoading(false); // Network error — stay on page
        }
      }
    };
    init();
  }, [loadSessions, onLogout]);

  useEffect(() => {
    if (currentSessionId) {
      if (justCreatedSessionRef.current === currentSessionId) {
        justCreatedSessionRef.current = null;
        return;
      }
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
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Autocomplete ────────────────────────────────────────────────────────────
  const fetchSuggestion = useCallback((text: string) => {
    if (text.length < 2) { setSuggestion(''); return; }
    const lower = text.toLowerCase();
    let match = SUGGESTIONS_BANK.find(s => s.toLowerCase().startsWith(lower));
    if (!match) {
      const words = lower.split(' ').filter(w => w.length > 2);
      if (words.length > 0) {
        match = SUGGESTIONS_BANK.find(s => {
          const sLower = s.toLowerCase();
          return words.every(w => sLower.includes(w));
        });
      }
    }
    if (match) {
      if (match.toLowerCase().startsWith(lower)) {
        setSuggestion(match.slice(text.length));
      } else {
        setSuggestion(match);
      }
    } else {
      setSuggestion('');
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    fetchSuggestion(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      if (suggestion.toLowerCase().startsWith(input.toLowerCase())) {
        setInput(suggestion);
      } else if (SUGGESTIONS_BANK.includes(suggestion) && !suggestion.toLowerCase().startsWith(input.toLowerCase())) {
        setInput(suggestion);
      } else {
        setInput(prev => prev + suggestion);
      }
      setSuggestion('');
    }
    if (e.key === 'Escape') setSuggestion('');
  };

  // ── Auth ────────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      onLogout();
    }
  };

  // ── Sensitive message guard ─────────────────────────────────────────────────
  const isSensitiveMessage = (text: string) => {
    const BLOCKED_PATTERNS = [
      /\b(show|send|give|share|print|display|reveal|expose|leak|dump|export|output)\b.{0,40}\b(source\s*code|backend|\.env|config|secret|api\s*key|private\s*key|password|token|database\s*schema|schema|credentials|auth\s*token|jwt\s*secret|server\s*code|internal\s*code|system\s*prompt)\b/i,
      /\b(source\s*code|backend\s*code|server\s*code|\.env|api\s*key|jwt\s*secret|private\s*key|db\s*password)\b.{0,40}\b(show|send|give|share|reveal|expose|leak|dump)\b/i,
      /\b(porn|pornography|nude|naked|hentai|xxx|onlyfans|sex\s*video|explicit\s*content|adult\s*content|nsfw|erotic|strip\s*club|cam\s*girl|sex\s*scene)\b/i,
      /\b(how\s*to\s*(make|build|create|synthesize|buy|get)\s*(drugs?|meth|cocaine|heroin|crack|bomb|explosive|weapon|gun|poison|malware|ransomware|virus|keylogger))\b/i,
      /\b(drug\s*deal|arms\s*deal|human\s*traffic|child\s*(abuse|exploit|porn|grooming)|dark\s*web\s*(buy|sell|order)|money\s*launder|hack\s*into|ddos\s*attack|phishing\s*kit|credit\s*card\s*dump|carding)\b/i,
      /\b(how\s*to\s*(steal|rob|shoplift|pickpocket|scam|defraud|bypass\s*payment|crack\s*account|brute\s*force\s*login))\b/i,
      /\b(social\s*engineering\s*script|fake\s*(id|passport|document)|identity\s*theft|account\s*takeover)\b/i,
    ];
    return BLOCKED_PATTERNS.some(p => p.test(text));
  };

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    setSuggestion('');

    if (isSensitiveMessage(userMessage)) {
      const blockedMsg: Message = {
        id: Date.now() + 1,
        sessionId: currentSessionId || 0,
        role: 'assistant',
        content: "⚠️ I'm not able to help with that request. I don't share internal code, credentials, or system files, and I don't assist with adult content, illegal activities, fraud, or anything that could cause harm. If you have a legitimate question, feel free to ask!",
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev,
        { id: Date.now(), sessionId: currentSessionId || 0, role: 'user', content: userMessage, timestamp: new Date().toISOString() },
        blockedMsg,
      ]);
      setInput('');
      return;
    }

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
      const response = await chatApi.sendMessage(userMessage, currentSessionId);
      const activeSessionId = response.sessionId || currentSessionId;

      if (!currentSessionId && activeSessionId) {
        justCreatedSessionRef.current = activeSessionId;
        setCurrentSessionId(activeSessionId);
        await loadSessions();
      }

      // Smart naming in background — don't await, don't crash on failure
      const currentSession = sessions.find(s => s.id === activeSessionId);
      if (
        activeSessionId &&
        (!currentSessionId || (currentSession && (currentSession.sessionName === 'New Chat' || currentSession.sessionName.includes('...'))))
      ) {
        chatApi.generateTitle(userMessage)
          .then(async ({ title }) => {
            if (title && title !== 'New Chat') {
              await chatApi.renameSession(activeSessionId, title);
              const refreshed = await chatApi.getSessions();
              setSessions(refreshed.sessions || []);
            }
          })
          .catch(err => console.error('Smart renaming failed (non-critical):', err));
      }

      const aiMsg: Message = {
        id: Date.now() + 1,
        sessionId: activeSessionId,
        role: 'assistant',
        content: response.response,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);

    } catch (err: any) {
      console.error('Chat send error:', err);

      // ── Only logout on hard auth failure — NOT on every 401 ──
      if (err?.status === 401) {
        // Verify the session is actually gone before logging out
        try {
          await authApi.getProfile();
          // If getProfile succeeds, it was a transient error — don't logout
        } catch (authErr: any) {
          if (authErr?.status === 401) { onLogout(); return; }
        }
      }

      const getErrorMessage = (err: any): string => {
        const status = err?.status || err?.response?.status;
        if (!navigator.onLine) return "📡 You appear to be offline. Please check your internet connection and try again.";
        if (status === 429) return "⏳ You're sending messages too fast. Please wait a moment and try again.";
        if (status === 500 || status === 502 || status === 503) return "🔧 The server ran into an issue. This is temporary — please try again in a few seconds.";
        if (status === 504) return "⌛ The request timed out. Please try again.";
        if (status === 403) return "🚫 You don't have permission to perform this action. Please log in again.";
        if (status === 404) return "🔍 The session could not be found. Try starting a new chat.";
        if (err?.message?.toLowerCase().includes('network') || err?.message?.toLowerCase().includes('fetch')) return "🌐 Network error — couldn't reach the server. Please check your connection.";
        return "⚠️ Something went wrong. Please try again in a moment.";
      };

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sessionId: currentSessionId || 0,
        role: 'assistant',
        content: getErrorMessage(err),
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  // ── Session management ──────────────────────────────────────────────────────
  const createNewSession = async () => {
    setSessionError(null);
    try {
      const response = await chatApi.createSession();
      justCreatedSessionRef.current = response.id;
      setMessages([]);
      setCurrentSessionId(response.id);
      const sessResponse = await chatApi.getSessions();
      setSessions(sessResponse.sessions || []);
      setIsSidebarOpen(false);
    } catch (err: any) {
      console.error('Failed to create session:', err);

      if (err?.status === 401) {
        // Verify before logging out
        try {
          await authApi.getProfile();
          // Session is fine — show error without logging out
          setSessionError('Could not create chat. Please try again.');
        } catch (authErr: any) {
          if (authErr?.status === 401) onLogout();
        }
      } else {
        setSessionError('Could not create chat. Please check your connection.');
      }
    }
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
    }
  };

  const currentSessionName = sessions.find(s => s.id === currentSessionId)?.sessionName;

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen font-sans text-zinc-400 bg-[--bg-main]">
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-4"
        >
          <StormLogo className="w-12 h-12 text-indigo-500/50" />
          <span className="tracking-widest text-[10px] font-black uppercase">Loading...</span>
        </motion.div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-[--bg-main] relative transition-colors duration-300">
      {/* Ambient glows */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-500/5 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-0 left-80 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[140px] pointer-events-none" />

      <Sidebar
        user={user}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={(id) => { setCurrentSessionId(id); setIsSidebarOpen(false); }}
        onNewSession={createNewSession}
        onDeleteSession={deleteSession}
        onClearAll={handleClearAll}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-transparent relative z-20">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 h-20 bg-white/80 dark:bg-black/40 backdrop-blur-2xl border-b border-[--border] flex items-center justify-between px-4 md:px-10 shrink-0 relative">
          <div className="flex items-center gap-4 md:gap-6 min-w-0 z-10">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsSidebarOpen(true); loadSessions(); }}
              className="lg:hidden p-2.5 -ml-1 bg-black/5 dark:bg-white/5 rounded-xl border border-[--border] text-[--text-muted] hover:text-indigo-600 transition-all flex items-center gap-2 active:scale-95 shrink-0 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline-block">Chats</span>
            </button>
            <div className="hidden sm:flex items-center gap-2.5 shrink-0">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)] animate-pulse" />
              <span className="text-[10px] font-black text-[--text-muted]/40 uppercase tracking-[0.25em]">Online</span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {currentSessionId && currentSessionName && (
              <motion.div
                key={currentSessionId}
                initial={{ opacity: 0, y: -6, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.94 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2.5 pointer-events-none select-none"
              >
                <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/70 dark:bg-white/[0.06] border border-indigo-200/60 dark:border-indigo-500/20 shadow-[0_2px_16px_0_rgba(99,102,241,0.10)] backdrop-blur-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 opacity-70 shrink-0" />
                  <span className="text-[11px] md:text-xs font-bold text-[--text-main] tracking-wide truncate max-w-[140px] sm:max-w-[260px] md:max-w-xs">
                    {currentSessionName}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-4 z-10" />
        </header>

        {/* ── Session error banner ──────────────────────────────────────────── */}
        <AnimatePresence>
          {sessionError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mx-4 md:mx-10 mt-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs font-semibold text-red-400 flex items-center justify-between"
            >
              <span>{sessionError}</span>
              <button onClick={() => setSessionError(null)} className="ml-4 text-red-400/60 hover:text-red-400 transition-colors">✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Messages ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-10 lg:px-20 py-8 md:py-12 scroll-hide">
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
                  {["Healthy breakfast ideas", "How to build a React app", "Write a poem about rain", "Explain quantum physics"].map((s, i) => (
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
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 md:gap-6 min-w-0 overflow-hidden ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    <div className={`w-9 h-9 md:w-12 md:h-12 rounded-xl md:rounded-2xl shrink-0 flex items-center justify-center border shadow-xl transition-all ${msg.role === 'user' ? 'p-0 shadow-indigo-500/10' : 'bg-[--surface] dark:bg-zinc-800 border-[--border] text-indigo-500 p-2 md:p-2.5'}`}>
                      {msg.role === 'user'
                        ? <UserAvatar name={user?.username || 'User'} className="w-full h-full text-sm md:text-lg" />
                        : <StormLogo className="w-full h-full" />}
                    </div>
                    <div className={`flex flex-col min-w-0 max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`p-4 md:p-6 rounded-2xl md:rounded-[2rem] border transition-colors shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white border-indigo-500 font-medium' : 'bg-white dark:bg-white/5 text-[--text-main] border-[--border] leading-relaxed'} ${msg.role === 'user' ? 'rounded-tr-none' : 'rounded-tl-none'}`}>
                        <p className="text-sm md:text-base whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</p>
                      </div>
                      <span className="mt-2 md:mt-3 text-[8px] md:text-[9px] font-black text-[--text-muted]/40 uppercase tracking-[0.2em] px-2 md:px-3">
                        {msg.role === 'user' ? 'You' : 'Nexus AI'} • {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                      </span>
                    </div>
                  </motion.div>
                ))}

                {isTyping && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 md:gap-6 min-w-0 overflow-hidden">
                    <div className="w-9 h-9 md:w-12 md:h-12 rounded-xl md:rounded-2xl shrink-0 flex items-center justify-center bg-[--surface] dark:bg-zinc-800 border border-[--border] text-indigo-500 p-2 md:p-2.5 shadow-xl">
                      <StormLogo className="w-full h-full" />
                    </div>
                    <div className="flex flex-col min-w-0 items-start max-w-[85%] md:max-w-[75%]">
                      <div className="p-4 md:p-6 rounded-2xl md:rounded-[2rem] bg-white dark:bg-white/5 border border-indigo-500/20 text-[--text-main] leading-relaxed rounded-tl-none flex items-center gap-3 md:gap-4 shadow-sm">
                        <div className="flex items-end gap-1">
                          {[0, 1, 2].map((i) => (
                            <motion.span key={i} className="block w-[6px] h-[6px] md:w-[7px] md:h-[7px] bg-indigo-500 rounded-full"
                              animate={{ y: ["0%", "-60%", "0%"] }}
                              transition={{ repeat: Infinity, repeatType: "loop", duration: 0.7, delay: i * 0.18, ease: [0.45, 0, 0.55, 1] }}
                            />
                          ))}
                        </div>
                        <motion.span className="text-[10px] font-black uppercase tracking-widest text-indigo-400"
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ repeat: Infinity, repeatType: "loop", duration: 1.4, ease: "easeInOut" }}
                        >
                          Thinking...
                        </motion.span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* ── Input area ───────────────────────────────────────────────────── */}
        <div className="p-4 md:p-10 lg:p-16 pt-2 shrink-0 bg-gradient-to-t from-[--bg-main] via-[--bg-main] to-transparent">
          <div className="max-w-4xl mx-auto relative">

            {!isTyping && messages.length > 0 && !suggestion && (
              <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scroll-hide">
                {["Explain more", "Give an example", "Summarize this", "How to fix it?", "What are alternatives?"].map((s, i) => (
                  <button key={i} onClick={() => setInput(s)}
                    className="shrink-0 px-3 py-1.5 text-[9px] md:text-[10px] font-black uppercase tracking-widest bg-[--surface] dark:bg-white/5 border border-[--border] rounded-full text-[--text-muted] hover:text-indigo-500 hover:border-indigo-500/50 transition-all whitespace-nowrap">
                    {s}
                  </button>
                ))}
              </div>
            )}

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
                      if (SUGGESTIONS_BANK.includes(suggestion)) {
                        setInput(suggestion);
                      } else {
                        setInput(prev => prev + suggestion);
                      }
                      setSuggestion('');
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white/60 dark:bg-white/[0.06] border border-indigo-300/40 dark:border-indigo-500/20 rounded-xl shadow-sm hover:border-indigo-400/60 hover:bg-indigo-50/60 dark:hover:bg-indigo-500/10 transition-all group max-w-[85%]"
                    title="Click or press Tab to accept"
                  >
                    {suggestion.toLowerCase().startsWith(input.toLowerCase()) === false && SUGGESTIONS_BANK.includes(suggestion) ? (
                      <span className="text-[11px] md:text-xs font-semibold text-indigo-500 dark:text-indigo-400 truncate">
                        {suggestion}
                      </span>
                    ) : (
                      <>
                        <span className="text-[11px] md:text-xs font-medium text-[--text-muted]/40 truncate shrink-0 max-w-[120px] hidden sm:inline">
                          {input}
                        </span>
                        <span className="text-[11px] md:text-xs font-semibold text-indigo-500 dark:text-indigo-400 truncate">
                          {suggestion}
                        </span>
                      </>
                    )}
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
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center pl-6 md:pl-8 pr-16 md:pr-20 overflow-hidden rounded-2xl md:rounded-[2.5rem]"
              >
                <span className="font-medium text-xs md:text-sm tracking-wide whitespace-pre text-transparent select-none">
                  {input}
                </span>
                {suggestion && !isTyping && suggestion.toLowerCase().startsWith(input.toLowerCase()) && (
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
                disabled={isTyping}
                placeholder={isTyping ? "Thinking..." : "Type a message…"}
                className="w-full pl-6 md:pl-8 pr-16 md:pr-20 py-4 md:py-6
                  bg-white dark:bg-white/5
                  border border-[--border] rounded-2xl md:rounded-[2.5rem]
                  shadow-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10
                  focus:border-indigo-500 transition-all
                  font-medium text-[--text-main] placeholder:text-[--text-muted]/30
                  tracking-wide text-xs md:text-sm relative z-10 bg-transparent"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 md:w-14 md:h-14 bg-indigo-600 text-white dark:bg-white dark:text-black rounded-full flex items-center justify-center shadow-2xl hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 group z-10"
              >
                <div className="group-hover:translate-x-0.5 transition-transform">
                  <Send className="w-4 h-4 md:w-5 md:h-5" />
                </div>
              </button>
            </form>

            {suggestion && (
              <p className="mt-2 text-center text-[8px] font-bold text-[--text-muted]/30 uppercase tracking-[0.25em]">
                Press <kbd className="px-1 py-0.5 border border-[--border] rounded text-[8px] font-mono">Tab</kbd> to accept · <kbd className="px-1 py-0.5 border border-[--border] rounded text-[8px] font-mono">Esc</kbd> to dismiss
              </p>
            )}
          </div>

          <div className="mt-4 md:mt-6 flex items-center justify-center gap-4 md:gap-6">
            <p className="text-[7px] md:text-[8px] font-bold text-[--text-muted]/30 uppercase tracking-[0.3em]">AI-Powered Assistant</p>
            <div className="w-1 h-1 rounded-full bg-[--border]" />
            <p className="text-[7px] md:text-[8px] font-bold text-[--text-muted]/30 uppercase tracking-[0.3em]">Built with Nexus AI</p>
          </div>
        </div>

      </main>
    </div>
  );
}
