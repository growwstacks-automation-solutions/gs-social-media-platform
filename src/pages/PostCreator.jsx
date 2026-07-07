import React, { useEffect, useMemo, useState } from 'react';
import { Spinner } from '../components/Loader.jsx';
import { PreviewSwitcher } from '../components/PlatformPreviews.jsx';
import ImageWorkbench from '../components/ImageWorkbench.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  POST_TYPES, POST_TYPE_LABELS, CAPTION_STYLES,
  PLATFORM_LIST, PLATFORM_META
} from '../utils/config.js';
// uploadToImageKit is dynamic-imported inside ImageLinksUploader to keep this file lean
import { waitForCampaign, supabase, CAMPAIGNS_TABLE } from '../services/supabase.js';
import {
  createCampaign, regenerateImage, regenerateVariants,
  regenerateCaption, saveCaptionEdit,
  approvePlatform, rejectPlatform,
  postNow, schedulePlatform, deleteCampaign
} from '../services/webhook.js';
import DeleteConfirmModal from '../components/DeleteConfirmModal.jsx';
import RegenerateImagePromptModal from '../components/RegenerateImagePromptModal.jsx';
import RegenerateCaptionModal from '../components/RegenerateCaptionModal.jsx';

function genPostId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback (RFC4122 v4)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Flatten user prompt text into a single paragraph before sending to webhooks:
// strips line breaks + tabs and collapses any run of whitespace into a single space.
// Returns null when the result is empty so n8n receives a real null, not "".
function normalizePrompt(s) {
  if (!s) return null;
  const flat = String(s).replace(/\s+/g, ' ').trim();
  return flat || null;
}

export default function PostCreator({ data, onNavigate, onClose, initialRecordId, composePlatforms = [] }) {
  const { campaigns, loading, refresh } = data;

  const campaign = useMemo(
    () => campaigns.find(c => c.post_id === initialRecordId) || null,
    [campaigns, initialRecordId]
  );

  const isEditing = !!campaign;
  const readOnly = isEditing; // Form fields read-only for existing campaigns (Phase 5 will wire edits)
  // Draft actions (regenerate / edit caption) are allowed unless this platform has already been posted

  const platforms = useMemo(() => {
    if (isEditing) return campaign.platforms_selected || [];
    return composePlatforms || [];
  }, [isEditing, campaign, composePlatforms]);

  const [activePlatform, setActivePlatform] = useState(platforms[0] || 'instagram');
  useEffect(() => {
    if (platforms.length && !platforms.includes(activePlatform)) {
      setActivePlatform(platforms[0]);
    }
  }, [platforms, activePlatform]);

  const [variantIdx, setVariantIdx] = useState(campaign?.selected_variant_index ?? 0);
  useEffect(() => {
    setVariantIdx(campaign?.selected_variant_index ?? 0);
  }, [campaign?.post_id, campaign?.selected_variant_index]);

  const handleSelectVariant = async (i) => {
    setVariantIdx(i); // optimistic
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!campaign) return;
    const { data, error } = await supabase
      .from(CAMPAIGNS_TABLE)
      .update({ selected_variant_index: i })
      .eq('post_id', campaign.post_id)
      .select('post_id, selected_variant_index');
    if (error) {
      console.error('selectVariant error', error);
      toast.error('Failed to save variant selection');
    } else {
      console.log('[selectVariant] wrote index', i, '→ DB returned', data);
    }
  };

  const [form, setForm] = useState({
    eventName: '',
    date: new Date().toISOString().slice(0, 10),
    postType: 'observance',
    captionStyle: 'Engaging',
    imagePrompt: '',
    sourceImages: [], // [{ id, url, name }]
    captionPrompt: '',    // single shared brief — applied to ALL platforms
    captionOverrides: {}  // per-platform manual edits: { instagram, x, linkedin, fb }
  });
  const [editingPlatform, setEditingPlatform] = useState(null); // which platform is in edit mode
  const [draftEdit, setDraftEdit] = useState(''); // textarea buffer while editing
  // Per-platform flag — true once Regenerate or Save edit invalidates a previously-approved caption.
  // Clears on Accept (and when a fresh campaign loads). Keeps the Accept button visible even when
  // the server still says approval === 'approved' but the caption has been changed since.
  const [approvalDirty, setApprovalDirty] = useState({});

  useEffect(() => {
    if (campaign) {
      setForm({
        eventName: campaign.event_name || '',
        date: campaign.event_date || new Date().toISOString().slice(0, 10),
        postType: campaign.post_type || 'observance',
        captionStyle: campaign.caption_style || 'Engaging',
        imagePrompt: campaign.user_image_prompt || '',
        sourceImages: (campaign.source_image_urls || []).map((url, i) => ({ id: `s${i}`, url, name: '', status: 'ready' })),
        captionPrompt: campaign.caption_prompts || '',
        captionOverrides: {}
      });
    } else {
      setForm({
        eventName: '',
        date: new Date().toISOString().slice(0, 10),
        postType: 'observance',
        captionStyle: 'Engaging',
        imagePrompt: '',
        sourceImages: [],
        captionPrompt: '',
        captionOverrides: {}
      });
    }
    setEditingPlatform(null);
    setApprovalDirty({});
  }, [campaign?.post_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up blob URLs created by file uploads when component unmounts
  useEffect(() => {
    return () => {
      form.sourceImages.forEach(s => {
        if (s.url && s.url.startsWith('blob:')) URL.revokeObjectURL(s.url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target?.value ?? e }));

  const caption = campaign ? campaign[`${activePlatform}_caption`] : null;
  const captionStatus = campaign ? campaign[`${activePlatform}_caption_status`] : 'idle';
  const approval  = campaign ? campaign[`${activePlatform}_approval_status`] : 'draft';
  const published = campaign ? campaign[`${activePlatform}_published_status`] : 'draft';
  const scheduledAt = campaign ? campaign[`${activePlatform}_scheduled_at`] : null;
  const postedAt    = campaign ? campaign[`${activePlatform}_posted_at`] : null;

  const images = useMemo(() => {
    // Live preview for new posts being composed
    if (!campaign) {
      if (form.postType === 'event') return form.sourceImages.map(s => s.url);
      return [];
    }
    if (campaign.post_type === 'event') return campaign.source_image_urls || [];
    const variants = campaign.generated_image_variants || [];
    return variants.length ? [variants[variantIdx] || variants[0]] : [];
  }, [campaign, variantIdx, form.postType, form.sourceImages]);

  const activeMeta = PLATFORM_META[activePlatform];

  /* ---------- Action wiring (Phase 5) ---------- */
  const toast = useToast();
  const [busy, setBusy] = useState(null); // 'forge' | 'image' | 'variants' | `caption-${platform}` | `approve-${platform}` | `reject-${platform}` | `post-${platform}` | `schedule-${platform}` | `save-${platform}`
  const [generating, setGenerating] = useState(false); // true while waiting for n8n to finish writing image + captions
  const [pendingPostId, setPendingPostId] = useState(null); // freshly-created post_id awaiting first read
  const [genStartedAt, setGenStartedAt] = useState(null); // ms timestamp when Forge was clicked
  const [nowMs, setNowMs] = useState(Date.now());        // ticked every 500ms while generating so timer UI updates
  const [previewModalOpen, setPreviewModalOpen] = useState(false); // full-size preview modal
  const [deleteModalOpen, setDeleteModalOpen]   = useState(false); // campaign delete confirmation
  const [regenImageModalOpen, setRegenImageModalOpen] = useState(false); // edit-prompt-before-regenerate-image
  // Per-platform 30s blur window after caption Regenerate is clicked. Map of platform -> Date.now() endpoint.
  const [regenCaptionUntil, setRegenCaptionUntil] = useState({});
  const [regenNowMs, setRegenNowMs] = useState(Date.now());
  // 60s blur window after image Regenerate is confirmed. Single timestamp (one image per post).
  const [regenImageUntilMs, setRegenImageUntilMs] = useState(0);
  // Which platform's caption is awaiting user confirmation before regenerating.
  const [regenCaptionConfirmPlatform, setRegenCaptionConfirmPlatform] = useState(null);
  // Pending Post Now / Schedule confirmation: { action: 'post'|'schedule', platform }
  const [publishConfirm, setPublishConfirm] = useState(null);
  // Tracks an in-flight Post Now / Schedule action waiting for Supabase to reflect the new status.
  // Shape: { platform: 'x', action: 'post'|'schedule', startedAt: ms } | null
  const [publishingState, setPublishingState] = useState(null);
  const [publishingNowMs, setPublishingNowMs] = useState(Date.now());

  const ESTIMATED_GEN_SECONDS = 90;
  const GEN_SAFETY_TIMEOUT_MS = 5 * 60 * 1000; // hard stop after 5 min

  const [schedDate, setSchedDate] = useState(new Date().toISOString().slice(0, 10));
  const [schedHour, setSchedHour] = useState('10');
  const [schedAmpm, setSchedAmpm] = useState('AM');

  // Tick the local clock every 500ms while generating so the elapsed/remaining counter updates
  useEffect(() => {
    if (!generating) return;
    setNowMs(Date.now());
    const i = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(i);
  }, [generating]);

  // Poll Supabase every 3s while generating — picks up n8n's writes to image variants & captions
  useEffect(() => {
    if (!generating) return;
    const i = setInterval(() => { refresh(); }, 3000);
    return () => clearInterval(i);
  }, [generating, refresh]);

  // While any platform is mid-regenerate, tick a clock + poll Supabase every 3s for fresh captions.
  // Expired entries are swept out on each tick so the blur clears automatically after 30s.
  useEffect(() => {
    const anyActive = Object.values(regenCaptionUntil).some(t => t > Date.now()) || regenImageUntilMs > Date.now();
    if (!anyActive) return;
    const tickI = setInterval(() => {
      const now = Date.now();
      setRegenNowMs(now);
      setRegenCaptionUntil(prev => {
        let changed = false;
        const next = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v > now) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
      setRegenImageUntilMs(prev => prev > now ? prev : 0);
    }, 500);
    const pollI = setInterval(() => { refresh(); }, 3000);
    return () => { clearInterval(tickI); clearInterval(pollI); };
  }, [regenCaptionUntil, regenImageUntilMs, refresh]);

  // Hard timeout — if we're still generating after the safety cap, give up
  useEffect(() => {
    if (!generating || !genStartedAt) return;
    const t = setTimeout(() => {
      setGenerating(false);
      setPendingPostId(null);
      toast.error('Generation timed out — refresh to check status');
    }, GEN_SAFETY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [generating, genStartedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Has the campaign finished generating? Need image (variants for observance/collage, sources for
  // event) AND a caption for every selected platform.
  const isReady = (c) => {
    if (!c) return false;
    const imageReady = c.post_type === 'event'
      ? Array.isArray(c.source_image_urls) && c.source_image_urls.length > 0
      : Array.isArray(c.generated_image_variants) && c.generated_image_variants.length > 0;
    const ps = Array.isArray(c.platforms_selected) ? c.platforms_selected : [];
    const captionsReady = ps.length > 0 && ps.every(p => !!c[`${p}_caption`]);
    return imageReady && captionsReady;
  };

  // Reconciliation effect — runs whenever campaigns refresh while we're generating.
  // 1. If the pending row hasn't appeared yet, do nothing (keep polling).
  // 2. Once it appears, switch the URL/state to that post so the user sees live updates.
  // 3. Once the campaign is fully populated (image + captions), exit generating mode.
  useEffect(() => {
    if (!generating) return;
    if (pendingPostId) {
      const row = campaigns.find(c => c.post_id === pendingPostId);
      if (!row) return;
      if (initialRecordId !== pendingPostId) {
        onNavigate?.('post-creator', pendingPostId);
        // Don't clear pendingPostId yet — wait for full readiness on next tick
        return;
      }
      // We're viewing the row now — check if it's fully baked
      if (isReady(row)) {
        setGenerating(false);
        setPendingPostId(null);
        setGenStartedAt(null);
        toast.success('Content ready!');
      }
    } else if (campaign && isReady(campaign)) {
      // Edge case: generating became true on an existing campaign (e.g. image regen) and it's now ready
      setGenerating(false);
      setGenStartedAt(null);
    }
  }, [campaigns, pendingPostId, generating, campaign, initialRecordId, onNavigate]);

  /* ------- Publishing overlay (Post Now / Schedule) ------- */

  // Tick the clock so the elapsed counter on the publishing overlay updates
  useEffect(() => {
    if (!publishingState) return;
    setPublishingNowMs(Date.now());
    const i = setInterval(() => setPublishingNowMs(Date.now()), 500);
    return () => clearInterval(i);
  }, [publishingState]);

  // Poll Supabase every 3s while waiting for the platform status to flip
  useEffect(() => {
    if (!publishingState) return;
    const i = setInterval(() => { refresh(); }, 3000);
    return () => clearInterval(i);
  }, [publishingState, refresh]);

  // Auto-close after 20s and redirect to pipeline
  useEffect(() => {
    if (!publishingState) return;
    const t = setTimeout(() => {
      setPublishingState(null);
      onNavigate('schedule');
    }, 20 * 1000);
    return () => clearTimeout(t);
  }, [publishingState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch for the target status to land in Supabase, then close the overlay
  useEffect(() => {
    if (!publishingState || !campaign) return;
    const current = campaign[`${publishingState.platform}_published_status`];
    const target = publishingState.action === 'post' ? 'posted' : 'scheduled';
    if (current === target) {
      const lbl = PLATFORM_META[publishingState.platform]?.label || publishingState.platform;
      toast.success(publishingState.action === 'post' ? `Posted to ${lbl}!` : `Scheduled on ${lbl}`);
      setPublishingState(null);
    }
  }, [campaigns, publishingState, campaign]);

  /* ---------------------------------------------------------- */

  const handleForge = async () => {
    if (!form.eventName.trim()) { toast.error('Add an Occasion / Event Name first'); return; }
    if ((form.postType === 'event' || form.postType === 'collage') && form.sourceImages.length === 0) {
      toast.error(`${form.postType === 'event' ? 'Event' : 'Collage'} needs at least one image`);
      return;
    }
    if (platforms.length === 0) { toast.error('Pick at least one platform'); return; }

    // Block if any images are still uploading or failed
    const stillUploading = form.sourceImages.filter(i => i.status === 'uploading').length;
    const failed = form.sourceImages.filter(i => i.status === 'failed').length;
    if (stillUploading > 0) { toast.error(`Wait — ${stillUploading} image${stillUploading === 1 ? '' : 's'} still uploading`); return; }
    if (failed > 0) { toast.error(`${failed} image${failed === 1 ? '' : 's'} failed to upload — retry or remove`); return; }

    setBusy('forge');
    setGenerating(true);
    setGenStartedAt(Date.now());
    // Snap the page to the top instantly (no smooth animation) so it doesn't race with the
    // body-scroll-lock applied by the overlay. When the overlay closes the user lands at the
    // top of the freshly-generated post.
    window.scrollTo(0, 0);

    try {
      // 1. Source URLs are already on ImageKit (uploaded on drop). Just collect them.
      const sourceUrls = form.sourceImages
        .filter(i => (i.status === 'ready' || !i.status) && i.url && !i.url.startsWith('blob:'))
        .map(i => i.url);

      // 2. Generate the post_id client-side
      const post_id = genPostId();

      // 3. Fire webhook — keys match Supabase columns
      await createCampaign({
        post_id,
        event_name: form.eventName.trim(),
        event_date: form.date,
        post_type: form.postType,
        caption_style: form.captionStyle,
        user_image_prompt: normalizePrompt(form.imagePrompt),
        platforms_selected: platforms,
        source_image_urls: sourceUrls,
        caption_prompts: normalizePrompt(form.captionPrompt)
      });

      // 4. Hand off to the polling effects above — they refresh every 3s and exit when the
      //    campaign row exists AND every selected platform has its caption + image written.
      toast.success('Workflow started — generating content…');
      setPendingPostId(post_id);
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Failed to start workflow');
      setGenerating(false);
      setGenStartedAt(null);
      setPendingPostId(null);
    } finally {
      setBusy(null);
    }
  };

  const handleRegenerateImage = () => {
    if (!campaign) return;
    // Pop the modal so the user can review/edit the previous Image Personal Touch
    // before firing the regenerate webhook.
    setRegenImageModalOpen(true);
  };

  const handleConfirmRegenerateImage = async (editedPrompt) => {
    if (!campaign) return;
    setBusy('image');
    setForm(f => ({ ...f, imagePrompt: editedPrompt }));
    setRegenImageUntilMs(Date.now() + 60000);
    setRegenNowMs(Date.now());
    try {
      await regenerateImage(campaign.post_id, normalizePrompt(editedPrompt));
      toast.success('Regenerating image…');
      setRegenImageModalOpen(false);
      await refresh();
    } catch (e) {
      toast.error(e.message);
      setRegenImageUntilMs(0);
    }
    finally { setBusy(null); }
  };

  const handleRegenerateVariants = async () => {
    if (!campaign) return;
    setBusy('variants');
    try {
      await regenerateVariants(campaign.post_id, normalizePrompt(form.imagePrompt));
      toast.success('Regenerating variants…');
      await refresh();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleRegenerateCaption = async (platform = activePlatform, promptOverride) => {
    if (!campaign) return;
    setBusy(`caption-${platform}`);
    setApprovalDirty(prev => ({ ...prev, [platform]: true }));
    // Open a 30s blur+poll window on this platform's caption card. The effect above will
    // refresh() every 3s during the window and auto-clear the entry when it expires.
    setRegenCaptionUntil(prev => ({ ...prev, [platform]: Date.now() + 30000 }));
    setRegenNowMs(Date.now());
    try {
      await regenerateCaption(campaign.post_id, platform, normalizePrompt(promptOverride ?? form.captionPrompt));
      toast.success(`Regenerating ${PLATFORM_META[platform]?.label} caption…`);
      setRegenCaptionConfirmPlatform(null);
      await refresh();
    } catch (e) {
      toast.error(e.message);
      // Webhook failed — drop the window immediately so the card unblurs.
      setRegenCaptionUntil(prev => {
        const next = { ...prev };
        delete next[platform];
        return next;
      });
    }
    finally { setBusy(null); }
  };

  const handleSaveCaption = async (newText, platform = activePlatform) => {
    if (!campaign) {
      // No campaign yet — local-only edit
      setForm(f => ({ ...f, captionOverrides: { ...f.captionOverrides, [platform]: newText } }));
      return;
    }
    setBusy(`save-${platform}`);
    setApprovalDirty(prev => ({ ...prev, [platform]: true }));
    try {
      await saveCaptionEdit(campaign.post_id, platform, newText);
      toast.success('Caption saved');
      await refresh();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleApprove = async (platform = activePlatform) => {
    if (!campaign) return;
    setBusy(`approve-${platform}`);
    try {
      await approvePlatform(campaign.post_id, platform);
      setApprovalDirty(prev => ({ ...prev, [platform]: false }));
      toast.success(`${PLATFORM_META[platform]?.label} approved`);
      await refresh();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleReject = async (platform = activePlatform) => {
    if (!campaign) return;
    setBusy(`reject-${platform}`);
    try {
      await rejectPlatform(campaign.post_id, platform);
      toast.success(`${PLATFORM_META[platform]?.label} rejected`);
      await refresh();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handlePostNow = async (platform = activePlatform) => {
    if (!campaign) return;
    setBusy(`post-${platform}`);
    setPublishingState({ platform, action: 'post', startedAt: Date.now() });
    window.scrollTo(0, 0);
    try {
      // Send the picker time as scheduled_at — same logic as handleSchedule — so both
      // buttons emit a consistent payload shape and n8n can read one field for either action.
      let h = parseInt(schedHour, 10) || 0;
      if (schedAmpm === 'PM' && h < 12) h += 12;
      if (schedAmpm === 'AM' && h === 12) h = 0;
      const dt = new Date(schedDate);
      dt.setHours(h, 0, 0, 0);
      const scheduled_at = dt.toISOString();
      await postNow(campaign.post_id, platform, scheduled_at);
      toast.success(`Posting to ${PLATFORM_META[platform]?.label}…`);
      await refresh();
      // Polling effect now watches campaign[`${platform}_published_status`] for 'posted'
      // and clears publishingState when it lands. No further action needed here.
    } catch (e) {
      toast.error(e.message);
      setPublishingState(null);
    }
    finally { setBusy(null); }
  };

  const handleSchedule = async (platform = activePlatform, scheduled_at = null) => {
    if (!campaign) return;
    if (!scheduled_at) {
      let h = parseInt(schedHour, 10) || 0;
      if (schedAmpm === 'PM' && h < 12) h += 12;
      if (schedAmpm === 'AM' && h === 12) h = 0;
      const dt = new Date(schedDate);
      dt.setHours(h, 0, 0, 0);
      scheduled_at = dt.toISOString();
    }
    setBusy(`schedule-${platform}`);
    setPublishingState({ platform, action: 'schedule', startedAt: Date.now() });
    window.scrollTo(0, 0);
    try {
      await schedulePlatform(campaign.post_id, platform, scheduled_at);
      toast.success(`Scheduled on ${PLATFORM_META[platform]?.label}`);
      await refresh();
    } catch (e) {
      toast.error(e.message);
      setPublishingState(null);
    }
    finally { setBusy(null); }
  };

  // True when the campaign exists AND no platform has shipped (no `_published_status === 'posted'`).
  // Used to gate the delete UI — a posted campaign should not be removable from the dashboard.
  const canDelete = !!campaign && !platforms.some(p => campaign?.[`${p}_published_status`] === 'posted');

  const handleDelete = async () => {
    if (!campaign || !canDelete) return;
    setBusy('delete');
    try {
      await deleteCampaign(campaign.post_id, campaign.event_name || null, platforms);
      toast.success(`Deleted "${campaign.event_name || 'campaign'}"`);
      await refresh();
      setDeleteModalOpen(false);
      // Leave the page — the row is gone, so nothing here to edit anymore.
      onClose?.();
    } catch (e) {
      toast.error(e.message || 'Failed to delete campaign');
    } finally {
      setBusy(null);
    }
  };

  /* ---------- /Action wiring ---------- */

  // For new post (no campaign) with no platforms — bounce back
  useEffect(() => {
    if (!isEditing && platforms.length === 0) {
      onClose?.();
    }
  }, [isEditing, platforms.length, onClose]);

  // Derived UI for the Generating overlay — elapsed seconds, remaining, and step label
  const elapsedSeconds = generating && genStartedAt
    ? Math.floor((nowMs - genStartedAt) / 1000)
    : 0;
  const remainingSeconds = Math.max(0, ESTIMATED_GEN_SECONDS - elapsedSeconds);
  const progressPct = Math.min(100, (elapsedSeconds / ESTIMATED_GEN_SECONDS) * 100);

  // Live status — derived from what's in the campaign row right now
  const generationStatus = (() => {
    if (!generating) return null;
    const row = pendingPostId ? campaigns.find(c => c.post_id === pendingPostId) : campaign;
    if (!row) return 'Creating campaign in Supabase…';
    const imageReady = row.post_type === 'event'
      ? (row.source_image_urls?.length > 0)
      : (row.generated_image_variants?.length > 0);
    const ps = row.platforms_selected || [];
    const captionsDone = ps.filter(p => !!row[`${p}_caption`]).length;
    if (!imageReady) return 'Generating image…';
    if (captionsDone < ps.length) return `Writing captions… (${captionsDone}/${ps.length})`;
    return 'Finalising…';
  })();

  return (
    <>
      <header className="sticky top-0 z-20 glass border-b border-cream-300/60">
        <div className="px-4 lg:px-10 h-16 flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-full h-10 w-10 bg-white border border-cream-300 flex items-center justify-center text-ink-700 hover:bg-cream-100 transition-all"
            aria-label="Back"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <PlatformChipStrip platforms={platforms} campaign={campaign} />

          <div className="flex-1" />

          {canDelete && (
            <button
              onClick={() => setDeleteModalOpen(true)}
              className="rounded-full h-10 w-10 bg-white border border-cream-300 flex items-center justify-center text-ink-700 hover:bg-red-50 hover:text-brand-700 hover:border-red-200 transition-all"
              aria-label="Delete campaign"
              title="Delete this campaign"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          <button
            onClick={onClose}
            className="rounded-full h-10 w-10 bg-white border border-cream-300 flex items-center justify-center text-ink-700 hover:bg-cream-100 transition-all"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <main className="px-4 lg:px-10 py-6 lg:py-8 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 min-w-0">
          {/* LEFT — shared inputs + per-tab content */}
          <div className="space-y-6 stagger min-w-0">
            <div className="rounded-xl border border-cream-300/60 bg-brand-50 px-4 py-3 text-sm text-ink-700 flex items-start gap-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4 mt-0.5 shrink-0 text-brand-600" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" strokeLinejoin="round" />
              </svg>
              <div>
                <strong className="text-ink-900">One image, per-platform captions.</strong> Create Content generates a single visual shared across all {platforms.length || ''} selected platforms, plus a tailored caption for each. Switch tabs to review or override each platform's caption.
              </div>
            </div>

            {/* Shared section */}
            <Section title="Occasion / Event Name" className="!bg-[#cde8da]">
              <input
                value={form.eventName}
                onChange={set('eventName')}
                disabled={readOnly}
                readOnly={readOnly}
                placeholder="Occasion / Event Name…"
                className="input text-lg lg:text-xl h-display font-bold placeholder:text-ink-900/30"
              />
              <div className="mt-3 flex items-center gap-3">
                <Field label="Date" className="w-full sm:w-44">
                  <input type="date" value={form.date} onChange={set('date')} disabled={readOnly} readOnly={readOnly} className="input" />
                </Field>
              </div>
            </Section>

            <Section title="Post Type" tint>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {POST_TYPES.map((t) => {
                  const active = form.postType === t;
                  return (
                    <button
                      key={t}
                      onClick={() => !readOnly && setForm(f => ({ ...f, postType: t }))}
                      disabled={readOnly}
                      className={[
                        'relative rounded-xl border px-4 py-3 text-left overflow-hidden min-h-[70px] transition-all',
                        active
                          ? 'bg-gradient-to-br from-brand-100 to-brand-50 border-brand-300 text-brand-700 shadow-glow'
                          : 'bg-white border-cream-300/60 text-ink-700 hover:border-brand-200',
                        readOnly ? 'cursor-default' : 'cursor-pointer'
                      ].join(' ')}
                    >
                      {active && (
                        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-brand-700 animate-pulse-soft" />
                      )}
                      <div className="font-semibold flex items-center gap-2">
                        <PostTypeIcon type={t} />
                        {POST_TYPE_LABELS[t]}
                      </div>
                      <div className="text-[10px] lg:text-xs text-ink-500 mt-1 uppercase tracking-tight">
                        {t === 'observance' && 'AI-GENERATED VISUAL'}
                        {t === 'event' && '1–5 IMAGE '}
                        {t === 'collage' && '1–5 IMAGE '}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Image Links uploader — only for event / collage */}
              {(form.postType === 'event' || form.postType === 'collage') && (
                <ImageLinksUploader
                  images={form.sourceImages}
                  onChange={(nextOrFn) => setForm(f => ({
                    ...f,
                    sourceImages: typeof nextOrFn === 'function' ? nextOrFn(f.sourceImages) : nextOrFn
                  }))}
                  max={5}
                  disabled={readOnly}
                />
              )}

              {/* Image personal touch — observance only (collage/event use user-supplied images,
                  so the AI-image hint doesn't apply). */}
              {form.postType === 'observance' && (
                <div className="mt-5 rounded-xl bg-gradient-to-br from-cream-100 to-cream-50 border border-cream-300/60 p-4">
                  <Field label="Image Personal Touch (optional)" hint="Notes that shape the visual — mood, brand colors, composition, lighting.">
                    <textarea
                      rows={2}
                      value={form.imagePrompt}
                      onChange={set('imagePrompt')}
                      disabled={readOnly}
                      readOnly={readOnly}
                      placeholder="Mood, brand colors, style…"
                      className="input text-sm"
                    />
                  </Field>
                </div>
              )}

            </Section>

            {form.postType !== 'event' && (
              <ImageWorkbench
                campaign={campaign}
                postType={form.postType}
                readOnly={readOnly}
                variantIdx={variantIdx}
                onSelectVariant={handleSelectVariant}
                onRegenerateImage={isEditing && form.postType === 'observance' ? handleRegenerateImage : null}
                onRegenerateVariants={null}
                busy={busy}
                locked={isEditing && platforms.some(p => campaign?.[`${p}_published_status`] === 'posted')}
                regenUntilMs={regenImageUntilMs}
                nowMs={regenNowMs}
                regenCount={campaign?.generated_image_variants?.length ?? 0}
                regenMax={10}
              />
            )}

            {/* Shared Caption Style — applies to all selected platforms */}
            {platforms.length > 0 && (
              <Section title="Caption Style" subtitle="Shared style — Create Content uses this base for every platform" tint>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CAPTION_STYLES.map((s) => {
                    const active = form.captionStyle === s;
                    return (
                      <button
                        key={s}
                        onClick={() => !readOnly && setForm(f => ({ ...f, captionStyle: s }))}
                        disabled={readOnly}
                        className={[
                          'rounded-lg border px-3 py-2.5 text-sm transition-all',
                          active
                            ? 'bg-gradient-to-br from-brand-100 to-brand-50 border-brand-300 text-brand-700 font-semibold shadow-soft'
                            : 'bg-white border-cream-300/60 text-ink-700 hover:border-brand-200 hover:-translate-y-0.5',
                          readOnly ? 'cursor-default' : 'cursor-pointer'
                        ].join(' ')}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>

                {/* Caption personal touch — single brief shared across ALL platforms */}
                <div className="mt-5 rounded-xl bg-gradient-to-br from-cream-100 to-cream-50 border border-cream-300/60 p-4">
                  <Field label="Caption Personal Touch (optional)" hint="A single brief applied to every platform's caption — tone, key phrases, hashtags, mentions, calls-to-action.">
                    <textarea
                      rows={2}
                      value={form.captionPrompt}
                      onChange={set('captionPrompt')}
                      disabled={readOnly}
                      readOnly={readOnly}
                      placeholder="Tone, key phrases, hashtags, mentions…"
                      className="input text-sm"
                    />
                  </Field>
                </div>
              </Section>
            )}

            {/* Per-platform caption cards (one row per selected platform) */}
            {isEditing && platforms.length > 0 && (
              <section className="card p-6">
                <div className="mb-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-ink-500 font-bold">Captions</div>
                  <div className="text-xs text-ink-500 mt-1">One row per platform · review, regenerate, edit or accept</div>
                </div>
                <div className="space-y-4">
                  {platforms.map(pid => (
                    <PlatformCaptionCard
                      key={pid}
                      platform={pid}
                      campaign={campaign}
                      form={form}
                      setForm={setForm}
                      editingPlatform={editingPlatform}
                      setEditingPlatform={setEditingPlatform}
                      draftEdit={draftEdit}
                      setDraftEdit={setDraftEdit}
                      busy={busy}
                      onRegenerate={(p) => setRegenCaptionConfirmPlatform(p)}
                      onSaveEdit={(text, p) => handleSaveCaption(text, p)}
                      onApprove={(p) => handleApprove(p)}
                      approvalDirty={!!approvalDirty[pid]}
                      regenUntilMs={regenCaptionUntil[pid] || 0}
                      nowMs={regenNowMs}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Empty state when composing a new post — captions will populate after Create Content */}
            {!isEditing && platforms.length > 0 && (
              <section className="card p-6 border-dashed border-2 border-cream-300/60 bg-cream-50">
                <div className="text-center py-8">
                  <div className="font-bold text-ink-900">Captions appear after Create Content</div>
                  <div className="text-sm text-ink-500 mt-1.5 max-w-md mx-auto">
                    Once you hit <strong>Create Content</strong>, one tailored caption per selected platform will land here — each with its own Approve / Regenerate / Edit controls.
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    {platforms.map(pid => (
                      <span key={pid} className="rounded-full bg-white border border-cream-300 px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-2"
                        style={{ color: PLATFORM_META[pid].color }}>
                        <PlatformGlyph platform={pid} className="h-3.5 w-3.5" />
                        {PLATFORM_META[pid].label}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Create Content CTA — only when composing a new post */}
            {!isEditing && (
              <div className="rounded-2xl overflow-hidden border border-brand-300 shadow-glow">
                <div className="bg-brand-gradient text-white px-6 py-5 flex items-center justify-between gap-6 flex-wrap">
                  <div>
                    <h3 className="h-display text-2xl">Generate Content</h3>
                    <p className="text-sm text-brand-100/95 mt-1">
                      {generating
                        ? 'Workflow running — image and captions on the way…'
                        : `Generate one image + ${platforms.length} caption${platforms.length === 1 ? '' : 's'} in parallel.`}
                    </p>
                  </div>
                  <button
                    onClick={handleForge}
                    disabled={busy === 'forge' || generating}
                    className="bg-white text-brand-700 px-6 py-3 rounded-xl font-semibold inline-flex items-center gap-2 hover:bg-cream-100 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  >
                    {busy === 'forge' || generating ? <Spinner /> : <SparkleIcon />}
                    {generating ? 'Running workflow…' : 'Create Content'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — preview + schedule */}
          <aside className="space-y-5 stagger">
            {platforms.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-ink-500 mr-1">Preview:</span>
                  {platforms.map(pid => {
                    const m = PLATFORM_META[pid];
                    const active = activePlatform === pid;
                    return (
                      <button
                        key={pid}
                        onClick={() => setActivePlatform(pid)}
                        style={active ? { background: m.color, color: '#fff', borderColor: m.color } : { color: m.color }}
                        className={[
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all',
                          active ? 'shadow-soft' : 'bg-white border-cream-300/60 hover:border-current'
                        ].join(' ')}
                      >
                        <PlatformGlyph platform={pid} className="h-3 w-3" />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
                <PreviewSwitcher
                  platform={activePlatform}
                  caption={form.captionOverrides[activePlatform] ?? caption}
                  images={images}
                  eventName={form.eventName}
                />
                <button
                  type="button"
                  onClick={() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    setPreviewModalOpen(true);
                  }}
                  className="w-full btn-ghost text-xs px-3 py-2 inline-flex items-center justify-center gap-1.5 hover:border-brand-300 hover:text-brand-700"
                >
                  <ExpandIcon /> Preview Post
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-cream-300 bg-white p-8 text-center text-sm text-ink-500">
                Pick at least one platform.
              </div>
            )}

            {!isEditing && (
              <button
                onClick={handleForge}
                disabled={busy === 'forge' || generating}
                className="w-full rounded-2xl bg-brand-gradient text-white font-bold px-5 py-3.5 inline-flex items-center justify-center gap-2.5 shadow-glow hover:shadow-lift transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {busy === 'forge' || generating ? <Spinner /> : <SparkleIcon />}
                <span className="text-base">{generating ? 'Running workflow…' : 'Create Content'}</span>
              </button>
            )}

            <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-cream-50 border border-blue-100 p-5">
              <div className="flex items-center gap-2 text-accent-blue font-semibold">
                <span className="h-7 w-7 rounded-lg bg-accent-blue text-white flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                Schedule Post
              </div>
              <p className="text-xs text-ink-700 mt-2">
                {!isEditing
                  ? 'Run Generate Content first, then publish or schedule from here.'
                  : published === 'posted'
                    ? `${activeMeta?.label || 'This platform'} has already been published — Post Now and Schedule are locked.`
                    : `Publish now or pick a date + time to schedule on ${activeMeta?.label || 'the active platform'}.`}
              </p>

              {published === 'posted' && postedAt && (
                <div className="mt-3 rounded-lg bg-green-50 border border-green-100 px-3 py-2 text-[11px] text-accent-green flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Posted <strong>{new Date(postedAt).toLocaleString()}</strong></span>
                </div>
              )}

              {/* Post Now — ships the active platform immediately */}
              <button
                onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setPublishConfirm({ action: 'post', platform: activePlatform }); }}
                disabled={!isEditing || !caption || busy === `post-${activePlatform}` || published === 'posted'}
                className="mt-4 w-full bg-gradient-to-r from-accent-blue to-blue-500 hover:from-blue-600 hover:to-blue-500 text-white font-bold rounded-lg px-4 py-2.5 inline-flex items-center justify-center gap-2 transition-all shadow-soft hover:shadow-lift disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:bg-gradient-to-r disabled:from-cream-300 disabled:to-cream-300 disabled:text-ink-500"
              >
                {busy === `post-${activePlatform}` ? <Spinner /> : <SendIcon />}
                {published === 'posted' ? 'Already Posted' : 'Post Now'}
              </button>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                  disabled={!isEditing || published === 'posted'}
                  className="input flex-1 min-w-[140px]"
                />
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={schedHour}
                      onChange={(e) => setSchedHour(e.target.value)}
                      disabled={!isEditing || published === 'posted'}
                      className="input appearance-none w-20 pr-8 text-center tabular-nums font-semibold cursor-pointer"
                    >
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
                      ))}
                    </select>
                    <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-500" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="relative">
                    <select
                      value={schedAmpm}
                      onChange={(e) => setSchedAmpm(e.target.value)}
                      disabled={!isEditing || published === 'posted'}
                      className="input appearance-none w-20 pr-8 text-center font-bold cursor-pointer"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                    <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-500" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </div>

              <button
                onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setPublishConfirm({ action: 'schedule', platform: activePlatform }); }}
                disabled={!isEditing || !caption || busy === `schedule-${activePlatform}` || published === 'posted'}
                className="mt-3 w-full btn-ghost border-blue-200 text-accent-blue font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:border-cream-300 disabled:text-ink-500"
              >
                {busy === `schedule-${activePlatform}` ? <Spinner /> : <ClockIcon />}
                {published === 'posted' ? 'Already Posted' : `Schedule on ${activeMeta?.label || 'platform'}`}
              </button>
            </div>
          </aside>
        </div>
      </main>

      {generating && (
        <GeneratingOverlay
          elapsed={elapsedSeconds}
          remaining={remainingSeconds}
          estimated={ESTIMATED_GEN_SECONDS}
          pct={progressPct}
          status={generationStatus}
          onClose={() => {
            // Close the overlay; polling effects stop on their own when `generating` flips false.
            // The campaign row keeps being written by n8n in the background — the user can
            // refresh the dashboard / Schedule page later to see the finished post.
            setGenerating(false);
            setGenStartedAt(null);
            setPendingPostId(null);
            toast.success('Continuing in background — the post will appear once ready.');
          }}
        />
      )}

      {previewModalOpen && (
        <PreviewModal
          platform={activePlatform}
          caption={form.captionOverrides[activePlatform] ?? caption}
          images={images}
          eventName={form.eventName}
          onClose={() => setPreviewModalOpen(false)}
        />
      )}

      {deleteModalOpen && (
        <DeleteConfirmModal
          subject={campaign?.event_name || '(untitled campaign)'}
          description="This will remove the campaign row from Supabase. The image, captions, scheduled times, and all platform data are erased. This can't be undone."
          confirmLabel="Delete post"
          busy={busy === 'delete'}
          onConfirm={handleDelete}
          onClose={() => busy !== 'delete' && setDeleteModalOpen(false)}
        />
      )}

      {regenImageModalOpen && (
        <RegenerateImagePromptModal
          initialPrompt={form.imagePrompt}
          busy={busy === 'image'}
          onConfirm={handleConfirmRegenerateImage}
          onClose={() => busy !== 'image' && setRegenImageModalOpen(false)}
        />
      )}

      {regenCaptionConfirmPlatform && (
        <RegenerateCaptionModal
          platform={regenCaptionConfirmPlatform}
          initialPrompt={form.captionPrompt}
          busy={busy === `caption-${regenCaptionConfirmPlatform}`}
          onConfirm={(editedPrompt) => {
            setForm(f => ({ ...f, captionPrompt: editedPrompt }));
            handleRegenerateCaption(regenCaptionConfirmPlatform, editedPrompt);
          }}
          onClose={() => { if (busy !== `caption-${regenCaptionConfirmPlatform}`) setRegenCaptionConfirmPlatform(null); }}
        />
      )}

      {publishConfirm && (() => {
        const { action, platform } = publishConfirm;
        const meta = PLATFORM_META[platform];
        const isPost = action === 'post';
        const busyKey = isPost ? `post-${platform}` : `schedule-${platform}`;
        let schedLabel = '';
        if (!isPost) {
          let h = parseInt(schedHour, 10) || 0;
          if (schedAmpm === 'PM' && h < 12) h += 12;
          if (schedAmpm === 'AM' && h === 12) h = 0;
          schedLabel = `${schedDate} at ${String(h).padStart(2, '0')}:00 ${schedAmpm}`;
        }
        const isBusy = busy === busyKey;
        return (
          <div
            className="fixed inset-0 z-50 bg-ink-900/55 backdrop-blur-sm overflow-y-auto animate-fade-in"
            onClick={() => !isBusy && setPublishConfirm(null)}
          >
            <div className="min-h-screen flex items-center justify-center p-4">
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-cream-200 overflow-hidden animate-fade-up"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className={`px-6 pt-6 pb-4 flex items-start gap-4`}>
                <div className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${isPost ? 'bg-blue-50 text-accent-blue' : 'bg-brand-50 text-brand-700'}`}>
                  {isPost
                    ? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round"/></svg>
                  }
                </div>
                <div>
                  <h3 className="h-display text-base text-ink-900">
                    {isPost ? `Post to ${meta?.label}?` : `Schedule on ${meta?.label}?`}
                  </h3>
                  <p className="text-sm text-ink-500 mt-1">
                    {isPost
                      ? `This will immediately publish to ${meta?.label}. This cannot be undone.`
                      : `Post will be scheduled for ${schedLabel}.`}
                  </p>
                </div>
              </div>

              {/* Platform pill */}
              <div className="px-6 pb-4">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cream-50 border border-cream-200">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: meta?.color }} />
                  <span className="text-xs font-semibold text-ink-700">{meta?.label}</span>
                  <span className="text-xs text-ink-400 ml-auto">{form.eventName || 'Untitled post'}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 pb-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => !isBusy && setPublishConfirm(null)}
                  disabled={isBusy}
                  className="btn-ghost text-sm px-4 py-2 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    setPublishConfirm(null);
                    if (isPost) handlePostNow(platform);
                    else handleSchedule(platform);
                  }}
                  className={`inline-flex items-center gap-2 font-bold rounded-xl px-5 py-2.5 text-sm text-white transition-all shadow-soft disabled:opacity-60 disabled:cursor-not-allowed ${isPost ? 'bg-gradient-to-r from-accent-blue to-blue-500 hover:from-blue-600 hover:to-blue-500' : 'bg-brand-gradient hover:opacity-90'}`}
                >
                  {isBusy && <Spinner />}
                  {isPost ? 'Post Now' : 'Schedule Post'}
                </button>
              </div>
            </div>
            </div>
          </div>
        );
      })()}

      {publishingState && (
        <PublishingOverlay
          platform={publishingState.platform}
          action={publishingState.action}
          elapsed={Math.floor((publishingNowMs - publishingState.startedAt) / 1000)}
        />
      )}
    </>
  );
}

function PublishingOverlay({ platform, action, elapsed }) {
  const meta = PLATFORM_META[platform] || { label: platform, color: '#14b8a6' };
  const title = action === 'post'
    ? `Publishing to ${meta.label}`
    : `Scheduling on ${meta.label}`;
  const sub = action === 'post'
    ? 'Sending to the platform and waiting for confirmation from n8n…'
    : 'Queueing your post and waiting for Supabase to reflect the scheduled time…';
  const waitingFor = action === 'post' ? 'posted' : 'scheduled';

  // Lock body scroll while the overlay is up, matching GeneratingOverlay behavior.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/55 backdrop-blur-sm overflow-y-auto animate-fade-in">
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-7 max-w-md w-full text-center border border-cream-200 my-4">
          <div
            className="h-20 w-20 rounded-full mx-auto flex items-center justify-center mb-5 shadow-glow"
            style={{ background: meta.color }}
          >
            <Spinner className="h-8 w-8 text-white" />
          </div>

          <h2 className="h-display text-2xl text-ink-900">{title}</h2>
          <p className="text-sm text-ink-600 mt-2">{sub}</p>

          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-cream-100 px-4 py-2 text-xs font-semibold text-ink-700">
            <span className="h-1.5 w-1.5 rounded-full animate-pulse-soft" style={{ background: meta.color }} />
            Waiting for status: <code className="font-mono text-ink-900">{waitingFor}</code>
          </div>

          <div className="mt-4 text-xs text-ink-500 tabular-nums">
            <strong className="text-ink-900">{elapsed}s</strong> elapsed
          </div>

          {/* <p className="text-[11px] text-ink-500 mt-5">
            This overlay closes automatically as soon as Supabase shows <code className="font-mono">{platform}_published_status = '{waitingFor}'</code>.
          </p> */}
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ platform, caption, images, eventName, onClose }) {
  const meta = PLATFORM_META[platform];

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-900/55 backdrop-blur-sm flex items-start justify-center p-4 pt-8 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[450px] max-h-[92vh] border border-cream-200 animate-fade-up flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 flex items-center justify-between gap-3 border-b border-cream-200 shrink-0">
          <h3 className="h-display text-base text-ink-900">
            {meta?.label || 'Preview'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-cream-100 hover:bg-cream-200 text-ink-700 flex items-center justify-center transition-all"
            aria-label="Close preview"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="p-3 overflow-y-auto flex-1 scrollbar-none min-h-0">
          <PreviewSwitcher
            platform={platform}
            caption={caption}
            images={images}
            eventName={eventName}
          />
        </div>
      </div>
    </div>
  );
}

function GeneratingOverlay({ elapsed, remaining, estimated, pct, status, onClose }) {
  // Lock the body scroll so the page can't scroll behind the overlay; restore on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Cap the elapsed display at the estimated time so we never show "1m 30s elapsed / 0s remaining" —
  // once we cross the expected window, switch to a "taking longer than expected" mode.
  const overran = elapsed >= estimated;
  const displayElapsed = Math.min(elapsed, estimated);

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/55 backdrop-blur-sm overflow-y-auto animate-fade-in">
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-3xl shadow-2xl p-7 max-w-md w-full text-center border border-cream-200 my-4">

        {/* Manual close (X) — always visible so the user can dismiss anytime */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Close — generation continues in the background"
            className="absolute top-3 right-3 h-9 w-9 rounded-full bg-cream-100 hover:bg-cream-200 text-ink-700 flex items-center justify-center transition-all"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
            </svg>
          </button>
        )}

        <div className="h-20 w-20 rounded-full bg-brand-gradient mx-auto flex items-center justify-center mb-5 shadow-glow">
          <Spinner className="h-8 w-8 text-white" />
        </div>

        <h2 className="h-display text-2xl text-ink-900">
          {overran ? 'Taking a little longer…' : 'Forging your content'}
        </h2>
        <p className="text-sm text-ink-600 mt-2">
          {overran
            ? 'The workflow is still running. You can close this and check back — the post will appear in your list once ready.'
            : `Generating image and per-platform captions. Usually completes in ~${estimated} seconds.`}
        </p>

        {/* Progress bar — caps at 100% */}
        <div className="mt-6 h-2.5 rounded-full bg-cream-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-snap ${overran ? 'bg-accent-amber' : 'bg-brand-gradient'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Elapsed / remaining — capped at estimated so we don't show negative numbers */}
        <div className="mt-3 flex items-center justify-between text-xs text-ink-700 tabular-nums">
          <span><strong className="text-ink-900">{displayElapsed}s</strong> elapsed</span>
          <span>
            {overran
              ? <strong className="text-accent-amber">Past expected window</strong>
              : <>~<strong className="text-ink-900">{remaining}s</strong> remaining</>
            }
          </span>
        </div>

        {/* Live step label */}
        {status && (
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-cream-100 px-4 py-2 text-xs font-semibold text-ink-700">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-600 animate-pulse-soft" />
            {status}
          </div>
        )}

        <p className="text-[11px] text-ink-500 mt-5">
          {overran
            ? 'It is safe to close this — the workflow keeps running on n8n and Supabase will update when finished.'
            : 'The page will update automatically as soon as Supabase reflects the new data — leave this open.'}
        </p>

        {/* Close button appears as a regular CTA once we are past the expected window */}
        {overran && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full btn-ghost text-xs px-3 py-2 inline-flex items-center justify-center gap-1.5 hover:border-brand-300 hover:text-brand-700"
          >
            Close and continue in background
          </button>
        )}
        </div>
      </div>
    </div>
  );
}

function ImageLinksUploader({ images = [], onChange, max = 5, disabled = false }) {
  const inputRef = React.useRef(null);
  const [drag, setDrag] = React.useState(false);

  // Track latest images via ref so async upload callbacks see fresh state.
  // onChange always receives an array (functional form is resolved here).
  const imagesRef = React.useRef(images);
  React.useEffect(() => { imagesRef.current = images; }, [images]);

  const update = (fn) => {
    const next = fn(imagesRef.current);
    imagesRef.current = next;
    onChange?.(next);
  };

  const startUpload = (item) => {
    import('../services/imagekit.js').then(({ uploadToImageKit }) => {
      uploadToImageKit(item.file, { folder: '/Post_Images' })
        .then((cdnUrl) => {
          update((current) => current.map(it => {
            if (it.id !== item.id) return it;
            if (it.url?.startsWith('blob:')) URL.revokeObjectURL(it.url);
            return { ...it, url: cdnUrl, status: 'ready', file: null };
          }));
        })
        .catch((err) => {
          console.error('[upload]', err);
          update((current) => current.map(it =>
            it.id === item.id ? { ...it, status: 'failed', error: err.message || 'Upload failed' } : it
          ));
        });
    });
  };

  const addFiles = (fileList) => {
    if (disabled) return;
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    const room = max - imagesRef.current.length;
    if (room <= 0) return;
    const newItems = files.slice(0, room).map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url: URL.createObjectURL(file),
      name: file.name,
      file,
      status: 'uploading'
    }));
    update((current) => [...current, ...newItems]);
    newItems.forEach(startUpload);
  };

  const retryUpload = (id) => {
    const target = imagesRef.current.find(i => i.id === id);
    if (!target?.file) return;
    update((current) => current.map(it =>
      it.id === id ? { ...it, status: 'uploading', error: null } : it
    ));
    startUpload(target);
  };

  const removeAt = (id) => {
    if (disabled) return;
    update((current) => {
      const removed = current.find(i => i.id === id);
      if (removed?.url?.startsWith('blob:')) URL.revokeObjectURL(removed.url);
      return current.filter(i => i.id !== id);
    });
  };

  const count = images.length;
  const atMax = count >= max;
  const uploading = images.filter(i => i.status === 'uploading').length;
  const failed    = images.filter(i => i.status === 'failed').length;
  const ready     = images.filter(i => i.status === 'ready' || !i.status).length; // legacy items without status treated as ready
  const valid = ready >= 1 && uploading === 0 && failed === 0;

  const onPick = () => { if (!disabled && !atMax) inputRef.current?.click(); };
  const onInput = (e) => { addFiles(e.target.files); e.target.value = ''; };
  const onDrop = (e) => { e.preventDefault(); e.stopPropagation(); setDrag(false); addFiles(e.dataTransfer.files); };
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); if (!drag) setDrag(true); };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDrag(false); };

  return (
    <div className="mt-5 rounded-xl bg-gradient-to-br from-cream-100 to-cream-50 border border-cream-300/60 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-500 font-bold">Image </div>
          <div className="text-xs text-ink-500 mt-1">Add 1 or more images (max {max})</div>
        </div>
        <button
          onClick={onPick}
          disabled={disabled || atMax}
          className="btn-ghost inline-flex items-center gap-2 text-xs uppercase tracking-wider font-bold border-cream-300 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <UploadIcon /> Explore
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        multiple
        className="hidden"
        onChange={onInput}
      />

      <div
        onClick={onPick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={[
          'relative border-2 border-dashed rounded-xl p-8 lg:p-10 flex flex-col items-center justify-center gap-3 text-center transition-all',
          disabled
            ? 'border-cream-300 bg-cream-100/50 cursor-not-allowed'
            : atMax
              ? 'border-cream-300 bg-cream-100/60 cursor-not-allowed'
              : drag
                ? 'border-brand-500 bg-brand-50 cursor-pointer'
                : 'border-cream-300 bg-white/70 hover:border-brand-300 hover:bg-brand-50/30 cursor-pointer'
        ].join(' ')}
      >
        <div className="h-12 w-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
          <UploadIcon className="h-5 w-5" />
        </div>
        <div className="font-bold text-ink-900">
          {atMax ? `Maximum ${max} images reached` : 'Drag & Drop images here'}
        </div>
        <div className="text-xs text-ink-500">PNG, JPG, WEBP (Max 5MB each)</div>
        {!atMax && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPick(); }}
            disabled={disabled}
            className="mt-1 btn-ghost text-brand-700 bg-white border-brand-200 hover:bg-brand-50 inline-flex items-center gap-2"
          >
            Explore Files
          </button>
        )}
      </div>

      {/* Validation chip */}
      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <div className={`text-xs inline-flex items-center gap-1.5 font-medium ${valid ? 'text-accent-green' : (uploading > 0 ? 'text-accent-blue' : (failed > 0 ? 'text-brand-700' : 'text-accent-amber'))}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${valid ? 'bg-accent-green' : (uploading > 0 ? 'bg-accent-blue animate-pulse-soft' : (failed > 0 ? 'bg-brand-700' : 'bg-accent-amber animate-pulse-soft'))}`} />
          {count === 0
            ? 'Need at least 1 image'
            : uploading > 0
              ? `Uploading ${uploading} image${uploading === 1 ? '' : 's'}…`
              : failed > 0
                ? `${failed} upload${failed === 1 ? '' : 's'} failed — retry or remove`
                : `${ready} of ${max} image${ready === 1 ? '' : 's'} ready`}
        </div>
      </div>

      {/* Thumbnail grid */}
      {images.length > 0 && (
        <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-3">
          {images.map((img) => {
            const isUploading = img.status === 'uploading';
            const isFailed    = img.status === 'failed';
            return (
              <div key={img.id} className="group relative aspect-square rounded-lg border border-cream-300/60 bg-white overflow-hidden shadow-sm animate-fade-in">
                <img
                  src={img.url}
                  alt={img.name || ''}
                  referrerPolicy="no-referrer"
                  className={`h-full w-full object-cover ${isUploading ? 'opacity-50' : ''}`}
                  onError={(e) => { e.target.style.opacity = 0.3; }}
                />

                {/* Uploading overlay */}
                {isUploading && (
                  <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-center gap-1 text-white">
                    <Spinner className="h-5 w-5" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Uploading…</span>
                  </div>
                )}

                {/* Failed overlay */}
                {isFailed && (
                  <div className="absolute inset-0 bg-red-900/55 flex flex-col items-center justify-center gap-1 text-white px-2 text-center">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h0" strokeLinecap="round" />
                    </svg>
                    <span className="text-[9px] font-bold uppercase tracking-wider">Upload failed</span>
                    <button
                      type="button"
                      onClick={() => retryUpload(img.id)}
                      className="mt-0.5 text-[10px] uppercase tracking-wider font-bold underline hover:no-underline"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Ready check */}
                {!isUploading && !isFailed && (
                  <span className="absolute bottom-1 left-1 h-5 w-5 rounded-full bg-accent-green/95 text-white flex items-center justify-center shadow">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}

                {/* Remove */}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeAt(img.id)}
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-opacity"
                    title="Remove"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlatformChipStrip({ platforms, campaign }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
      {platforms.map(pid => {
        const meta = PLATFORM_META[pid];
        const status = campaign ? campaign[`${pid}_published_status`] : null;
        return (
          <span
            key={pid}
            style={{ background: meta.color, color: '#fff', borderColor: meta.color }}
            className="rounded-full px-3.5 py-2 text-sm font-semibold inline-flex items-center gap-2 border shrink-0 shadow-soft"
          >
            <PlatformGlyph platform={pid} className="h-4 w-4" />
            {meta.label}
            {status && status !== 'draft' && (
              <span className={[
                'h-1.5 w-1.5 rounded-full',
                status === 'posted' ? 'bg-white'
                  : status === 'scheduled' ? 'bg-white/80'
                  : status === 'failed' ? 'bg-red-300'
                  : 'bg-white/60'
              ].join(' ')} />
            )}
          </span>
        );
      })}
    </div>
  );
}

function PlatformGlyph({ platform, className = 'h-4 w-4' }) {
  switch (platform) {
    case 'instagram': return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>;
    case 'x':         return <svg viewBox="0 0 24 24" className={className} fill="currentColor"><path d="M18.244 2H21l-6.51 7.44L22 22h-6.74l-4.7-6.13L4.96 22H2.2l6.97-7.96L2 2h6.91l4.26 5.62L18.244 2z" /></svg>;
    case 'linkedin':  return <svg viewBox="0 0 24 24" className={className} fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.4 17V10H6v7h2.4zM7.2 9a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM18 17v-3.86c0-2.07-1.12-3.04-2.6-3.04-1.21 0-1.75.66-2.05 1.13V10H11v7h2.35v-3.79c0-.96.18-1.89 1.37-1.89s1.28 1.08 1.28 1.95V17H18z" /></svg>;
    case 'fb':        return <svg viewBox="0 0 24 24" className={className} fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88V14.9H7.9V12h2.54V9.8c0-2.52 1.5-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.9h-2.33v6.98A10 10 0 0 0 22 12z" /></svg>;
    default: return null;
  }
}

function PostTypeIcon({ type }) {
  if (type === 'observance') return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" strokeLinejoin="round" /></svg>;
  if (type === 'event')      return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" /></svg>;
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>;
}

function PlatformCaptionCard({
  platform, campaign, form, setForm,
  editingPlatform, setEditingPlatform, draftEdit, setDraftEdit,
  busy,
  onRegenerate, onSaveEdit, onApprove,
  approvalDirty,
  regenUntilMs = 0, nowMs = 0
}) {
  const regenActive = regenUntilMs > nowMs;
  const regenRemaining = regenActive ? Math.max(1, Math.ceil((regenUntilMs - nowMs) / 1000)) : 0;
  const meta = PLATFORM_META[platform];
  const caption = campaign?.[`${platform}_caption`] || '';
  const approval = campaign?.[`${platform}_approval_status`] || 'draft';
  const published = campaign?.[`${platform}_published_status`] || 'draft';
  const scheduledAt = campaign?.[`${platform}_scheduled_at`] || null;
  const postedAt = campaign?.[`${platform}_posted_at`] || null;
  const postUrl = campaign?.[`${platform}_post_url`] || null;

  const override = form.captionOverrides[platform];
  const shown = override ?? caption;
  const isEdit = editingPlatform === platform;
  const alreadyPosted = published === 'posted';

  const startEdit = () => { setDraftEdit(shown || ''); setEditingPlatform(platform); };
  const cancelEdit = () => setEditingPlatform(null);
  const saveEdit = async () => {
    setForm(f => ({ ...f, captionOverrides: { ...f.captionOverrides, [platform]: draftEdit } }));
    setEditingPlatform(null);
    await onSaveEdit?.(draftEdit, platform);
  };
  const revertOverride = () => {
    setForm(f => {
      const next = { ...f.captionOverrides };
      delete next[platform];
      return { ...f, captionOverrides: next };
    });
  };

  const tagBusy = (kind) => busy === `${kind}-${platform}`;

  return (
    <div className="rounded-xl border bg-white" style={{ borderColor: `${meta.color}55` }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2 border-b border-cream-200">
        <span className="h-7 w-7 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: meta.color }}>
          <PlatformGlyph platform={platform} className="h-4 w-4" />
        </span>
        <div className="font-bold text-ink-900 text-sm">{meta.label}</div>
        {override !== undefined && (
          <span className="text-[9px] uppercase tracking-wider font-bold text-brand-700 bg-brand-50 ring-1 ring-brand-200 rounded-full px-2 py-0.5">
            Edited
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-4 relative">
        {regenActive && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/30 backdrop-blur-md rounded-b-xl">
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-white/90 ring-1 ring-cream-300/70 shadow-soft">
              <span className="h-6 w-6 rounded-full bg-brand-gradient text-white flex items-center justify-center shadow-glow">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin-slow" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-sm font-semibold text-ink-900 tabular-nums">
                Your content will be updated in {regenRemaining}s
              </span>
            </div>
          </div>
        )}
        <div className={regenActive ? 'pointer-events-none select-none' : undefined}>
        {isEdit ? (
          <>
            <textarea
              rows={5}
              value={draftEdit}
              onChange={(e) => setDraftEdit(e.target.value)}
              className="input text-sm"
              placeholder={`Write a ${meta.label} caption…`}
              autoFocus
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-ink-500">
                {draftEdit.trim().length} chars
                {platform === 'x' && draftEdit.length > 280 && (
                  <span className="text-red-600 font-semibold ml-2">over 280-char limit</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={cancelEdit} className="btn-ghost text-xs px-3 py-1.5">Cancel</button>
                <button onClick={saveEdit} className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
                  <SaveIcon /> Save edit
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-ink-900 whitespace-pre-wrap min-h-[48px]">
              {shown || <span className="text-ink-400 italic">Caption will appear here after generation.</span>}
            </div>

            {!alreadyPosted && (
              <div className="mt-3 pt-3 border-t border-cream-200 flex flex-wrap items-center gap-2 justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onRegenerate?.(platform)}
                    disabled={tagBusy('caption')}
                    className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1.5 hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
                  >
                    {tagBusy('caption') ? <Spinner /> : <RegenIcon />} Regenerate
                  </button>
                  <button onClick={startEdit} className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1.5 hover:border-brand-300 hover:text-brand-700">
                    <PencilIcon /> Edit
                  </button>
                  {override !== undefined && (
                    <button onClick={revertOverride} className="text-[11px] uppercase tracking-wider font-bold text-ink-500 hover:text-brand-700">
                      Revert to AI
                    </button>
                  )}
                </div>
                {/* Accept is always visible but only clickable after the caption has been
                    changed (regenerated or manually edited) in this session. Untouched drafts
                    are treated as already accepted — the button shows "Accepted" + disabled
                    so the user can see the state without being able to re-click it. */}
                <button
                  onClick={() => onApprove?.(platform)}
                  disabled={!approvalDirty || tagBusy('approve')}
                  title={approvalDirty ? 'Accept the updated caption' : 'Already accepted — regenerate or edit to change'}
                  className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1.5 text-accent-green border-green-200 hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  {tagBusy('approve') ? <Spinner /> : <ApproveIcon />}
                  {approvalDirty ? 'Accept' : 'Accepted'}
                </button>
              </div>
            )}

            {(postedAt || scheduledAt) && (
              <div className="mt-3 pt-3 border-t border-cream-200 text-xs text-ink-500 flex items-center justify-between flex-wrap gap-2">
                <div>
                  {postedAt && <>Posted <span className="text-ink-900 font-semibold">{new Date(postedAt).toLocaleString()}</span></>}
                  {!postedAt && scheduledAt && <>Scheduled <span className="text-ink-900 font-semibold">{new Date(scheduledAt).toLocaleString()}</span></>}
                </div>
                {postUrl && (
                  <a href={postUrl} target="_blank" rel="noreferrer" className="text-brand-700 font-semibold hover:underline">View post →</a>
                )}
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, tint, accent, className = '', headerLight = false, children }) {
  return (
    <section className={`card p-6 ${tint ? 'bg-gradient-to-br from-brand-50/40 to-cream-50' : ''} ${className}`}
      style={accent ? { borderColor: `${accent}33` } : {}}>
      <div className="mb-4">
        <div className={`text-[11px] uppercase tracking-[0.18em] font-bold ${headerLight ? 'text-white/80' : 'text-ink-500'}`}>{title}</div>
        {subtitle && <div className={`text-xs mt-1 normal-case tracking-normal font-normal ${headerLight ? 'text-white/65' : 'text-ink-500'}`}>{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children, className = '', labelClassName = '' }) {
  return (
    <label className={`block ${className}`}>
      <div className={`text-[11px] uppercase tracking-[0.16em] text-ink-500 font-semibold mb-1.5 ${labelClassName}`}>{label}</div>
      {hint && <div className="text-xs text-ink-500 mb-1.5 -mt-0.5 normal-case tracking-normal font-normal">{hint}</div>}
      {children}
    </label>
  );
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function captionPromptPlaceholder(platform) {
  switch (platform) {
    case 'instagram': return 'lots of emojis, 5–10 hashtags, visual-first hook';
    case 'x':         return 'punchy, ≤280 chars, 1 hashtag max, strong line-1 hook';
    case 'linkedin':  return 'professional, story-driven, line breaks, 100–200 words';
    case 'fb':        return 'conversational, prompt a comment, medium length';
    default:          return 'tone, hashtags, mentions, voice';
  }
}

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" strokeLinejoin="round" />
  </svg>
);
const SendIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinejoin="round" />
  </svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" />
  </svg>
);
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const UploadIcon = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const RegenIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const PencilIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const SaveIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ApproveIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M5 13l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const RejectIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
  </svg>
);
const ExpandIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
