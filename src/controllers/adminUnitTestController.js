import fs from 'fs';
import { UnitTest } from '../models/UnitTest.js';
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

function toUnitTestJson(doc) {
  const classFields = classRefFields(doc.studentClass);
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    studentClass: classFields.studentClass,
    studentClassName: classFields.studentClassName,
    unitNumber: doc.unitNumber,
    unitName: doc.unitName,
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

function parseUnitNumber(value) {
  const num = Number(String(value ?? '').trim());
  if (!Number.isInteger(num) || num < 1 || num > 200) {
    throw new ApiError(400, 'Unit number must be a whole number between 1 and 200');
  }
  return num;
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
    .sort({ studentClass: 1, unitNumber: 1, createdAt: -1 });
  res.status(200).json({
    success: true,
    data: { unitTests: unitTests.map(toUnitTestJson) },
  });
});

export const getUnitTest = asyncHandler(async (req, res) => {
  const unitTest = await UnitTest.findById(req.params.id).populate('studentClass', 'name');
  if (!unitTest) throw new ApiError(404, 'Unit test not found');
  res.status(200).json({
    success: true,
    data: { unitTest: toUnitTestJson(unitTest) },
  });
});

export const createUnitTest = asyncHandler(async (req, res) => {
  const { title, description, studentClass, unitNumber, unitName, isPublished } = req.body;
  const cover = req.files?.coverImage?.[0];
  const file = req.files?.file?.[0];

  try {
    if (!title?.trim()) throw new ApiError(400, 'Title is required');
    if (!studentClass?.trim()) throw new ApiError(400, 'Class is required');
    await assertActiveClassId(studentClass);
    const unit = parseUnitNumber(unitNumber);

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
      unitNumber: unit,
      unitName: unitName?.trim() || '',
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

    await unitTest.populate('studentClass', 'name');

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

  const { title, description, studentClass, unitNumber, unitName, isPublished, removeCoverImage } =
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
    if (studentClass !== undefined) {
      await assertActiveClassId(studentClass);
      unitTest.studentClass = studentClass;
    }
    if (unitNumber !== undefined) {
      unitTest.unitNumber = parseUnitNumber(unitNumber);
    }
    if (unitName !== undefined) {
      unitTest.unitName = String(unitName).trim();
    }

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

    await unitTest.save();
    await unitTest.populate('studentClass', 'name');

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
