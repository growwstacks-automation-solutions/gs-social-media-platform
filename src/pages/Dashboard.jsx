import React, { useEffect, useMemo, useState } from 'react';
import {
  PLATFORM_LIST, PLATFORM_META,
  primaryPublished, primaryApproval, primaryCaption,
  primaryPostedAt, selectedImage, campaignPlatforms
} from '../utils/config.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { PlatformGlyph } from '../components/PlatformChip.jsx';
import { Spinner } from '../components/Loader.jsx';
import DeleteConfirmModal from '../components/DeleteConfirmModal.jsx';
import { useToast } from '../components/Toast.jsx';
import { deleteCampaign } from '../services/webhook.js';

function fmtRelative(d) {
  if (!d) return '';
  const dt = new Date(d);
  const now = new Date();
  const diffDays = Math.round((dt.getTime() - now.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function fmtDayChip(d) {
  if (!d) return { day: '—', mon: '' };
  const dt = new Date(d);
  return {
    day: String(dt.getDate()).padStart(2, '0'),
    mon: dt.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()
  };
}

function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// Δ% comparing items created in the last 7 days vs the prior 7 days
function deltaPct(items, dateField = 'created_at') {
  const now = Date.now();
  const day = 86400000;
  const last7  = items.filter(x => x[dateField] && (now - new Date(x[dateField]).getTime() <= 7 * day)).length;
  const prev7  = items.filter(x => {
    if (!x[dateField]) return false;
    const t = new Date(x[dateField]).getTime();
    return t < now - 7 * day && t >= now - 14 * day;
  }).length;
  if (prev7 === 0) return last7 > 0 ? 100 : 0;
  return Math.round(((last7 - prev7) / prev7) * 100);
}

export default function Dashboard({ data, onNavigate, onNewPost }) {
  const { campaigns, loading, error, refresh } = data;
  const startNew = () => (onNewPost ? onNewPost() : onNavigate('post-creator'));
  const toast = useToast();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy]     = useState(false);

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
    total:     campaigns.length,
    drafts:    campaigns.filter(c => primaryPublished(c) === 'draft').length,
    scheduled: campaigns.filter(c => primaryPublished(c) === 'scheduled').length,
    posted:    campaigns.filter(c => primaryPublished(c) === 'posted').length
  }), [campaigns]);

  const deltas = useMemo(() => ({
    total: deltaPct(campaigns),
    drafts: deltaPct(campaigns.filter(c => primaryPublished(c) === 'draft')),
    scheduled: deltaPct(campaigns.filter(c => primaryPublished(c) === 'scheduled')),
    posted: deltaPct(campaigns.filter(c => primaryPublished(c) === 'posted'))
  }), [campaigns]);

  const upcoming = useMemo(() => {
    return campaigns
      .filter(c => primaryPublished(c) !== 'posted')
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 5);
  }, [campaigns]);

  // Counts campaigns where each platform has actually shipped (published_status === 'posted').
  // Falls back to "platforms_selected" counts only if no posts have shipped yet, so the chart
  // still shows reach intent on a fresh account.
  const platformDist = useMemo(() => {
    const postedCounts = PLATFORM_LIST.map(p => ({
      id: p,
      meta: PLATFORM_META[p],
      count: campaigns.filter(c => c[`${p}_published_status`] === 'posted').length
    }));
    const anyPosted = postedCounts.some(p => p.count > 0);
    const source = anyPosted
      ? postedCounts
      : PLATFORM_LIST.map(p => ({
          id: p,
          meta: PLATFORM_META[p],
          count: campaigns.filter(c => campaignPlatforms(c).includes(p)).length
        }));
    return { rows: source.sort((a, b) => b.count - a.count), mode: anyPosted ? 'posted' : 'selected' };
  }, [campaigns]);

  const platformMax = Math.max(1, ...platformDist.rows.map(p => p.count));

  return (
    <>
      <TopBar onNewPost={startNew} />

      <main className="px-4 lg:px-10 py-8 max-w-6xl w-full">
        {error && (
          <div className="mb-6 rounded-xl border border-accent-red/30 bg-brand-50 px-4 py-3 text-sm text-brand-800 animate-fade-up">
            {error}
          </div>
        )}

        <header className="animate-fade-up flex items-center justify-between gap-6 flex-wrap">
          <div>
            <h1 className="h-display text-3xl lg:text-4xl text-ink-900">Dashboard</h1>
            <p className="text-ink-600 mt-1 text-sm">Your content engine across Instagram, X, LinkedIn and Facebook.</p>
          </div>
          <div className="flex items-center gap-2">
            {PLATFORM_LIST.map(p => (
              <span key={p} className="h-7 w-7 rounded-lg bg-white border border-cream-300/60 flex items-center justify-center" style={{ color: PLATFORM_META[p].color }} title={PLATFORM_META[p].label}>
                <PlatformGlyph platform={p} className="h-4 w-4" />
              </span>
            ))}
          </div>
        </header>

        {/* KPI tiles */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mt-8 stagger">
          <KpiTile label="Total Posts" value={counts.total}     delta={deltas.total}     icon={<GridIcon />} />
          <KpiTile label="Drafts"      value={counts.drafts}    delta={deltas.drafts}    icon={<DraftIcon />} />
          <KpiTile label="Scheduled"   value={counts.scheduled} delta={deltas.scheduled} icon={<ClockIcon />} />
          <KpiTile label="Published"   value={counts.posted}    delta={deltas.posted}    icon={<CheckIcon />} />
        </section>

        {/* Upcoming + Platform Distribution */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-8 stagger">
          {/* Upcoming */}
          <div className="lg:col-span-2 card card-hover p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="h-display text-2xl text-ink-900">Upcoming Posts</h2>
              <button onClick={() => onNavigate('schedule')}
                className="text-sm text-brand-700 font-medium inline-flex items-center gap-1 hover:gap-2 transition-all duration-200">
                View pipeline <span aria-hidden>→</span>
              </button>
            </div>
            <p className="text-xs text-ink-500 mb-5">Review and manage your next scheduled posts</p>

            {loading && !campaigns.length ? (
              <Skeleton rows={4} />
            ) : upcoming.length === 0 ? (
              <Empty
                title="Nothing on deck"
                hint="Draft a new post to start filling your pipeline."
                action={<button onClick={startNew} className="btn-primary mt-4">Create Post</button>}
              />
            ) : (
              <ul className="space-y-3">
                {upcoming.map((c, i) => {
                  const chip = fmtDayChip(c.event_date || c.created_at);
                  const status = primaryPublished(c);
                  // Upcoming list only contains non-posted campaigns by construction,
                  // so canDelete is effectively true here — but we still guard defensively.
                  const canDelete = !campaignPlatforms(c).some(p => c[`${p}_published_status`] === 'posted');
                  return (
                    <li key={c.post_id}
                      onClick={() => onNavigate('post-creator', c.post_id)}
                      style={{ animationDelay: `${80 + i * 50}ms` }}
                      className="py-3 flex items-center gap-4 animate-fade-up group cursor-pointer rounded-xl px-3 -mx-3 hover:bg-cream-50 transition">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-brand-100 to-brand-50 text-brand-700 flex flex-col items-center justify-center ring-1 ring-brand-100 shrink-0">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-brand-600">{chip.mon}</span>
                        <span className="text-base font-bold leading-none">{chip.day}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        {/* Title + platforms — stack vertically on mobile so the title doesn't
                            compete with platform chips for horizontal space; inline on sm+ */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-1 sm:gap-2">
                          <div className="font-bold text-ink-900 group-hover:text-brand-700 transition-colors truncate">
                            {c.event_name || '(untitled)'}
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            {campaignPlatforms(c).map(p => (
                              <span key={p}
                                className="text-[9px] font-bold uppercase tracking-wider rounded inline-flex items-center justify-center px-1.5 py-0.5"
                                style={{ background: `${PLATFORM_META[p]?.color}18`, color: PLATFORM_META[p]?.color }}
                                title={PLATFORM_META[p]?.label}
                              >
                                {/* Logo only on mobile (saves horizontal space); full label on sm+ */}
                                <PlatformGlyph platform={p} className="h-3 w-3 sm:hidden" />
                                <span className="hidden sm:inline">{PLATFORM_META[p]?.label}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-xs text-ink-500 mt-0.5 truncate">
                          {primaryCaption(c)?.slice(0, 100) || c.user_image_prompt || '—'}
                        </div>
                      </div>
                      <StatusBadge value={cap(status)} />
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                          title="Delete this campaign"
                          className="h-8 w-8 rounded-lg text-ink-500 hover:text-brand-700 hover:bg-red-50 flex items-center justify-center transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Platform Distribution */}
          <div className="card p-6">
            <h2 className="h-display text-xl text-ink-900">Platform Distribution</h2>
            <p className="text-xs text-ink-500 mt-1 mb-5">
              {platformDist.mode === 'posted' ? 'Posts published per platform' : 'Campaigns per platform (no posts published yet)'}
            </p>
            <ul className="space-y-4">
              {platformDist.rows.map(({ id, meta, count }) => {
                const pct = (count / platformMax) * 100;
                return (
                  <li key={id} className="animate-fade-up">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 text-sm text-ink-900">
                        <span style={{ color: meta.color }}><PlatformGlyph platform={id} className="h-4 w-4" /></span>
                        <span className="font-medium">{meta.label}</span>
                      </div>
                      <span className="text-sm font-bold text-ink-900 tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-cream-100 overflow-hidden">
                      <div className="h-full rounded-full transition-[width] duration-700 ease-snap"
                        style={{ width: `${pct}%`, background: meta.color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Recently Published */}
        <section className="mt-8 card p-6 animate-fade-up">
          <div className="flex items-center justify-between mb-5">
            <h2 className="h-display text-2xl text-ink-900">Recently Published</h2>
          </div>
          {(() => {
            const recent = [...campaigns]
              .filter(c => primaryPublished(c) === 'posted')
              .sort((a, b) => new Date(primaryPostedAt(b) || 0) - new Date(primaryPostedAt(a) || 0));
            if (recent.length === 0) return <Empty title="No posts published yet" hint="Once a post ships, it will land here." />;
            return (
              <div className="max-h-[560px] overflow-y-auto pr-2 -mr-1 space-y-4 stagger">
                {recent.map(c => {
                  const img = selectedImage(c);
                  // Show a chip for every platform where there's evidence of a publish:
                  //   - status flipped to 'posted', OR
                  //   - a post URL was written (n8n may write the URL before/without the status flip)
                  // Sweeps all four platforms, not just `platforms_selected`, so chips appear even
                  // if a campaign was published to a platform that wasn't in the initial selection.
                  const postedPlatforms = PLATFORM_LIST.filter(p =>
                    c[`${p}_published_status`] === 'posted' || c[`${p}_post_url`]
                  );
                  return (
                    <div
                      key={c.post_id}
                      onClick={() => onNavigate('post-creator', c.post_id)}
                      className="group rounded-xl border border-cream-200 hover:border-brand-300/60 hover:shadow-lift hover:-translate-y-0.5 transition-all duration-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-stretch gap-4 sm:gap-5 cursor-pointer"
                    >
                      {/* Top row on mobile (image + text) */}
                      <div className="flex items-start gap-3 sm:contents">
                        {/* Image — smaller on mobile */}
                        <div className="h-20 w-20 sm:h-32 sm:w-32 lg:h-36 lg:w-36 rounded-xl overflow-hidden bg-cream-200 shrink-0">
                          {img && <img src={img} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />}
                        </div>

                        {/* Middle — title + caption */}
                        <div className="min-w-0 flex-1 flex flex-col justify-center">
                          <div className="text-[11px] sm:text-xs text-ink-500">{fmtRelative(primaryPostedAt(c))}</div>
                          <div className="text-base sm:text-lg font-bold text-ink-900 truncate group-hover:text-brand-700 transition-colors mt-1">
                            {c.event_name || '(untitled)'}
                          </div>
                          <div className="text-xs sm:text-sm text-ink-500 mt-1 sm:mt-1.5 line-clamp-2">{primaryCaption(c) || '—'}</div>
                        </div>
                      </div>

                      {/* Actions — full-width horizontal row on mobile, stacked vertical column on sm+ */}
                      <div className="shrink-0 flex flex-row flex-wrap sm:flex-col gap-2 sm:justify-center sm:self-center sm:min-w-[160px]">
                        {postedPlatforms.length === 0 ? (
                          <span className="text-[11px] text-ink-400 italic px-2">No post URL yet</span>
                        ) : (
                          postedPlatforms.map(p => {
                            const meta = PLATFORM_META[p];
                            const href = c[`${p}_post_url`];
                            const disabled = !href;
                            const Tag = disabled ? 'span' : 'a';
                            const tagProps = disabled
                              ? { 'aria-disabled': true, title: 'Post URL not available yet' }
                              : { href, target: '_blank', rel: 'noreferrer', onClick: (e) => e.stopPropagation() };
                            return (
                              <Tag
                                key={p}
                                {...tagProps}
                                style={{ background: meta.color, color: '#fff' }}
                                className={[
                                  'inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-bold transition-all',
                                  disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lift hover:-translate-y-0.5'
                                ].join(' ')}
                                title={`View on ${meta.label}`}
                              >
                                <PlatformGlyph platform={p} className="h-3.5 w-3.5" />
                                {/* Icon-only on mobile (saves width); full text on sm+ */}
                                <span className="hidden sm:inline">View on {meta.label}</span>
                                {!disabled && <span aria-hidden className="hidden sm:inline">↗</span>}
                              </Tag>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>
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

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function TopBar({ onNewPost }) {
  // Hidden on mobile — the global mobile bar (App.jsx) already exposes "+ New" so this
  // page-level Create button would be a duplicate. Visible on lg+ where there is no global bar.
  return (
    <header className="hidden lg:block sticky top-0 z-20 glass border-b border-cream-300/60">
      <div className="px-4 lg:px-10 h-16 flex items-center justify-end">
        <button onClick={onNewPost} className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
          <PlusIcon /> New Post 
        </button>
      </div>
    </header>
  );
}

function KpiTile({ label, value, delta, icon }) {
  const display = useCountUp(value);
  const positive = delta >= 0;
  return (
    <div className="card card-hover px-5 py-4 relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div className="h-9 w-9 rounded-lg bg-cream-100 text-ink-600 flex items-center justify-center">{icon}</div>
        <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 inline-flex items-center gap-0.5 ${positive ? 'bg-green-50 text-accent-green' : 'bg-red-50 text-brand-700'}`}>
          {positive ? '+' : ''}{delta}%
        </span>
      </div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-500 mt-3 font-bold">{label}</div>
      <div className="text-3xl font-bold tabular-nums text-ink-900 mt-1">{display}</div>
    </div>
  );
}

function Skeleton({ rows = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 rounded-lg shimmer" />
      ))}
    </div>
  );
}

function Empty({ title, hint, action }) {
  return (
    <div className="text-center py-10 animate-fade-in">
      <div className="font-medium text-ink-900">{title}</div>
      <div className="text-sm text-ink-500 mt-1">{hint}</div>
      {action}
    </div>
  );
}

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);
const GridIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);
const DraftIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" /><path d="M12 8v5" strokeLinecap="round" />
  </svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
