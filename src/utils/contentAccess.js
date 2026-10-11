import { ApiError } from './ApiError.js';

export const CONTENT_ACCESS_MODES = ['code', 'list', 'both'];

export function contentAccessPaths() {
  return {
    joinCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    accessMode: {
      type: String,
      enum: {
        values: CONTENT_ACCESS_MODES,
        message: 'Choose QR or code, the list, or both',
      },
      default: 'both',
    },
  };
}

export function contentAccessJson(doc) {
  const accessMode = doc.accessMode || 'both';
  return {
    accessMode,
    joinCode: accessMode === 'list' ? '' : doc.joinCode || '',
  };
}

export function readAccessMode(value, fallback = 'both') {
  if (value === undefined || value === null || value === '') return fallback;
  if (!CONTENT_ACCESS_MODES.includes(value)) {
    throw new ApiError(400, 'Choose how students open this.');
  }
  return value;
}

export function includeInStudentList(doc, hasRecord = false) {
  if ((doc.accessMode || 'both') !== 'code') return true;
  return Boolean(hasRecord);
}
