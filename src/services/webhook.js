const ENDPOINTS = {
  generation:   import.meta.env.VITE_WEBHOOK_POST_GENERATION,
  regeneration: import.meta.env.VITE_WEBHOOK_POST_REGENERATION,
  publishing:   import.meta.env.VITE_WEBHOOK_POST_PUBLISHING,
  delete:       import.meta.env.VITE_WEBHOOK_DELETE_RECORD
};

for (const [k, v] of Object.entries(ENDPOINTS)) {
  if (!v) console.warn(`[webhook] Missing endpoint URL for bucket "${k}" in .env`);
}

/**
 * Fire a webhook to one of the three n8n endpoints.
 * @param {'generation'|'regeneration'|'publishing'} bucket
 * @param {string} action
 * @param {object} payload — keys mirror Supabase column names where possible
 */
export async function fireWebhook(bucket, action, payload = {}) {
  const url = ENDPOINTS[bucket];
  if (!url) throw new Error(`Webhook URL not configured for bucket "${bucket}"`);
  const body = { action, ...payload };
  console.log(`[webhook:${bucket}]`, action, body);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Webhook ${res.status}: ${txt || res.statusText}`);
  }
  try { return await res.json(); } catch { return { ok: true }; }
}

/* -------- Per-action helpers (keys match Supabase columns) -------- */

// GENERATION — initial campaign creation
export const createCampaign = ({
  post_id,
  event_name,
  event_date,
  post_type,
  caption_style,
  user_image_prompt,
  platforms_selected,
  source_image_urls = [],
  caption_prompts = {}
}) => fireWebhook('generation', 'campaign.create', {
  post_id,
  event_name,
  event_date,
  post_type,
  caption_style,
  user_image_prompt,
  platforms_selected,
  source_image_urls,
  caption_prompts
});

// REGENERATION — image, variants, variant pick, caption regenerate, manual caption edit
export const regenerateImage    = (post_id, user_image_prompt) =>
  fireWebhook('regeneration', 'image.regenerate', { post_id, user_image_prompt });

export const regenerateVariants = (post_id, user_image_prompt) =>
  fireWebhook('regeneration', 'image.regenerate_variants', { post_id, user_image_prompt });

export const selectVariant      = (post_id, selected_variant_index) =>
  fireWebhook('regeneration', 'image.select', { post_id, selected_variant_index });

export const regenerateCaption  = (post_id, platform, caption_prompt) =>
  fireWebhook('regeneration', 'caption.regenerate', { post_id, platform, caption_prompt });

export const saveCaptionEdit    = (post_id, platform, caption) =>
  fireWebhook('regeneration', 'caption.update', { post_id, platform, caption });

// PUBLISHING — approve, reject, post now, schedule
export const approvePlatform    = (post_id, platform) =>
  fireWebhook('publishing', 'platform.approve', { post_id, platform });

export const rejectPlatform     = (post_id, platform) =>
  fireWebhook('publishing', 'platform.reject', { post_id, platform });

export const postNow            = (post_id, platform, scheduled_at) =>
  fireWebhook('publishing', 'platform.post_now', { post_id, platform, scheduled_at });

export const schedulePlatform   = (post_id, platform, scheduled_at) =>
  fireWebhook('publishing', 'platform.schedule', { post_id, platform, scheduled_at });

// DELETE — drop a whole campaign row (draft or scheduled only — caller must gate)
export const deleteCampaign = (post_id, event_name, platforms_selected = []) =>
  fireWebhook('delete', 'campaign.delete', { post_id, event_name, platforms_selected });
