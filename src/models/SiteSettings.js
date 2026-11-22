import mongoose from 'mongoose';

const SITE_KEY = 'site';

const siteSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: SITE_KEY,
    },
    logoUrl: {
      type: String,
      trim: true,
      default: '',
    },
    logoKey: {
      type: String,
      trim: true,
      default: '',
    },
    upiId: {
      type: String,
      trim: true,
      default: '9505820072@ybl',
    },
    upiPayeeName: {
      type: String,
      trim: true,
      default: 'Pradeep Sir',
    },
  },
  { timestamps: true }
);

export const SiteSettings = mongoose.model('SiteSettings', siteSettingsSchema);

export async function getSiteSettings() {
  let settings = await SiteSettings.findOne({ key: SITE_KEY });
  if (!settings) {
    settings = await SiteSettings.create({ key: SITE_KEY });
  }
  return settings;
}

export function toPublicSiteSettings(doc) {
  return {
    logoUrl: doc.logoUrl || '',
    upiId: doc.upiId || '9505820072@ybl',
    upiPayeeName: doc.upiPayeeName || 'Pradeep Sir',
  };
}
