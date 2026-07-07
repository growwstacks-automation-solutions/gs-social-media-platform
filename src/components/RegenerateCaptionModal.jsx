import React, { useEffect, useRef, useState } from 'react';
import { Spinner } from './Loader.jsx';
import { PLATFORM_META } from '../utils/config.js';

export default function RegenerateCaptionModal({
  platform,
  initialPrompt = '',
  busy = false,
  onConfirm,
  onClose
}) {
  const [draft, setDraft] = useState(initialPrompt || '');
  const textareaRef = useRef(null);
  const meta = PLATFORM_META[platform];

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.(); };
    document.addEventListener('keydown', onKey);
    const ta = textareaRef.current;
    if (ta) { ta.focus(); const len = ta.value.length; ta.setSelectionRange(len, len); }
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/55 backdrop-blur-sm overflow-y-auto animate-fade-in"
      onClick={() => !busy && onClose?.()}
    >
      <div className="min-h-screen flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-cream-200 p-6 my-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="h-display text-lg text-ink-900">
                Regenerate {meta?.label} caption?
              </h3>
              <p className="text-sm text-ink-600 mt-1">
                Edit the Caption Personal Touch before regenerating, or leave it as-is.
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-gradient-to-br from-cream-100 to-cream-50 border border-cream-300/60 p-4">
            <div className="text-[10px] uppercase tracking-[0.16em] text-ink-500 font-bold mb-1">
              Caption Personal Touch (optional)
            </div>
            <div className="text-xs text-ink-500 mb-2">
              Tone, key phrases, hashtags, mentions, calls-to-action.
            </div>
            <textarea
              ref={textareaRef}
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
              placeholder="Tone, key phrases, hashtags, mentions…"
              className="input text-sm"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => !busy && onClose?.()}
              disabled={busy}
              className="btn-ghost text-xs px-4 py-2 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => !busy && onConfirm?.(draft)}
              disabled={busy}
              className="bg-brand-gradient text-white font-bold rounded-lg px-4 py-2 text-xs inline-flex items-center gap-2 shadow-soft hover:shadow-lift transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? <Spinner /> : (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {busy ? 'Regenerating…' : 'Regenerate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
