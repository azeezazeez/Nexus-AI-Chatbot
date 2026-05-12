import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { User, Session, Message } from '../types';
import Sidebar from '../components/Sidebar';
import { chatApi, authApi } from '../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import StormLogo from '../components/StormLogo';
import UserAvatar from '../components/UserAvatar';
import ConfirmationModal from '../components/ConfirmationModal';
import { Send, ArrowDown, ArrowUp, Menu, Square, Paperclip, Copy, Check, Plus, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  const [justFinished, setJustFinished] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

  // --- Modal state ---
  const [modalType, setModalType] = useState<'none' | 'delete-all' | 'delete-single'>('none');
  const [sessionIdToDelete, setSessionIdToDelete] = useState<number | null>(null);

  // ── Autocomplete state ──────────────────────────────────────────────────────
  const [suggestion, setSuggestion] = useState('');
  const autocompleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingSuggestionRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<any[]>([]);

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

  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true; // Changed to true for live listening
      recognitionRef.current.interimResults = true; // Show text as spoken
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          setInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + finalTranscript.trim());
        }
        
        // We can use the interimTranscript to give visual feedback if we wanted, 
        // but for now, we'll just log it or we could append it temporarily.
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        // Only stop if we explicitly turned it off
      };
    }
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollBottom(!isAtBottom);
  };

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

  const fetchSuggestionFromBackend = useCallback(async (text: string) => {
    if (text.length < 3 || isFetchingSuggestionRef.current) {
      setSuggestion('');
      return;
    }
    isFetchingSuggestionRef.current = true;
    try {
      const response = await fetch('/api/chat/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (response.ok) {
        const data = await response.json();
        setSuggestion(data.suggestion || '');
      }
    } catch (error) {
      console.error('Autocomplete error:', error);
    } finally {
      isFetchingSuggestionRef.current = false;
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    if (autocompleteTimeoutRef.current) clearTimeout(autocompleteTimeoutRef.current);
    if (val.length >= 3) {
      autocompleteTimeoutRef.current = setTimeout(() => fetchSuggestionFromBackend(val), 300);
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
    if (e.key === 'Enter' && !isTyping) {
      e.preventDefault();
      handleSendMessage();
    }
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

  const handleStopResponse = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsTyping(false);
      isSendingRef.current = false;
      abortControllerRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const speak = (text: string) => {
    if (!isVoiceEnabled || !window.speechSynthesis) return;
    
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    // Prefer Google English voices for better quality
    const premiumVoice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) || voices[0];
    if (premiumVoice) utterance.voice = premiumVoice;
    
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    
    window.speechSynthesis.speak(utterance);
    synthesisRef.current = utterance;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const response = await chatApi.uploadFile(file);
      setAttachedFiles(prev => [...prev, response.file]);
    } catch (err) {
      console.error('File upload failed:', err);
      alert('File upload failed');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, directMessage?: string) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const messageText = directMessage || input.trim();
    if (!messageText && attachedFiles.length === 0) return;
    
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    setIsTyping(true);
    setSuggestion('');
    setJustFinished(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const files = [...attachedFiles];
    let fullMessageContent = messageText;
    if (files.length > 0) {
      fullMessageContent += `\n\n[Attached Files: ${files.map(f => f.originalName).join(', ')}]`;
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
    const fileIds = attachedFiles.map(f => f.id);

    try {
      const response = await chatApi.sendMessage(fullMessageContent, currentSessionId, fileIds, controller.signal);
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

  const createNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setInput('');
    setSuggestion('');
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

  const handleClearAll = () => {
    setModalType('delete-all');
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
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-[--bg-main] relative transition-colors duration-300 font-sans">
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-500/5 rounded-full blur-[160px] pointer-events-none" />
      
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
        onRenameSession={renameSession}
        onClearAll={handleClearAll}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-transparent relative z-20">
        <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-black/40 backdrop-blur-2xl border-b border-[--border] flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 bg-black/5 dark:bg-white/5 rounded-lg border border-[--border] text-[--text-muted]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-[--text-muted]/60 uppercase tracking-widest">Nexus AI Online</span>
            </div>
          </div>
          <div className="flex-1 text-center px-4">
             <span className="text-xs font-bold text-[--text-main] truncate block">
                {sessions.find(s => s.id === currentSessionId)?.sessionName || 'New Conversation'}
             </span>
          </div>
          <div className="w-20" /> {/* Spacer */}
        </header>

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
                    "Plan a 3-day trip to Tokyo",
                    "How to build a SaaS with React?",
                    "Write a professional covering letter",
                    "Explain the theory of relativity"
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
              <div className="space-y-12 pb-32 pt-4">
                {messages.map((msg, index) => (
                  <div key={msg.id || index} className="group relative">
                    <div className="flex gap-4 md:gap-6 items-start">
                      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full shrink-0 flex items-center justify-center border shadow-sm transition-all ${msg.role === 'user' 
                        ? 'bg-zinc-100 dark:bg-zinc-800 border-[--border]' 
                        : 'bg-indigo-600 text-white border-indigo-500'}`}>
                        {msg.role === 'user' ? (
                          <UserAvatar name={user?.username || 'User'} className="w-full h-full text-xs" />
                        ) : (
                          <StormLogo className="w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-bold text-[--text-muted]/60 uppercase tracking-widest">
                            {msg.role === 'user' ? 'You' : 'Nexus AI'}
                          </p>
                          <span className="text-[8px] font-medium opacity-30 tracking-tight">• {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}</span>
                        </div>

                        {/* Image Preview in Message */}
                        {msg.role === 'user' && msg.content.includes('[Attached Files:') && (
                          <div className="flex flex-wrap gap-2 mt-2 mb-3">
                            {msg.content.match(/\[Attached Files: (.*?)\]/)?.[1].split(', ').map((fileName, idx) => {
                              const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
                              if (!isImage) return null;
                              return (
                                <div key={idx} className="relative group/img overflow-hidden rounded-xl border border-[--border] shadow-lg max-w-[240px] bg-zinc-100 dark:bg-zinc-900">
                                  <img 
                                    src={`/uploads/${fileName}`} 
                                    alt={fileName} 
                                    className="max-h-48 w-auto object-contain hover:scale-105 transition-transform duration-500 cursor-zoom-in"
                                    onClick={() => window.open(`/uploads/${fileName}`, '_blank')}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="text-sm md:text-base text-[--text-main] leading-relaxed markdown-body max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity pt-2">
                          <motion.button 
                            whileHover={{ scale: 1.1, backgroundColor: 'rgba(0,0,0,0.05)' }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              navigator.clipboard.writeText(msg.content);
                              setCopiedId(msg.id || index);
                              setTimeout(() => setCopiedId(null), 2000);
                            }}
                            className="p-1.5 rounded text-[--text-muted] transition-colors"
                            title="Copy message"
                          >
                            {copiedId === (msg.id || index) ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

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

        <div className="p-4 md:p-8 shrink-0">
          <div className="max-w-3xl mx-auto relative">
            
            {/* Stop Button handled via Send button */}

            {/* Attached Files Preview */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 px-4">
                {attachedFiles.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-500/20 rounded-xl">
                    <Paperclip className="w-3 h-3 text-indigo-500" />
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[150px]">{file.originalName}</span>
                    <button 
                      onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-xs text-indigo-400 hover:text-red-500 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative group">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              {/* Ghost Layer for Autocomplete */}
              <div className="absolute inset-0 pointer-events-none flex items-center px-14 py-4 z-0">
                <span className="text-sm font-medium text-transparent leading-relaxed">{input}</span>
                {suggestion && !isTyping && (
                  <span className="text-sm font-medium text-[--text-muted]/30 leading-relaxed">{suggestion}</span>
                )}
              </div>
              
              <div className={`relative flex items-center bg-zinc-50 dark:bg-zinc-900/50 border border-[--border] rounded-2xl shadow-xl focus-within:ring-4 focus-within:ring-indigo-500/5 focus-within:border-indigo-600/50 transition-all z-10 backdrop-blur-sm ${justFinished ? 'animate-blink' : ''}`}>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-4 text-[--text-muted] hover:text-indigo-600 transition-colors"
                  title="Attach file"
                >
                  <Paperclip className="w-5 h-5" />
                </motion.button>
                <input
                  type="text"
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={isTyping}
                  placeholder="Ask anything..."
                  className="flex-1 py-4 bg-transparent focus:outline-none font-medium text-[--text-main] placeholder:text-[--text-muted]/30 text-sm leading-relaxed"
                />
                
                {/* Voice Recognition Button */}
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

                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={toggleListening}
                  className={`p-2 mr-2 rounded-lg transition-all ${isListening ? 'text-red-500 bg-red-50 dark:bg-red-900/20 animate-pulse outline-2 outline-red-200 outline-offset-2' : 'text-[--text-muted] hover:text-indigo-600'}`}
                  title={isListening ? 'Listening...' : 'Voice input'}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={isTyping ? handleStopResponse : () => handleSendMessage()}
                  disabled={(!input.trim() && attachedFiles.length === 0) && !isTyping}
                  className={`m-2 p-3 rounded-full shadow-lg transition-all active:scale-95 flex items-center justify-center ${
                    isTyping 
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : (!input.trim() && attachedFiles.length === 0)
                        ? 'bg-[--surface] text-[--text-muted] opacity-50'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {isTyping ? (
                    <Square className="w-4 h-4 fill-current" />
                  ) : (
                    <ArrowUp className="w-5 h-5" />
                  )}
                </motion.button>
              </div>
            </div>
            
            <p className="mt-4 text-center text-[10px] font-medium text-[--text-muted]/40">
              Nexus AI can make mistakes. Check important info.
            </p>
          </div>
        </div>

        <AnimatePresence>
          {messages.length > 5 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="absolute bottom-40 right-6 md:right-10 p-3 bg-white dark:bg-zinc-800 border border-[--border] rounded-full shadow-2xl text-[--text-muted] hover:text-indigo-600 transition-all z-20"
            >
              <ArrowDown className="w-5 h-5" />
            </motion.button>
          )}
        </AnimatePresence>
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
        message="Are you sure you want to delete ALL chats? This action is permanent and cannot be reversed."
        confirmText="Clear All"
      />
    </div>
  );
}
