import fs from 'fs';
import { UnitTest } from '../models/UnitTest.js';
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

function resolveSubjectName(doc) {
  return String(doc.subjectName || doc.unitName || '').trim();
}

function toUnitTestJson(doc) {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
    subjectName: resolveSubjectName(doc),
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

function parseSubjectName(value) {
  const name = String(value ?? '').trim();
  if (!name) throw new ApiError(400, 'Subject name is required');
  if (name.length > 160) throw new ApiError(400, 'Subject name cannot exceed 160 characters');
  return name;
}

async function unlinkTemp(file) {
  if (file?.path) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
}

async function uploadCover(file) {
  const key = buildObjectKey('unit-tests/covers', file.originalname);
  const url = await uploadDiskFile({
    filePath: file.path,
    contentType: file.mimetype,
    key,
  });
  return { url, key };
}

async function uploadFile(file) {
  if (!file?.path) throw new ApiError(400, 'Question paper file is required');
  const key = buildObjectKey('unit-tests/files', file.originalname);
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

export const listUnitTests = asyncHandler(async (_req, res) => {
  const unitTests = await UnitTest.find()
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .sort({ studentClass: 1, createdAt: -1 });
  for (const doc of unitTests) {
    await ensureContentJoinCode(doc);
  }
  res.status(200).json({
    success: true,
    data: { unitTests: unitTests.map(toUnitTestJson) },
  });
});

export const getUnitTest = asyncHandler(async (req, res) => {
  const unitTest = await UnitTest.findById(req.params.id)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!unitTest) throw new ApiError(404, 'Unit test not found');
  await ensureContentJoinCode(unitTest);
  res.status(200).json({
    success: true,
    data: { unitTest: toUnitTestJson(unitTest) },
  });
});

export const createUnitTest = asyncHandler(async (req, res) => {
  const { title, description, subjectName, isPublished, startDate, endDate } = req.body;
  const cover = req.files?.coverImage?.[0];
  const file = req.files?.file?.[0];

  try {
    if (!title?.trim()) throw new ApiError(400, 'Title is required');
    const { studentClasses, studentClass } = await resolveContentClasses(req.body);
    const subject = parseSubjectName(subjectName);
    const starts = readStartDate(startDate, { label: 'starting date and time' });
    const ends = readEndDate(endDate);
    assertEndDateNotBefore(ends, starts, 'starting date and time');

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

    const unitTest = await UnitTest.create({
      title: title.trim(),
      description: description?.trim() || '',
      studentClass,
      studentClasses,
      subjectName: subject,
      unitNumber: null,
      unitName: '',
      coverImageUrl: coverUpload?.url || '',
      coverImageKey: coverUpload?.key || '',
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

    await ensureContentJoinCode(unitTest);
    await unitTest.populate([
      { path: 'studentClass', select: 'name' },
      { path: 'studentClasses', select: 'name' },
    ]);

    res.status(201).json({
      success: true,
      message: 'Unit test created',
      data: { unitTest: toUnitTestJson(unitTest) },
    });
  } catch (err) {
    await unlinkTemp(cover);
    await unlinkTemp(file);
    throw err;
  }
});

export const updateUnitTest = asyncHandler(async (req, res) => {
  const unitTest = await UnitTest.findById(req.params.id);
  if (!unitTest) throw new ApiError(404, 'Unit test not found');

  const { title, description, subjectName, isPublished, removeCoverImage, startDate, endDate } =
    req.body;
  const cover = req.files?.coverImage?.[0];
  const file = req.files?.file?.[0];

  try {
    if (title !== undefined) {
      if (!String(title).trim()) throw new ApiError(400, 'Title cannot be empty');
      unitTest.title = String(title).trim();
    }
    if (description !== undefined) {
      unitTest.description = String(description).trim();
    }
    if (req.body.studentClasses !== undefined || req.body.studentClass !== undefined) {
      const { studentClasses, studentClass } = await resolveContentClasses(req.body);
      unitTest.studentClasses = studentClasses;
      unitTest.studentClass = studentClass;
    }
    if (subjectName !== undefined) {
      unitTest.subjectName = parseSubjectName(subjectName);
      unitTest.unitNumber = null;
      unitTest.unitName = '';
    }
    if (startDate !== undefined) {
      unitTest.startDate = readStartDate(startDate, { label: 'starting date and time' });
    }
    if (endDate !== undefined) unitTest.endDate = readEndDate(endDate);
    assertEndDateNotBefore(unitTest.endDate, unitTest.startDate, 'starting date and time');

    if (cover) {
      const prevKey = unitTest.coverImageKey || keyFromPublicUrl(unitTest.coverImageUrl);
      const coverUpload = await uploadCover(cover);
      unitTest.coverImageUrl = coverUpload.url;
      unitTest.coverImageKey = coverUpload.key;
      await deleteObject(prevKey);
    } else if (removeCoverImage === 'true' || removeCoverImage === true) {
      const prevKey = unitTest.coverImageKey || keyFromPublicUrl(unitTest.coverImageUrl);
      unitTest.coverImageUrl = '';
      unitTest.coverImageKey = '';
      await deleteObject(prevKey);
    }

    if (file) {
      const prevKey = unitTest.fileKey || keyFromPublicUrl(unitTest.fileUrl);
      const fileUpload = await uploadFile(file);
      unitTest.fileUrl = fileUpload.url;
      unitTest.fileKey = fileUpload.key;
      unitTest.fileName = fileUpload.fileName;
      unitTest.fileMimeType = fileUpload.fileMimeType;
      unitTest.fileSize = fileUpload.fileSize;
      await deleteObject(prevKey);
    }

    if (isPublished !== undefined) {
      const published = parsePublished(isPublished);
      if (published && !unitTest.isPublished) {
        unitTest.publishedAt = new Date();
      }
      if (!published) {
        unitTest.publishedAt = null;
      }
      unitTest.isPublished = published;
    }

    if (req.body.accessMode !== undefined) {
      unitTest.accessMode = readAccessMode(req.body.accessMode, unitTest.accessMode);
    }
    await ensureContentJoinCode(unitTest, { save: false });
    await unitTest.save();
    await unitTest.populate([
      { path: 'studentClass', select: 'name' },
      { path: 'studentClasses', select: 'name' },
    ]);

    res.status(200).json({
      success: true,
      message: 'Unit test updated',
      data: { unitTest: toUnitTestJson(unitTest) },
    });
  } catch (err) {
    await unlinkTemp(cover);
    await unlinkTemp(file);
    throw err;
  }
});

export const deleteUnitTest = asyncHandler(async (req, res) => {
  const unitTest = await UnitTest.findByIdAndDelete(req.params.id);
  if (!unitTest) throw new ApiError(404, 'Unit test not found');

  await deleteObject(unitTest.coverImageKey || keyFromPublicUrl(unitTest.coverImageUrl));
  await deleteObject(unitTest.fileKey || keyFromPublicUrl(unitTest.fileUrl));

  res.status(200).json({
    success: true,
    message: 'Unit test deleted',
  });
});
