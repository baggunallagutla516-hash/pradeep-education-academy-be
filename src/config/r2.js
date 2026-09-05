import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env.js';

let client;

export function isR2Configured() {
  return Boolean(
    env.r2.accountId &&
      env.r2.accessKeyId &&
      env.r2.secretAccessKey &&
      env.r2.bucket &&
      env.r2.publicUrl
  );
}

export function getR2Client() {
  if (!isR2Configured()) {
    return null;
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2.accessKeyId,
        secretAccessKey: env.r2.secretAccessKey,
      },
    });
  }
  return client;
}
