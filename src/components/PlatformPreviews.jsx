import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PLATFORM_META } from '../utils/config.js';

const DEFAULT_HANDLE = '@growwstacks';
const DEFAULT_NAME   = 'GrowwStacks';
const DEFAULT_FULLNAME = 'GrowwStacks';
const AVATAR_URL     = '/logo.png';

export function PreviewSwitcher({ platform, caption, images = [], eventName }) {
  const props = { caption, images, eventName };
  switch (platform) {
    case 'instagram': return <InstagramPreview {...props} />;
    case 'x':         return <XPreview {...props} />;
    case 'linkedin':  return <LinkedInPreview {...props} />;
    case 'fb':        return <FacebookPreview {...props} />;
    default:          return <InstagramPreview {...props} />;
  }
}

function Carousel({ images, alt = '', aspect = 'aspect-square', fit = 'cover' }) {
  const [idx, setIdx] = useState(0);
  // Captured from <img onLoad> — used when fit="contain" so the container hugs the image
  // (no black letterbox bars), while keeping the rendered preview tightly sized.
  const [naturalAspect, setNaturalAspect] = useState(null);
  const safe = images.filter(Boolean);
  const image = safe[idx] || null;

  // Reset measured aspect when the displayed image changes so it doesn't carry over.
  useEffect(() => { setNaturalAspect(null); }, [image]);

  if (!image) {
    return (
      <div className={`${aspect} w-full bg-cream-100 flex items-center justify-center text-ink-500 text-xs italic`}>
        Preview will appear here
      </div>
    );
  }

  const objectClass = fit === 'contain' ? 'object-contain' : 'object-cover';
  const useNaturalAspect = fit === 'contain' && naturalAspect != null;
  const containerClass = useNaturalAspect ? '' : aspect;
  const containerStyle = useNaturalAspect ? { aspectRatio: String(naturalAspect) } : {};

  const handleLoad = (e) => {
    const w = e.currentTarget.naturalWidth;
    const h = e.currentTarget.naturalHeight;
    if (w && h) setNaturalAspect(w / h);
  };

  return (
    <div className={`${containerClass} w-full relative bg-black overflow-hidden group`} style={containerStyle}>
      <img
        key={image}
        src={image}
        alt={alt}
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        className={`absolute inset-0 w-full h-full ${objectClass} animate-fade-in`}
      />
      {safe.length > 1 && (
        <>
          <button
            onClick={() => setIdx(p => (p > 0 ? p - 1 : safe.length - 1))}
            className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            onClick={() => setIdx(p => (p < safe.length - 1 ? p + 1 : 0))}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/55 rounded text-[10px] text-white font-medium">
            {idx + 1}/{safe.length}
          </div>
        </>
      )}
    </div>
  );
}

// Clamps caption text to `lines` lines. If overflow is detected, renders a "...more" button
// that toggles to the full text. Placeholder shown italic in muted color when caption is empty.
function ClampedCaption({ caption, lines = 3, placeholder = 'Post text will appear here…', className = '', prefix = null }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef(null);

  useLayoutEffect(() => {
    setExpanded(false);
  }, [caption]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight - el.clientHeight > 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [caption, expanded, lines]);

  const clampStyle = expanded
    ? {}
    : {
        display: '-webkit-box',
        WebkitLineClamp: lines,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden'
      };

  return (
    <div className={className}>
      <div
        ref={ref}
        style={clampStyle}
        className="text-sm text-ink-900 whitespace-pre-wrap"
      >
        {prefix && <span className="font-bold mr-1">{prefix}</span>}
        {caption || <span className="text-ink-400 italic">{placeholder}</span>}
      </div>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="mt-1 text-xs font-semibold text-ink-500 hover:text-ink-900"
        >
          {expanded ? '…less' : '…more'}
        </button>
      )}
    </div>
  );
}

export function InstagramPreview({ caption, images = [], eventName }) {
  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-cream-300/60 shadow-soft">
      <div className="px-3 py-2.5 flex items-center gap-2 border-b border-black/5">
        <div className="h-8 w-8 rounded-full p-[2px]" style={{ background: 'conic-gradient(from 0deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5, #feda75)' }}>
          <div className="h-full w-full rounded-full bg-white p-[2px]">
            <img src={AVATAR_URL} alt="" className="h-full w-full rounded-full object-cover" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-ink-900 truncate">{DEFAULT_HANDLE}</div>
        </div>
        <button className="text-ink-500"><DotsHIcon /></button>
      </div>

      <Carousel images={images} alt={eventName} aspect="aspect-square" />

      <div className="px-3 py-2 flex items-center gap-3 text-ink-900">
        <HeartIcon /><CommentIcon /><SendIcon />
        <div className="flex-1" />
        <BookmarkIcon />
      </div>

      <div className="px-3 pb-3">
        <ClampedCaption
          caption={caption}
          lines={4}
          prefix={DEFAULT_HANDLE}
          placeholder="Caption will appear here…"
          className="text-xs"
        />
        <div className="text-[10px] text-ink-500 uppercase mt-1 tracking-wider">16 hours ago</div>
      </div>

      <PreviewFooter platform="instagram" />
    </div>
  );
}

export function XPreview({ caption, images = [], eventName }) {
  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-cream-300/60 shadow-soft">
      <div className="p-3 flex gap-2.5">
        <img src={AVATAR_URL} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-bold text-ink-900 truncate">{DEFAULT_NAME}</span>
            <span className="text-ink-500 text-xs shrink-0">{DEFAULT_HANDLE} · 4d</span>
            <div className="flex-1" />
            <button className="text-ink-500"><DotsHIcon /></button>
          </div>
          <ClampedCaption
            caption={caption}
            lines={3}
            placeholder="Tweet text will appear here…"
            className="mt-1"
          />
          {images.length > 0 && (
            <div className="mt-2 rounded-2xl overflow-hidden border border-cream-300">
              <Carousel images={images} alt={eventName} aspect="aspect-square" />
            </div>
          )}
          <div className="mt-3 flex items-center justify-between text-ink-500 text-xs max-w-md">
            <IconStat icon={<CommentIcon />} value="" />
            <IconStat icon={<RepeatIcon />} value="" />
            <IconStat icon={<HeartIcon />} value="" />
            <IconStat icon={<BarsIcon />} value="" />
            <IconStat icon={<ShareIcon />} value="" />
          </div>
        </div>
      </div>
      <PreviewFooter platform="x" />
    </div>
  );
}

export function LinkedInPreview({ caption, images = [], eventName }) {
  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-cream-300/60 shadow-soft">
      <div className="p-3 flex items-start gap-2">
        <img src={AVATAR_URL} alt="" className="h-11 w-11 rounded-full object-cover shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-ink-900 truncate">{DEFAULT_FULLNAME}</div>
          <div className="text-[11px] text-ink-500">26,817 followers</div>
          <div className="text-[11px] text-ink-500">5d · 🌐</div>
        </div>
        <button className="text-ink-500"><DotsHIcon /></button>
      </div>

      <ClampedCaption
        caption={caption}
        lines={3}
        className="px-3 pb-2"
      />

      {images.length > 0 && <Carousel images={images} alt={eventName} aspect="aspect-square" fit="contain" />}

      <div className="px-1 py-1 flex items-center justify-around text-ink-500 text-xs border-t border-black/5">
        <ActionBtn label="Like" icon={<ThumbIcon />} />
        <ActionBtn label="Comment" icon={<CommentIcon />} />
        <ActionBtn label="Repost" icon={<RepeatIcon />} />
        <ActionBtn label="Send" icon={<SendIcon />} />
      </div>
      <PreviewFooter platform="linkedin" />
    </div>
  );
}

export function FacebookPreview({ caption, images = [], eventName }) {
  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-cream-300/60 shadow-soft">
      <div className="p-3 flex items-center gap-2">
        <img src={AVATAR_URL} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-ink-900 truncate">{DEFAULT_NAME}</div>
          <div className="text-[11px] text-ink-500">16h · 🌐</div>
        </div>
        <button className="text-ink-500"><DotsHIcon /></button>
      </div>

      <ClampedCaption
        caption={caption}
        lines={3}
        className="px-3 pb-2"
      />

      {images.length > 0 && <Carousel images={images} alt={eventName} aspect="aspect-square" fit="contain" />}

      <div className="px-1 py-1 flex items-center justify-around text-ink-500 text-xs border-t border-black/5">
        <ActionBtn label="Like" icon={<ThumbIcon />} />
        <ActionBtn label="Comment" icon={<CommentIcon />} />
        <ActionBtn label="Share" icon={<ShareIcon />} />
      </div>
      <PreviewFooter platform="fb" />
    </div>
  );
}

function PreviewFooter({ platform }) {
  const meta = PLATFORM_META[platform];
  return (
    <div className="px-4 py-2 flex items-center justify-between text-[10px] text-ink-500 border-t border-cream-200">
      <span className="uppercase tracking-wider font-semibold">Preview · {meta?.label}</span>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta?.color }} />
    </div>
  );
}

function ActionBtn({ icon, label }) {
  return (
    <button className="flex items-center gap-1.5 px-2 py-2 rounded hover:bg-black/5 transition-colors font-medium">
      {icon}{label}
    </button>
  );
}
function IconStat({ icon, value }) {
  return (
    <button className="flex items-center gap-1 hover:text-accent-blue transition-colors">
      {icon}{value && <span>{value}</span>}
    </button>
  );
}

const HeartIcon = () => (<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" strokeLinejoin="round" /></svg>);
const CommentIcon = () => (<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" strokeLinejoin="round" /></svg>);
const SendIcon = () => (<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinejoin="round" /></svg>);
const BookmarkIcon = () => (<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" strokeLinejoin="round" /></svg>);
const DotsHIcon = () => (<svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>);
const RepeatIcon = () => (<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" strokeLinejoin="round" /></svg>);
const BarsIcon = () => (<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h4M9 8h4M15 4h4M3 16h4M9 16h4M15 16h4M3 20h18" strokeLinecap="round" /></svg>);
const ShareIcon = () => (<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" strokeLinejoin="round" /></svg>);
const ThumbIcon = () => (<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9A2 2 0 0 0 19.66 9zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" strokeLinejoin="round" /></svg>);
