/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Session, User } from '../types';
import {
  Plus, LogOut, Trash2, X, Search, Sparkles,
  MoreHorizontal, Pin, PinOff, Share2, Edit3, Check,
  MessageSquare, SquarePen, ChevronRight,
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

// ── localStorage helpers ──────────────────────────────────────────────────────
const PINNED_KEY = 'nexus_pinned_sessions';
const loadPinnedIds = (): number[] => {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY) || '[]'); } catch { return []; }
};
const savePinnedIds = (ids: number[]) => {
  localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
};

// ── Date grouping ─────────────────────────────────────────────────────────────
const getGroupLabel = (session: Session): string => {
  const raw = (session as any).createdAt || (session as any).created_at;
  if (!raw) return 'Recent';
  const date = new Date(raw);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This Week';
  if (diffDays < 30) return 'This Month';
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

// ── Tooltip wrapper for collapsed rail icons ──────────────────────────────────
function IconTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip flex items-center justify-center w-full">
      {children}
      <div className="
        absolute left-full ml-3 px-2.5 py-1.5
        bg-zinc-900 text-white text-xs font-semibold rounded-lg
        whitespace-nowrap pointer-events-none z-[300] shadow-lg
        opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150
      ">
        {label}
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-zinc-900" />
      </div>
    </div>
  );
}

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
  // collapsed = narrow icon rail; expanded = full panel
  const [collapsed, setCollapsed] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSessions, setFilteredSessions] = useState<Session[]>(sessions);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [focusSearch, setFocusSearch] = useState(false);

  // Context menu
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Inline rename
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Pinned
  const [pinnedIds, setPinnedIds] = useState<number[]>(loadPinnedIds);

  // Share toast
  const [sharedId, setSharedId] = useState<number | null>(null);

  // When parent forces open (mobile hamburger), expand
  useEffect(() => {
    if (isOpen) setCollapsed(false);
  }, [isOpen]);

  // Focus search when expanded via search icon
  useEffect(() => {
    if (!collapsed && focusSearch) {
      setTimeout(() => { searchInputRef.current?.focus(); setFocusSearch(false); }, 80);
    }
  }, [collapsed, focusSearch]);

  // ── Sync sessions ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) setFilteredSessions(sessions);
  }, [sessions, searchQuery]);

  // ── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setFilteredSessions(sessions); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await chatApi.searchSessions(searchQuery);
        setFilteredSessions((res as any).sessions || []);
      } catch {
        setFilteredSessions(sessions.filter(s =>
          s.sessionName.toLowerCase().includes(searchQuery.toLowerCase())
        ));
      } finally { setIsSearching(false); }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, sessions]);

  // ── Close context menu on outside click ───────────────────────────────────
  useEffect(() => {
    if (menuOpenId === null) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpenId]);

  // ── Focus rename input ────────────────────────────────────────────────────
  useEffect(() => {
    if (renamingId !== null) setTimeout(() => renameInputRef.current?.focus(), 50);
  }, [renamingId]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const togglePin = useCallback((id: number) => {
    setPinnedIds(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      savePinnedIds(next);
      return next;
    });
    setMenuOpenId(null);
  }, []);

  const handleShare = useCallback((session: Session) => {
    const text = session.sessionName;
    const fallback = () => {
      const el = document.createElement('textarea');
      el.value = text; document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(fallback);
    } else { fallback(); }
    setSharedId(session.id);
    setMenuOpenId(null);
    setTimeout(() => setSharedId(null), 2000);
  }, []);

  const startRename = useCallback((session: Session) => {
    setRenamingId(session.id);
    setRenameValue(session.sessionName);
    setMenuOpenId(null);
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId !== null && renameValue.trim()) onRenameSession(renamingId, renameValue.trim());
    setRenamingId(null); setRenameValue('');
  }, [renamingId, renameValue, onRenameSession]);

  const cancelRename = useCallback(() => { setRenamingId(null); setRenameValue(''); }, []);

  const handleDelete = useCallback((id: number) => {
    onDeleteSession(id);
    setMenuOpenId(null);
    setPinnedIds(prev => { const next = prev.filter(p => p !== id); savePinnedIds(next); return next; });
  }, [onDeleteSession]);

  // ── Collapse helpers ──────────────────────────────────────────────────────
  const expand = () => setCollapsed(false);
  const expandToSearch = () => { setCollapsed(false); setFocusSearch(true); };
  const collapse = () => { setCollapsed(true); onClose(); };

  // ── Grouped sessions ──────────────────────────────────────────────────────
  const sortedSessions = [
    ...filteredSessions.filter(s => pinnedIds.includes(s.id)),
    ...filteredSessions.filter(s => !pinnedIds.includes(s.id)),
  ];
  const grouped: { label: string; items: Session[] }[] = [];
  sortedSessions.forEach(session => {
    const label = pinnedIds.includes(session.id) ? 'Pinned' : getGroupLabel(session);
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) last.items.push(session);
    else grouped.push({ label, items: [session] });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLAPSED ICON RAIL — exactly 4 icons matching the screenshot
  // ═══════════════════════════════════════════════════════════════════════════
  if (collapsed) {
    return (
      <aside className="fixed inset-y-0 left-0 z-[100] w-14 bg-white border-r border-zinc-200 flex flex-col items-center py-5 shadow-sm">

        {/* 1. Logo (□) — tap to expand */}
        <IconTooltip label="Expand sidebar">
          <button
            onClick={expand}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100 transition-all"
            title="Expand"
          >
            {/* Square / window icon matching screenshot */}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="14" height="14" rx="2" />
            </svg>
          </button>
        </IconTooltip>

        <div className="w-5 border-t border-zinc-100 my-3" />

        {/* 2. New Chat (+) */}
        <IconTooltip label="New Chat">
          <button
            onClick={() => { onNewSession(); expand(); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100 transition-all"
            title="New Chat"
          >
            {/* Plus in a thin circle matching screenshot */}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="10" cy="10" r="7.5" />
              <line x1="10" y1="6.5" x2="10" y2="13.5" />
              <line x1="6.5" y1="10" x2="13.5" y2="10" />
            </svg>
          </button>
        </IconTooltip>

        {/* 3. Search (🔍) */}
        <IconTooltip label="Search">
          <button
            onClick={expandToSearch}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100 transition-all"
            title="Search"
          >
            <Search className="w-[18px] h-[18px]" strokeWidth={1.6} />
          </button>
        </IconTooltip>

        {/* 4. Chats (💬) */}
        <IconTooltip label="Chats">
          <button
            onClick={expand}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100 transition-all relative"
            title="Chats"
          >
            <MessageSquare className="w-[18px] h-[18px]" strokeWidth={1.6} />
            {sessions.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
            )}
          </button>
        </IconTooltip>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User avatar at bottom */}
        <IconTooltip label={user.username}>
          <button onClick={expand} className="mb-1">
            <UserAvatar
              name={user.username}
              className="w-8 h-8 text-xs shadow-sm hover:scale-105 transition-transform"
            />
          </button>
        </IconTooltip>
      </aside>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPANDED FULL SIDEBAR
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {/* Mobile overlay */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
        onClick={collapse}
      />

      <aside
        className="fixed inset-y-0 left-0 z-[100] w-72 bg-white border-r border-zinc-200 flex flex-col h-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="p-5 shrink-0">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white p-1.5">
                <StormLogo className="w-full h-full" />
              </div>
              <h2 className="text-xl font-black tracking-tighter text-zinc-900 italic">NEXUS</h2>
            </div>
            <button
              onClick={collapse}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors"
              title="Collapse sidebar"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* New Chat */}
          <button
            onClick={onNewSession}
            className="w-full py-2.5 px-4 bg-indigo-600 text-white rounded-2xl flex items-center gap-3 font-bold hover:opacity-90 transition-all active:scale-[0.98] group shadow-lg"
          >
            <div className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
              <Plus className="w-3.5 h-3.5" />
            </div>
            <span className="uppercase tracking-widest text-xs">New Chat</span>
          </button>

          {/* Search */}
          <div className="mt-3 relative group">
            <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-zinc-400 group-focus-within:text-indigo-500 transition-colors">
              {isSearching
                ? <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                : <Search className="w-3.5 h-3.5" />}
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="w-full pl-10 pr-8 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-3 flex items-center text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Session List ── */}
        <div className="flex-1 overflow-y-auto px-3 min-h-0 pb-4">
          {sortedSessions.length === 0 ? (
            <div className="mx-2 py-8 text-center bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider leading-relaxed">
                {searchQuery ? 'No matching chats' : 'No chats yet'}
                <br />
                <span className="opacity-60 font-medium">
                  {searchQuery ? 'Try a different query' : 'Start a new conversation'}
                </span>
              </p>
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.label} className="mb-2">
                <div className="flex items-center justify-between px-3 pt-4 pb-1.5">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">
                    {group.label}
                  </span>
                  {group.label !== 'Pinned' && !searchQuery && group === grouped[grouped.length - 1] && sessions.length > 0 && (
                    <button
                      onClick={onClearAll}
                      title="Clear all"
                      className="text-[9px] font-black text-red-400 hover:text-red-500 transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>

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
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                          }`}
                          onClick={() => { if (!isRenaming) onSelectSession(session.id); }}
                        >
                          <div className={`shrink-0 w-1.5 h-1.5 rounded-full transition-colors ${
                            isActive ? 'bg-indigo-500' : isPinned ? 'bg-amber-400' : 'bg-transparent'
                          }`} />

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
                              className="flex-1 min-w-0 bg-white border border-indigo-400 rounded-lg px-2 py-0.5 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                            />
                          ) : (
                            <span className="flex-1 min-w-0 truncate text-xs font-semibold leading-snug">
                              {session.sessionName}
                            </span>
                          )}

                          {!isRenaming && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setMenuOpenId(isMenuOpen ? null : session.id);
                              }}
                              className={`shrink-0 p-1 rounded-md transition-all ${
                                isMenuOpen
                                  ? 'opacity-100 bg-zinc-200 text-zinc-700'
                                  : 'opacity-0 group-hover/item:opacity-100 hover:bg-zinc-200 text-zinc-400'
                              }`}
                              title="More options"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          )}
                        </motion.div>

                        {/* Context menu dropdown */}
                        <AnimatePresence>
                          {isMenuOpen && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.92, y: -4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.92, y: -4 }}
                              transition={{ duration: 0.12 }}
                              className="absolute right-0 top-full mt-1 z-[200] w-44 bg-white border border-zinc-200 rounded-2xl shadow-xl shadow-black/10 overflow-hidden"
                              onClick={e => e.stopPropagation()}
                            >
                              {/* Rename */}
                              <button
                                onClick={() => startRename(session)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                              >
                                <Edit3 className="w-4 h-4 text-zinc-400" />
                                Rename
                              </button>

                              {/* Pin / Unpin */}
                              <button
                                onClick={() => togglePin(session.id)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                              >
                                {isPinned
                                  ? <PinOff className="w-4 h-4 text-amber-500" />
                                  : <Pin className="w-4 h-4 text-zinc-400" />}
                                {isPinned ? 'Unpin' : 'Pin'}
                              </button>

                              {/* Share */}
                              <button
                                onClick={() => handleShare(session)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                              >
                                {wasShared
                                  ? <Check className="w-4 h-4 text-emerald-500" />
                                  : <Share2 className="w-4 h-4 text-zinc-400" />}
                                {wasShared ? 'Copied!' : 'Share'}
                              </button>

                              <div className="mx-3 border-t border-zinc-100" />

                              {/* Delete */}
                              <button
                                onClick={() => handleDelete(session.id)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
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
        <div className="p-4 shrink-0 border-t border-zinc-200">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-50 hover:bg-zinc-100 transition-colors group mb-2">
            <UserAvatar
              name={user.username}
              className="w-9 h-9 text-xs shadow-sm group-hover:scale-105 transition-transform shrink-0"
            />
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-black truncate text-zinc-800 uppercase tracking-wider">
                {user.username}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-[0.15em]">Online</p>
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2.5 p-2.5 text-[10px] font-black text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all uppercase tracking-[0.2em]"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
