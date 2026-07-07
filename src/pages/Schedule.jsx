import React, { useEffect, useMemo, useState } from 'react';
import StatusBadge from '../components/StatusBadge.jsx';
import { Spinner } from '../components/Loader.jsx';
import { PlatformStack, PlatformPill } from '../components/PlatformChip.jsx';
import {
  PLATFORM_LIST, POST_TYPE_LABELS,
  primaryPublished, primaryScheduledAt, primaryPostedAt,
  primaryCaption, selectedImage, campaignPlatforms
} from '../utils/config.js';
import DeleteConfirmModal from '../components/DeleteConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import { deleteCampaign } from '../services/webhook.js';

function fmtRelative(d) {
  if (!d) return '';
  const dt = new Date(d);
  const now = new Date();
  const diffMs = dt.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function useCountUp(target, duration = 800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export default function Schedule({ data, onNavigate, onNewPost }) {
  const { campaigns, loading, refresh } = data;
  const [limit, setLimit] = useState(12);
  const [activeFilter, setActiveFilter] = useState('All');
  const [platformFilter, setPlatformFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null); // campaign object pending deletion
  const [deleteBusy, setDeleteBusy] = useState(false);
  const toast = useToast();

  const startNew = () => (onNewPost ? onNewPost() : onNavigate('post-creator'));

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteCampaign(
        deleteTarget.post_id,
        deleteTarget.event_name || null,
        Array.isArray(deleteTarget.platforms_selected) ? deleteTarget.platforms_selected : []
      );
      toast.success(`Deleted "${deleteTarget.event_name || 'campaign'}"`);
      await refresh();
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e.message || 'Failed to delete campaign');
    } finally {
      setDeleteBusy(false);
    }
  };

  const counts = useMemo(() => ({
    Scheduled: campaigns.filter(c => primaryPublished(c) === 'scheduled').length,
    Drafts:    campaigns.filter(c => primaryPublished(c) === 'draft').length,
    Posted:    campaigns.filter(c => primaryPublished(c) === 'posted').length,
    All:       campaigns.length
  }), [campaigns]);

  const platformCounts = useMemo(() => {
    const out = {};
    for (const p of PLATFORM_LIST) {
      out[p] = campaigns.filter(c => campaignPlatforms(c).includes(p)).length;
    }
    return out;
  }, [campaigns]);

  const filtered = useMemo(() => {
    let res = [...campaigns];

    if (activeFilter === 'Scheduled') res = res.filter(c => primaryPublished(c) === 'scheduled');
    else if (activeFilter === 'Drafts') res = res.filter(c => primaryPublished(c) === 'draft');
    else if (activeFilter === 'Posted') res = res.filter(c => primaryPublished(c) === 'posted');

    if (platformFilter) res = res.filter(c => campaignPlatforms(c).includes(platformFilter));

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      res = res.filter(c => (c.event_name || '').toLowerCase().includes(q));
    }

    return res.sort((a, b) => {
      const ts = (d) => d ? new Date(d).getTime() : 0;
      if (activeFilter === 'Scheduled') {
        // soonest scheduled date first (ascending)
        return ts(primaryScheduledAt(a)) - ts(primaryScheduledAt(b));
      }
      if (activeFilter === 'Posted') {
        // most recently posted first (descending)
        return ts(primaryPostedAt(b)) - ts(primaryPostedAt(a));
      }
      // All / Drafts — most recently created first (descending)
      return ts(b.created_at) - ts(a.created_at);
    });
  }, [campaigns, activeFilter, platformFilter, searchQuery]);

  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  useEffect(() => { setLimit(12); }, [activeFilter, platformFilter, searchQuery]);

  return (
    <>
      <header className="sticky top-0 z-20 glass border-b border-cream-300/60">
        <div className="px-4 lg:px-10 lg:pr-48 h-16 flex items-center gap-3">
          <span className="text-xs lg:text-sm text-ink-700 inline-flex items-center gap-2">
            Active Pipeline
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-accent-green animate-ping opacity-60" />
              <span className="relative h-2 w-2 rounded-full bg-accent-green" />
            </span>
          </span>
          <div className="flex-1" />
          <button onClick={refresh} className="text-sm text-ink-500 hover:text-brand-700 inline-flex items-center gap-1.5 transition-colors">
            {loading ? <Spinner /> : <RefreshIcon />}
          </button>
        </div>
      </header>

      <main className="px-4 lg:px-10 py-8 max-w-6xl w-full">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 animate-fade-up">
          <div>
            <h1 className="h-display text-3xl lg:text-5xl text-ink-900">
              Content <span className="bg-gradient-to-r from-brand-700 to-brand-500 bg-clip-text text-transparent">Pipeline</span>
            </h1>
            <p className="text-ink-500 mt-2 text-sm lg:text-base">Manage and schedule your cross-platform content</p>
          </div>
          <button onClick={startNew} className="btn-primary inline-flex items-center gap-2">
            <PlusIcon /> Create Post
          </button>
        </div>

        {/* Search bar */}
        <div className="mt-6 relative animate-fade-up">
          <svg viewBox="0 0 24 24" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-500 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search campaigns…"
            className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-cream-300/60 bg-white text-sm text-ink-900 placeholder-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-900"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        {/* Status + Platform filter row */}
        <div className="mt-4 flex flex-wrap items-center gap-3 animate-fade-up">
          {/* Status chip group — horizontal scroll on mobile so all four chips stay reachable */}
          <div className="w-full sm:w-auto overflow-x-auto scrollbar-none -mx-1 sm:mx-0">
            <div className="inline-flex p-1 bg-cream-100 rounded-full border border-cream-300/60 mx-1 sm:mx-0">
              <FilterChip label="All Posts" shortLabel="All"  count={counts.All}       active={activeFilter === 'All'}       onClick={() => setActiveFilter('All')} />
              <FilterChip label="Scheduled"                    count={counts.Scheduled} active={activeFilter === 'Scheduled'} onClick={() => setActiveFilter('Scheduled')} />
              <FilterChip label="Drafts"                       count={counts.Drafts}    active={activeFilter === 'Drafts'}    onClick={() => setActiveFilter('Drafts')} />
              <FilterChip label="Posted"                       count={counts.Posted}    active={activeFilter === 'Posted'}    onClick={() => setActiveFilter('Posted')} />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-ink-500">
            <FilterIcon />
            <span className="font-semibold uppercase tracking-wider">Platform:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PLATFORM_LIST.map(p => (
              <button
                key={p}
                onClick={() => setPlatformFilter(platformFilter === p ? null : p)}
                className={[
                  'h-9 w-9 rounded-full border flex items-center justify-center transition-all',
                  platformFilter === p
                    ? 'shadow-glow scale-110'
                    : platformFilter
                      ? 'opacity-40 hover:opacity-100 bg-white border-cream-300/60'
                      : 'bg-white border-cream-300/60 hover:-translate-y-0.5 hover:shadow-soft'
                ].join(' ')}
                style={platformFilter === p ? { background: '#fff' } : undefined}
                title={p}
              >
                <PlatformBrandGlyph platform={p} size={18} />
              </button>
            ))}
            {platformFilter && (
              <button
                onClick={() => setPlatformFilter(null)}
                className="text-[10px] uppercase tracking-wider text-brand-700 font-bold hover:underline ml-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Cards grid */}
        <div className="mt-8">
          {visible.length === 0 ? (
            <div className="rounded-2xl bg-white border border-dashed border-cream-300 p-16 text-center animate-fade-up">
              <div className="font-semibold text-ink-900">
                {activeFilter === 'All' && !platformFilter ? 'Pipeline empty' : 'No matches found'}
              </div>
              <p className="text-sm text-ink-500 mt-1">
                {activeFilter === 'All' && !platformFilter
                  ? 'Draft and schedule a post to see it here.'
                  : 'Try a different filter combination.'}
              </p>
              {activeFilter === 'All' && !platformFilter ? (
                <button onClick={startNew} className="btn-primary mt-5">Create Post</button>
              ) : (
                <button onClick={() => { setActiveFilter('All'); setPlatformFilter(null); }} className="btn-ghost mt-4">Show All Posts</button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
                {visible.map(c => (
                  <PipelineCard
                    key={c.post_id}
                    campaign={c}
                    onClick={() => onNavigate('post-creator', c.post_id)}
                    onDelete={() => setDeleteTarget(c)}
                  />
                ))}
              </div>

              {limit < filtered.length && (
                <div className="pt-6 flex justify-center">
                  <button
                    onClick={() => setLimit(prev => prev + 12)}
                    className="btn-ghost text-brand-700 font-bold inline-flex items-center gap-2 hover:bg-brand-50"
                  >
                    Load More ({filtered.length - limit} remaining)
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {deleteTarget && (
        <DeleteConfirmModal
          subject={deleteTarget.event_name || '(untitled campaign)'}
          description="This will remove the campaign row from Supabase. The image, captions, scheduled times, and all platform data are erased. This can't be undone."
          confirmLabel="Delete post"
          busy={deleteBusy}
          onConfirm={handleDelete}
          onClose={() => !deleteBusy && setDeleteTarget(null)}
        />
      )}
    </>
  );
}

function FilterChip({ label, shortLabel, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 sm:gap-2 transition-all whitespace-nowrap shrink-0',
        active
          ? 'bg-brand-gradient text-white shadow-soft'
          : 'text-ink-700 hover:text-ink-900'
      ].join(' ')}
    >
      {/* Use a shorter label on mobile when one is provided */}
      {shortLabel ? (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
      <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${active ? 'bg-white/25 text-white' : 'bg-cream-200 text-ink-700'}`}>
        {count}
      </span>
    </button>
  );
}

function PipelineCard({ campaign, onClick, onDelete }) {
  const status = primaryPublished(campaign);
  const img = selectedImage(campaign);
  const platforms = campaignPlatforms(campaign);

  // Only allow deletion when nothing has shipped — published campaigns are protected.
  const canDelete = !platforms.some(p => campaign[`${p}_published_status`] === 'posted');

  const statusTag =
    status === 'posted'    ? { text: 'POSTED',    cls: 'bg-accent-green text-white' } :
    status === 'scheduled' ? { text: 'SCHEDULED', cls: 'bg-brand-gradient text-white' } :
    status === 'failed'    ? { text: 'FAILED',    cls: 'bg-red-600 text-white' } :
                             { text: 'DRAFT',     cls: 'bg-ink-900 text-white' };

  const when = primaryScheduledAt(campaign) || primaryPostedAt(campaign) || campaign.created_at;

  return (
    <article
      onClick={onClick}
      className="group rounded-2xl overflow-hidden border bg-white border-cream-300/60 shadow-soft hover:shadow-lift hover:-translate-y-1 hover:border-brand-200 cursor-pointer transition-all duration-300 ease-snap"
    >
      <div className="relative h-44 bg-cream-200 overflow-hidden">
        {img ? (
          <img src={img} alt="" referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-ink-400 text-xs italic">No image yet</div>
        )}

        <div className="absolute top-3 left-3">
          <PlatformStack platforms={platforms} size="sm" />
        </div>

        <span className={`absolute top-3 right-3 text-[10px] font-bold tracking-wider rounded-md px-2 py-1 shadow-soft ${statusTag.cls}`}>
          {statusTag.text}
        </span>

        {/* Delete — bottom-right of image, fades in on card hover */}
        {canDelete && onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete this campaign"
            className="absolute bottom-3 right-3 h-8 w-8 rounded-full bg-brand-gradient text-white flex items-center justify-center shadow-soft hover:shadow-lift transition-all"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="p-5">
        <h3 className="text-lg font-bold text-ink-900 group-hover:text-brand-700 transition-colors line-clamp-1">
          {campaign.event_name || '(untitled)'}
        </h3>
        <p className="mt-1.5 text-sm text-ink-600 line-clamp-2 italic">
          "{primaryCaption(campaign) || campaign.user_image_prompt || '—'}"
        </p>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <StatusBadge value={POST_TYPE_LABELS[campaign.post_type] || campaign.post_type} />
          {campaign.caption_style && <StatusBadge value={campaign.caption_style} />}
        </div>

        <div className="mt-4 pt-4 border-t border-cream-200 flex items-center justify-between text-xs">
          <div className="text-ink-500 inline-flex items-center gap-1.5">
            <ClockIcon />
            {when ? fmtRelative(when) : '—'}
          </div>
          <span className="text-brand-700 font-bold inline-flex items-center gap-1 group-hover:gap-2 transition-all">
            Edit <span aria-hidden>›</span>
          </span>
        </div>
      </div>
    </article>
  );
}

function PlatformBrandGlyph({ platform, size = 18 }) {
  // Same SVGs as PlatformChip but using brand color fill
  const props = { width: size, height: size };
  switch (platform) {
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <defs>
            <linearGradient id="ig-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#feda75" />
              <stop offset="35%" stopColor="#fa7e1e" />
              <stop offset="65%" stopColor="#d62976" />
              <stop offset="100%" stopColor="#962fbf" />
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="url(#ig-g)" strokeWidth="2" />
          <circle cx="12" cy="12" r="4" fill="none" stroke="url(#ig-g)" strokeWidth="2" />
          <circle cx="17.5" cy="6.5" r="1" fill="#d62976" />
        </svg>
      );
    case 'x':
      return (
        <svg viewBox="0 0 24 24" {...props} fill="#000">
          <path d="M18.244 2H21l-6.51 7.44L22 22h-6.74l-4.7-6.13L4.96 22H2.2l6.97-7.96L2 2h6.91l4.26 5.62L18.244 2z" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" {...props} fill="#0A66C2">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.4 17V10H6v7h2.4zM7.2 9a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM18 17v-3.86c0-2.07-1.12-3.04-2.6-3.04-1.21 0-1.75.66-2.05 1.13V10H11v7h2.35v-3.79c0-.96.18-1.89 1.37-1.89s1.28 1.08 1.28 1.95V17H18z" />
        </svg>
      );
    case 'fb':
      return (
        <svg viewBox="0 0 24 24" {...props} fill="#1877F2">
          <path d="M22 12a10 10 0 1 0-11.56 9.88V14.9H7.9V12h2.54V9.8c0-2.52 1.5-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.9h-2.33v6.98A10 10 0 0 0 22 12z" />
        </svg>
      );
    default: return null;
  }
}

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" />
  </svg>
);
const FilterIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 4h18l-7 9v7l-4-2v-5L3 4z" strokeLinejoin="round" />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
