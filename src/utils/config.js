export const APP_NAME = 'GrowwStacks Studio';

export const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || '';

export const PLATFORMS = {
  INSTAGRAM: 'instagram',
  X: 'x',
  LINKEDIN: 'linkedin',
  FB: 'fb'
};

export const PLATFORM_LIST = ['instagram', 'x', 'linkedin', 'fb'];

export const PLATFORM_META = {
  instagram: { id: 'instagram', label: 'Instagram',  short: 'IG', color: '#E1306C' },
  x:         { id: 'x',         label: 'X (Twitter)', short: 'X',  color: '#000000' },
  linkedin:  { id: 'linkedin',  label: 'LinkedIn',    short: 'LI', color: '#0A66C2' },
  fb:        { id: 'fb',        label: 'Facebook',    short: 'FB', color: '#1877F2' }
};

export const POST_TYPES = ['observance', 'event', 'collage'];
export const POST_TYPE_LABELS = { observance: 'Observance', event: 'Event', collage: 'Collage' };
export const CAPTION_STYLES = ['Engaging', 'Professional', 'Data-Driven', 'Conversational'];

export const IMAGE_STATUSES     = ['idle', 'generating', 'ready', 'failed'];
export const CAPTION_STATUSES   = ['idle', 'generating', 'ready', 'regenerate', 'failed'];
export const APPROVAL_STATUSES  = ['draft', 'approved', 'rejected'];
export const PUBLISHED_STATUSES = ['draft', 'scheduled', 'posted', 'failed'];

export function campaignPlatforms(c) {
  return (c && Array.isArray(c.platforms_selected)) ? c.platforms_selected : [];
}

export function primaryPlatform(c) {
  const list = campaignPlatforms(c);
  if (list.includes('linkedin')) return 'linkedin';
  return list[0] || 'linkedin';
}

export function selectedImage(c) {
  if (!c) return null;
  const variants = Array.isArray(c.generated_image_variants) ? c.generated_image_variants : [];
  const sources  = Array.isArray(c.source_image_urls)        ? c.source_image_urls        : [];
  const idx = Number.isInteger(c.selected_variant_index) ? c.selected_variant_index : 0;
  if (c.post_type === 'event') return sources[0] || null;
  return variants[idx] || variants[0] || null;
}

export function previewImages(c) {
  if (!c) return [];
  if (c.post_type === 'event') return c.source_image_urls || [];
  const v = c.generated_image_variants || [];
  return v.length ? [v[c.selected_variant_index || 0] || v[0]] : [];
}

export function primaryCaption(c) {
  if (!c) return null;
  const p = primaryPlatform(c);
  return c[`${p}_caption`] || null;
}

export function primaryPublished(c) {
  if (!c) return 'draft';
  const list = campaignPlatforms(c);
  const order = ['posted', 'scheduled', 'failed', 'draft'];
  for (const s of order) {
    if (list.some(p => c[`${p}_published_status`] === s)) return s;
  }
  return 'draft';
}

export function primaryApproval(c) {
  if (!c) return 'draft';
  const list = campaignPlatforms(c);
  const order = ['approved', 'rejected', 'draft'];
  for (const s of order) {
    if (list.some(p => c[`${p}_approval_status`] === s)) return s;
  }
  return 'draft';
}

export function primaryScheduledAt(c) {
  if (!c) return null;
  for (const p of campaignPlatforms(c)) {
    if (c[`${p}_scheduled_at`]) return c[`${p}_scheduled_at`];
  }
  return null;
}

export function primaryPostedAt(c) {
  if (!c) return null;
  for (const p of campaignPlatforms(c)) {
    if (c[`${p}_posted_at`]) return c[`${p}_posted_at`];
  }
  return null;
}

export function primaryPostUrl(c) {
  if (!c) return null;
  for (const p of campaignPlatforms(c)) {
    if (c[`${p}_post_url`]) return c[`${p}_post_url`];
  }
  return null;
}
