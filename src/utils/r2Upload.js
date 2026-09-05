import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, isR2Configured } from '../config/r2.js';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

function safeFilename(originalname) {
  return String(originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function buildObjectKey(folder, originalname) {
  return `${folder}/${Date.now()}-${safeFilename(originalname)}`;
}

export function publicUrlForKey(key) {
  const base = env.r2.publicUrl.replace(/\/$/, '');
  return `${base}/${key}`;
}

export async function uploadBufferToR2({ buffer, contentType, key }) {
  if (!isR2Configured()) {
    throw new ApiError(
      503,
      'Cloudflare R2 is not configured. Add R2_* variables to the backend .env'
    );
  }

  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return publicUrlForKey(key);
}

export async function deleteFromR2(key) {
  if (!key || !isR2Configured()) return;
  const client = getR2Client();
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: env.r2.bucket,
        Key: key,
      })
    );
  } catch {
    /* best-effort cleanup */
  }
}

export function keyFromPublicUrl(url) {
  if (!url || !env.r2.publicUrl) return null;
  const base = env.r2.publicUrl.replace(/\/$/, '');
  if (!url.startsWith(`${base}/`)) return null;
  return url.slice(base.length + 1);
}
