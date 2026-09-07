import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';

// Avoid flaky IPv6 / SRV resolution issues on some Windows networks
dns.setDefaultResultOrder('ipv4first');

// Some Windows/VPN DNS resolvers refuse MongoDB Atlas SRV lookups (querySrv ECONNREFUSED).
// Public resolvers fix mongodb+srv:// without changing the connection string.
if (String(env.mongoUri).startsWith('mongodb+srv://') && process.platform === 'win32') {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const isServerless = Boolean(process.env.VERCEL);

const connectOptions = {
  maxPoolSize: isServerless ? 1 : 50,
  minPoolSize: isServerless ? 0 : 5,
  serverSelectionTimeoutMS: 15000,
  family: 4,
};

/** @type {{ conn: typeof mongoose | null, promise: Promise<typeof mongoose> | null }} */
const cached = globalThis.__mongooseCache || { conn: null, promise: null };
globalThis.__mongooseCache = cached;

export async function connectDB() {
  mongoose.set('strictQuery', true);

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(env.mongoUri, connectOptions).then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    if (String(error.message || '').includes('querySrv')) {
      dns.setServers(['8.8.8.8', '1.1.1.1']);
      try {
        cached.promise = mongoose.connect(env.mongoUri, connectOptions).then((m) => m);
        cached.conn = await cached.promise;
      } catch (retryError) {
        throw new Error(
          `${retryError.message}\n` +
            'Atlas SRV DNS failed. Fix options:\n' +
            '1) Atlas → Network Access → allow your IP (or 0.0.0.0/0 for testing)\n' +
            '2) In Atlas → Connect → Drivers, copy a fresh URI\n' +
            '3) Or use the non-SRV (standard) connection string instead of mongodb+srv://'
        );
      }
    } else {
      throw error;
    }
  }

  console.log(`MongoDB connected: ${mongoose.connection.host}`);
  return cached.conn;
}

export async function disconnectDB() {
  await mongoose.disconnect();
  cached.conn = null;
  cached.promise = null;
}
