import React, { useState } from 'react';
import { User as UserIcon, Lock, AlertCircle, ChevronRight } from 'lucide-react';
import { getLoginLockoutRemaining, recordFailedLogin, resetLoginAttempts, getRemainingAttempts } from '../../services/rateLimiter';

interface LoginFormProps {
  onLogin: (username: string, password: string) => Promise<string | null>;
  loginError: string;
}

/**
 * Extracted Login Form component with rate limiting integration.
 * Handles username/password input and displays errors.
 */
const LoginForm: React.FC<LoginFormProps> = ({ onLogin, loginError }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rateLimitError, setRateLimitError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRateLimitError('');

    // Check rate limit before attempting login
    const lockoutRemaining = getLoginLockoutRemaining();
    if (lockoutRemaining > 0) {
      const minutes = Math.floor(lockoutRemaining / 60);
      const seconds = lockoutRemaining % 60;
      setRateLimitError(`Akun terkunci. Coba lagi dalam ${minutes}m ${seconds}s.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const error = await onLogin(username, password);
      if (error) {
        // Record failed attempt
        const lockoutMsg = recordFailedLogin();
        if (lockoutMsg) {
          setRateLimitError(lockoutMsg);
        }
      } else {
        // Success — reset attempts
        resetLoginAttempts();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = rateLimitError || loginError;
  const remainingAttempts = getRemainingAttempts();

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="login-username" className="text-[11px] font-black text-slate-400 uppercase tracking-[0.18em] ml-1.5">
            Identitas Login
          </label>
          <div className="relative group">
            <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-600 transition-colors" size={18} aria-hidden="true" />
            <input
              id="login-username"
              type="text"
              required
              autoFocus
              autoComplete="username"
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-[1.2rem] focus:border-indigo-600 focus:bg-white outline-none font-black text-slate-800 transition-all shadow-inner text-sm"
              placeholder="ID AKUN"
              value={username}
              onChange={e => setUsername(e.target.value)}
              aria-label="Username"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="login-password" className="text-[11px] font-black text-slate-400 uppercase tracking-[0.18em] ml-1.5">
            Kata Sandi
          </label>
          <div className="relative group">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-600 transition-colors" size={18} aria-hidden="true" />
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-[1.2rem] focus:border-indigo-600 focus:bg-white outline-none font-black text-slate-800 transition-all shadow-inner text-sm"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              aria-label="Password"
            />
          </div>
        </div>
      </div>

      {displayError && (
        <div className="p-3.5 bg-red-50 text-red-600 rounded-[1.2rem] border border-red-100 font-black uppercase text-[11px] flex items-center gap-3" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{displayError}</span>
        </div>
      )}

      {remainingAttempts <= 2 && remainingAttempts > 0 && !displayError && (
        <div className="p-3 bg-amber-50 text-amber-700 rounded-[1.2rem] border border-amber-100 font-bold text-[11px] flex items-center gap-3" role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          <span>Sisa {remainingAttempts} percobaan sebelum akun terkunci.</span>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white rounded-[1.35rem] font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-indigo-200/70 hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
        aria-label="Login"
      >
        {isSubmitting ? 'Memverifikasi...' : 'Masuk Dashboard'}
        {!isSubmitting && <ChevronRight size={18} aria-hidden="true" />}
      </button>
    </form>
  );
};

export default LoginForm;
