import React from 'react';

const TONE = {
  green:  'bg-green-50  text-accent-green ring-green-200',
  yellow: 'bg-amber-50  text-accent-amber ring-amber-200',
  red:    'bg-brand-50  text-brand-700    ring-brand-200',
  blue:   'bg-blue-50   text-accent-blue  ring-blue-200',
  purple: 'bg-violet-50 text-violet-700   ring-violet-200',
  gray:   'bg-cream-100 text-ink-600      ring-cream-300',
  brand:  'bg-brand-100 text-brand-700    ring-brand-200'
};

const DOT = {
  green:  'bg-accent-green',
  yellow: 'bg-accent-amber',
  red:    'bg-brand-700',
  blue:   'bg-accent-blue',
  purple: 'bg-violet-600',
  gray:   'bg-ink-500',
  brand:  'bg-brand-700'
};

const PULSING = new Set(['yellow', 'blue']);

const MAP = {
  // approval
  Draft: 'yellow', Approved: 'green', Rejected: 'red',
  // published
  Scheduled: 'blue', Posted: 'green', Failed: 'red',
  // legacy
  Pending: 'yellow',
  // post type
  Observance: 'purple', Event: 'brand', Collage: 'blue',
  observance: 'purple', event: 'brand', collage: 'blue',
  // caption style
  Engaging: 'brand', Professional: 'blue', 'Data-Driven': 'purple', Conversational: 'green'
};

export default function StatusBadge({ value, tone, className = '' }) {
  if (!value) return null;
  const t = tone || MAP[value] || 'gray';
  const display = typeof value === 'string' ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-transform hover:scale-105 ${TONE[t]} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[t]} ${PULSING.has(t) ? 'animate-pulse-soft' : ''}`} />
      {display}
    </span>
  );
}
