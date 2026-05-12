/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Session, User } from '../types';
import { Plus, LogOut, Trash2, X, Search, Sparkles } from 'lucide-react';
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
  onClearAll: () => void;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ 
  user, 
  sessions, 
  currentSessionId, 
  onSelectSession, 
  onNewSession, 
  onDeleteSession,
  onClearAll,
  onLogout,
  isOpen,
  onClose
 }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredSessions, setFilteredSessions] = useState<Session[]>(sessions);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredSessions(sessions);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await chatApi.searchSessions(searchQuery);
        setFilteredSessions(response.sessions || []);
      } catch (err) {
        console.error('Search failed:', err);
        // Fallback to local filtering
        setFilteredSessions(sessions.filter(s => 
          s.sessionName.toLowerCase().includes(searchQuery.toLowerCase())
        ));
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, sessions]);

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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside 
        className={`
          fixed inset-y-0 left-0 z-[100] w-72 xs:w-80 bg-[--surface] dark:bg-black border-r border-[--border] transition-transform duration-300 ease-in-out transform lg:translate-x-0 lg:static lg:inset-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          flex flex-col h-full shadow-2xl lg:shadow-none isolate
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
      <div className="p-6 md:p-8 shrink-0 relative z-20">
        <div className="flex items-center justify-between mb-8 md:mb-10 lg:block">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white p-1.5">
              <StormLogo className="w-full h-full" />
            </div>
            <h2 className="text-2xl font-black tracking-tighter text-[--text-main] italic">NEXUS</h2>
          </div>
          <button 
            onClick={onClose} 
            className="lg:hidden p-2 text-[--text-muted] hover:text-red-500 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <button
          onClick={() => {
            onNewSession();
            onClose();
          }}
          className="w-full py-4 px-5 bg-indigo-600 text-white dark:bg-white dark:text-black rounded-2xl flex items-center justify-center lg:justify-start gap-3 font-bold text-sm tracking-wide hover:opacity-90 transition-all active:scale-[0.98] group shadow-lg cursor-pointer"
        >
          <div className="w-6 h-6 rounded-lg bg-white/20 dark:bg-black/10 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
            <Plus className="w-4 h-4 text-white dark:text-black" />
          </div>
          <span className="uppercase tracking-widest">New Chat</span>
        </button>

        {/* Search Bar */}
        <div className="mt-6 relative group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-[--text-muted]/40 group-focus-within:text-indigo-500 transition-colors">
            {isSearching ? <Sparkles className="w-3.5 h-3.5 animate-pulse" /> : <Search className="w-3.5 h-3.5" />}
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Smart AI Search..."
            className="w-full pl-11 pr-4 py-3 bg-black/5 dark:bg-white/5 border border-[--border] rounded-xl text-[10px] font-bold uppercase tracking-widest text-[--text-main] placeholder:text-[--text-muted]/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-5 space-y-2 scroll-hide min-h-0 pb-10 relative z-10">
        <div className="flex items-center justify-between px-3 md:px-4 mb-4">
          <label className="text-[10px] font-black text-[--text-muted]/60 uppercase tracking-[0.25em]">
            {searchQuery ? 'Search Results' : 'Recent Chats'}
          </label>
          {sessions.length > 0 && !searchQuery && (
            <button 
              onClick={onClearAll}
              title="Delete All Chats"
              className="text-[9px] font-black text-red-500/60 hover:text-red-500 uppercase tracking-widest transition-colors flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-red-500/5 group/clear"
            >
              <Trash2 className="w-3.5 h-3.5 group-hover/clear:scale-110 transition-transform" />
            </button>
          )}
        </div>
        
        {filteredSessions.length === 0 ? (
          <div className="px-4 py-8 text-center bg-black/5 dark:bg-white/5 rounded-2xl border border-dashed border-[--border]">
            <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-wider leading-relaxed">
              {searchQuery ? 'No matching chats' : 'No recent chats'}
              <br />
              <span className="opacity-40 font-medium">
                {searchQuery ? 'Try a different query' : 'Your history will appear here'}
              </span>
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSessions.map((session) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`group flex items-center gap-3 p-4 rounded-2xl cursor-pointer transition-all border ${
                  currentSessionId === session.id 
                    ? 'bg-indigo-50 border-indigo-100 text-indigo-700 dark:bg-white/10 dark:border-white/10 dark:text-white shadow-sm' 
                    : 'text-[--text-muted] border-transparent hover:bg-black/5 dark:hover:bg-white/5 hover:text-[--text-main]'
                }`}
                onClick={() => {
                  onSelectSession(session.id);
                  onClose();
                }}
              >
                <div className={`shrink-0 w-2 h-2 rounded-full ${currentSessionId === session.id ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-300 dark:bg-white/10'}`} />
                <span className="flex-1 truncate text-xs font-bold tracking-wide">{session.sessionName}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                  className={`p-1.5 rounded-lg transition-all ${
                    currentSessionId === session.id ? 'hover:bg-indigo-100 dark:hover:bg-white/10 text-indigo-400 hover:text-indigo-600 dark:text-white/40' : 'opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-zinc-400 hover:text-red-500'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-6 mt-auto">
        <div className="flex items-center gap-4 p-4 rounded-3xl bg-black/5 dark:bg-white/5 border border-transparent hover:border-indigo-500/10 transition-colors group">
            <UserAvatar name={user.username} className="w-12 h-12 text-sm shadow-md group-hover:scale-105 transition-transform" />
            <div className="flex-1 overflow-hidden">
                <p className="text-xs font-black truncate text-[--text-main] uppercase tracking-wider">{user.username}</p>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <p className="text-[9px] font-bold text-[--text-muted] truncate uppercase tracking-[0.15em]">Online</p>
                </div>
            </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-3 p-3 text-[10px] font-black text-[--text-muted] hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-all uppercase tracking-[0.2em]"
        >
          <LogOut className="w-3.5 h-3.5" />
          Logout
        </button>
      </div>
    </aside>
    </>
  );
}
