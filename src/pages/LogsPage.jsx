import React, { useMemo, useState } from 'react';
import { useLogs } from '../hooks/useLogs.js';
import { PLATFORM_LIST, PLATFORM_META } from '../utils/config.js';
import { PlatformGlyph } from '../components/PlatformChip.jsx';

/* ============================================================
   Pricing — easy to tweak in one place.
   Pricing is kept in USD (the currency Google bills in), then converted to INR for display.
   Update USD_TO_INR when the FX rate moves materially. Per-1M-token rates below are
   Gemini's published prices in USD.
   ============================================================ */
const PRICING_PER_MTOK = {
  'gemini-2.5-flash':       { input: 0.075, output: 0.30 },
  'gemini-2.5-flash-image': { input: 0.075, output: 0.30 },
  'gemini-2.5-pro':         { input: 1.25,  output: 5.00 },
  'gemini-1.5-flash':       { input: 0.075, output: 0.30 },
  'gemini-1.5-pro':         { input: 1.25,  output: 5.00 },
  default:                  { input: 0.075, output: 0.30 }
};
const USD_TO_INR = 84;  // bump this when the FX rate moves
function rateFor(model) { return PRICING_PER_MTOK[model] || PRICING_PER_MTOK.default; }
function costFromTokensUSD(inTok, outTok, model) {
  const r = rateFor(model);
  return ((inTok || 0) * r.input + (outTok || 0) * r.output) / 1_000_000;
}
// Returns cost in INR (USD × FX rate).
function costFromTokens(inTok, outTok, model) {
  return costFromTokensUSD(inTok, outTok, model) * USD_TO_INR;
}
const fmtINR = (n) => (n || 0).toLocaleString('en-IN', {
  style: 'currency', currency: 'INR',
  minimumFractionDigits: n < 1 ? 4 : 2,
  maximumFractionDigits: n < 1 ? 4 : 2
});
const fmtInt = (n) => (n || 0).toLocaleString();

/* ============================================================ */

const STATUS_META = {
  pending: { label: 'Pending', color: '#2563eb', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-accent-blue', dot: 'bg-accent-blue' },
  success: { label: 'Success', color: '#16a34a', bg: 'bg-green-50', border: 'border-green-200', text: 'text-accent-green', dot: 'bg-accent-green' },
  partial: { label: 'Partial', color: '#d97706', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-accent-amber', dot: 'bg-accent-amber' },
  failed:  { label: 'Failed',  color: '#b83a25', bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-brand-700',   dot: 'bg-brand-700' }
};

const ACTIONS = [
  'campaign.create',
  'caption.regenerate', 'caption.update',
  'image.regenerate', 'image.regenerate_variants', 'image.select',
  'platform.post_now', 'platform.schedule', 'platform.approve', 'platform.reject'
];

function fmtRelative(d) {
  if (!d) return '—';
  const dt = new Date(d).getTime();
  if (Number.isNaN(dt)) return '—';
  const diffSec = Math.floor((Date.now() - dt) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(d).toLocaleDateString();
}

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function startOfMonth(d) { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }

export default function LogsPage({ onNavigate }) {
  const { logs, loading, error, refresh } = useLogs();

  /* ---------------- aggregations ---------------- */

  const stats = useMemo(() => {
    const out = {
      counts: { total: logs.length, pending: 0, success: 0, partial: 0, failed: 0 },
      caption: { input: 0, output: 0, total: 0, cost: 0, errors: 0, runs: 0 },
      image:   { input: 0, output: 0, total: 0, cost: 0, errors: 0, runs: 0 },
      perPlatformErrors: { instagram: 0, x: 0, linkedin: 0, fb: 0 },
      perActionRuns:    {}, // action -> { total, success, partial, failed, pending }
      topErrors:        new Map(), // text -> count
      recentFailures:   []
    };
    for (const l of logs) {
      if (out.counts[l.log_status] != null) out.counts[l.log_status] += 1;

      // Caption Gemini
      if (l.gemini_caption_model || l.gemini_caption_total_tokens) {
        out.caption.runs   += 1;
        out.caption.input  += l.gemini_caption_input_tokens  || 0;
        out.caption.output += l.gemini_caption_output_tokens || 0;
        out.caption.total  += l.gemini_caption_total_tokens  || 0;
        out.caption.cost   += costFromTokens(l.gemini_caption_input_tokens, l.gemini_caption_output_tokens, l.gemini_caption_model);
        if (l.gemini_caption_error && l.gemini_caption_error !== 'No error') out.caption.errors += 1;
      }
      // Image Gemini
      if (l.gemini_image_model || l.gemini_image_total_tokens) {
        out.image.runs   += 1;
        out.image.input  += l.gemini_image_input_tokens  || 0;
        out.image.output += l.gemini_image_output_tokens || 0;
        out.image.total  += l.gemini_image_total_tokens  || 0;
        out.image.cost   += costFromTokens(l.gemini_image_input_tokens, l.gemini_image_output_tokens, l.gemini_image_model);
        if (l.gemini_image_error && l.gemini_image_error !== 'No error') out.image.errors += 1;
      }

      // Per-platform errors
      ['instagram','x','linkedin','fb'].forEach(p => {
        const v = l[`${p}_error`];
        if (v && v !== 'No error') out.perPlatformErrors[p] += 1;
      });

      // Per-action
      if (l.webhook_action) {
        const a = out.perActionRuns[l.webhook_action] || { total: 0, success: 0, partial: 0, failed: 0, pending: 0 };
        a.total += 1;
        if (a[l.log_status] != null) a[l.log_status] += 1;
        out.perActionRuns[l.webhook_action] = a;
      }

      // Top errors — first non-"No error" we find
      const errCandidates = [l.error_status, l.gemini_image_error, l.gemini_caption_error,
        l.instagram_error, l.x_error, l.linkedin_error, l.fb_error]
        .filter(s => s && s !== 'No error');
      for (const e of errCandidates) {
        out.topErrors.set(e, (out.topErrors.get(e) || 0) + 1);
      }

      if (l.log_status === 'failed' || l.log_status === 'partial') {
        out.recentFailures.push(l);
      }
    }
    out.totalCost = out.caption.cost + out.image.cost;
    out.totalTokens = out.caption.total + out.image.total;
    out.successRate = out.counts.total === 0
      ? 0
      : Math.round((out.counts.success / out.counts.total) * 100);
    out.topErrorsArr = [...out.topErrors.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    out.recentFailures = out.recentFailures.slice(0, 5);
    return out;
  }, [logs]);

  /* ---------------- time-series buckets ---------------- */

  const [trendRange, setTrendRange] = useState('7d'); // '7d' | '30d' | 'month'

  const trendData = useMemo(() => {
    if (trendRange === 'month') {
      const buckets = new Map(); // 'YYYY-MM' -> { caption, image, cost, count }
      // Seed last 6 months so chart isn't empty
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        buckets.set(k, { label: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), caption: 0, image: 0, cost: 0, count: 0 });
      }
      for (const l of logs) {
        if (!l.trigger_at) continue;
        const d = startOfMonth(l.trigger_at);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!buckets.has(k)) continue; // outside window
        const b = buckets.get(k);
        b.caption += l.gemini_caption_total_tokens || 0;
        b.image   += l.gemini_image_total_tokens   || 0;
        b.cost    += costFromTokens(l.gemini_caption_input_tokens, l.gemini_caption_output_tokens, l.gemini_caption_model)
                    + costFromTokens(l.gemini_image_input_tokens, l.gemini_image_output_tokens, l.gemini_image_model);
        b.count   += 1;
      }
      return [...buckets.values()];
    }

    const days = trendRange === '7d' ? 7 : 30;
    const buckets = new Map(); // YYYY-MM-DD -> bucket
    const today = startOfDay(new Date());
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const k = d.toISOString().slice(0, 10);
      buckets.set(k, { label: d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }), caption: 0, image: 0, cost: 0, count: 0 });
    }
    for (const l of logs) {
      if (!l.trigger_at) continue;
      const k = startOfDay(l.trigger_at).toISOString().slice(0, 10);
      if (!buckets.has(k)) continue;
      const b = buckets.get(k);
      b.caption += l.gemini_caption_total_tokens || 0;
      b.image   += l.gemini_image_total_tokens   || 0;
      b.cost    += costFromTokens(l.gemini_caption_input_tokens, l.gemini_caption_output_tokens, l.gemini_caption_model)
                  + costFromTokens(l.gemini_image_input_tokens, l.gemini_image_output_tokens, l.gemini_image_model);
      b.count   += 1;
    }
    return [...buckets.values()];
  }, [logs, trendRange]);

  /* ---------------- log list filters ---------------- */

  const [statusFilter, setStatusFilter]     = useState('all');
  const [actionFilter, setActionFilter]     = useState('all');
  const [platformFilter, setPlatformFilter] = useState([]);
  const [search, setSearch]                 = useState('');

  const togglePlatform = (p) => setPlatformFilter(prev =>
    prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter(l => {
      if (statusFilter !== 'all' && l.log_status !== statusFilter) return false;
      if (actionFilter !== 'all' && l.webhook_action !== actionFilter) return false;
      if (platformFilter.length > 0) {
        const ps = Array.isArray(l.platforms_selected) ? l.platforms_selected : [];
        if (!platformFilter.some(p => ps.includes(p))) return false;
      }
      if (q) {
        const haystack = [l.event_name, l.post_id, l.webhook_action, l.error_status,
          l.gemini_image_error, l.gemini_caption_error,
          l.instagram_error, l.x_error, l.linkedin_error, l.fb_error]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [logs, statusFilter, actionFilter, platformFilter, search]);

  /* ---------------- render ---------------- */

  return (
    <>
      <header className="sticky top-0 z-20 glass border-b border-cream-300/60">
        <div className="px-4 lg:px-10 h-16 flex items-center justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-500 font-bold">
            Auto-refresh · every 10 s
          </div>
          <button onClick={refresh}
            className="rounded-full h-9 w-9 bg-white border border-cream-300 flex items-center justify-center text-ink-700 hover:bg-cream-100 hover:text-brand-700 transition-all"
            title="Refresh now"
          ><RefreshIcon /></button>
        </div>
      </header>

      <main className="px-4 lg:px-10 py-8 max-w-7xl w-full">
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="animate-fade-up">
          <h1 className="h-display text-3xl lg:text-4xl text-ink-900">Reports &amp; Logs</h1>
          <p className="text-ink-600 mt-1 text-sm">
            Gemini spend, workflow health, and per-platform error breakdown for every webhook fired.
          </p>
        </div>

        {/* ------------ KPI strip ------------ */}
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4 mt-8 stagger">
          <KpiTile label="Total Runs"     value={fmtInt(stats.counts.total)}    tint="ink"   icon={<GridIcon />} />
          <KpiTile label="Total Cost"     value={fmtINR(stats.totalCost)}       tint="brand" icon={<CoinIcon />} note={`${fmtInt(stats.totalTokens)} tokens`} />
          <KpiTile label="Caption Tokens" value={fmtInt(stats.caption.total)}   tint="blue"  icon={<TextIcon />}  note={fmtINR(stats.caption.cost)} />
          <KpiTile label="Image Tokens"   value={fmtInt(stats.image.total)}     tint="amber" icon={<ImageIcon />} note={fmtINR(stats.image.cost)} />
          <KpiTile label="Success Rate"   value={`${stats.successRate}%`}       tint="green" icon={<CheckIcon />} note={`${stats.counts.success}/${stats.counts.total}`} />
        </section>

        {/* ------------ Spend & Tokens chart ------------ */}
        <section className="mt-8 card p-6 animate-fade-up">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
            <div>
              <h2 className="h-display text-2xl text-ink-900">Spend &amp; Tokens</h2>
              <p className="text-xs text-ink-500 mt-1">Daily token usage and cost — caption + image stacked</p>
            </div>
            <div className="flex items-center gap-1">
              <SegBtn active={trendRange === '7d'}    onClick={() => setTrendRange('7d')}>7d</SegBtn>
              <SegBtn active={trendRange === '30d'}   onClick={() => setTrendRange('30d')}>30d</SegBtn>
              <SegBtn active={trendRange === 'month'} onClick={() => setTrendRange('month')}>Monthly</SegBtn>
            </div>
          </div>

          {/* Cost split row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
            <CostSplit
              title="Caption" color="#2563eb"
              cost={stats.caption.cost} tokens={stats.caption.total}
              input={stats.caption.input} output={stats.caption.output}
              runs={stats.caption.runs} errors={stats.caption.errors}
            />
            <CostSplit
              title="Image" color="#d97706"
              cost={stats.image.cost} tokens={stats.image.total}
              input={stats.image.input} output={stats.image.output}
              runs={stats.image.runs} errors={stats.image.errors}
            />
          </div>

          {/* Stacked bar chart */}
          <div className="mt-6">
            <StackedBarChart data={trendData} captionColor="#2563eb" imageColor="#d97706" />
          </div>
        </section>

        {/* ------------ Workflow Health ------------ */}
        <section className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card p-6 animate-fade-up">
            <h2 className="h-display text-xl text-ink-900">Workflow Health</h2>
            <p className="text-xs text-ink-500 mt-1 mb-5">Distribution of all runs by final status</p>
            <div className="flex items-center gap-6 flex-wrap">
              <StatusDonut counts={stats.counts} />
              <div className="space-y-2 flex-1 min-w-[140px]">
                {Object.entries(STATUS_META).map(([k, m]) => (
                  <div key={k} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                    <span className="text-ink-700">{m.label}</span>
                    <div className="flex-1" />
                    <span className="font-bold tabular-nums text-ink-900">{stats.counts[k]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card p-6 animate-fade-up">
            <h2 className="h-display text-xl text-ink-900">Per-Action Health</h2>
            <p className="text-xs text-ink-500 mt-1 mb-4">Success vs failure rate for each webhook action</p>
            <PerActionTable data={stats.perActionRuns} />
          </div>
        </section>

        {/* ------------ Platform Errors ------------ */}
        <section className="mt-8 card p-6 animate-fade-up">
          <h2 className="h-display text-xl text-ink-900">Platform Errors</h2>
          <p className="text-xs text-ink-500 mt-1 mb-5">Number of logs where each platform reported an error</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {PLATFORM_LIST.map(p => {
              const meta = PLATFORM_META[p];
              const count = stats.perPlatformErrors[p] || 0;
              return (
                <div key={p}
                  className="rounded-xl border bg-white px-4 py-3 flex items-center gap-3"
                  style={{ borderColor: `${meta.color}55` }}
                >
                  <span className="h-10 w-10 rounded-lg flex items-center justify-center text-white shrink-0"
                    style={{ background: meta.color }}>
                    <PlatformGlyph platform={p} className="h-5 w-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-ink-700 truncate">{meta.label}</div>
                    <div className={`text-2xl font-bold tabular-nums ${count > 0 ? 'text-brand-700' : 'text-accent-green'}`}>
                      {count}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-ink-500">
                      {count === 0 ? 'No errors' : `error${count === 1 ? '' : 's'}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ------------ Top Errors + Recent Failures ------------ */}
        <section className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card p-6 animate-fade-up">
            <h2 className="h-display text-xl text-ink-900">Top Errors</h2>
            <p className="text-xs text-ink-500 mt-1 mb-4">Most frequent error messages across logs</p>
            {stats.topErrorsArr.length === 0 ? (
              <div className="text-sm text-ink-500 italic py-6 text-center">No errors recorded — everything looks healthy.</div>
            ) : (
              <ul className="space-y-2">
                {stats.topErrorsArr.map(([msg, count]) => (
                  <li key={msg} className="flex items-start gap-3 text-sm rounded-lg border border-red-100 bg-red-50/50 px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white bg-brand-700 rounded-full px-2 py-0.5 mt-0.5 shrink-0 tabular-nums">{count}×</span>
                    <code className="text-xs text-ink-900 break-words flex-1">{msg}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-6 animate-fade-up">
            <h2 className="h-display text-xl text-ink-900">Recent Failures</h2>
            <p className="text-xs text-ink-500 mt-1 mb-4">Failed or partial runs — click to drill in</p>
            {stats.recentFailures.length === 0 ? (
              <div className="text-sm text-ink-500 italic py-6 text-center">No failed or partial runs.</div>
            ) : (
              <ul className="space-y-2">
                {stats.recentFailures.map(l => {
                  const s = STATUS_META[l.log_status] || STATUS_META.pending;
                  return (
                    <li key={l.log_id}>
                      <button
                        onClick={() => l.post_id && onNavigate?.('post-creator', l.post_id)}
                        className="w-full text-left rounded-lg border border-cream-200 bg-white px-3 py-2 hover:border-brand-300 hover:shadow-soft transition-all"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s.bg} ${s.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                            {s.label}
                          </span>
                          <code className="text-[10px] font-mono text-ink-700 bg-cream-100 rounded px-1.5 py-0.5">{l.webhook_action || '—'}</code>
                          <span className="text-[11px] text-ink-500">{fmtRelative(l.trigger_at)}</span>
                        </div>
                        <div className="font-bold text-ink-900 text-sm mt-1">{l.event_name || '(no name)'}</div>
                        <div className="text-xs text-brand-700 mt-1 truncate">{l.error_status || 'See expanded log'}</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* ------------ Log list (filter + cards) ------------ */}
        <section className="mt-10 animate-fade-up">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h2 className="h-display text-2xl text-ink-900">All Logs</h2>
              <p className="text-xs text-ink-500 mt-1">Filter and inspect individual webhook calls</p>
            </div>
          </div>

          {/* Filters */}
          <div className="card p-5 mb-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider font-bold text-ink-500 mr-1">Status:</span>
                <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</FilterPill>
                {Object.entries(STATUS_META).map(([key, m]) => (
                  <FilterPill key={key} active={statusFilter === key} onClick={() => setStatusFilter(key)} color={m.color}>
                    {m.label}
                  </FilterPill>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider font-bold text-ink-500 mr-1">Platform:</span>
                {PLATFORM_LIST.map(p => {
                  const meta = PLATFORM_META[p];
                  const active = platformFilter.includes(p);
                  return (
                    <button key={p}
                      onClick={() => togglePlatform(p)}
                      style={active ? { background: meta.color, color: '#fff', borderColor: meta.color } : { color: meta.color }}
                      className={['inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all',
                        active ? 'shadow-soft' : 'bg-white border-cream-300/60 hover:border-current'].join(' ')}
                    >
                      <PlatformGlyph platform={p} className="h-3 w-3" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
                  className="input text-xs h-8 py-0 w-auto"
                >
                  <option value="all">All actions</option>
                  {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search event name, post_id, error…"
                  className="input text-sm flex-1 min-w-[200px]"
                />
              </div>
            </div>
          </div>

          {/* List */}
          <div className="space-y-3">
            {loading && logs.length === 0 ? (
              <SkeletonList />
            ) : filtered.length === 0 ? (
              <Empty
                title={logs.length === 0 ? 'No logs yet' : 'No logs match these filters'}
                hint={logs.length === 0
                  ? 'Actions from PostCreator will appear here as soon as n8n writes to log_report.'
                  : 'Try clearing some filters.'}
              />
            ) : (
              filtered.map(log => <LogCard key={log.log_id} log={log} onNavigate={onNavigate} />)
            )}
          </div>

          {filtered.length > 0 && (
            <div className="text-center text-xs text-ink-500 mt-6 mb-4">
              Showing {filtered.length} of {logs.length} loaded · capped at 200 newest entries
            </div>
          )}
        </section>
      </main>
    </>
  );
}

/* ============================================================
   Subcomponents
   ============================================================ */

function KpiTile({ label, value, note, tint = 'ink', icon }) {
  const tintMap = {
    ink:   'bg-cream-100 text-ink-600',
    brand: 'bg-brand-50 text-brand-700',
    blue:  'bg-blue-50 text-accent-blue',
    green: 'bg-green-50 text-accent-green',
    amber: 'bg-amber-50 text-accent-amber',
    red:   'bg-red-50 text-brand-700'
  };
  return (
    <div className="card card-hover px-5 py-4">
      <div className="flex items-start justify-between">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tintMap[tint]}`}>{icon}</div>
      </div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-500 mt-3 font-bold">{label}</div>
      <div className="text-2xl lg:text-3xl font-bold tabular-nums text-ink-900 mt-1 leading-tight">{value}</div>
      {note && <div className="text-[10px] text-ink-500 mt-1 tabular-nums">{note}</div>}
    </div>
  );
}

function CostSplit({ title, color, cost, tokens, input, output, runs, errors }) {
  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: `${color}40` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <span className="text-[11px] uppercase tracking-wider font-bold text-ink-700">{title}</span>
        </div>
        <span className="text-[10px] text-ink-500 tabular-nums">{runs} run{runs === 1 ? '' : 's'}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums text-ink-900 mt-2">{fmtINR(cost)}</div>
      <div className="text-[11px] text-ink-500 mt-0.5 tabular-nums">{fmtInt(tokens)} tokens</div>
      <div className="mt-3 grid grid-cols-3 gap-1 text-[11px] text-ink-700">
        <div><div className="text-ink-500 text-[9px] uppercase tracking-wider font-bold">Input</div><div className="tabular-nums">{fmtInt(input)}</div></div>
        <div><div className="text-ink-500 text-[9px] uppercase tracking-wider font-bold">Output</div><div className="tabular-nums">{fmtInt(output)}</div></div>
        <div><div className="text-ink-500 text-[9px] uppercase tracking-wider font-bold">Errors</div><div className={`tabular-nums font-bold ${errors > 0 ? 'text-brand-700' : 'text-ink-700'}`}>{errors}</div></div>
      </div>
    </div>
  );
}

function StackedBarChart({ data, captionColor, imageColor }) {
  const max = Math.max(1, ...data.map(d => (d.caption || 0) + (d.image || 0)));
  return (
    <div>
      <div className="flex items-end gap-1.5 h-44">
        {data.map((d, i) => {
          const total = (d.caption || 0) + (d.image || 0);
          const pct = (total / max) * 100;
          const capPct = total === 0 ? 0 : (d.caption / total) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-stretch h-full min-w-[10px] group">
              <div className="flex-1" />
              <div className="relative w-full bg-cream-100 rounded-md overflow-hidden transition-all"
                style={{ height: `${pct}%`, minHeight: total > 0 ? 3 : 1 }}
                title={`${d.label} — caption ${fmtInt(d.caption)} · image ${fmtInt(d.image)} · ${fmtINR(d.cost)}`}
              >
                {total > 0 && (
                  <>
                    <div style={{ background: imageColor,   height: `${100 - capPct}%` }} className="w-full" />
                    <div style={{ background: captionColor, height: `${capPct}%` }} className="w-full" />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-2 text-[10px] text-ink-500">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length/2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      <div className="flex items-center justify-center gap-4 text-[11px] text-ink-700 mt-3">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: captionColor }} />Caption</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: imageColor }} />Image</span>
      </div>
    </div>
  );
}

function StatusDonut({ counts }) {
  const total = counts.total || 0;
  const ordered = ['success', 'partial', 'failed', 'pending'];
  const r = 42, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#F3EAE3" strokeWidth="14" />
        {total > 0 && ordered.map(k => {
          const v = counts[k] || 0;
          if (v === 0) return null;
          const portion = v / total;
          const len = portion * c;
          const offset = acc * c;
          acc += portion;
          return (
            <circle key={k} cx="55" cy="55" r={r} fill="none"
              stroke={STATUS_META[k].color} strokeWidth="14"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold tabular-nums text-ink-900">{total}</div>
        <div className="text-[9px] uppercase tracking-wider font-bold text-ink-500">Total</div>
      </div>
    </div>
  );
}

function PerActionTable({ data }) {
  const rows = Object.entries(data).sort((a, b) => b[1].total - a[1].total);
  if (rows.length === 0) {
    return <div className="text-sm text-ink-500 italic py-6 text-center">No actions logged yet.</div>;
  }
  return (
    <div className="space-y-2">
      {rows.map(([action, c]) => {
        const successPct = c.total === 0 ? 0 : Math.round((c.success / c.total) * 100);
        return (
          <div key={action} className="rounded-lg border border-cream-200 bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <code className="text-[11px] font-mono text-ink-900 bg-cream-100 rounded px-1.5 py-0.5">{action}</code>
              <div className="text-xs text-ink-700 flex items-center gap-3 tabular-nums">
                <span><strong className="text-accent-green">{c.success}</strong>/{c.total}</span>
                <span className={`font-bold ${successPct >= 80 ? 'text-accent-green' : successPct >= 50 ? 'text-accent-amber' : 'text-brand-700'}`}>
                  {successPct}%
                </span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-cream-100 overflow-hidden mt-2 flex">
              {['success','partial','failed','pending'].map(s => {
                const pct = c.total === 0 ? 0 : ((c[s] || 0) / c.total) * 100;
                if (pct === 0) return null;
                return <div key={s} style={{ width: `${pct}%`, background: STATUS_META[s].color }} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SegBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={['px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
        active ? 'bg-brand-700 text-white shadow-soft' : 'bg-white border border-cream-300/60 text-ink-700 hover:border-brand-300'].join(' ')}
    >{children}</button>
  );
}

function FilterPill({ active, onClick, children, color }) {
  return (
    <button onClick={onClick}
      style={active && color ? { background: color, color: '#fff', borderColor: color } : undefined}
      className={['rounded-full border px-3 py-1 text-[11px] font-semibold transition-all',
        active ? color ? 'shadow-soft' : 'bg-brand-700 text-white border-brand-700 shadow-soft'
                       : 'bg-white border-cream-300/60 text-ink-700 hover:border-brand-300'].join(' ')}
    >{children}</button>
  );
}

function LogCard({ log, onNavigate }) {
  const [open, setOpen] = useState(false);
  const status = STATUS_META[log.log_status] || STATUS_META.pending;
  const platforms = Array.isArray(log.platforms_selected) ? log.platforms_selected : [];
  const totalTokens = (log.gemini_image_total_tokens || 0) + (log.gemini_caption_total_tokens || 0);
  const totalCost = costFromTokens(log.gemini_image_input_tokens, log.gemini_image_output_tokens, log.gemini_image_model)
                  + costFromTokens(log.gemini_caption_input_tokens, log.gemini_caption_output_tokens, log.gemini_caption_model);

  return (
    <article className={`rounded-xl border bg-white shadow-soft transition-all ${open ? 'shadow-lift' : 'hover:shadow-lift'} ${status.border}`}>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-left p-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${status.bg} ${status.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot} ${log.log_status === 'pending' ? 'animate-pulse-soft' : ''}`} />
            {status.label}
          </span>
          {log.webhook_action && (
            <code className="text-[11px] font-mono text-ink-700 bg-cream-100 rounded px-2 py-0.5">{log.webhook_action}</code>
          )}
          <span className="text-xs text-ink-500">{fmtRelative(log.trigger_at)}</span>
          {!log.post_id && (
            <span className="text-[10px] uppercase tracking-wider font-bold text-ink-500 bg-cream-100 rounded-full px-2 py-0.5">Post deleted</span>
          )}
          <div className="flex-1" />
          <span className="text-[11px] text-ink-500">{open ? '▴ Collapse' : '▾ Expand'}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <div className="font-bold text-ink-900">{log.event_name || <span className="text-ink-400 italic">(no event name)</span>}</div>
          <div className="text-xs text-ink-500">
            {log.post_type && <>· {log.post_type} </>}
            {log.caption_style && <>· {log.caption_style} </>}
            {platforms.length > 0 && <>· {platforms.length} platform{platforms.length === 1 ? '' : 's'}</>}
          </div>
        </div>
        {platforms.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {platforms.map(p => {
              const meta = PLATFORM_META[p];
              const err = log[`${p}_error`];
              const ok = !err || err === 'No error';
              return (
                <span key={p} style={{ background: meta.color, color: '#fff' }}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  title={ok ? 'No error' : err}
                >
                  <PlatformGlyph platform={p} className="h-3 w-3" />
                  {meta.label}
                  <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-green-300' : 'bg-red-300'}`} />
                </span>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-ink-500 tabular-nums">
          <div className="flex items-center gap-3 flex-wrap">
            {totalTokens > 0 && <span className="inline-flex items-center gap-1"><CoinIcon /><strong className="text-ink-700">{fmtInt(totalTokens)}</strong> tokens</span>}
            {totalCost > 0 && <span><strong className="text-ink-700">{fmtINR(totalCost)}</strong> cost</span>}
            <span className={log.error_status && log.error_status !== 'No error' ? 'text-brand-700 font-semibold' : ''}>{log.error_status || 'No error'}</span>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-cream-200 p-5 space-y-5 bg-cream-50/40">
          <Panel title="Post snapshot">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <KV label="post_id" value={log.post_id || '—'} mono />
              <KV label="Triggered" value={log.trigger_at ? new Date(log.trigger_at).toLocaleString() : '—'} />
              <KV label="Event date" value={log.event_date || '—'} />
              <KV label="Post type" value={log.post_type || '—'} />
              <KV label="Caption style" value={log.caption_style || '—'} />
              <KV label="Image prompt" value={log.user_image_prompt || '—'} />
            </div>
            {Array.isArray(log.source_image_urls) && log.source_image_urls.length > 0 && (
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-2">Source images</div>
                <div className="flex gap-2 flex-wrap">
                  {log.source_image_urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="h-16 w-16 rounded-lg overflow-hidden border border-cream-300 bg-white">
                      <img src={url} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {log.post_id && onNavigate && (
              <div className="mt-4">
                <button onClick={() => onNavigate('post-creator', log.post_id)}
                  className="text-xs font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"
                >Open post in editor →</button>
              </div>
            )}
          </Panel>

          {log.gemini_image_model && (
            <GeminiPanel
              title="Gemini · Image"
              model={log.gemini_image_model}
              inTokens={log.gemini_image_input_tokens} outTokens={log.gemini_image_output_tokens} total={log.gemini_image_total_tokens}
              cost={costFromTokens(log.gemini_image_input_tokens, log.gemini_image_output_tokens, log.gemini_image_model)}
              error={log.gemini_image_error}
            />
          )}
          {log.gemini_caption_model && (
            <GeminiPanel
              title="Gemini · Caption"
              model={log.gemini_caption_model}
              inTokens={log.gemini_caption_input_tokens} outTokens={log.gemini_caption_output_tokens} total={log.gemini_caption_total_tokens}
              cost={costFromTokens(log.gemini_caption_input_tokens, log.gemini_caption_output_tokens, log.gemini_caption_model)}
              error={log.gemini_caption_error}
            />
          )}
          {platforms.length > 0 && (
            <Panel title="Per-platform results">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {platforms.map(p => {
                  const meta = PLATFORM_META[p];
                  const err = log[`${p}_error`];
                  const ok = !err || err === 'No error';
                  return (
                    <div key={p} className="rounded-lg border bg-white" style={{ borderColor: `${meta.color}55` }}>
                      <div className="px-3 py-2 flex items-center gap-2 border-b border-cream-200" style={{ background: `${meta.color}10` }}>
                        <span className="h-6 w-6 rounded-md flex items-center justify-center text-white" style={{ background: meta.color }}>
                          <PlatformGlyph platform={p} className="h-3.5 w-3.5" />
                        </span>
                        <div className="font-bold text-xs text-ink-900">{meta.label}</div>
                        <div className="flex-1" />
                        <span className={`text-[10px] uppercase tracking-wider font-bold ${ok ? 'text-accent-green' : 'text-brand-700'}`}>
                          {ok ? '✓ OK' : '✕ Error'}
                        </span>
                      </div>
                      <div className="px-3 py-2 text-xs text-ink-700">
                        {ok ? <span className="text-ink-500">No error reported.</span> : <code className="break-all">{err}</code>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>
      )}
    </article>
  );
}

function GeminiPanel({ title, model, inTokens, outTokens, total, cost, error }) {
  return (
    <Panel title={title}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <code className="text-[11px] font-mono bg-cream-100 text-ink-900 rounded px-2 py-0.5">{model || '—'}</code>
        <span className="text-[11px] uppercase tracking-wider font-bold text-brand-700 bg-brand-50 rounded-full px-2 py-0.5">{fmtINR(cost)}</span>
        {error && error !== 'No error' && (
          <span className="text-[10px] uppercase tracking-wider font-bold text-brand-700 bg-red-50 ring-1 ring-red-200 rounded-full px-2 py-0.5">Errored</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <TokenStat label="Input"  value={inTokens} />
        <TokenStat label="Output" value={outTokens} />
        <TokenStat label="Total"  value={total} emphasis />
      </div>
      {error && error !== 'No error' && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <strong className="font-bold">Error:</strong> <code className="break-all">{error}</code>
        </div>
      )}
    </Panel>
  );
}

function TokenStat({ label, value, emphasis }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${emphasis ? 'bg-brand-50/50 border-brand-200' : 'bg-white border-cream-200'}`}>
      <div className="text-[9px] uppercase tracking-wider font-bold text-ink-500">{label}</div>
      <div className={`text-base font-bold tabular-nums ${emphasis ? 'text-brand-700' : 'text-ink-900'}`}>{value != null ? fmtInt(value) : '—'}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-500 font-bold mb-2">{title}</div>
      <div className="rounded-xl border border-cream-200 bg-white p-4">{children}</div>
    </section>
  );
}

function KV({ label, value, mono }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] uppercase tracking-wider font-bold text-ink-500 shrink-0">{label}</span>
      <span className={`text-xs text-ink-900 truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-xl shimmer" />)}
    </div>
  );
}

function Empty({ title, hint }) {
  return (
    <div className="card p-10 text-center">
      <div className="font-bold text-ink-900">{title}</div>
      <div className="text-sm text-ink-500 mt-1.5">{hint}</div>
    </div>
  );
}

/* ---------------- icons ---------------- */
const RefreshIcon = () => (<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" /></svg>);
const GridIcon    = () => (<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>);
const CoinIcon    = () => (<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9 10c0-1.5 1-2.5 3-2.5s3 1 3 2c0 2.5-6 2-6 5 0 1 1 2 3 2s3-1 3-2" strokeLinecap="round" strokeLinejoin="round" /></svg>);
const TextIcon    = () => (<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h12M4 18h8" strokeLinecap="round" /></svg>);
const ImageIcon   = () => (<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" strokeLinejoin="round" /></svg>);
const CheckIcon   = () => (<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" /></svg>);
