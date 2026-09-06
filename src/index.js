import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { bootstrapClasses } from './utils/classBootstrap.js';

async function start() {
  try {
    await connectDB();
    await bootstrapClasses();
    const app = createApp();

    app.listen(env.port, () => {
      console.log(`${env.siteName} API running on port ${env.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
