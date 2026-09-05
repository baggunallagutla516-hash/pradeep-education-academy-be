import { getSupabaseClient, isSupabaseConfigured } from '../config/supabase.js';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

function safeFilename(originalname) {
  return String(originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function buildObjectKey(folder, originalname) {
  return `${folder}/${Date.now()}-${safeFilename(originalname)}`;
}

export function publicUrlForKey(key) {
  const base = env.supabase.url.replace(/\/$/, '');
  return `${base}/storage/v1/object/public/${env.supabase.bucket}/${key}`;
}

export async function uploadBufferToSupabase({ buffer, contentType, key }) {
  if (!isSupabaseConfigured()) {
    const hint = env.supabase.url && !/^https?:\/\//i.test(env.supabase.url)
      ? ' SUPABASE_URL must look like https://YOUR_PROJECT_REF.supabase.co (not an API key).'
      : ' Add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET to the backend .env';
    throw new ApiError(503, `Supabase Storage is not configured.${hint}`);
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(env.supabase.bucket).upload(key, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new ApiError(500, `Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(env.supabase.bucket).getPublicUrl(key);
  return data.publicUrl;
}

export async function deleteFromSupabase(key) {
  if (!key || !isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  try {
    await supabase.storage.from(env.supabase.bucket).remove([key]);
  } catch {
    /* best-effort cleanup */
  }
}

export function keyFromPublicUrl(url) {
  if (!url || !env.supabase.url || !env.supabase.bucket) return null;
  const marker = `/storage/v1/object/public/${env.supabase.bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}
