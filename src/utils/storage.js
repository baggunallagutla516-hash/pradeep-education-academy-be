import fs from 'fs';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';
import * as supabaseStorage from './supabaseStorage.js';
import * as r2Storage from './r2Upload.js';
import { isSupabaseConfigured } from '../config/supabase.js';
import { isR2Configured } from '../config/r2.js';

/**
 * Active object storage. Default: supabase.
 * Set STORAGE_PROVIDER=r2 later to switch without rewriting controllers.
 */
function provider() {
  return env.storageProvider === 'r2' ? 'r2' : 'supabase';
}

export function isStorageConfigured() {
  return provider() === 'r2' ? isR2Configured() : isSupabaseConfigured();
}

export function buildObjectKey(folder, originalname) {
  return supabaseStorage.buildObjectKey(folder, originalname);
}

export async function uploadBuffer({ buffer, contentType, key }) {
  if (provider() === 'r2') {
    return r2Storage.uploadBufferToR2({ buffer, contentType, key });
  }
  return supabaseStorage.uploadBufferToSupabase({ buffer, contentType, key });
}

/** Read a disk temp file, upload to object storage, then delete the local file. */
export async function uploadDiskFile({ filePath, contentType, key }) {
  try {
    const buffer = await fs.promises.readFile(filePath);
    return await uploadBuffer({ buffer, contentType, key });
  } finally {
    await fs.promises.unlink(filePath).catch(() => {});
  }
}

export async function deleteObject(key) {
  if (provider() === 'r2') {
    return r2Storage.deleteFromR2(key);
  }
  return supabaseStorage.deleteFromSupabase(key);
}

export function keyFromPublicUrl(url) {
  if (provider() === 'r2') {
    return r2Storage.keyFromPublicUrl(url);
  }
  return supabaseStorage.keyFromPublicUrl(url);
}

export function storageNotConfiguredMessage() {
  if (provider() === 'r2') {
    return 'Cloudflare R2 is not configured. Add R2_* variables to the backend .env';
  }
  return 'Supabase Storage is not configured. Add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET to the backend .env';
}

export function assertStorageConfigured() {
  if (!isStorageConfigured()) {
    throw new ApiError(503, storageNotConfiguredMessage());
  }
}
