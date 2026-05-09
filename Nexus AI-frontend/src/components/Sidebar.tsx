/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Session, User } from '../types';
import { Plus, LogOut, Trash2, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import StormLogo from './StormLogo';
import UserAvatar from './UserAvatar';

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

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-80 bg-[--surface] dark:bg-black/80 border-r border-[--border] transition-transform duration-300 transform lg:translate-x-0 lg:static lg:inset-auto
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        flex flex-col h-full
      `}>
        {/* Header */}
      <div className="p-8">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white p-1.5">
            <StormLogo className="w-full h-full" />
          </div>
          <h2 className="text-2xl font-black tracking-tighter text-[--text-main] italic">NEXUS</h2>
        </div>

        <button
          onClick={() => {
            onNewSession();
            onClose();
          }}
          className="w-full py-4 px-5 bg-indigo-600 text-white dark:bg-white dark:text-black rounded-2xl flex items-center gap-3 font-bold text-sm tracking-wide hover:opacity-90 transition-all active:scale-[0.98] group shadow-lg"
        >
          <div className="w-6 h-6 rounded-lg bg-white/20 dark:bg-black/10 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Plus className="w-4 h-4 text-white dark:text-black" />
          </div>
          NEW CHAT
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-2 scroll-hide min-h-0">
        <div className="flex items-center justify-between px-4 mb-4">
          <label className="text-[10px] font-black text-[--text-muted]/60 uppercase tracking-[0.25em]">Recent Chats</label>
          {sessions.length > 0 && (
            <button 
              onClick={onClearAll}
              title="Delete All Chats"
              className="text-[9px] font-black text-red-500/60 hover:text-red-500 uppercase tracking-widest transition-colors flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-red-500/5 group/clear"
            >
              <Trash2 className="w-3.5 h-3.5 group-hover/clear:scale-110 transition-transform" />
            </button>
          )}
        </div>
        
        {sessions.length === 0 ? (
          <div className="px-4 py-8 text-center bg-black/5 dark:bg-white/5 rounded-2xl border border-dashed border-[--border]">
            <p className="text-[10px] font-bold text-[--text-muted] uppercase tracking-wider leading-relaxed">No recent chats<br /><span className="opacity-40 font-medium">Your history will appear here</span></p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
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
