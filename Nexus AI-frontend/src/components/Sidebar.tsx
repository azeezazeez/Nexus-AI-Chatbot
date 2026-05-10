/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Session, User } from '../types';
import { Plus, LogOut, Trash2, X } from 'lucide-react';
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

      <aside 
        className={`
          fixed inset-y-0 left-0 z-[100] w-72 xs:w-80
          bg-white border-r border-zinc-200
          transition-transform duration-300 ease-in-out transform
          lg:translate-x-0 lg:static lg:inset-auto
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
              <h2 className="text-2xl font-black tracking-tighter text-black italic">NEXUS</h2>
            </div>
            <button 
              onClick={onClose} 
              className="lg:hidden p-2 text-zinc-400 hover:text-red-500 rounded-full hover:bg-zinc-100 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <button
            onClick={() => {
              onNewSession();
              onClose();
            }}
            className="w-full py-4 px-5 bg-indigo-600 text-white rounded-2xl flex items-center justify-center lg:justify-start gap-3 font-bold text-sm tracking-wide hover:opacity-90 transition-all active:scale-[0.98] group shadow-lg cursor-pointer"
          >
            <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
              <Plus className="w-4 h-4 text-white" />
            </div>
            <span className="uppercase tracking-widest">New Chat</span>
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-4 md:px-5 space-y-2 scroll-hide min-h-0 pb-10 relative z-10">
          <div className="flex items-center justify-between px-3 md:px-4 mb-4">
            <label className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.25em]">
              Recent Chats
            </label>
            {sessions.length > 0 && (
              <button 
                onClick={onClearAll}
                title="Delete All Chats"
                className="text-[9px] font-black text-red-400 hover:text-red-600 uppercase tracking-widest transition-colors flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-red-50 group/clear"
              >
                <Trash2 className="w-3.5 h-3.5 group-hover/clear:scale-110 transition-transform" />
              </button>
            )}
          </div>
          
          {sessions.length === 0 ? (
            <div className="px-4 py-8 text-center bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider leading-relaxed">
                No recent chats<br />
                <span className="opacity-60 font-medium">Your history will appear here</span>
              </p>
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
                      ? 'bg-indigo-50 border-indigo-100 text-indigo-700 shadow-sm' 
                      : 'text-zinc-500 border-transparent hover:bg-zinc-50 hover:text-black'
                  }`}
                  onClick={() => {
                    onSelectSession(session.id);
                    onClose();
                  }}
                >
                  <div className={`shrink-0 w-2 h-2 rounded-full ${
                    currentSessionId === session.id
                      ? 'bg-indigo-500 animate-pulse'
                      : 'bg-zinc-300'
                  }`} />
                  <span className="flex-1 truncate text-xs font-bold tracking-wide">
                    {session.sessionName}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className={`p-1.5 rounded-lg transition-all ${
                      currentSessionId === session.id
                        ? 'hover:bg-indigo-100 text-indigo-400 hover:text-indigo-600'
                        : 'opacity-0 group-hover:opacity-100 hover:bg-red-50 text-zinc-400 hover:text-red-500'
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
        <div className="p-6 mt-auto border-t border-zinc-100">
          <div className="flex items-center gap-4 p-4 rounded-3xl bg-zinc-50 border border-zinc-100 hover:border-indigo-100 transition-colors group">
            <UserAvatar name={user.username} className="w-12 h-12 text-sm shadow-md group-hover:scale-105 transition-transform" />
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-black truncate text-black uppercase tracking-wider">
                {user.username}
              </p>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <p className="text-[9px] font-bold text-zinc-400 truncate uppercase tracking-[0.15em]">Online</p>
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-3 p-3 mt-2 text-[10px] font-black text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all uppercase tracking-[0.2em]"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
