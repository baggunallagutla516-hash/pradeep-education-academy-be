import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

let client;

export function isValidSupabaseUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isSupabaseConfigured() {
  return Boolean(
    isValidSupabaseUrl(env.supabase.url) &&
      env.supabase.serviceRoleKey &&
      env.supabase.bucket
  );
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(env.supabase.url.replace(/\/$/, ''), env.supabase.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return client;
}
