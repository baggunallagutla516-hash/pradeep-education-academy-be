import { News } from '../models/News.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function normalizeLink(value) {
  const link = String(value || '').trim();
  if (!link) return '';
  if (!link.startsWith('/') || link.startsWith('//')) {
    throw new ApiError(400, 'Link must be an internal path starting with /');
  }
  return link;
}

function toNewsJson(item) {
  return {
    id: item._id,
    text: item.text,
    link: item.link || '',
    isActive: item.isActive,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export const listNews = asyncHandler(async (_req, res) => {
  const items = await News.find().sort({ createdAt: -1 });
  res.status(200).json({
    success: true,
    data: { news: items.map(toNewsJson) },
  });
});

export const createNews = asyncHandler(async (req, res) => {
  const { text, isActive, link } = req.body;
  if (!text?.trim()) {
    throw new ApiError(400, 'News text is required');
  }

  const item = await News.create({
    text: text.trim(),
    link: normalizeLink(link),
    isActive: isActive === undefined ? true : Boolean(isActive),
    createdBy: req.admin._id,
  });

  res.status(201).json({
    success: true,
    message: 'News item created',
    data: { news: toNewsJson(item) },
  });
});

export const updateNews = asyncHandler(async (req, res) => {
  const item = await News.findById(req.params.id);
  if (!item) throw new ApiError(404, 'News item not found');

  const { text, isActive, link } = req.body;
  if (text !== undefined) {
    if (!String(text).trim()) throw new ApiError(400, 'News text cannot be empty');
    item.text = String(text).trim();
  }
  if (link !== undefined) {
    item.link = normalizeLink(link);
  }
  if (isActive !== undefined) {
    item.isActive = Boolean(isActive);
  }

  await item.save();

  res.status(200).json({
    success: true,
    message: 'News item updated',
    data: { news: toNewsJson(item) },
  });
});

export const deleteNews = asyncHandler(async (req, res) => {
  const item = await News.findByIdAndDelete(req.params.id);
  if (!item) throw new ApiError(404, 'News item not found');
  res.status(200).json({
    success: true,
    message: 'News item deleted',
  });
});
