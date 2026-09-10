import fs from 'fs';
import { ChapterEndTest } from '../models/ChapterEndTest.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertActiveClassId } from '../utils/schoolClass.js';
import { classRefFields } from '../utils/schoolClass.js';
import {
  buildObjectKey,
  deleteObject,
  keyFromPublicUrl,
  uploadDiskFile,
} from '../utils/storage.js';

function toCetJson(doc) {
  const classFields = classRefFields(doc.studentClass);
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    studentClass: classFields.studentClass,
    studentClassName: classFields.studentClassName,
    chapterNumber: doc.chapterNumber,
    chapterName: doc.chapterName,
    coverImageUrl: doc.coverImageUrl,
    fileUrl: doc.fileUrl,
    fileName: doc.fileName,
    fileMimeType: doc.fileMimeType,
    fileSize: doc.fileSize,
    isPublished: doc.isPublished,
    publishedAt: doc.publishedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function parsePublished(value) {
  if (value === undefined) return true;
  return value === 'true' || value === true;
}

function parseChapterNumber(value) {
  const num = Number(String(value ?? '').trim());
  if (!Number.isInteger(num) || num < 1 || num > 200) {
    throw new ApiError(400, 'Chapter number must be a whole number between 1 and 200');
  }
  return num;
}

async function unlinkTemp(file) {
  if (file?.path) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
}

async function uploadCover(file) {
  const key = buildObjectKey('cets/covers', file.originalname);
  const url = await uploadDiskFile({
    filePath: file.path,
    contentType: file.mimetype,
    key,
  });
  return { url, key };
}

async function uploadFile(file) {
  if (!file?.path) throw new ApiError(400, 'Question paper file is required');
  const key = buildObjectKey('cets/files', file.originalname);
  const url = await uploadDiskFile({
    filePath: file.path,
    contentType: file.mimetype,
    key,
  });
  return {
    url,
    key,
    fileName: file.originalname,
    fileMimeType: file.mimetype,
    fileSize: file.size,
  };
}

export const listCets = asyncHandler(async (_req, res) => {
  const cets = await ChapterEndTest.find()
    .populate('studentClass', 'name')
    .sort({ studentClass: 1, chapterNumber: 1, createdAt: -1 });
  res.status(200).json({
    success: true,
    data: { cets: cets.map(toCetJson) },
  });
});

export const getCet = asyncHandler(async (req, res) => {
  const cet = await ChapterEndTest.findById(req.params.id).populate('studentClass', 'name');
  if (!cet) throw new ApiError(404, 'C.E.T. not found');
  res.status(200).json({
    success: true,
    data: { cet: toCetJson(cet) },
  });
});

export const createCet = asyncHandler(async (req, res) => {
  const { title, description, studentClass, chapterNumber, chapterName, isPublished } = req.body;
  const cover = req.files?.coverImage?.[0];
  const file = req.files?.file?.[0];

  try {
    if (!title?.trim()) throw new ApiError(400, 'Title is required');
    if (!studentClass?.trim()) throw new ApiError(400, 'Class is required');
    await assertActiveClassId(studentClass);
    const chapter = parseChapterNumber(chapterNumber);

    if (!file) throw new ApiError(400, 'Question paper file is required');

    const coverUpload = cover ? await uploadCover(cover) : null;
    let fileUpload;
    try {
      fileUpload = await uploadFile(file);
    } catch (err) {
      if (coverUpload) await deleteObject(coverUpload.key);
      throw err;
    }

    const published = parsePublished(isPublished);

    const cet = await ChapterEndTest.create({
      title: title.trim(),
      description: description?.trim() || '',
      studentClass,
      chapterNumber: chapter,
      chapterName: chapterName?.trim() || '',
      coverImageUrl: coverUpload?.url || '',
      coverImageKey: coverUpload?.key || '',
      fileUrl: fileUpload.url,
      fileKey: fileUpload.key,
      fileName: fileUpload.fileName,
      fileMimeType: fileUpload.fileMimeType,
      fileSize: fileUpload.fileSize,
      isPublished: published,
      publishedAt: published ? new Date() : null,
      createdBy: req.admin._id,
    });

    await cet.populate('studentClass', 'name');

    res.status(201).json({
      success: true,
      message: 'C.E.T. created',
      data: { cet: toCetJson(cet) },
    });
  } catch (err) {
    await unlinkTemp(cover);
    await unlinkTemp(file);
    throw err;
  }
});

export const updateCet = asyncHandler(async (req, res) => {
  const cet = await ChapterEndTest.findById(req.params.id);
  if (!cet) throw new ApiError(404, 'C.E.T. not found');

  const {
    title,
    description,
    studentClass,
    chapterNumber,
    chapterName,
    isPublished,
    removeCoverImage,
  } = req.body;
  const cover = req.files?.coverImage?.[0];
  const file = req.files?.file?.[0];

  try {
    if (title !== undefined) {
      if (!String(title).trim()) throw new ApiError(400, 'Title cannot be empty');
      cet.title = String(title).trim();
    }
    if (description !== undefined) {
      cet.description = String(description).trim();
    }
    if (studentClass !== undefined) {
      await assertActiveClassId(studentClass);
      cet.studentClass = studentClass;
    }
    if (chapterNumber !== undefined) {
      cet.chapterNumber = parseChapterNumber(chapterNumber);
    }
    if (chapterName !== undefined) {
      cet.chapterName = String(chapterName).trim();
    }

    if (cover) {
      const prevKey = cet.coverImageKey || keyFromPublicUrl(cet.coverImageUrl);
      const coverUpload = await uploadCover(cover);
      cet.coverImageUrl = coverUpload.url;
      cet.coverImageKey = coverUpload.key;
      await deleteObject(prevKey);
    } else if (removeCoverImage === 'true' || removeCoverImage === true) {
      const prevKey = cet.coverImageKey || keyFromPublicUrl(cet.coverImageUrl);
      cet.coverImageUrl = '';
      cet.coverImageKey = '';
      await deleteObject(prevKey);
    }

    if (file) {
      const prevKey = cet.fileKey || keyFromPublicUrl(cet.fileUrl);
      const fileUpload = await uploadFile(file);
      cet.fileUrl = fileUpload.url;
      cet.fileKey = fileUpload.key;
      cet.fileName = fileUpload.fileName;
      cet.fileMimeType = fileUpload.fileMimeType;
      cet.fileSize = fileUpload.fileSize;
      await deleteObject(prevKey);
    }

    if (isPublished !== undefined) {
      const published = parsePublished(isPublished);
      if (published && !cet.isPublished) {
        cet.publishedAt = new Date();
      }
      if (!published) {
        cet.publishedAt = null;
      }
      cet.isPublished = published;
    }

    await cet.save();
    await cet.populate('studentClass', 'name');

    res.status(200).json({
      success: true,
      message: 'C.E.T. updated',
      data: { cet: toCetJson(cet) },
    });
  } catch (err) {
    await unlinkTemp(cover);
    await unlinkTemp(file);
    throw err;
  }
});

export const deleteCet = asyncHandler(async (req, res) => {
  const cet = await ChapterEndTest.findByIdAndDelete(req.params.id);
  if (!cet) throw new ApiError(404, 'C.E.T. not found');

  await deleteObject(cet.coverImageKey || keyFromPublicUrl(cet.coverImageUrl));
  await deleteObject(cet.fileKey || keyFromPublicUrl(cet.fileUrl));

  res.status(200).json({
    success: true,
    message: 'C.E.T. deleted',
  });
});
