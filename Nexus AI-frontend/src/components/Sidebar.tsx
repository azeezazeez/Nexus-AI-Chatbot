/**
 * Sidebar.tsx — fully rewritten for correctness.
 *
 * KEY FIXES:
 * 1. Sessions always derived from prop — never stale on mobile open.
 * 2. SessionList is a self-contained component with its own search/rename/menu
 *    state and refs — no shared refs between mobile and desktop instances.
 * 3. displaySessions = searchResults ?? sessions, so when searchResults is null
 *    (no active search) the full live sessions prop is shown immediately.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Session, User } from '../types';
import {
  Plus, LogOut, Trash2, X, Search, Sparkles,
  MoreHorizontal, Pin, PinOff, Edit3,
  MessageSquare,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import UserAvatar from './UserAvatar';
import { chatApi } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
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
  onClose?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PINNED_KEY = 'nexus_pinned_sessions';
const SIDEBAR_SEEN_KEY = 'nexus_sidebar_seen';

const loadPinnedIds = (): number[] => {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY) || '[]'); } catch { return []; }
};
const savePinnedIds = (ids: number[]) => {
  localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
};

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

// ─── NexusLogo ────────────────────────────────────────────────────────────────
function NexusLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="32" height="32" rx="8" ry="8" stroke="currentColor" strokeWidth="2.2" fill="none" />
      <line x1="10" y1="2" x2="10" y2="34" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// ─── IconTooltip ──────────────────────────────────────────────────────────────
function IconTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip flex items-center justify-center w-full">
      {children}
      <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap pointer-events-none z-[300] shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
        {label}
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-zinc-900" />
      </div>
    </div>
  );
}

// ─── SessionList ──────────────────────────────────────────────────────────────
// Fully self-contained: owns search, rename, menu, pin state and all refs.
// Receives `sessions` from parent so it always has the latest data.
interface SessionListProps {
  user: User;
  sessions: Session[];
  currentSessionId: number | null;
  onSelectSession: (id: number) => void;
  onNewSession: () => void;
  onDeleteSession: (id: number) => void;
  onRenameSession: (id: number, name: string) => void;
  onClearAll: () => void;
  onLogout: () => void;
  onClose: () => void;
  focusSearchOnMount?: boolean;
}

function SessionList({
  user,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onClearAll,
  onLogout,
  onClose,
  focusSearchOnMount = false,
}: SessionListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  // null = no active search → show full sessions prop directly (never stale)
  const [searchResults, setSearchResults] = useState<Session[] | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [pinnedIds, setPinnedIds] = useState<number[]>(loadPinnedIds);

  // Focus search input on mount when requested
  useEffect(() => {
    if (focusSearchOnMount) {
      setTimeout(() => searchInputRef.current?.focus(), 80);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await chatApi.searchSessions(searchQuery);
        setSearchResults((res as any).sessions || []);
      } catch {
        setSearchResults(
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

  // Close context menu on outside click
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

  // Auto-focus rename input
  useEffect(() => {
    if (renamingId !== null) {
      setTimeout(() => renameInputRef.current?.focus(), 50);
    }
  }, [renamingId]);

  // Derived list — searchResults=null means show full live sessions prop
  const displaySessions: Session[] = searchResults ?? sessions;

  const sortedSessions = [
    ...displaySessions.filter(s => pinnedIds.includes(s.id)),
    ...displaySessions.filter(s => !pinnedIds.includes(s.id)),
  ];

  const grouped: { label: string; items: Session[] }[] = [];
  sortedSessions.forEach(session => {
    const label = pinnedIds.includes(session.id) ? 'Pinned' : getGroupLabel(session);
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) last.items.push(session);
    else grouped.push({ label, items: [session] });
  });

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) setSearchResults(null);
  };

  const togglePin = useCallback((id: number) => {
    setPinnedIds(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      savePinnedIds(next);
      return next;
    });
    setMenuOpenId(null);
  }, []);

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

  const handleDelete = (id: number) => {
    onDeleteSession(id);
    setMenuOpenId(null);
    setPinnedIds(prev => {
      const next = prev.filter(p => p !== id);
      savePinnedIds(next);
      return next;
    });
  };

  return (
    <>
      {/* Top controls */}
      <div className="p-4 shrink-0">
        <button
          onClick={() => { onNewSession(); onClose(); }}
          className="w-full py-2.5 px-4 bg-indigo-600 text-white rounded-2xl flex items-center gap-3 font-bold hover:opacity-90 transition-all active:scale-[0.98] group shadow-lg mb-3"
        >
          <div className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <span className="uppercase tracking-widest text-xs">New Chat</span>
        </button>

        <div className="relative group">
          <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-zinc-400 group-focus-within:text-indigo-500 transition-colors">
            {isSearching
              ? <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              : <Search className="w-3.5 h-3.5" />}
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search chats..."
            className="w-full pl-10 pr-8 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute inset-y-0 right-3 flex items-center text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Session list */}
      <div
        className="flex-1 overflow-y-auto px-3 min-h-0 pb-4"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        {sortedSessions.length === 0 ? (
          <div className="mx-2 py-8 text-center bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700">
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

                  return (
                    <div
                      key={session.id}
                      className="relative"
                      ref={isMenuOpen ? menuRef : undefined}
                    >
                      <motion.div
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`group/item flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                          isActive
                            ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                            : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200'
                        }`}
                        onClick={() => {
                          if (!isRenaming) {
                            onSelectSession(session.id);
                            onClose();
                          }
                        }}
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
                            className="flex-1 min-w-0 bg-white dark:bg-zinc-900 border border-indigo-400 rounded-lg px-2 py-0.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
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
                                ? 'opacity-100 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                                : 'opacity-60 hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400'
                            }`}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        )}
                      </motion.div>

                      {/* Context menu */}
                      <AnimatePresence>
                        {isMenuOpen && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.92, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: -4 }}
                            transition={{ duration: 0.12 }}
                            className="absolute right-0 top-full mt-1 z-[200] w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl shadow-black/10 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={() => startRename(session)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Edit3 className="w-4 h-4 text-zinc-400" /> Rename
                            </button>
                            <button
                              onClick={() => togglePin(session.id)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                            >
                              {isPinned
                                ? <PinOff className="w-4 h-4 text-amber-500" />
                                : <Pin className="w-4 h-4 text-zinc-400" />}
                              {isPinned ? 'Unpin' : 'Pin'}
                            </button>
                            <div className="mx-3 border-t border-zinc-100 dark:border-zinc-800" />
                            <button
                              onClick={() => handleDelete(session.id)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" /> Delete
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

      {/* Footer */}
      <div className="p-4 shrink-0 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group mb-2">
          <UserAvatar
            name={user.username}
            className="w-9 h-9 text-xs shadow-sm group-hover:scale-105 transition-transform shrink-0"
          />
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-black truncate text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
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
          className="w-full flex items-center justify-center gap-2.5 p-2.5 text-[10px] font-black text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all uppercase tracking-[0.2em]"
        >
          <LogOut className="w-3.5 h-3.5" /> Logout
        </button>
      </div>
    </>
  );
}

// ─── Main Sidebar export ──────────────────────────────────────────────────────
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
  onClose = () => {},
  mobileOpen = false,
  onMobileClose = () => {},
}: Props) {
  const [desktopCollapsed, setDesktopCollapsed] = useState(() =>
    localStorage.getItem(SIDEBAR_SEEN_KEY) !== null
  );
  const [focusSearch, setFocusSearch] = useState(false);

  const expandDesktop = useCallback(() => {
    setDesktopCollapsed(false);
    localStorage.setItem(SIDEBAR_SEEN_KEY, '1');
    setFocusSearch(false);
  }, []);

  const expandDesktopToSearch = useCallback(() => {
    setDesktopCollapsed(false);
    localStorage.setItem(SIDEBAR_SEEN_KEY, '1');
    setFocusSearch(true);
  }, []);

  const collapseDesktop = useCallback(() => {
    setDesktopCollapsed(true);
    setFocusSearch(false);
    onClose();
  }, [onClose]);

  const toggleDesktop = useCallback(() => {
    if (desktopCollapsed) expandDesktop();
    else collapseDesktop();
  }, [desktopCollapsed, expandDesktop, collapseDesktop]);

  // Common props for every SessionList instance
  const listProps = {
    user,
    sessions,
    currentSessionId,
    onSelectSession,
    onNewSession,
    onDeleteSession,
    onRenameSession,
    onClearAll,
    onLogout,
  };

  return (
    <>
      {/* ═══════════════════════════════════════════════════
          MOBILE / TABLET DRAWER  (hidden on lg+)
      ═══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={onMobileClose}
              aria-hidden="true"
            />
            <motion.aside
              key="mobile-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex flex-col h-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 p-1.5">
                    <NexusLogo className="w-full h-full text-white" />
                  </div>
                  <h2 className="text-lg font-black tracking-tighter text-zinc-900 dark:text-white italic">NEXUS</h2>
                </div>
                <button
                  onClick={onMobileClose}
                  className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <SessionList
                {...listProps}
                onClose={onMobileClose}
                focusSearchOnMount={false}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════
          DESKTOP COLLAPSED ICON RAIL  (lg+ only)
      ═══════════════════════════════════════════════════ */}
      {desktopCollapsed && (
        <aside className="hidden lg:flex fixed inset-y-0 left-0 z-[100] w-14 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex-col items-center py-5 shadow-sm">
          <IconTooltip label="Open sidebar">
            <button
              onClick={toggleDesktop}
              className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 hover:opacity-90 transition-all shadow-lg shadow-indigo-500/20"
            >
              <NexusLogo className="w-5 h-5 text-white" />
            </button>
          </IconTooltip>

          <div className="flex flex-col items-center w-full gap-1">
            <div className="w-5 border-t border-zinc-100 dark:border-zinc-800 my-3" />
            <IconTooltip label="New Chat">
              <button
                onClick={() => { onNewSession(); expandDesktop(); }}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <circle cx="10" cy="10" r="7.5" />
                  <line x1="10" y1="6.5" x2="10" y2="13.5" />
                  <line x1="6.5" y1="10" x2="13.5" y2="10" />
                </svg>
              </button>
            </IconTooltip>
            <IconTooltip label="Search">
              <button
                onClick={expandDesktopToSearch}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              >
                <Search className="w-[18px] h-[18px]" strokeWidth={1.6} />
              </button>
            </IconTooltip>
            <IconTooltip label={`Chats (${sessions.length})`}>
              <button
                onClick={expandDesktop}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all relative"
              >
                <MessageSquare className="w-[18px] h-[18px]" strokeWidth={1.6} />
                {sessions.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-indigo-500 text-white text-[9px] font-black flex items-center justify-center leading-none">
                    {sessions.length > 9 ? '9+' : sessions.length}
                  </span>
                )}
              </button>
            </IconTooltip>
          </div>

          <div className="flex-1" />
          <IconTooltip label={user.username}>
            <button onClick={expandDesktop}>
              <UserAvatar
                name={user.username}
                className="w-8 h-8 text-xs shadow-sm hover:scale-105 transition-transform"
              />
            </button>
          </IconTooltip>
        </aside>
      )}

      {/* ═══════════════════════════════════════════════════
          DESKTOP EXPANDED FULL SIDEBAR  (lg+ only)
      ═══════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        {!desktopCollapsed && (
          <>
            <motion.div
              key="desktop-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="hidden lg:block fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={collapseDesktop}
              aria-hidden="true"
            />
            <aside
              className="hidden lg:flex fixed inset-y-0 left-0 z-[100] w-72 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex-col h-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
                <button
                  onClick={collapseDesktop}
                  className="flex items-center gap-2.5 group"
                  title="Close sidebar"
                >
                  <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 p-1.5 group-hover:opacity-80 transition-opacity">
                    <NexusLogo className="w-full h-full text-white" />
                  </div>
                  <h2 className="text-xl font-black tracking-tighter text-zinc-900 dark:text-white italic">NEXUS</h2>
                </button>
              </div>

              <SessionList
                {...listProps}
                onClose={collapseDesktop}
                focusSearchOnMount={focusSearch}
              />
            </aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
