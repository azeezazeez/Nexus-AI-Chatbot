/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Session, User } from '../types';
import {
  Plus, LogOut, Trash2, X, Search, Sparkles,
  MoreHorizontal, Pin, PinOff, Share2, Edit3, Check, Copy,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import StormLogo from './StormLogo';
import UserAvatar from './UserAvatar';
import { chatApi } from '../lib/api';

interface Props {
  user: User;
  sessions: Session[];
  currentSessionId: number | null;
  onSelectSession: (id: number) => void;
  onNewSession: () => void;
  onDeleteSession: (id: number) => void;
  onRenameSession: (id: number, name: string) => void;
  onClearAll: () => void;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

// ── localStorage helpers for pinned sessions ─────────────────────────────────
const PINNED_KEY = 'nexus_pinned_sessions';

const loadPinnedIds = (): number[] => {
  try {
    return JSON.parse(localStorage.getItem(PINNED_KEY) || '[]');
  } catch {
    return [];
  }
};

const savePinnedIds = (ids: number[]) => {
  localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
};

// ── Date grouping helper ──────────────────────────────────────────────────────
const getGroupLabel = (session: Session): string => {
  // Sessions may not have a createdAt; fall back to a generic label
  const raw = (session as any).createdAt || (session as any).created_at;
  if (!raw) return 'Recent';
  const date = new Date(raw);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This Week';
  if (diffDays < 30) return 'This Month';
  // Format as "Jan 2025"
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

export default function Sidebar({
  user,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onClearAll,
  onLogout,
  isOpen,
  onClose,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSessions, setFilteredSessions] = useState<Session[]>(sessions);
  const [isSearching, setIsSearching] = useState(false);

  // Context menu state
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Pinned sessions (local, persisted to localStorage)
  const [pinnedIds, setPinnedIds] = useState<number[]>(loadPinnedIds);

  // Share toast
  const [sharedId, setSharedId] = useState<number | null>(null);

  // ── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredSessions(sessions);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await chatApi.searchSessions(searchQuery);
        setFilteredSessions((response as any).sessions || []);
      } catch {
        setFilteredSessions(
          sessions.filter(s =>
            s.sessionName.toLowerCase().includes(searchQuery.toLowerCase())
          )
        );
      } finally {
        setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, sessions]);

  // ── Close menu on outside click ───────────────────────────────────────────
  useEffect(() => {
    if (menuOpenId === null) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpenId]);

  // ── Focus rename input when it appears ───────────────────────────────────
  useEffect(() => {
    if (renamingId !== null) {
      setTimeout(() => renameInputRef.current?.focus(), 50);
    }
  }, [renamingId]);

  // ── Pin helpers ───────────────────────────────────────────────────────────
  const togglePin = useCallback((id: number) => {
    setPinnedIds(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      savePinnedIds(next);
      return next;
    });
    setMenuOpenId(null);
  }, []);

  // ── Share helper ─────────────────────────────────────────────────────────
  const handleShare = useCallback((session: Session) => {
    const text = session.sessionName;
    navigator.clipboard.writeText(text).catch(() => {});
    setSharedId(session.id);
    setMenuOpenId(null);
    setTimeout(() => setSharedId(null), 2000);
  }, []);

  // ── Rename helpers ────────────────────────────────────────────────────────
  const startRename = (session: Session) => {
    setRenamingId(session.id);
    setRenameValue(session.sessionName);
    setMenuOpenId(null);
  };

  const commitRename = () => {
    if (renamingId !== null && renameValue.trim()) {
      onRenameSession(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  // ── Sort: pinned first, then rest in original order ───────────────────────
  const sortedSessions = [
    ...filteredSessions.filter(s => pinnedIds.includes(s.id)),
    ...filteredSessions.filter(s => !pinnedIds.includes(s.id)),
  ];

  // ── Date grouping ─────────────────────────────────────────────────────────
  const grouped: { label: string; items: Session[] }[] = [];
  sortedSessions.forEach(session => {
    const label = pinnedIds.includes(session.id) ? 'Pinned' : getGroupLabel(session);
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) {
      last.items.push(session);
    } else {
      grouped.push({ label, items: [session] });
    }
  });

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      <aside
        className={`
          fixed inset-y-0 left-0 z-[100] w-72
          bg-[--surface] dark:bg-[#111] border-r border-[--border]
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          flex flex-col h-full shadow-2xl
        `}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="p-5 md:p-6 shrink-0">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white p-1.5">
                <StormLogo className="w-full h-full" />
              </div>
              <h2 className="text-xl font-black tracking-tighter text-[--text-main] italic">NEXUS</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-[--text-muted] hover:text-red-500 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* New Chat button */}
          <button
            onClick={() => { onNewSession(); onClose(); }}
            className="w-full py-3 px-4 bg-indigo-600 text-white dark:bg-white dark:text-black rounded-2xl flex items-center gap-3 font-bold text-sm tracking-wide hover:opacity-90 transition-all active:scale-[0.98] group shadow-lg"
          >
            <div className="w-5 h-5 rounded-md bg-white/20 dark:bg-black/10 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
              <Plus className="w-3.5 h-3.5" />
            </div>
            <span className="uppercase tracking-widest text-xs">New Chat</span>
          </button>

          {/* Search */}
          <div className="mt-4 relative group">
            <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-[--text-muted]/40 group-focus-within:text-indigo-500 transition-colors">
              {isSearching
                ? <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                : <Search className="w-3.5 h-3.5" />}
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="w-full pl-10 pr-4 py-2.5 bg-black/5 dark:bg-white/5 border border-[--border] rounded-xl text-xs font-medium text-[--text-main] placeholder:text-[--text-muted]/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all"
            />
          </div>
        </div>

        {/* ── Session List ── */}
        <div className="flex-1 overflow-y-auto px-3 scroll-hide min-h-0 pb-4">
          {sortedSessions.length === 0 ? (
            <div className="mx-2 py-8 text-center bg-black/5 dark:bg-white/5 rounded-2xl border border-dashed border-[--border]">
              <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-wider leading-relaxed">
                {searchQuery ? 'No matching chats' : 'No chats yet'}
                <br />
                <span className="opacity-40 font-medium">
                  {searchQuery ? 'Try a different query' : 'Start a new conversation'}
                </span>
              </p>
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.label} className="mb-2">
                {/* Group label */}
                <div className="flex items-center justify-between px-3 pt-4 pb-1.5">
                  <span className="text-[10px] font-black text-[--text-muted]/50 uppercase tracking-[0.2em]">
                    {group.label}
                  </span>
                  {group.label !== 'Pinned' && !searchQuery && group === grouped[grouped.length - 1] && sessions.length > 0 && (
                    <button
                      onClick={onClearAll}
                      title="Clear all"
                      className="text-[9px] font-black text-red-500/50 hover:text-red-500 uppercase tracking-widest transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-red-500/5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Session items */}
                <div className="space-y-0.5">
                  {group.items.map(session => {
                    const isActive = currentSessionId === session.id;
                    const isPinned = pinnedIds.includes(session.id);
                    const isMenuOpen = menuOpenId === session.id;
                    const isRenaming = renamingId === session.id;
                    const wasShared = sharedId === session.id;

                    return (
                      <div key={session.id} className="relative" ref={isMenuOpen ? menuRef : undefined}>
                        <motion.div
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`group/item flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                            isActive
                              ? 'bg-indigo-50 dark:bg-white/10 text-indigo-700 dark:text-white'
                              : 'text-[--text-muted] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[--text-main]'
                          }`}
                          onClick={() => {
                            if (!isRenaming) { onSelectSession(session.id); onClose(); }
                          }}
                        >
                          {/* Active dot */}
                          <div className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                            isActive ? 'bg-indigo-500' : isPinned ? 'bg-amber-400' : 'bg-transparent'
                          }`} />

                          {/* Session name / rename input */}
                          {isRenaming ? (
                            <input
                              ref={renameInputRef}
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitRename();
                                if (e.key === 'Escape') cancelRename();
                                e.stopPropagation();
                              }}
                              onBlur={commitRename}
                              onClick={e => e.stopPropagation()}
                              className="flex-1 min-w-0 bg-white dark:bg-zinc-800 border border-indigo-400 rounded-lg px-2 py-0.5 text-xs font-medium text-[--text-main] focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                            />
                          ) : (
                            <span className="flex-1 min-w-0 truncate text-xs font-semibold leading-snug">
                              {session.sessionName}
                            </span>
                          )}

                          {/* Three-dot menu button */}
                          {!isRenaming && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setMenuOpenId(isMenuOpen ? null : session.id);
                              }}
                              className={`shrink-0 p-1 rounded-md transition-all ${
                                isMenuOpen
                                  ? 'opacity-100 bg-black/10 dark:bg-white/10 text-[--text-main]'
                                  : 'opacity-0 group-hover/item:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 text-[--text-muted]'
                              }`}
                              title="More options"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          )}
                        </motion.div>

                        {/* ── Context Menu Dropdown ── */}
                        <AnimatePresence>
                          {isMenuOpen && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.92, y: -4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.92, y: -4 }}
                              transition={{ duration: 0.12 }}
                              className="absolute right-0 top-full mt-1 z-[200] w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl shadow-black/10 dark:shadow-black/40 overflow-hidden"
                              onClick={e => e.stopPropagation()}
                            >
                              {/* Rename */}
                              <button
                                onClick={() => startRename(session)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-[--text-main] hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                              >
                                <Edit3 className="w-4 h-4 text-zinc-500" />
                                Rename
                              </button>

                              {/* Pin / Unpin */}
                              <button
                                onClick={() => togglePin(session.id)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-[--text-main] hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                              >
                                {isPinned
                                  ? <PinOff className="w-4 h-4 text-amber-500" />
                                  : <Pin className="w-4 h-4 text-zinc-500" />}
                                {isPinned ? 'Unpin' : 'Pin'}
                              </button>

                              {/* Share */}
                              <button
                                onClick={() => handleShare(session)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-[--text-main] hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                              >
                                {wasShared
                                  ? <Check className="w-4 h-4 text-emerald-500" />
                                  : <Share2 className="w-4 h-4 text-zinc-500" />}
                                {wasShared ? 'Copied!' : 'Share'}
                              </button>

                              <div className="mx-3 border-t border-zinc-100 dark:border-zinc-800" />

                              {/* Delete */}
                              <button
                                onClick={() => { onDeleteSession(session.id); setMenuOpenId(null); }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Footer ── */}
        <div className="p-4 shrink-0 border-t border-[--border]">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/8 dark:hover:bg-white/8 transition-colors group mb-2">
            <UserAvatar
              name={user.username}
              className="w-9 h-9 text-xs shadow-sm group-hover:scale-105 transition-transform shrink-0"
            />
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-black truncate text-[--text-main] uppercase tracking-wider">
                {user.username}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <p className="text-[9px] font-bold text-[--text-muted] uppercase tracking-[0.15em]">Online</p>
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2.5 p-2.5 text-[10px] font-black text-[--text-muted] hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-all uppercase tracking-[0.2em]"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
