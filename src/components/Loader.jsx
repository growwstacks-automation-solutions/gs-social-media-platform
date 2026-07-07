import React from 'react';

export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3"/>
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

export function SkeletonRow() {
  return (
    <div className="grid grid-cols-6 gap-4 px-4 py-3 border-b border-white/5 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-white/5" />
      ))}
    </div>
  );
}
