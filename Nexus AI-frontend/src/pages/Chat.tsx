import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { User, Session, Message, UploadedFile } from '../types';
import Sidebar from '../components/Sidebar';
import { chatApi, authApi } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import StormLogo from '../components/StormLogo';
import UserAvatar from '../components/UserAvatar';
import ConfirmationModal from '../components/ConfirmationModal';
import {
  Send, ArrowDown, ArrowUp, Menu, Square,
  Paperclip, Copy, Check, Plus, Mic, MicOff,
  Volume2, VolumeX, X, FileText, Image as ImageIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
  user: User;
  onLogout: () => void;
}

const BACKEND_BASE = 'https://nexus-ai-chatbot-arhr.onrender.com';

const CodeBlock = ({ language, value }: { language: string; value: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group/code relative my-6 overflow-hidden rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-lg transition-all">
      <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-zinc-900 border-b border-zinc-200/50 dark:border-zinc-800/50">
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
  const [isListening, setIsListening] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Modal state
  const [modalType, setModalType] = useState<'none' | 'delete-all' | 'delete-single'>('none');
  const [sessionIdToDelete, setSessionIdToDelete] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);

  // ── Data Loading ──────────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    try {
      const response = await chatApi.getSessions();
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── Speech Recognition ────────────────────────────────────────────────────

  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + finalTranscript.trim());
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  };

  const speak = (text: string) => {
    if (!isVoiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const premiumVoice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) || voices[0];
    if (premiumVoice) utterance.voice = premiumVoice;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
    synthesisRef.current = utterance;
  };

  // ── Scroll ────────────────────────────────────────────────────────────────

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 100);
  };

  // ── File Upload ───────────────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Only images, PDFs and text files are allowed.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File is too large. Max size is 10MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    try {
      const response = await chatApi.uploadFile(file);
      setAttachedFiles(prev => [...prev, response.file]);
    } catch (err: any) {
      console.error('File upload failed:', err);
      setUploadError(err.message || 'File upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // ── Send Message ──────────────────────────────────────────────────────────

  const handleSendMessage = async (e?: React.FormEvent, directMessage?: string) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }

    const messageText = directMessage || input.trim();
    if (!messageText && attachedFiles.length === 0) return;
    if (isSendingRef.current) return;

    isSendingRef.current = true;
    setIsTyping(true);
    setJustFinished(false);
    setUploadError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const files = [...attachedFiles];

    // Build display content for the message bubble
    let fullMessageContent = messageText;
    if (files.length > 0) {
      const fileNames = files.map(f => f.originalName).join(', ');
      fullMessageContent += (messageText ? '\n\n' : '') + `[Attached Files: ${fileNames}]`;
    }

    const tempUserMsg: Message = {
      id: 'temp-' + Date.now(),
      sessionId: currentSessionId || 0,
      role: 'user',
      content: fullMessageContent,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, tempUserMsg]);
    setInput('');
    setAttachedFiles([]);

    const isNewSession = !currentSessionId;
    const fileIds = files.map(f => f.id);

    try {
      const response = await chatApi.sendMessage(
        fullMessageContent,
        currentSessionId,
        fileIds,
        controller.signal
      );

      const activeSessionId = response.sessionId || currentSessionId;

      if (isNewSession && activeSessionId) {
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

      speak(response.response);

      // Auto-rename new sessions
      if ((isNewSession || sessions.find(s => s.id === activeSessionId)?.sessionName === 'New Chat') && activeSessionId) {
        try {
          const { title } = await chatApi.generateTitle(messageText);
          await chatApi.renameSession(activeSessionId, title);
          await loadSessions();
        } catch (renameErr) {
          console.error('Rename failed:', renameErr);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isTyping) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ── Session Management ────────────────────────────────────────────────────

  const createNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setInput('');
    setAttachedFiles([]);
    setUploadError(null);
    setIsSidebarOpen(false);
  };

  const deleteSession = async (sid: number) => {
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
    } catch (err: any) {
      console.error('Failed to delete session:', err);
      if (err.status === 401) onLogout();
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
    } catch (err: any) {
      console.error('Failed to rename session:', err);
      if (err.status === 401) onLogout();
    }
  };

  const confirmClearAll = async () => {
    try {
      await chatApi.clearSessions();
      setCurrentSessionId(null);
      setMessages([]);
      await loadSessions();
    } catch (err: any) {
      console.error('Failed to clear sessions:', err);
      if (err.status === 401) onLogout();
    } finally {
      setModalType('none');
    }
  };

  const handleLogout = async () => {
    try { await authApi.logout(); } catch (err) { console.error('Logout failed:', err); }
    finally { onLogout(); }
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

  // ── Render ────────────────────────────────────────────────────────────────

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

        {/* Header */}
        <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/80 dark:bg-black/40 backdrop-blur-2xl border-b border-[--border] flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 bg-black/5 dark:bg-white/5 rounded-lg border border-[--border] text-[--text-muted]"
            >
              <Menu className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] md:text-[10px] font-bold text-[--text-muted]/60 uppercase tracking-widest">Nexus AI Online</span>
            </div>
          </div>
          <div className="flex-1 text-center px-4 overflow-hidden">
            <span className="text-[10px] md:text-xs font-bold text-[--text-main] truncate block max-w-[200px] md:max-w-md mx-auto">
              {sessions.find(s => s.id === currentSessionId)?.sessionName || 'New Conversation'}
            </span>
          </div>
          <div className="w-10 md:w-20" />
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-8 md:py-12 scroll-hide" onScroll={handleScroll}>
          <div className="max-w-3xl mx-auto">

            {messages.length === 0 && !isTyping ? (
              <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4 max-w-2xl mx-auto">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-10 text-white shadow-2xl"
                >
                  <StormLogo className="w-10 h-10" />
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
                      className="group p-4 bg-white dark:bg-zinc-900 border border-[--border] rounded-xl text-sm font-medium text-[--text-muted] hover:text-indigo-600 hover:border-indigo-600/30 transition-all text-left"
                    >
                      <span className="block truncate">{s}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 pb-32 pt-4">
                {messages.map((msg, index) => (
                  <div 
                    key={msg.id || index} 
                    className={`group relative py-6 md:py-8 px-4 md:px-6 -mx-2 md:-mx-4 rounded-2xl md:rounded-[2rem] transition-all duration-500 hover:shadow-sm border border-transparent ${
                      msg.role === 'assistant' 
                        ? 'bg-indigo-50/40 dark:bg-indigo-500/[0.03] border-indigo-100/20 dark:border-indigo-500/10' 
                        : ''
                    }`}
                  >
                    <div className="flex gap-4 md:gap-6 items-start max-w-3xl mx-auto">
                      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full shrink-0 flex items-center justify-center border shadow-sm transition-all ${
                        msg.role === 'user'
                          ? 'bg-zinc-100 dark:bg-zinc-800 border-[--border]'
                          : 'bg-indigo-600 text-white border-indigo-500'
                      }`}>
                        {msg.role === 'user'
                          ? <UserAvatar name={user?.username || 'User'} className="w-full h-full text-xs" />
                          : <StormLogo className="w-5 h-5" />
                        }
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-bold text-[--text-muted]/60 uppercase tracking-widest">
                            {msg.role === 'user' ? 'You' : 'Nexus AI'}
                          </p>
                          <span className="text-[8px] font-medium opacity-30 tracking-tight">
                            • {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                          </span>
                        </div>

                        {/* ── Image Attachments in Message ── */}
                        {msg.role === 'user' && msg.content.includes('[Attached Files:') && (() => {
                          const match = msg.content.match(/\[Attached Files: (.*?)\]/);
                          if (!match) return null;
                          const fileNames = match[1].split(', ');
                          const imageFiles = fileNames.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
                          const otherFiles = fileNames.filter(f => !/\.(jpg|jpeg|png|gif|webp)$/i.test(f));
                          return (
                            <div className="flex flex-wrap gap-2 mt-2 mb-3">
                              {imageFiles.map((fileName, idx) => (
                                <div
                                  key={idx}
                                  className="relative overflow-hidden rounded-xl border border-[--border] shadow-lg max-w-[240px] bg-zinc-100 dark:bg-zinc-900"
                                >
                                  <img
                                    src={`${BACKEND_BASE}/uploads/${fileName}`}
                                    alt={fileName}
                                    className="max-h-48 w-auto object-contain hover:scale-105 transition-transform duration-500 cursor-zoom-in"
                                    onClick={() => window.open(`${BACKEND_BASE}/uploads/${fileName}`, '_blank')}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                  <p className="text-[9px] text-center text-[--text-muted] py-1 truncate px-2">{fileName}</p>
                                </div>
                              ))}
                              {otherFiles.map((fileName, idx) => (
                                <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-[--border]">
                                  <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                                  <span className="text-xs text-[--text-muted] truncate max-w-[150px]">{fileName}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Message text (hide the [Attached Files:...] tag) */}
                        <div className="text-sm md:text-base text-[--text-main] leading-relaxed markdown-body max-w-none">
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ node, inline, className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || '');
                                const content = String(children).replace(/\n$/, '');
                                return !inline && match ? (
                                  <CodeBlock language={match[1]} value={content} />
                                ) : (
                                  <code className={`${className} bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-indigo-500 font-mono text-[0.9em]`} {...props}>
                                    {children}
                                  </code>
                                );
                              }
                            }}
                          >
                            {msg.content.replace(/\n?\n?\[Attached Files:.*?\]/g, '').trim()}
                          </ReactMarkdown>
                        </div>

                        {/* Copy button */}
                        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity pt-2">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              navigator.clipboard.writeText(msg.content);
                              setCopiedId(msg.id || index);
                              setTimeout(() => setCopiedId(null), 2000);
                            }}
                            className="p-1.5 rounded text-[--text-muted] transition-colors"
                            title="Copy message"
                          >
                            {copiedId === (msg.id || index)
                              ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                              : <Copy className="w-3.5 h-3.5" />
                            }
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                {isTyping && (
                  <div className="flex gap-4 md:gap-6 items-start">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full shrink-0 flex items-center justify-center bg-indigo-600 text-white border border-indigo-500 shadow-sm">
                      <StormLogo className="w-5 h-5" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-[10px] font-bold text-[--text-muted]/60 uppercase tracking-widest">Nexus AI</p>
                      <div className="flex gap-1.5 py-4 items-center">
                        <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                        <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                        <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                        <span className="ml-2 text-xs font-bold text-indigo-600/30 tracking-widest uppercase">Thinking</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <AnimatePresence>
            {showScrollBottom && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="fixed bottom-32 right-1/2 translate-x-1/2 p-3 bg-white dark:bg-zinc-800 border border-[--border] rounded-full shadow-2xl text-[--text-muted] hover:text-indigo-600 transition-all z-40 group"
              >
                <ArrowDown className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-8 shrink-0">
          <div className="max-w-3xl mx-auto">

            {/* Upload Error */}
            <AnimatePresence>
              {uploadError && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="flex items-center justify-between mb-3 px-4 py-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-500/20 rounded-xl"
                >
                  <span className="text-xs text-red-600 dark:text-red-400">{uploadError}</span>
                  <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600 ml-2">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Attached Files Preview */}
            <AnimatePresence>
              {attachedFiles.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap gap-2 mb-3 px-1"
                >
                  {attachedFiles.map((file, i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-500/20 rounded-xl max-w-[200px]"
                    >
                      {file.isImage ? (
                        <ImageIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      )}
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 truncate">
                        {file.originalName}
                      </span>
                      <button
                        onClick={() => removeAttachedFile(i)}
                        className="text-indigo-400 hover:text-red-500 transition-colors shrink-0"
                        title="Remove file"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Box */}
            <div className="relative group">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain"
                className="hidden"
              />

              <div className={`relative flex items-center bg-zinc-50 dark:bg-zinc-900/50 border border-[--border] rounded-2xl shadow-xl focus-within:ring-4 focus-within:ring-indigo-500/5 focus-within:border-indigo-600/50 transition-all backdrop-blur-sm ${justFinished ? 'animate-blink' : ''}`}>

                {/* Paperclip / Upload Button */}
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={`p-4 transition-colors ${isUploading ? 'text-indigo-400 animate-pulse' : 'text-[--text-muted] hover:text-indigo-600'}`}
                  title={isUploading ? 'Uploading...' : 'Attach image or file'}
                >
                  <Paperclip className="w-5 h-5" />
                </motion.button>

                {/* Text Input */}
                <input
                  type="text"
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isTyping}
                  placeholder={isUploading ? 'Uploading file...' : 'Ask anything...'}
                  className="flex-1 py-4 bg-transparent focus:outline-none font-medium text-[--text-main] placeholder:text-[--text-muted]/30 text-sm leading-relaxed"
                />

                {/* Voice Feedback Toggle */}
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
                  className={`p-2 mr-1 rounded-lg transition-all ${isVoiceEnabled ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'text-[--text-muted] hover:text-indigo-600'}`}
                  title={isVoiceEnabled ? 'Voice feedback ON' : 'Voice feedback OFF'}
                >
                  {isVoiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                </motion.button>

                {/* Mic Button */}
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={toggleListening}
                  className={`p-2 mr-2 rounded-lg transition-all ${isListening ? 'text-red-500 bg-red-50 dark:bg-red-900/20 animate-pulse' : 'text-[--text-muted] hover:text-indigo-600'}`}
                  title={isListening ? 'Listening... Click to stop' : 'Voice input'}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </motion.button>

                {/* Send / Stop Button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={isTyping ? handleStopResponse : () => handleSendMessage()}
                  disabled={(!input.trim() && attachedFiles.length === 0 && !isUploading) && !isTyping}
                  className={`m-2 p-3 rounded-full shadow-lg transition-all flex items-center justify-center ${
                    isTyping
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : (!input.trim() && attachedFiles.length === 0)
                        ? 'bg-[--surface] text-[--text-muted] opacity-50'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {isTyping ? <Square className="w-4 h-4 fill-current" /> : <ArrowUp className="w-5 h-5" />}
                </motion.button>
              </div>
            </div>

            <p className="mt-4 text-center text-[10px] font-medium text-[--text-muted]/40">
              Nexus AI can make mistakes. Check important info.
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
