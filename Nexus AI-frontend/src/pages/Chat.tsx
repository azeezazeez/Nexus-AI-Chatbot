/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';

import { User, Session, Message, UploadedFile } from '../types';
import Sidebar from '../components/Sidebar';
import { chatApi, authApi } from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import StormLogo from '../components/StormLogo';
import UserAvatar from '../components/UserAvatar';
import ConfirmationModal from '../components/ConfirmationModal';

import {
  ArrowDown,
  Menu,
  Copy,
  Check,
  Plus,
  X,
  FileText,
  Image as ImageIcon,
  ChevronDown,
  Edit2,
} from 'lucide-react';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
  user: User;
  onLogout: () => void;
}

const BACKEND_BASE =
  'https://nexus-ai-chatbot-arhr.onrender.com';

const CodeBlock = ({
  language,
  value,
}: {
  language: string;
  value: string;
}) => {
  const [copied, setCopied] = useState(false);

  const timeoutRef = useRef<number | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);

      setCopied(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="group/code relative my-6 overflow-hidden rounded-xl border border-white/20 dark:border-white/10 shadow-2xl backdrop-blur-xl bg-white/5 dark:bg-black/20 transition-all">
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/10 dark:bg-black/20 border-b border-white/10">
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          {language || 'code'}
        </span>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px] font-black text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-500" />
          ) : (
            <Copy className="w-3 h-3" />
          )}

          <span className="uppercase tracking-widest">
            {copied ? 'Copied' : 'Copy'}
          </span>
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

export default function Chat({
  user,
  onLogout,
}: Props) {
  const [sessions, setSessions] = useState<
    Session[]
  >([]);

  const [
    currentSessionId,
    setCurrentSessionId,
  ] = useState<number | null>(null);

  const [messages, setMessages] = useState<
    Message[]
  >([]);

  const [input, setInput] = useState('');

  const [isTyping, setIsTyping] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [
    isSidebarOpen,
    setIsSidebarOpen,
  ] = useState(false);

  const [
    showScrollBottom,
    setShowScrollBottom,
  ] = useState(false);

  const [copiedId, setCopiedId] =
    useState<string | number | null>(null);

  const [isUploading, setIsUploading] =
    useState(false);

  const [uploadError, setUploadError] =
    useState<string | null>(null);

  const [
    isModelMenuOpen,
    setIsModelMenuOpen,
  ] = useState(false);

  const [selectedModel, setSelectedModel] =
    useState('llama-3.3-70b-versatile');

  const [
    editingMessageId,
    setEditingMessageId,
  ] = useState<string | number | null>(null);

  const [editInput, setEditInput] =
    useState('');

  const [attachedFiles, setAttachedFiles] =
    useState<UploadedFile[]>([]);

  const [
    modalType,
    setModalType,
  ] = useState<
    'none' | 'delete-all' | 'delete-single'
  >('none');

  const [
    sessionIdToDelete,
    setSessionIdToDelete,
  ] = useState<number | null>(null);

  const messagesEndRef =
    useRef<HTMLDivElement>(null);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const inputRef =
    useRef<HTMLTextAreaElement>(null);

  const abortControllerRef =
    useRef<AbortController | null>(null);

  const isSendingRef = useRef(false);

  const modelMenuRef =
    useRef<HTMLDivElement>(null);

  const copyTimeoutRef =
    useRef<number | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const response =
        await chatApi.getSessions();

      setSessions(response.sessions || []);
    } catch (err: any) {
      console.error(err);

      if (err.status === 401) {
        onLogout();
      }
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  const loadMessages = useCallback(
    async (sid: number) => {
      try {
        const response =
          await chatApi.getMessages(sid);

        setMessages(response.messages || []);
      } catch (err: any) {
        console.error(err);

        if (err.status === 401) {
          onLogout();
        }
      }
    },
    [onLogout]
  );

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (currentSessionId) {
      loadMessages(currentSessionId);
    } else {
      setMessages([]);
    }
  }, [currentSessionId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages, isTyping]);

  useEffect(() => {
    const handleClickOutside = (
      event: MouseEvent
    ) => {
      if (
        modelMenuRef.current &&
        !modelMenuRef.current.contains(
          event.target as Node
        )
      ) {
        setIsModelMenuOpen(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleScroll = (
    e: React.UIEvent<HTMLDivElement>
  ) => {
    const {
      scrollTop,
      scrollHeight,
      clientHeight,
    } = e.currentTarget;

    setShowScrollBottom(
      scrollHeight - scrollTop - clientHeight >
        100
    );
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    setUploadError(null);
    setIsUploading(true);

    try {
      const response =
        await chatApi.uploadFile(file);

      setAttachedFiles((prev) => [
        ...prev,
        response.file,
      ]);
    } catch (err: any) {
      console.error(err);

      setUploadError(
        err.message ||
          'File upload failed.'
      );
    } finally {
      setIsUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeAttachedFile = (
    index: number
  ) => {
    setAttachedFiles((prev) =>
      prev.filter((_, i) => i !== index)
    );
  };

  const handleSendMessage = async (
    e?: React.FormEvent,
    directMessage?: string
  ) => {
    if (e) {
      e.preventDefault();
    }

    const messageText =
      directMessage || input.trim();

    if (
      !messageText &&
      attachedFiles.length === 0
    ) {
      return;
    }

    if (isSendingRef.current) {
      return;
    }

    isSendingRef.current = true;

    setIsTyping(true);

    const controller =
      new AbortController();

    abortControllerRef.current =
      controller;

    try {
      const tempMessage: Message = {
        id: crypto.randomUUID(),
        sessionId: currentSessionId || 0,
        role: 'user',
        content: messageText,
        timestamp:
          new Date().toISOString(),
      };

      setMessages((prev) => [
        ...prev,
        tempMessage,
      ]);

      setInput('');

      const response =
        await chatApi.sendMessage(
          messageText,
          currentSessionId,
          attachedFiles.map((f) => f.id),
          controller.signal,
          selectedModel
        );

      const assistantMessage: Message = {
        id:
          response.messageId ||
          crypto.randomUUID(),
        sessionId:
          response.sessionId ||
          currentSessionId ||
          0,
        role: 'assistant',
        content:
          response.response ||
          'No response received.',
        timestamp:
          new Date().toISOString(),
      };

      setMessages((prev) => [
        ...prev,
        assistantMessage,
      ]);

      setAttachedFiles([]);

      if (
        !currentSessionId &&
        response.sessionId
      ) {
        setCurrentSessionId(
          response.sessionId
        );

        await loadSessions();
      }
    } catch (err: any) {
      console.error(err);

      if (err.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sessionId:
              currentSessionId || 0,
            role: 'assistant',
            content:
              'Something went wrong.',
            timestamp:
              new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setIsTyping(false);

      isSendingRef.current = false;

      abortControllerRef.current = null;

      inputRef.current?.focus();
    }
  };

  const handleStopResponse = () => {
    abortControllerRef.current?.abort();

    setIsTyping(false);

    isSendingRef.current = false;

    abortControllerRef.current = null;

    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }
  };

  const createNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setInput('');
    setAttachedFiles([]);
    setUploadError(null);
  };

  const confirmDeleteSession = async () => {
    if (!sessionIdToDelete) return;

    try {
      await chatApi.deleteSession(
        sessionIdToDelete
      );

      await loadSessions();

      if (
        currentSessionId ===
        sessionIdToDelete
      ) {
        setCurrentSessionId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setModalType('none');
    }
  };

  const confirmClearAll = async () => {
    try {
      await chatApi.clearSessions();

      setCurrentSessionId(null);

      setMessages([]);

      await loadSessions();
    } catch (err) {
      console.error(err);
    } finally {
      setModalType('none');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[--bg-main]">
        <motion.div
          animate={{
            scale: [1, 1.05, 1],
            opacity: [0.4, 0.7, 0.4],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
          }}
        >
          <StormLogo className="w-12 h-12" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[--bg-main] overflow-hidden">
      <Sidebar
        user={user}
        sessions={sessions}
        currentSessionId={
          currentSessionId
        }
        onSelectSession={(id) =>
          setCurrentSessionId(id)
        }
        onNewSession={createNewSession}
        onDeleteSession={(id) => {
          setSessionIdToDelete(id);
          setModalType(
            'delete-single'
          );
        }}
        onRenameSession={async (
          sid,
          name
        ) => {
          await chatApi.renameSession(
            sid,
            name
          );

          await loadSessions();
        }}
        onClearAll={() =>
          setModalType('delete-all')
        }
        onLogout={async () => {
          try {
            await authApi.logout();
          } finally {
            onLogout();
          }
        }}
        isOpen={isSidebarOpen}
        onClose={() =>
          setIsSidebarOpen(false)
        }
      />

      <main className="flex-1 flex flex-col">
        <header className="h-16 border-b border-[--border] flex items-center justify-between px-4">
          <button
            onClick={() =>
              setIsSidebarOpen(true)
            }
            className="lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <StormLogo className="w-7 h-7" />

            <span className="font-bold">
              Nexus AI
            </span>
          </div>

          <div />
        </header>

        <div
          className="flex-1 overflow-y-auto px-4 py-8"
          onScroll={handleScroll}
        >
          <div className="max-w-3xl mx-auto space-y-8">
            {messages.map((msg, index) => (
              <div
                key={msg.id || index}
                className={`flex ${
                  msg.role === 'user'
                    ? 'justify-end'
                    : 'justify-start'
                }`}
              >
                <div className="max-w-[85%]">
                  <div className="rounded-2xl border p-4 bg-white dark:bg-zinc-900">
                    {editingMessageId ===
                    msg.id ? (
                      <textarea
                        value={editInput}
                        onChange={(e) =>
                          setEditInput(
                            e.target.value
                          )
                        }
                        className="w-full min-h-[120px] bg-transparent outline-none"
                      />
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[
                          remarkGfm,
                        ]}
                        components={{
                          code({
                            className,
                            children,
                            ...props
                          }: React.HTMLAttributes<HTMLElement> & {
                            inline?: boolean;
                            children?: React.ReactNode;
                          }) {
                            const match =
                              /language-(\w+)/.exec(
                                className || ''
                              );

                            const content =
                              String(
                                children
                              ).replace(
                                /\n$/,
                                ''
                              );

                            if (match) {
                              return (
                                <CodeBlock
                                  language={
                                    match[1]
                                  }
                                  value={
                                    content
                                  }
                                />
                              );
                            }

                            return (
                              <code
                                className={`${className || ''} bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded`}
                                {...props}
                              >
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {(msg.content || '')
                          .replace(
                            /\n?\n?\[Attached Files:.*?\]/g,
                            ''
                          )
                          .trim()}
                      </ReactMarkdown>
                    )}
                  </div>

                  <div className="flex justify-end items-center gap-2 mt-1">
                    <span className="text-[10px] text-zinc-400">
                      {new Date(
                        msg.timestamp
                      ).toLocaleTimeString(
                        [],
                        {
                          hour: '2-digit',
                          minute:
                            '2-digit',
                        }
                      )}
                    </span>

                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            msg.content
                          );

                          setCopiedId(
                            msg.id
                          );

                          if (
                            copyTimeoutRef.current
                          ) {
                            clearTimeout(
                              copyTimeoutRef.current
                            );
                          }

                          copyTimeoutRef.current =
                            window.setTimeout(
                              () => {
                                setCopiedId(
                                  null
                                );
                              },
                              2000
                            );
                        } catch (err) {
                          console.error(
                            err
                          );
                        }
                      }}
                    >
                      {copiedId ===
                      msg.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setEditingMessageId(
                          msg.id
                        );

                        setEditInput(
                          msg.content
                        );
                      }}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-2">
                <StormLogo className="w-5 h-5 animate-spin" />

                <span className="text-sm text-zinc-500">
                  Thinking...
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="p-4 border-t border-[--border]">
          <div className="max-w-3xl mx-auto">
            <AnimatePresence>
              {uploadError && (
                <motion.div
                  initial={{
                    opacity: 0,
                  }}
                  animate={{
                    opacity: 1,
                  }}
                  exit={{
                    opacity: 0,
                  }}
                  className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-500 text-sm"
                >
                  {uploadError}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="border rounded-3xl bg-white dark:bg-zinc-900 overflow-hidden">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) =>
                  setInput(e.target.value)
                }
                onInput={(e) => {
                  const target =
                    e.target as HTMLTextAreaElement;

                  target.style.height =
                    '0px';

                  target.style.height = `${target.scrollHeight}px`;
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !isTyping
                  ) {
                    e.preventDefault();

                    handleSendMessage();
                  }
                }}
                rows={1}
                placeholder="Write a message..."
                className="w-full resize-none bg-transparent outline-none px-5 pt-5 pb-2 min-h-[60px] max-h-[200px]"
              />

              <div className="flex items-center justify-between px-3 pb-3">
                <button
                  onClick={() => {
                    if (
                      fileInputRef.current
                    ) {
                      fileInputRef.current.value =
                        '';

                      fileInputRef.current.click();
                    }
                  }}
                  className="p-2"
                >
                  <Plus className="w-5 h-5" />
                </button>

                <div
                  className="relative"
                  ref={modelMenuRef}
                >
                  <button
                    onClick={() =>
                      setIsModelMenuOpen(
                        !isModelMenuOpen
                      )
                    }
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                  >
                    <span className="text-xs font-bold">
                      {selectedModel}
                    </span>

                    <ChevronDown className="w-4 h-4" />
                  </button>

                  <AnimatePresence>
                    {isModelMenuOpen && (
                      <motion.div
                        initial={{
                          opacity: 0,
                          y: -10,
                        }}
                        animate={{
                          opacity: 1,
                          y: 0,
                        }}
                        exit={{
                          opacity: 0,
                          y: -10,
                        }}
                        className="absolute right-0 bottom-14 bg-white dark:bg-zinc-900 border rounded-xl shadow-xl overflow-hidden z-50"
                      >
                        {[
                          'llama-3.3-70b-versatile',
                          'gemini-2.5-flash',
                        ].map((model) => (
                          <button
                            key={model}
                            onClick={() => {
                              setSelectedModel(
                                model
                              );

                              setIsModelMenuOpen(
                                false
                              );
                            }}
                            className="block w-full text-left px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm"
                          >
                            {model}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  onClick={
                    isTyping
                      ? handleStopResponse
                      : () =>
                          handleSendMessage()
                  }
                  disabled={
                    !isTyping &&
                    !isUploading &&
                    !input.trim() &&
                    attachedFiles.length ===
                      0
                  }
                  className="w-11 h-11 rounded-2xl border flex items-center justify-center"
                >
                  {isTyping ? (
                    <div className="w-2.5 h-2.5 rounded-sm bg-black dark:bg-white" />
                  ) : (
                    <ArrowDown className="w-5 h-5 rotate-180" />
                  )}
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>
      </main>

      <ConfirmationModal
        isOpen={
          modalType === 'delete-single'
        }
        onClose={() =>
          setModalType('none')
        }
        onConfirm={confirmDeleteSession}
        title="Delete Chat"
        message="Delete this chat permanently?"
        confirmText="Delete"
      />

      <ConfirmationModal
        isOpen={
          modalType === 'delete-all'
        }
        onClose={() =>
          setModalType('none')
        }
        onConfirm={confirmClearAll}
        title="Clear All Chats"
        message="Delete all chats permanently?"
        confirmText="Clear All"
      />
    </div>
  );
}
