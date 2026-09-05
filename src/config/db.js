import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';

// Avoid flaky IPv6 / SRV resolution issues on some Windows networks
dns.setDefaultResultOrder('ipv4first');

export async function connectDB() {
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(env.mongoUri, {
      maxPoolSize: 50,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 15000,
      family: 4,
    });
  } catch (error) {
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
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
