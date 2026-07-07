import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const CAMPAIGNS_TABLE = 'matix_content_publishing_database';
export const LOGS_TABLE = 'log_report';
export const CREDENTIALS_TABLE = 'matix_login_credentials';

/**
 * Look up an active credential row by email + password. Returns the row on success
 * (without the password field) or null when no match.
 *
 * NOTE: this is a plaintext password compare against the matix_login_credentials table.
 * That's only safe-ish because RLS is disabled on the table and we're treating it as a
 * lightweight internal gate. For anything beyond an internal demo, migrate to Supabase
 * Auth (auth.users + RLS) and hash passwords with bcrypt.
 */
export async function verifyLogin(email, password) {
  const trimmedEmail = (email || '').trim().toLowerCase();
  if (!trimmedEmail || !password) return null;

  const { data, error } = await supabase
    .from(CREDENTIALS_TABLE)
    .select('credential_id, email, credential_status')
    .ilike('email', trimmedEmail)        // case-insensitive email match
    .eq('password', password)            // exact password match
    .eq('credential_status', 'active')
    .maybeSingle();

  if (error) throw error;
  return data; // { credential_id, email, credential_status } or null
}

export async function fetchCampaigns() {
  const { data, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchCampaignById(postId) {
  const { data, error } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select('*')
    .eq('post_id', postId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Fetch most recent log rows (capped at 200) ordered newest first.
 * Filtering / search happens client-side over this slice — cheap given the cap.
 *
 * Note: Postgres folds unquoted identifiers to lowercase, so columns the user wrote as
 * `User_image_prompt`, `Instagram_error`, `linkedIn_error`, etc. are queried as
 * `user_image_prompt`, `instagram_error`, `linkedin_error`. `select('*')` returns whatever
 * Supabase has, so we don't have to enumerate.
 */
export async function fetchLogs({ limit = 200 } = {}) {
  const { data, error } = await supabase
    .from(LOGS_TABLE)
    .select('*')
    .order('trigger_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Poll Supabase for a campaign row to appear (or to satisfy a condition).
 * Returns the row, or throws on timeout.
 */
export async function waitForCampaign(postId, {
  intervalMs = 3000,
  timeoutMs = 120000,
  condition = (row) => !!row
} = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = await fetchCampaignById(postId);
    if (condition(row)) return row;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for campaign ${postId}`);
}
