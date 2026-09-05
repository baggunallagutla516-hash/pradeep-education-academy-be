import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';

// Avoid flaky IPv6 / SRV resolution issues on some Windows networks
dns.setDefaultResultOrder('ipv4first');

const isServerless = Boolean(process.env.VERCEL);

/** @type {{ conn: typeof mongoose | null, promise: Promise<typeof mongoose> | null }} */
const cached = globalThis.__mongooseCache || { conn: null, promise: null };
globalThis.__mongooseCache = cached;

export async function connectDB() {
  mongoose.set('strictQuery', true);

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(env.mongoUri, {
        maxPoolSize: isServerless ? 1 : 50,
        minPoolSize: isServerless ? 0 : 5,
        serverSelectionTimeoutMS: 15000,
        family: 4,
      })
      .then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    if (String(error.message || '').includes('querySrv')) {
      throw new Error(
        `${error.message}\n` +
          'Atlas SRV DNS failed. Fix options:\n' +
          '1) Atlas → Network Access → allow your IP (or 0.0.0.0/0 for testing)\n' +
          '2) In Atlas → Connect → Drivers, copy a fresh URI\n' +
          '3) Or use the non-SRV (standard) connection string instead of mongodb+srv://'
      );
    }
    throw error;
  }

  console.log(`MongoDB connected: ${mongoose.connection.host}`);
  return cached.conn;
}

export async function disconnectDB() {
  await mongoose.disconnect();
  cached.conn = null;
  cached.promise = null;
}
