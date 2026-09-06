import { Worksheet } from '../models/Worksheet.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertActiveClassId } from '../utils/schoolClass.js';
import { classRefFields } from '../utils/schoolClass.js';
import {
  buildObjectKey,
  deleteObject,
  keyFromPublicUrl,
  uploadBuffer,
} from '../utils/storage.js';

function toWorksheetJson(doc) {
  const classFields = classRefFields(doc.studentClass);
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    studentClass: classFields.studentClass,
    studentClassName: classFields.studentClassName,
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

async function uploadCover(file) {
  const key = buildObjectKey('worksheets/covers', file.originalname);
  const url = await uploadBuffer({
    buffer: file.buffer,
    contentType: file.mimetype,
    key,
  });
  return { url, key };
}

async function uploadFile(file) {
  const key = buildObjectKey('worksheets/files', file.originalname);
  const url = await uploadBuffer({
    buffer: file.buffer,
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
    .sort({ publishedAt: -1, createdAt: -1 });
  res.status(200).json({
    success: true,
    data: { worksheets: worksheets.map(toWorksheetJson) },
  });
});

export const getWorksheet = asyncHandler(async (req, res) => {
  const worksheet = await Worksheet.findById(req.params.id).populate('studentClass', 'name');
  if (!worksheet) throw new ApiError(404, 'Worksheet not found');
  res.status(200).json({
    success: true,
    data: { worksheet: toWorksheetJson(worksheet) },
  });
});

export const createWorksheet = asyncHandler(async (req, res) => {
  const { title, description, studentClass, isPublished } = req.body;

  if (!title?.trim()) throw new ApiError(400, 'Title is required');
  if (!studentClass?.trim()) throw new ApiError(400, 'Class is required');
  await assertActiveClassId(studentClass);

  const cover = req.files?.coverImage?.[0];
  const file = req.files?.file?.[0];
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
    coverImageUrl: coverUpload.url,
    coverImageKey: coverUpload.key,
    fileUrl: fileUpload.url,
    fileKey: fileUpload.key,
    fileName: fileUpload.fileName,
    fileMimeType: fileUpload.fileMimeType,
    fileSize: fileUpload.fileSize,
    isPublished: published,
    publishedAt: published ? new Date() : null,
    createdBy: req.admin._id,
  });

  await worksheet.populate('studentClass', 'name');

  res.status(201).json({
    success: true,
    message: 'Worksheet created',
    data: { worksheet: toWorksheetJson(worksheet) },
  });
});

export const updateWorksheet = asyncHandler(async (req, res) => {
  const worksheet = await Worksheet.findById(req.params.id);
  if (!worksheet) throw new ApiError(404, 'Worksheet not found');

  const { title, description, studentClass, isPublished } = req.body;

  if (title !== undefined) {
    if (!String(title).trim()) throw new ApiError(400, 'Title cannot be empty');
    worksheet.title = String(title).trim();
  }
  if (description !== undefined) {
    worksheet.description = String(description).trim();
  }
  if (studentClass !== undefined) {
    await assertActiveClassId(studentClass);
    worksheet.studentClass = studentClass;
  }

  const cover = req.files?.coverImage?.[0];
  const file = req.files?.file?.[0];

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

  await worksheet.save();
  await worksheet.populate('studentClass', 'name');

  res.status(200).json({
    success: true,
    message: 'Worksheet updated',
    data: { worksheet: toWorksheetJson(worksheet) },
  });
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
