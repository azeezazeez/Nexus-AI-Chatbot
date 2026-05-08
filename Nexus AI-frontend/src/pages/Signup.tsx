/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { authApi } from '../lib/api';
import { User } from '../types';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import StormLogo from '../components/StormLogo';

interface Props {
  onSignup: (user: User) => void;
}

export default function Signup({ onSignup }: Props) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validatePassword = (pass: string) => {
    if (pass.length < 8) return "Password must be at least 8 characters long.";
    if (!/[A-Z]/.test(pass)) return "Password must contain at least one capital letter.";
    if (!/[a-z]/.test(pass)) return "Password must contain at least one small letter.";
    if (!/[0-9]/.test(pass)) return "Password must contain at least one number.";
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pass)) return "Password must contain at least one special character.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    try {
      const response = await authApi.signup({ username, email, password });
      // In this dev environment, we pass the simulated OTP so the user can test easily
      navigate('/verify-otp', { state: { email, otpSimulated: response.otpSimulated } });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-[--bg-main] transition-colors duration-300 relative overflow-hidden">
      {/* Decorative Orbs */}
      <div className="absolute top-1/4 -left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 -right-20 w-64 h-64 bg-purple-500/10 rounded-full blur-[120px]" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md p-10 glass rounded-[2.5rem] shadow-2xl relative z-10 bg-white/70 dark:bg-zinc-900/40"
      >
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-5 shadow-xl shadow-indigo-500/20 text-white p-3">
            <StormLogo className="w-full h-full" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-[--text-main] mb-2 italic uppercase">Sign Up</h1>
          <p className="text-[--text-muted] text-sm font-medium tracking-wide">Create your account to get started.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.2em] mb-2 px-1">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-5 py-4 bg-[--surface] border border-[--border] rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-[--text-main] placeholder:text-[--text-muted]/30"
                placeholder="username"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.2em] mb-2 px-1">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 py-4 bg-[--surface] border border-[--border] rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-[--text-main] placeholder:text-[--text-muted]/30"
              placeholder="email@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.2em] mb-2 px-1">Password</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 bg-[--surface] border border-[--border] rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-[--text-main] placeholder:text-[--text-muted]/30 text-sm pr-14"
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
            <p className="mt-2 px-1 text-[10px] text-[--text-muted] leading-relaxed font-medium">
              Requires 8+ characters, one uppercase, one lowercase, one number, and one symbol.
            </p>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-xs rounded-2xl px-5 font-bold uppercase tracking-widest leading-relaxed"
            >
              {error}
            </motion.div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-5 px-8 bg-indigo-600 text-white dark:bg-white dark:text-black rounded-[1.25rem] font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-3 hover:opacity-90 transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed group shadow-xl"
          >
            {loading ? 'Processing...' : 'Sign Up'}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-[--text-muted] font-medium tracking-wide">
          Already have an account? {' '}
          <Link to="/login" className="text-indigo-600 dark:text-white font-bold hover:underline transition-colors underline-offset-8 decoration-indigo-500/30">Log In</Link>
        </p>
      </motion.div>
    </div>
  );
}
