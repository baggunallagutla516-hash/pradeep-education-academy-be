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
  };
}
