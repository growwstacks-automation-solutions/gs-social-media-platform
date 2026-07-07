import React, { useEffect, useRef } from 'react';
import { Spinner } from './Loader.jsx';

/**
 * Reusable confirmation dialog for destructive actions (campaign delete).
 * Esc closes; click on the backdrop closes; clicking inside the card does not.
 *
 * Props:
 *   title         — bold question shown at the top
 *   subject       — the item being acted on (rendered emphasized below the title)
 *   description   — extra explanation about consequences
 *   confirmLabel  — main destructive button text (default "Delete")
 *   busy          — show spinner + disable confirm
 *   onConfirm     — called when user confirms
 *   onClose       — called when user cancels / hits Esc / clicks backdrop..
 */
export default function DeleteConfirmModal({
  title = 'Delete this post?',
  subject,
  description = "This action can't be undone.",
  confirmLabel = 'Delete post',
  busy = false,
  onConfirm,
  onClose
}) {
  const cancelRef = useRef(null);

  // Esc to close; focus Cancel for safe default
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.(); };
    document.addEventListener('keydown', onKey);
    cancelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // Lock body scroll while open
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
          className="bg-white rounded-2xl shadow-2xl max-w-sm w-full border border-cream-200 p-6 my-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-red-50 text-brand-700 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="h-display text-lg text-ink-900">{title}</h3>
              {subject && (
                <p className="text-sm text-ink-700 mt-1 font-semibold truncate" title={subject}>"{subject}"</p>
              )}
            </div>
          </div>

          <p className="text-sm text-ink-600">{description}</p>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={() => !busy && onClose?.()}
              disabled={busy}
              className="btn-ghost text-xs px-4 py-2 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => !busy && onConfirm?.()}
              disabled={busy}
              className="bg-brand-700 hover:bg-brand-800 text-white font-bold rounded-lg px-4 py-2 text-xs inline-flex items-center gap-2 transition-all shadow-soft hover:shadow-lift disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? <Spinner /> : null}
              {busy ? 'Deleting…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
