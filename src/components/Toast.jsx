import React, { createContext, useCallback, useContext, useState } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((msg, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    const toast = { id, msg, type: opts.type || 'info', duration: opts.duration ?? 3200 };
    setToasts((t) => [...t, toast]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), toast.duration);
  }, []);

  const api = {
    info:    (m, o) => push(m, { ...o, type: 'info' }),
    success: (m, o) => push(m, { ...o, type: 'success' }),
    error:   (m, o) => push(m, { ...o, type: 'error' })
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
            className={`pointer-events-auto animate-slide-in rounded-xl px-4 py-3 text-sm shadow-lift ring-1 ring-inset backdrop-blur flex items-start gap-2.5
              ${t.type === 'success' ? 'bg-green-50/95 text-accent-green ring-green-200'
              : t.type === 'error'   ? 'bg-brand-50/95 text-brand-700  ring-brand-200'
              : 'bg-white/95 text-ink-900 ring-cream-300'}`}>
            <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0
              ${t.type === 'success' ? 'bg-accent-green'
              : t.type === 'error'   ? 'bg-brand-700'
              : 'bg-accent-blue'}`}/>
            <span className="leading-snug">{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be inside <ToastProvider>');
  return ctx;
}
