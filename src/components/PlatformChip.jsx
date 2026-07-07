import React from 'react';
import { PLATFORM_META } from '../utils/config.js';

export function PlatformGlyph({ platform, className = 'h-4 w-4' }) {
  switch (platform) {
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
        </svg>
      );
    case 'x':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M18.244 2H21l-6.51 7.44L22 22h-6.74l-4.7-6.13L4.96 22H2.2l6.97-7.96L2 2h6.91l4.26 5.62L18.244 2z" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.4 17V10H6v7h2.4zM7.2 9a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM18 17v-3.86c0-2.07-1.12-3.04-2.6-3.04-1.21 0-1.75.66-2.05 1.13V10H11v7h2.35v-3.79c0-.96.18-1.89 1.37-1.89s1.28 1.08 1.28 1.95V17H18z" />
        </svg>
      );
    case 'fb':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M22 12a10 10 0 1 0-11.56 9.88V14.9H7.9V12h2.54V9.8c0-2.52 1.5-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.9h-2.33v6.98A10 10 0 0 0 22 12z" />
        </svg>
      );
    default:
      return null;
  }
}

// Circular icon chip — for chip stacks on cards
export function PlatformIconChip({ platform, size = 'sm', ring = true, className = '' }) {
  const meta = PLATFORM_META[platform];
  if (!meta) return null;
  const dims = size === 'lg' ? 'h-8 w-8' : size === 'md' ? 'h-7 w-7' : 'h-6 w-6';
  const icon = size === 'lg' ? 'h-4 w-4' : size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3';
  return (
    <span
      className={`${dims} rounded-full flex items-center justify-center ${ring ? 'ring-2 ring-white shadow-soft' : ''} ${className}`}
      style={{ background: '#fff', color: meta.color }}
      title={meta.label}
    >
      <PlatformGlyph platform={platform} className={icon} />
    </span>
  );
}

// Pill chip with icon + label — for filter rows / inline tags
export function PlatformPill({ platform, active, onClick, count, className = '' }) {
  const meta = PLATFORM_META[platform];
  if (!meta) return null;
  return (
    <button
      onClick={onClick}
      style={active ? { background: meta.color, color: '#fff', borderColor: meta.color } : { color: meta.color }}
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
        active ? 'shadow-soft' : 'bg-white border-cream-300/60 hover:border-current',
        className
      ].join(' ')}
      title={meta.label}
    >
      <PlatformGlyph platform={platform} className="h-3.5 w-3.5" />
      <span className={active ? 'text-white' : 'text-ink-900'}>{meta.label}</span>
      {typeof count === 'number' && (
        <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${active ? 'bg-white/25 text-white' : 'bg-cream-100 text-ink-700'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// Stack of overlapping icon chips
export function PlatformStack({ platforms = [], size = 'sm', max = 4 }) {
  const list = platforms.slice(0, max);
  return (
    <div className="flex -space-x-2">
      {list.map(p => (
        <PlatformIconChip key={p} platform={p} size={size} />
      ))}
      {platforms.length > max && (
        <span className="h-6 w-6 rounded-full bg-ink-700 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white shadow-soft">
          +{platforms.length - max}
        </span>
      )}
    </div>
  );
}
