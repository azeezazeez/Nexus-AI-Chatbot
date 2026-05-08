/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { authApi } from './lib/api';
import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyOtp from './pages/VerifyOtp';
import ForgotPassword from './pages/ForgotPassword';
import Chat from './pages/Chat';
import StormLogo from './components/StormLogo';
import { User } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await authApi.getStatus();
      if (response.authenticated) {
        const profile = await authApi.getProfile();
        setUser(profile.user);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[--bg-main] transition-colors duration-300">
        <div className="flex flex-col items-center gap-4">
          <StormLogo className="w-12 h-12 text-indigo-500 animate-pulse" />
          <span className="text-[10px] font-bold text-[--text-muted] uppercase tracking-[0.3em]">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login onLogin={setUser} /> : <Navigate to="/" />} />
        <Route path="/signup" element={!user ? <Signup onSignup={(u) => setUser(u)} /> : <Navigate to="/" />} />
        <Route path="/verify-otp" element={!user ? <VerifyOtp onLogin={setUser} /> : <Navigate to="/" />} />
        <Route path="/forgot-password" element={!user ? <ForgotPassword /> : <Navigate to="/" />} />
        <Route path="/" element={user ? <Chat user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

