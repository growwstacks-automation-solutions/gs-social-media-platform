import React, { useEffect, useState } from 'react';
import { PLATFORM_LIST, PLATFORM_META } from '../utils/config.js';

const ICONS = {
  instagram: (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
      <path d="M18.244 2H21l-6.51 7.44L22 22h-6.74l-4.7-6.13L4.96 22H2.2l6.97-7.96L2 2h6.91l4.26 5.62L18.244 2zm-1.18 18.4h1.85L7.04 3.5H5.06l12 16.9z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.4 17V10H6v7h2.4zM7.2 9a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM18 17v-3.86c0-2.07-1.12-3.04-2.6-3.04-1.21 0-1.75.66-2.05 1.13V10H11v7h2.35v-3.79c0-.96.18-1.89 1.37-1.89s1.28 1.08 1.28 1.95V17H18z" />
    </svg>
  ),
  fb: (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
      <path d="M22 12a10 10 0 1 0-11.56 9.88V14.9H7.9V12h2.54V9.8c0-2.52 1.5-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.9h-2.33v6.98A10 10 0 0 0 22 12z" />
    </svg>
  )
};

// Original platform brand colors — used ONLY in this picker so each card reflects
// the real platform identity. The rest of the app keeps the teal PLATFORM_META colors.
const BRAND = {
  instagram: { color: '#E1306C', gradient: 'linear-gradient(135deg, #feda75 0%, #fa7e1e 35%, #d62976 65%, #962fbf 100%)' },
  x:         { color: '#000000' },
  linkedin:  { color: '#0A66C2' },
  fb:        { color: '#1877F2' }
};

export default function PlatformPickerModal({ onConfirm, onClose, initial = [] }) {
  const [selected, setSelected] = useState(new Set(initial));

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onEsc);
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = original;
    };
  }, [onClose]);

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const count = selected.size;
  const disabled = count === 0;

  const handleStart = () => {
    if (disabled) return;
    onConfirm?.(PLATFORM_LIST.filter(p => selected.has(p)));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-6 animate-fade-in">
      <div className="absolute inset-0 bg-ink-900/60 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-3xl bg-cream-50 rounded-3xl shadow-lift overflow-hidden animate-scale-in border border-cream-300/60">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 h-9 w-9 rounded-full bg-white/80 hover:bg-white border border-cream-300 flex items-center justify-center text-ink-600 hover:text-brand-700 transition-all z-10"
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
          </svg>
        </button>

        <div className="px-8 pt-10 pb-4 text-center">
          <h2 className="h-display text-3xl lg:text-4xl text-ink-900">Post Creator</h2>
          <p className="text-ink-600 mt-2 text-sm lg:text-base">Pick platforms to start your campaign</p>
        </div>

        <div className="px-6 sm:px-8 pb-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {PLATFORM_LIST.map((pid, i) => {
            const meta = PLATFORM_META[pid];
            const b = BRAND[pid];
            const isIg = pid === 'instagram';
            const active = selected.has(pid);
            return (
              <button
                key={pid}
                onClick={() => toggle(pid)}
                style={{
                  animationDelay: `${80 + i * 60}ms`,
                  '--p': b.color,
                  borderColor: active ? b.color : `${b.color}2b`,
                  background: active ? `${b.color}14` : `${b.color}08`,
                  ...(active ? {
                    boxShadow: `0 0 0 1px ${b.color}30, 0 16px 36px -16px ${b.color}59`
                  } : {})
                }}
                className={[
                  'relative rounded-2xl border-2 px-4 py-6 sm:py-8 transition-all duration-200 ease-snap animate-fade-up',
                  'flex flex-col items-center justify-center gap-3 group',
                  active
                    ? 'scale-[1.02]'
                    : 'hover:-translate-y-0.5 hover:shadow-soft'
                ].join(' ')}
              >
                <span
                  className={[
                    'absolute top-3 right-3 h-5 w-5 rounded-full flex items-center justify-center transition-all',
                    active ? 'text-white shadow-soft' : 'bg-cream-200 text-cream-200 group-hover:bg-cream-300'
                  ].join(' ')}
                  style={active ? { background: isIg ? b.gradient : b.color } : undefined}
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>

                <span
                  className={[
                    'h-14 w-14 rounded-2xl flex items-center justify-center transition-all',
                    active ? 'shadow-soft' : 'opacity-90 group-hover:opacity-100'
                  ].join(' ')}
                  style={isIg
                    ? { background: b.gradient, color: '#fff' }
                    : { background: `${b.color}14`, color: b.color }
                  }
                >
                  {ICONS[pid]}
                </span>
                <span className="text-sm font-semibold text-ink-900" style={active ? { color: b.color } : undefined}>
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-6 sm:px-8 pb-8 pt-2 flex justify-center">
          <button
            onClick={handleStart}
            disabled={disabled}
            className={[
              'btn-primary px-8 py-3.5 text-base inline-flex items-center gap-2',
              disabled ? 'opacity-40 cursor-not-allowed' : ''
            ].join(' ')}
          >
            Start Creating {count > 0 && <span className="bg-white/20 rounded-full px-2 py-0.5 text-xs">{count}</span>}
            {!disabled && (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
