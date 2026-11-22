import { OnlineClass, ONLINE_CLASS_AUDIENCES } from '../models/OnlineClass.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function detectPlatform(link) {
  const lower = String(link || '').toLowerCase();
  if (lower.includes('meet.google.com') || lower.includes('google.com/meet')) {
    return 'google_meet';
  }
  if (lower.includes('zoom.us') || lower.includes('zoom.com')) {
    return 'zoom';
  }
  return 'other';
}

function normalizeMeetingLink(value) {
  const link = String(value || '').trim();
  if (!link) throw new ApiError(400, 'Meeting link is required');
  let url;
  try {
    url = new URL(link);
  } catch {
    throw new ApiError(400, 'Meeting link must be a valid URL (e.g. Google Meet or Zoom)');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ApiError(400, 'Meeting link must start with http:// or https://');
  }
  return url.toString();
}

function normalizeVisibleTo(value) {
  if (value === undefined) return undefined;
  const list = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
  const unique = [...new Set(list.filter((item) => ONLINE_CLASS_AUDIENCES.includes(item)))];
  if (unique.length === 0) {
    throw new ApiError(400, 'Select at least one audience: students, staff, or parents');
  }
  return unique;
}

function normalizeScheduledAt(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'Invalid date/time for the class');
  }
  return date;
}

function toOnlineClassJson(item, { includeLink = true } = {}) {
  return {
    id: item._id,
    title: item.title,
    meetingLink: includeLink ? item.meetingLink : undefined,
    platform: item.platform,
    description: item.description || '',
    scheduledAt: item.scheduledAt || null,
    visibleTo: item.visibleTo || [],
    isActive: item.isActive,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function audienceFilter(role) {
  return {
    isActive: true,
    visibleTo: role,
  };
}

export const listAdminOnlineClasses = asyncHandler(async (_req, res) => {
  const items = await OnlineClass.find().sort({ scheduledAt: 1, createdAt: -1 });
  res.status(200).json({
    success: true,
    data: { onlineClasses: items.map((item) => toOnlineClassJson(item)) },
  });
});

export const createOnlineClass = asyncHandler(async (req, res) => {
  const { title, meetingLink, description, scheduledAt, visibleTo, isActive, platform } = req.body;
  if (!title?.trim()) throw new ApiError(400, 'Title is required');

  const link = normalizeMeetingLink(meetingLink);
  const item = await OnlineClass.create({
    title: title.trim(),
    meetingLink: link,
    platform: platform || detectPlatform(link),
    description: String(description || '').trim(),
    scheduledAt: normalizeScheduledAt(scheduledAt) ?? null,
    visibleTo: normalizeVisibleTo(visibleTo) || [...ONLINE_CLASS_AUDIENCES],
    isActive: isActive === undefined ? true : Boolean(isActive),
    createdBy: req.admin._id,
  });

  res.status(201).json({
    success: true,
    message: 'Online class link saved',
    data: { onlineClass: toOnlineClassJson(item) },
  });
});

export const updateOnlineClass = asyncHandler(async (req, res) => {
  const item = await OnlineClass.findById(req.params.id);
  if (!item) throw new ApiError(404, 'Online class not found');

  const { title, meetingLink, description, scheduledAt, visibleTo, isActive, platform } = req.body;

  if (title !== undefined) {
    if (!String(title).trim()) throw new ApiError(400, 'Title cannot be empty');
    item.title = String(title).trim();
  }
  if (meetingLink !== undefined) {
    const link = normalizeMeetingLink(meetingLink);
    item.meetingLink = link;
    if (platform === undefined) item.platform = detectPlatform(link);
  }
  if (platform !== undefined) {
    if (!['google_meet', 'zoom', 'other'].includes(platform)) {
      throw new ApiError(400, 'Platform must be google_meet, zoom, or other');
    }
    item.platform = platform;
  }
  if (description !== undefined) item.description = String(description || '').trim();
  if (scheduledAt !== undefined) item.scheduledAt = normalizeScheduledAt(scheduledAt);
  if (visibleTo !== undefined) item.visibleTo = normalizeVisibleTo(visibleTo);
  if (isActive !== undefined) item.isActive = Boolean(isActive);

  await item.save();

  res.status(200).json({
    success: true,
    message: 'Online class updated',
    data: { onlineClass: toOnlineClassJson(item) },
  });
});

export const deleteOnlineClass = asyncHandler(async (req, res) => {
  const item = await OnlineClass.findByIdAndDelete(req.params.id);
  if (!item) throw new ApiError(404, 'Online class not found');
  res.status(200).json({
    success: true,
    message: 'Online class deleted',
  });
});

async function listForAudience(role, res) {
  const items = await OnlineClass.find(audienceFilter(role)).sort({
    scheduledAt: 1,
    createdAt: -1,
  });
  res.status(200).json({
    success: true,
    data: { onlineClasses: items.map((item) => toOnlineClassJson(item)) },
  });
}

export const listStudentOnlineClasses = asyncHandler(async (_req, res) => {
  await listForAudience('student', res);
});

export const listEducatorOnlineClasses = asyncHandler(async (_req, res) => {
  await listForAudience('educator', res);
});

export const listParentOnlineClasses = asyncHandler(async (_req, res) => {
  await listForAudience('parent', res);
});
