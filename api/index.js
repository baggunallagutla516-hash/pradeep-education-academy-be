import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDB } from '../src/config/db.js';

const app = createApp();

export default async function handler(req, res) {
  if (mongoose.connection.readyState !== 1) {
    await connectDB();
  }
  return app(req, res);
}
