import { CarouselSlide, CAROUSEL_SLIDE_TYPES } from '../models/CarouselSlide.js';
import { Quiz } from '../models/Quiz.js';
import { Post } from '../models/Post.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  assertStorageConfigured,
  buildObjectKey,
  uploadDiskFile,
} from '../utils/storage.js';

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return value === true || value === 'true' || value === '1' || value === 'on';
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseOptionalDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'Invalid date value');
  }
  return date;
}

function normalizeLinkPath(value) {
  const link = String(value || '').trim();
  if (!link) return '';
  if (!link.startsWith('/') || link.startsWith('//')) {
    throw new ApiError(400, 'Link must be an internal path starting with /');
  }
  return link;
}

function toAdminSlideJson(doc) {
  return {
    id: doc._id,
    slideType: doc.slideType,
    title: doc.title,
    description: doc.description || '',
    imageUrl: doc.imageUrl || '',
    imageKey: doc.imageKey || '',
    ctaText: doc.ctaText || '',
    displayOrder: doc.displayOrder ?? 0,
    isEnabled: Boolean(doc.isEnabled),
    publishAt: doc.publishAt || null,
    unpublishAt: doc.unpublishAt || null,
    quizId: doc.quiz?._id || doc.quiz || null,
    quizTitle: doc.quiz?.title || '',
    difficulty: doc.difficulty || '',
    category: doc.category || '',
    studentName: doc.studentName || '',
    studentClassLabel: doc.studentClassLabel || '',
    studentPhotoUrl: doc.studentPhotoUrl || '',
    studentPhotoKey: doc.studentPhotoKey || '',
    quizName: doc.quizName || '',
    scoreDisplay: doc.scoreDisplay || '',
    percentage: doc.percentage,
    rank: doc.rank,
    badgeLabel: doc.badgeLabel || '',
    showStudentName: Boolean(doc.showStudentName),
    showStudentClass: Boolean(doc.showStudentClass),
    showStudentPhoto: Boolean(doc.showStudentPhoto),
    showScore: Boolean(doc.showScore),
    showPercentage: Boolean(doc.showPercentage),
    showRank: Boolean(doc.showRank),
    postId: doc.post?._id || doc.post || null,
    postTitle: doc.post?.title || '',
    linkPath: doc.linkPath || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function resolveQuizId(value) {
  if (!value) return null;
  const quiz = await Quiz.findById(value).select('_id title');
  if (!quiz) throw new ApiError(400, 'Selected quiz was not found');
  return quiz._id;
}

async function resolvePostId(value) {
  if (!value) return null;
  const post = await Post.findById(value).select('_id title');
  if (!post) throw new ApiError(400, 'Selected post was not found');
  return post._id;
}

async function uploadField(file, folder) {
  if (!file?.path) return null;
  assertStorageConfigured();
  const key = buildObjectKey(folder, file.originalname);
  const url = await uploadDiskFile({
    filePath: file.path,
    contentType: file.mimetype,
    key,
  });
  return { url, key };
}

function applyPayload(item, body) {
  const {
    slideType,
    title,
    description,
    ctaText,
    displayOrder,
    isEnabled,
    publishAt,
    unpublishAt,
    difficulty,
    category,
    studentName,
    studentClassLabel,
    quizName,
    scoreDisplay,
    percentage,
    rank,
    badgeLabel,
    showStudentName,
    showStudentClass,
    showStudentPhoto,
    showScore,
    showPercentage,
    showRank,
    linkPath,
  } = body;

  if (slideType !== undefined) {
    if (!CAROUSEL_SLIDE_TYPES.includes(slideType)) {
      throw new ApiError(400, 'Invalid slide type');
    }
    item.slideType = slideType;
  }
  if (title !== undefined) {
    if (!String(title).trim()) throw new ApiError(400, 'Title is required');
    item.title = String(title).trim();
  }
  if (description !== undefined) item.description = String(description || '').trim();
  if (ctaText !== undefined) item.ctaText = String(ctaText || '').trim();
  if (displayOrder !== undefined) {
    const order = parseOptionalNumber(displayOrder);
    item.displayOrder = order === null ? 0 : Math.max(0, Math.floor(order));
  }
  if (isEnabled !== undefined) item.isEnabled = parseBoolean(isEnabled, item.isEnabled);
  if (publishAt !== undefined) item.publishAt = parseOptionalDate(publishAt);
  if (unpublishAt !== undefined) item.unpublishAt = parseOptionalDate(unpublishAt);
  if (difficulty !== undefined) item.difficulty = String(difficulty || '').trim();
  if (category !== undefined) item.category = String(category || '').trim();
  if (studentName !== undefined) item.studentName = String(studentName || '').trim();
  if (studentClassLabel !== undefined) {
    item.studentClassLabel = String(studentClassLabel || '').trim();
  }
  if (quizName !== undefined) item.quizName = String(quizName || '').trim();
  if (scoreDisplay !== undefined) item.scoreDisplay = String(scoreDisplay || '').trim();
  if (percentage !== undefined) item.percentage = parseOptionalNumber(percentage);
  if (rank !== undefined) item.rank = parseOptionalNumber(rank);
  if (badgeLabel !== undefined) item.badgeLabel = String(badgeLabel || '').trim() || 'Quiz Topper';
  if (showStudentName !== undefined) {
    item.showStudentName = parseBoolean(showStudentName, item.showStudentName);
  }
  if (showStudentClass !== undefined) {
    item.showStudentClass = parseBoolean(showStudentClass, item.showStudentClass);
  }
  if (showStudentPhoto !== undefined) {
    item.showStudentPhoto = parseBoolean(showStudentPhoto, item.showStudentPhoto);
  }
  if (showScore !== undefined) item.showScore = parseBoolean(showScore, item.showScore);
  if (showPercentage !== undefined) {
    item.showPercentage = parseBoolean(showPercentage, item.showPercentage);
  }
  if (showRank !== undefined) item.showRank = parseBoolean(showRank, item.showRank);
  if (linkPath !== undefined) item.linkPath = normalizeLinkPath(linkPath);
}

export const listCarouselSlides = asyncHandler(async (_req, res) => {
  const slides = await CarouselSlide.find()
    .populate('quiz', 'title')
    .populate('post', 'title')
    .sort({ displayOrder: 1, createdAt: -1 });

  res.status(200).json({
    success: true,
    data: { slides: slides.map(toAdminSlideJson) },
  });
});

export const createCarouselSlide = asyncHandler(async (req, res) => {
  const slideType = String(req.body.slideType || '').trim();
  const title = String(req.body.title || '').trim();
  if (!CAROUSEL_SLIDE_TYPES.includes(slideType)) {
    throw new ApiError(400, 'Slide type is required');
  }
  if (!title) throw new ApiError(400, 'Title is required');

  const item = new CarouselSlide({
    slideType,
    title,
    createdBy: req.admin._id,
    isEnabled: true,
  });
  applyPayload(item, req.body);

  if (req.body.quizId !== undefined || req.body.quiz !== undefined) {
    item.quiz = await resolveQuizId(req.body.quizId || req.body.quiz);
  }
  if (req.body.postId !== undefined || req.body.post !== undefined) {
    item.post = await resolvePostId(req.body.postId || req.body.post);
  }

  const imageFile = req.files?.image?.[0] || req.file;
  const photoFile = req.files?.studentPhoto?.[0];
  if (imageFile) {
    const uploaded = await uploadField(imageFile, 'carousel');
    item.imageUrl = uploaded.url;
    item.imageKey = uploaded.key;
  }
  if (photoFile) {
    const uploaded = await uploadField(photoFile, 'carousel-photos');
    item.studentPhotoUrl = uploaded.url;
    item.studentPhotoKey = uploaded.key;
  }

  if (slideType === 'quiz' && !item.quiz) {
    throw new ApiError(400, 'Quiz slides must be linked to a quiz');
  }

  await item.save();
  await item.populate('quiz', 'title');
  await item.populate('post', 'title');

  res.status(201).json({
    success: true,
    message: 'Carousel slide created',
    data: { slide: toAdminSlideJson(item) },
  });
});

export const updateCarouselSlide = asyncHandler(async (req, res) => {
  const item = await CarouselSlide.findById(req.params.id);
  if (!item) throw new ApiError(404, 'Carousel slide not found');

  applyPayload(item, req.body);

  if (req.body.quizId !== undefined || req.body.quiz !== undefined) {
    item.quiz = await resolveQuizId(req.body.quizId || req.body.quiz);
  }
  if (req.body.postId !== undefined || req.body.post !== undefined) {
    item.post = await resolvePostId(req.body.postId || req.body.post);
  }

  const imageFile = req.files?.image?.[0] || req.file;
  const photoFile = req.files?.studentPhoto?.[0];
  if (imageFile) {
    const uploaded = await uploadField(imageFile, 'carousel');
    item.imageUrl = uploaded.url;
    item.imageKey = uploaded.key;
  }
  if (photoFile) {
    const uploaded = await uploadField(photoFile, 'carousel-photos');
    item.studentPhotoUrl = uploaded.url;
    item.studentPhotoKey = uploaded.key;
  }

  if (req.body.clearImage === true || req.body.clearImage === 'true') {
    item.imageUrl = '';
    item.imageKey = '';
  }
  if (req.body.clearStudentPhoto === true || req.body.clearStudentPhoto === 'true') {
    item.studentPhotoUrl = '';
    item.studentPhotoKey = '';
  }

  if (item.slideType === 'quiz' && !item.quiz) {
    throw new ApiError(400, 'Quiz slides must be linked to a quiz');
  }

  await item.save();
  await item.populate('quiz', 'title');
  await item.populate('post', 'title');

  res.status(200).json({
    success: true,
    message: 'Carousel slide updated',
    data: { slide: toAdminSlideJson(item) },
  });
});

export const deleteCarouselSlide = asyncHandler(async (req, res) => {
  const item = await CarouselSlide.findByIdAndDelete(req.params.id);
  if (!item) throw new ApiError(404, 'Carousel slide not found');
  res.status(200).json({
    success: true,
    message: 'Carousel slide deleted',
  });
});
