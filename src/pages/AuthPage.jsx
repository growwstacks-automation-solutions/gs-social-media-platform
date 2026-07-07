import React, { useState } from 'react';
import { verifyLogin } from '../services/supabase.js';
import { Spinner } from '../components/Loader.jsx';
import { APP_NAME } from '../utils/config.js';

export default function AuthPage({ onLoggedIn }) {
  const [email, setEmail]     = useState('');
  const [password, setPwd]    = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!email.trim() || !password) {
      setErr('Enter email and password.');
      return;
    }
    setBusy(true);
    try {
      const row = await verifyLogin(email, password);
      if (!row) {
        setErr('Invalid email or password, or account is not active.');
        return;
      }
      onLoggedIn?.({
        credential_id: row.credential_id,
        email: row.email,
        loggedInAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('[auth]', e);
      setErr(e.message || 'Login failed — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-50 p-4">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-gradient shadow-glow mb-3">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="h-display text-3xl text-ink-900">{APP_NAME}</h1>
          <p className="text-sm text-ink-500 mt-1">Sign in to manage your content workflow.</p>
        </div>

        {/* Card */}
        <form
          onSubmit={submit}
          className="bg-white rounded-2xl shadow-lift border border-cream-300/60 p-6 lg:p-8 space-y-5"
        >
          <div>
            <label className="block">
              <div className="text-[11px] uppercase tracking-[0.16em] text-ink-500 font-semibold mb-1.5">Email</div>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
                autoFocus
                disabled={busy}
              />
            </label>
          </div>

          <div>
            <label className="block">
              <div className="text-[11px] uppercase tracking-[0.16em] text-ink-500 font-semibold mb-1.5">Password</div>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="••••••••"
                  className="input pr-12"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider font-bold text-ink-500 hover:text-brand-700 px-2 py-1"
                  tabIndex={-1}
                >
                  {showPwd ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
          </div>

          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 animate-fade-in">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-brand-gradient hover:opacity-95 text-white font-bold rounded-lg px-4 py-3 inline-flex items-center justify-center gap-2 transition-all shadow-soft hover:shadow-lift disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? <Spinner /> : <LockIcon />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-[11px] text-ink-500 text-center pt-1">
            Trouble signing in? Contact your administrator to confirm your account is active.
          </p>
        </form>
      </div>
    </div>
  );
}

const LockIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
  </svg>
);
