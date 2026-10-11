import fs from 'fs';
import { Worksheet } from '../models/Worksheet.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { contentClassJsonFields, resolveContentClasses } from '../utils/schoolClass.js';
import {
  buildObjectKey,
  deleteObject,
  keyFromPublicUrl,
  uploadDiskFile,
} from '../utils/storage.js';
import { assertEndDateNotBefore, readEndDate, readStartDate } from '../utils/examWindow.js';
import { contentAccessJson, readAccessMode } from '../utils/contentAccess.js';
import { ensureContentJoinCode } from '../utils/joinCode.js';

function toWorksheetJson(doc) {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
    ...contentAccessJson(doc),
    coverImageUrl: doc.coverImageUrl,
    fileUrl: doc.fileUrl,
    fileName: doc.fileName,
    fileMimeType: doc.fileMimeType,
    fileSize: doc.fileSize,
    startDate: doc.startDate || null,
    endDate: doc.endDate || null,
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

async function unlinkTemp(file) {
  if (file?.path) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
}

async function uploadCover(file) {
  if (!file?.path) throw new ApiError(400, 'Cover image is required');
  const key = buildObjectKey('worksheets/covers', file.originalname);
  const url = await uploadDiskFile({
    filePath: file.path,
    contentType: file.mimetype,
    key,
  });
  return { url, key };
}

async function uploadFile(file) {
  if (!file?.path) throw new ApiError(400, 'Worksheet file is required');
  const key = buildObjectKey('worksheets/files', file.originalname);
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

export const listWorksheets = asyncHandler(async (_req, res) => {
  const worksheets = await Worksheet.find()
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .sort({ publishedAt: -1, createdAt: -1 });
  for (const doc of worksheets) {
    await ensureContentJoinCode(doc);
  }
  res.status(200).json({
    success: true,
    data: { worksheets: worksheets.map(toWorksheetJson) },
  });
});

export const getWorksheet = asyncHandler(async (req, res) => {
  const worksheet = await Worksheet.findById(req.params.id)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!worksheet) throw new ApiError(404, 'Worksheet not found');
  await ensureContentJoinCode(worksheet);
  res.status(200).json({
    success: true,
    data: { worksheet: toWorksheetJson(worksheet) },
  });
});

export const createWorksheet = asyncHandler(async (req, res) => {
  const { title, description, isPublished, startDate, endDate } = req.body;
  const cover = req.files?.coverImage?.[0];
  const file = req.files?.file?.[0];

  try {
    if (!title?.trim()) throw new ApiError(400, 'Title is required');
    const { studentClasses, studentClass } = await resolveContentClasses(req.body);
    const starts = readStartDate(startDate, { label: 'starting date and time' });
    const ends = readEndDate(endDate);
    assertEndDateNotBefore(ends, starts, 'starting date and time');

    if (!cover) throw new ApiError(400, 'Cover image is required');
    if (!file) throw new ApiError(400, 'Worksheet file is required');

    const coverUpload = await uploadCover(cover);
    let fileUpload;
    try {
      fileUpload = await uploadFile(file);
    } catch (err) {
      await deleteObject(coverUpload.key);
      throw err;
    }

    const published = parsePublished(isPublished);

    const worksheet = await Worksheet.create({
      title: title.trim(),
      description: description?.trim() || '',
      studentClass,
      studentClasses,
      coverImageUrl: coverUpload.url,
      coverImageKey: coverUpload.key,
      fileUrl: fileUpload.url,
      fileKey: fileUpload.key,
      fileName: fileUpload.fileName,
      fileMimeType: fileUpload.fileMimeType,
      fileSize: fileUpload.fileSize,
      startDate: starts,
      endDate: ends,
      isPublished: published,
      accessMode: readAccessMode(req.body.accessMode),
      publishedAt: published ? new Date() : null,
      createdBy: req.admin._id,
    });

    await ensureContentJoinCode(worksheet);
    await worksheet.populate([
      { path: 'studentClass', select: 'name' },
      { path: 'studentClasses', select: 'name' },
    ]);

    res.status(201).json({
      success: true,
      message: 'Worksheet created',
      data: { worksheet: toWorksheetJson(worksheet) },
    });
  } catch (err) {
    await unlinkTemp(cover);
    await unlinkTemp(file);
    throw err;
  }
});

export const updateWorksheet = asyncHandler(async (req, res) => {
  const worksheet = await Worksheet.findById(req.params.id);
  if (!worksheet) throw new ApiError(404, 'Worksheet not found');

  const { title, description, isPublished, startDate, endDate } = req.body;
  const cover = req.files?.coverImage?.[0];
  const file = req.files?.file?.[0];

  try {
    if (title !== undefined) {
      if (!String(title).trim()) throw new ApiError(400, 'Title cannot be empty');
      worksheet.title = String(title).trim();
    }
    if (description !== undefined) {
      worksheet.description = String(description).trim();
    }
    if (req.body.studentClasses !== undefined || req.body.studentClass !== undefined) {
      const { studentClasses, studentClass } = await resolveContentClasses(req.body);
      worksheet.studentClasses = studentClasses;
      worksheet.studentClass = studentClass;
    }
    if (startDate !== undefined) {
      worksheet.startDate = readStartDate(startDate, { label: 'starting date and time' });
    }
    if (endDate !== undefined) worksheet.endDate = readEndDate(endDate);
    assertEndDateNotBefore(worksheet.endDate, worksheet.startDate, 'starting date and time');

    if (cover) {
      const prevKey = worksheet.coverImageKey || keyFromPublicUrl(worksheet.coverImageUrl);
      const coverUpload = await uploadCover(cover);
      worksheet.coverImageUrl = coverUpload.url;
      worksheet.coverImageKey = coverUpload.key;
      await deleteObject(prevKey);
    }

    if (file) {
      const prevKey = worksheet.fileKey || keyFromPublicUrl(worksheet.fileUrl);
      const fileUpload = await uploadFile(file);
      worksheet.fileUrl = fileUpload.url;
      worksheet.fileKey = fileUpload.key;
      worksheet.fileName = fileUpload.fileName;
      worksheet.fileMimeType = fileUpload.fileMimeType;
      worksheet.fileSize = fileUpload.fileSize;
      await deleteObject(prevKey);
    }

    if (isPublished !== undefined) {
      const published = parsePublished(isPublished);
      if (published && !worksheet.isPublished) {
        worksheet.publishedAt = new Date();
      }
      if (!published) {
        worksheet.publishedAt = null;
      }
      worksheet.isPublished = published;
    }

    if (req.body.accessMode !== undefined) {
      worksheet.accessMode = readAccessMode(req.body.accessMode, worksheet.accessMode);
    }
    await ensureContentJoinCode(worksheet, { save: false });
    await worksheet.save();
    await worksheet.populate([
      { path: 'studentClass', select: 'name' },
      { path: 'studentClasses', select: 'name' },
    ]);

    res.status(200).json({
      success: true,
      message: 'Worksheet updated',
      data: { worksheet: toWorksheetJson(worksheet) },
    });
  } catch (err) {
    await unlinkTemp(cover);
    await unlinkTemp(file);
    throw err;
  }
});

export const deleteWorksheet = asyncHandler(async (req, res) => {
  const worksheet = await Worksheet.findByIdAndDelete(req.params.id);
  if (!worksheet) throw new ApiError(404, 'Worksheet not found');

  await deleteObject(worksheet.coverImageKey || keyFromPublicUrl(worksheet.coverImageUrl));
  await deleteObject(worksheet.fileKey || keyFromPublicUrl(worksheet.fileUrl));

  res.status(200).json({
    success: true,
    message: 'Worksheet deleted',
  });
});
