import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Spinner } from './Loader.jsx';

/**
 * Image area for the PostCreator. Renders one of three modes based on postType:
 *   observance → single AI-generated image with regenerate CTA
 *   event      → user-supplied gallery (1–5 source images)
 *   collage    → small AI variant strip (click to select)
 */
export default function ImageWorkbench({
  campaign, postType, readOnly = true, variantIdx = 0, onSelectVariant,
  onRegenerateImage, onRegenerateVariants, busy, locked = false,
  regenUntilMs = 0, nowMs = 0, regenCount = 0, regenMax = 10
}) {
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const imageStatus = campaign?.image_status || 'idle';
  const sources  = campaign?.source_image_urls || [];
  const variants = campaign?.generated_image_variants || [];

  const handlePick = (i) => onSelectVariant?.(i);

  if (postType === 'event') {
    return (
      <Wrapper title="Source Images" subtitle="1–5 images you've supplied">
        {sources.length === 0
          ? <EmptyTile label="Upload images" hint="Drop 1–5 photos to include in this post." />
          : <Carousel images={sources} />
        }
        <UploadBar disabled hint="Upload / add link actions wire up in Phase 5" />
      </Wrapper>
    );
  }

  if (postType === 'collage') {
    // Hide entirely if nothing to show
    if (imageStatus !== 'generating' && imageStatus !== 'failed' && variants.length === 0) {
      return null;
    }
    return (
      <Wrapper title="Collage Variants" subtitle="AI generated 3 options · pick one">
        {imageStatus === 'generating' && <GeneratingTile label="Generating collage variants…" small />}
        {imageStatus === 'failed' && <FailedTile small />}
        {variants.length > 0 && (
          <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
            {variants.slice(0, 6).map((src, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
                <VariantTile
                  src={src}
                  index={i}
                  selected={i === variantIdx}
                  onClick={() => handlePick(i)}
                />
                <button
                  type="button"
                  onClick={() => setLightboxSrc(src)}
                  className="text-[11px] font-medium text-ink-500 hover:text-brand-700 border border-cream-300 hover:border-brand-300 rounded-md px-2.5 py-0.5 transition-colors"
                >
                  Preview
                </button>
              </div>
            ))}
          </div>
        )}
        {variants.length > 0 && onRegenerateVariants && (
          <div className="flex items-center justify-end pt-2">
            <button
              onClick={onRegenerateVariants}
              disabled={busy === 'variants' || locked}
              title={locked ? 'Image is locked — at least one platform has already been published.' : undefined}
              className="btn-ghost inline-flex items-center gap-2 text-xs px-3 py-1.5 border-brand-200 text-brand-700 hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:border-cream-300 disabled:text-ink-500 disabled:hover:bg-transparent"
            >
              {busy === 'variants' ? <Spinner /> : (locked ? <LockIcon /> : <RegenIcon />)}
              {locked ? 'Image locked (already posted)' : 'Regenerate Variants'}
            </button>
          </div>
        )}
        {lightboxSrc && (
          <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
        )}
      </Wrapper>
    );
  }

  // observance (default) — hide entirely if nothing to show
  if (imageStatus !== 'generating' && imageStatus !== 'failed' && variants.length === 0) {
    return null;
  }
  const regenActive = regenUntilMs > nowMs;
  const regenRemaining = regenActive ? Math.max(1, Math.ceil((regenUntilMs - nowMs) / 1000)) : 0;
  const atRegenLimit = regenCount >= regenMax;
  return (
    <Wrapper
      title="AI Variants"
      subtitle="AI generated options · pick one"
      headerRight={
        <div className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full tabular-nums ${atRegenLimit ? 'bg-red-100 text-red-600' : 'bg-cream-200 text-ink-600'}`}>
          {regenCount}/{regenMax}
        </div>
      }
    >
      {imageStatus === 'generating' && <GeneratingTile label="Crafting your visual…" small />}
      {imageStatus === 'failed' && <FailedTile small />}
      {variants.length > 0 && (
        <div className="relative">
          {regenActive && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/30 backdrop-blur-md rounded-xl">
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-white/90 ring-1 ring-cream-300/70 shadow-soft">
                <span className="h-6 w-6 rounded-full bg-brand-gradient text-white flex items-center justify-center shadow-glow">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin-slow" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="text-sm font-semibold text-ink-900 tabular-nums">
                  Your image will be updated in {regenRemaining}s
                </span>
              </div>
            </div>
          )}
          <div className={regenActive ? 'pointer-events-none select-none' : undefined}>
            <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
              {variants.slice(0, 6).map((src, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
                  <VariantTile
                    src={src}
                    index={i}
                    selected={i === variantIdx}
                    onClick={() => handlePick(i)}
                  />
                  <button
                    type="button"
                    onClick={() => setLightboxSrc(src)}
                    className="text-[11px] font-medium text-ink-500 hover:text-brand-700 border border-cream-300 hover:border-brand-300 rounded-md px-2.5 py-0.5 transition-colors"
                  >
                    Preview
                  </button>
                </div>
              ))}
            </div>
            {onRegenerateImage && (
              <div className="flex items-center justify-end pt-2">
                <button
                  onClick={onRegenerateImage}
                  disabled={busy === 'image' || locked || atRegenLimit}
                  title={locked ? 'Image is locked — at least one platform has already been published.' : atRegenLimit ? 'Regeneration limit reached (10/10)' : undefined}
                  className="btn-ghost inline-flex items-center gap-2 text-xs px-3 py-1.5 border-brand-200 text-brand-700 hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:border-cream-300 disabled:text-ink-500 disabled:hover:bg-transparent"
                >
                  {busy === 'image' ? <Spinner /> : (locked || atRegenLimit ? <LockIcon /> : <RegenIcon />)}
                  {locked ? 'Image locked (already posted)' : atRegenLimit ? 'Limit reached (10/10)' : 'Regenerate Image'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {lightboxSrc && (
        <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </Wrapper>
  );
}

function Lightbox({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white text-ink-700 shadow-lg flex items-center justify-center hover:bg-cream-100 transition-colors"
          style={{ zIndex: 10000 }}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
          </svg>
        </button>
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className="max-h-[88vh] max-w-[88vw] rounded-xl shadow-2xl object-contain"
        />
      </div>
    </div>,
    document.body
  );
}

function Wrapper({ title, subtitle, children, headerRight }) {
  return (
    <section className="card p-6 bg-gradient-to-br from-brand-50/40 to-cream-50">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-500 font-bold">{title}</div>
          {subtitle && <div className="text-xs text-ink-500 mt-1">{subtitle}</div>}
        </div>
        {headerRight}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Label({ children }) {
  return <div className="text-[10px] uppercase tracking-[0.16em] text-ink-500 font-bold">{children}</div>;
}

function VariantTile({ src, index, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        'relative h-32 w-32 shrink-0 rounded-lg overflow-hidden transition-all duration-200 group',
        selected
          ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-cream-50 shadow-glow'
          : 'ring-1 ring-cream-300/60 hover:ring-brand-300 hover:-translate-y-0.5 hover:shadow-soft'
      ].join(' ')}
    >
      <img src={src} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
      <span className="absolute top-1.5 left-1.5 h-5 w-5 rounded-full bg-black/55 backdrop-blur text-white text-[9px] font-bold flex items-center justify-center">
        {index + 1}
      </span>
      {selected && (
        <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-brand-gradient text-white flex items-center justify-center shadow-soft">
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
      <span className={[
        'absolute inset-x-0 bottom-0 px-1.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-all text-center',
        selected ? 'bg-brand-gradient text-white' : 'bg-black/40 text-white opacity-0 group-hover:opacity-100'
      ].join(' ')}>
        {selected ? 'Selected' : 'Tap'}
      </span>
    </button>
  );
}

function Carousel({ images }) {
  const [idx, setIdx] = useState(0);
  const safe = images.filter(Boolean);
  if (safe.length === 0) return <EmptyTile label="No images" hint="Add images to see them here." />;

  return (
    <div className="space-y-3">
      <div className="relative aspect-square rounded-xl overflow-hidden border border-cream-300/60 bg-black">
        <img key={safe[idx]} src={safe[idx]} alt="" referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover animate-fade-in" />
        {safe.length > 1 && (
          <>
            <button onClick={() => setIdx(p => (p > 0 ? p - 1 : safe.length - 1))}
              className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button onClick={() => setIdx(p => (p < safe.length - 1 ? p + 1 : 0))}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 rounded text-[10px] text-white font-bold tabular-nums">
              {idx + 1} / {safe.length}
            </div>
          </>
        )}
      </div>
      {safe.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {safe.map((src, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={`h-14 w-14 rounded-md overflow-hidden shrink-0 transition-all ${i === idx ? 'ring-2 ring-brand-500' : 'ring-1 ring-cream-300/60 opacity-70 hover:opacity-100'}`}>
              <img src={src} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UploadBar({ disabled, hint }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <div className="text-xs text-ink-500">{hint}</div>
      <div className="flex items-center gap-2">
        <button disabled={disabled}
          className="btn-ghost inline-flex items-center gap-2 text-xs opacity-50 cursor-not-allowed">
          <UploadIcon /> Upload
        </button>
        <button disabled={disabled}
          className="btn-ghost inline-flex items-center gap-2 text-xs opacity-50 cursor-not-allowed">
          <LinkIcon /> Add link
        </button>
      </div>
    </div>
  );
}

function EmptyTile({ label, hint }) {
  return (
    <div className="aspect-square rounded-xl border border-dashed border-cream-300/80 bg-white/60 flex flex-col items-center justify-center text-center p-6 gap-2">
      <div className="h-10 w-10 rounded-full bg-cream-100 text-ink-500 flex items-center justify-center">
        <ImageIcon />
      </div>
      <div className="text-sm font-bold text-ink-700">{label}</div>
      <div className="text-xs text-ink-500 max-w-[24ch]">{hint}</div>
    </div>
  );
}

function GeneratingTile({ label = 'Generating…', small = false }) {
  const wrap = small
    ? 'relative h-32 rounded-xl overflow-hidden border border-cream-300/60 bg-gradient-to-br from-cream-100 to-brand-50 flex items-center gap-3 px-4'
    : 'relative aspect-square rounded-xl overflow-hidden border border-cream-300/60 bg-gradient-to-br from-cream-100 to-brand-50 flex flex-col items-center justify-center gap-3';
  return (
    <div className={wrap}>
      <div className="absolute inset-0 shimmer opacity-60" />
      <div className={`relative flex ${small ? 'flex-row' : 'flex-col'} items-center gap-3 animate-fade-in`}>
        <div className={`${small ? 'h-9 w-9' : 'h-14 w-14'} rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center animate-breathe shadow-glow shrink-0`}>
          <svg viewBox="0 0 24 24" className={`${small ? 'h-4 w-4' : 'h-6 w-6'} animate-spin-slow`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" strokeLinejoin="round" />
          </svg>
        </div>
        <div className={small ? 'text-left' : 'flex flex-col items-center gap-1'}>
          <div className={`font-bold text-ink-900 ${small ? 'text-sm' : ''}`}>{label}</div>
          <div className="text-xs text-ink-500">Workflow is running</div>
        </div>
      </div>
    </div>
  );
}

function FailedTile({ small = false }) {
  const wrap = small
    ? 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3'
    : 'aspect-square rounded-xl border border-red-200 bg-red-50 flex flex-col items-center justify-center gap-3 p-6 text-center';
  return (
    <div className={wrap}>
      <div className={`${small ? 'h-9 w-9' : 'h-12 w-12'} rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0`}>
        <svg viewBox="0 0 24 24" className={small ? 'h-4 w-4' : 'h-6 w-6'} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h0" strokeLinecap="round" />
        </svg>
      </div>
      <div className={small ? 'text-left' : 'flex flex-col items-center gap-1'}>
        <div className={`font-bold text-red-700 ${small ? 'text-sm' : ''}`}>Generation failed</div>
        <div className="text-xs text-red-600 max-w-[28ch]">Something went wrong with the workflow.</div>
      </div>
    </div>
  );
}

const ImageIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="M21 15l-5-5L5 21" strokeLinejoin="round" />
  </svg>
);
const RegenIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const UploadIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const LinkIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
  </svg>
);
