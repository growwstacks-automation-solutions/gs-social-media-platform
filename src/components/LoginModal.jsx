import React, { useState } from 'react';
import { AIRTABLE_BASE_ID, AIRTABLE_AUTH_TABLE, AIRTABLE_PAT, APP_NAME } from '../utils/config';

export default function LoginModal({ onLogin, onClose }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    setError(null);

    try {
      // Find user by email in Airtable
      const formula = `AND({Email} = '${email}', {Password} = '${password}')`;
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_AUTH_TABLE}?filterByFormula=${encodeURIComponent(formula)}`;
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${AIRTABLE_PAT}` }
      });
      const data = await res.json();

      if (data.records && data.records.length > 0) {
        onLogin(data.records[0].fields);
      } else {
        setError('Invalid email or password');
      }
    } catch (err) {
      setError('Connection error. Try again.');
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-6 animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-ink-900/60 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-cream-50 rounded-3xl shadow-lift overflow-hidden animate-fade-up border border-cream-300/60">
        <div className="bg-brand-gradient p-8 text-white relative">
          <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
            <svg viewBox="0 0 24 24" className="h-24 w-24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
            </svg>
          </div>
          <h2 className="h-display text-3xl mb-2">Welcome</h2>
          <p className="text-brand-100 text-sm tracking-wide">Login to {APP_NAME} to manage your forge.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-semibold animate-shake">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-ink-500 font-bold ml-1">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. admin@gmail.com"
              className="input bg-white border-cream-300"
              required 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-ink-500 font-bold ml-1">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input bg-white border-cream-300"
              required 
            />
          </div>

          <button 
            type="submit" 
            disabled={busy}
            className="w-full btn-primary py-3.5 text-base flex items-center justify-center gap-3 mt-4"
          >
            {busy ? (
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : 'Access Dashboard'}
          </button>
          
          <div className="text-center">
            <button 
              type="button" 
              onClick={onClose}
              className="text-xs text-ink-400 hover:text-ink-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
