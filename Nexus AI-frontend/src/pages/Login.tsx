/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { authApi } from '../lib/api';
import { User } from '../types';
import { ArrowRight, Eye, EyeOff, CheckCircle } from 'lucide-react';
import StormLogo from '../components/StormLogo';

interface Props {
  onLogin: (user: User) => void;
}

export default function Login({ onLogin }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const state = location.state as { message?: string };
    if (state?.message) {
      setSuccessMsg(state.message);
      // Clear state and message after 5 seconds
      const timer = setTimeout(() => setSuccessMsg(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const response = await authApi.login({ username, password });
      onLogin(response.user);
    } catch (err: any) {
      if (err.message === 'Account not verified') {
        navigate('/verify-otp', { state: { email: err.email } });
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-[--bg-main] transition-colors duration-300 relative overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px]" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px]" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-10 glass rounded-[2.5rem] shadow-2xl relative z-10 bg-white/70 dark:bg-zinc-900/40"
      >
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[1.5rem] flex items-center justify-center mb-5 shadow-xl shadow-indigo-500/20 text-white p-3">
            <StormLogo className="w-full h-full" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-[--text-main] mb-2 italic uppercase">Login</h1>
          <p className="text-[--text-muted] text-sm font-medium tracking-wide">Welcome back! Please enter your details.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.2em] mb-2 px-1">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-6 py-4 bg-[--surface] border border-[--border] rounded-[1.25rem] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all text-[--text-main] placeholder:text-[--text-muted]/40 font-medium"
              placeholder="Enter your username"
              required
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-2 px-1">
              <label className="block text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.2em]">Password</label>
            </div>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-6 py-4 bg-[--surface] border border-[--border] rounded-[1.25rem] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all text-[--text-main] placeholder:text-[--text-muted]/40 font-medium pr-14"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-[--text-muted] hover:text-[--text-main] transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {successMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs rounded-2xl px-5 font-bold uppercase tracking-widest leading-relaxed flex items-center gap-3"
            >
              <CheckCircle className="w-4 h-4 shrink-0" />
              {successMsg}
            </motion.div>
          )}

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-xs rounded-2xl px-5 font-bold uppercase tracking-widest leading-relaxed"
            >
              {error}
            </motion.div>
          )}

          <div className="pt-2">
            <div className="flex justify-center mb-4">
              <Link to="/forgot-password" size="sm" className="text-[11px] font-black text-indigo-500 hover:underline uppercase tracking-widest">Forgot Password?</Link>
            </div>
            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-5 px-8 bg-indigo-600 text-white dark:bg-white dark:text-black rounded-[1.25rem] font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:opacity-90 transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed group shadow-xl"
            >
              {loading ? 'Logging in...' : 'Log In'}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </form>

        <p className="mt-10 text-center text-xs text-[--text-muted] font-medium tracking-wide">
          Don't have an account? {' '}
          <Link to="/signup" className="text-indigo-600 dark:text-white font-bold hover:underline transition-colors underline-offset-8 decoration-indigo-500/30">Sign Up</Link>
        </p>
      </motion.div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 opacity-30 select-none pointer-events-none">
        <p className="text-[10px] font-black text-[--text-muted] uppercase tracking-[0.3em]">Safe & Secure</p>
      </div>
    </div>
  );
}
