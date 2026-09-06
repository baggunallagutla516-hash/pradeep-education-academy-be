import dotenv from 'dotenv';

dotenv.config();

const required = ['MONGODB_URI', 'JWT_SECRET', 'JWT_ADMIN_SECRET', 'CLIENT_URL'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

function parseOrigins(value) {
  return String(value)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const clientOrigins = parseOrigins(process.env.CLIENT_URL);

if (clientOrigins.length === 0) {
  throw new Error('CLIENT_URL must include at least one frontend origin');
}

if (process.env.JWT_SECRET === process.env.JWT_ADMIN_SECRET) {
  throw new Error('JWT_SECRET and JWT_ADMIN_SECRET must be different values');
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtAdminSecret: process.env.JWT_ADMIN_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigins,
  siteName: process.env.SITE_NAME || "PRADEEP'S EDUCATIONAL ACADEMY",
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  contactToEmail:
    process.env.CONTACT_TO_EMAIL || 'pradeep.acad.infor@gmail.com',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from:
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      'pradeep.acad.infor@gmail.com',
  },
  // supabase (default) | r2 — switch later without changing controllers
  storageProvider: (process.env.STORAGE_PROVIDER || 'supabase').toLowerCase(),
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'worksheets',
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || '',
    publicUrl: process.env.R2_PUBLIC_URL || '',
  },
};
