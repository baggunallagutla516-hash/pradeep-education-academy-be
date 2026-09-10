import { SchoolClass, toPublicClass } from '../models/SchoolClass.js';
import { Student } from '../models/Student.js';
import { Worksheet } from '../models/Worksheet.js';
import { UnitTest } from '../models/UnitTest.js';
import { ChapterEndTest } from '../models/ChapterEndTest.js';
import { Assessment } from '../models/Assessment.js';
import { Dpp } from '../models/Dpp.js';
import { SlipTest } from '../models/SlipTest.js';
import { getSiteSettings, toPublicSiteSettings } from '../models/SiteSettings.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listAllClasses } from '../utils/schoolClass.js';
import {
  assertStorageConfigured,
  buildObjectKey,
  deleteObject,
  keyFromPublicUrl,
  uploadDiskFile,
} from '../utils/storage.js';

export const getAdminSettings = asyncHandler(async (_req, res) => {
  const settings = await getSiteSettings();
  const classes = await listAllClasses();

  res.status(200).json({
    success: true,
    data: {
      settings: toPublicSiteSettings(settings),
      classes: classes.map(toPublicClass),
    },
  });
});

export const uploadSiteLogo = asyncHandler(async (req, res) => {
  if (!req.file?.path) {
    throw new ApiError(400, 'Logo image is required');
  }

  assertStorageConfigured();

  const settings = await getSiteSettings();
  const previousKey = settings.logoKey || keyFromPublicUrl(settings.logoUrl);

  const key = buildObjectKey('site/logo', req.file.originalname);
  const url = await uploadDiskFile({
    filePath: req.file.path,
    contentType: req.file.mimetype,
    key,
  });

  settings.logoUrl = url;
  settings.logoKey = key;
  if (settings.logoFileName !== undefined) {
    settings.logoFileName = undefined;
  }
  await settings.save();

  if (previousKey && previousKey !== key) {
    await deleteObject(previousKey);
  }

  res.status(200).json({
    success: true,
    message: 'Logo updated',
    data: { settings: toPublicSiteSettings(settings) },
  });
});

export const removeSiteLogo = asyncHandler(async (_req, res) => {
  const settings = await getSiteSettings();
  const previousKey = settings.logoKey || keyFromPublicUrl(settings.logoUrl);

  settings.logoUrl = '';
  settings.logoKey = '';
  if (settings.logoFileName !== undefined) {
    settings.logoFileName = undefined;
  }
  await settings.save();

  if (previousKey) {
    await deleteObject(previousKey);
  }

  res.status(200).json({
    success: true,
    message: 'Logo removed',
    data: { settings: toPublicSiteSettings(settings) },
  });
});

export const createClass = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) throw new ApiError(400, 'Class name is required');

  const maxSort = await SchoolClass.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
  const sortOrder =
    req.body.sortOrder !== undefined && req.body.sortOrder !== ''
      ? Number(req.body.sortOrder)
      : (maxSort?.sortOrder ?? -1) + 1;

  try {
    const doc = await SchoolClass.create({
      name,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: 'Class created',
      data: { class: toPublicClass(doc) },
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(409, 'A class with this name already exists');
    }
    throw err;
  }
});

export const updateClass = asyncHandler(async (req, res) => {
  const doc = await SchoolClass.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Class not found');

  if (req.body.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) throw new ApiError(400, 'Class name is required');
    doc.name = name;
  }
  if (req.body.sortOrder !== undefined && req.body.sortOrder !== '') {
    const sortOrder = Number(req.body.sortOrder);
    if (!Number.isFinite(sortOrder)) throw new ApiError(400, 'Invalid sort order');
    doc.sortOrder = sortOrder;
  }
  if (req.body.isActive !== undefined) {
    doc.isActive = Boolean(req.body.isActive);
  }

  try {
    await doc.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(409, 'A class with this name already exists');
    }
    throw err;
  }

  res.status(200).json({
    success: true,
    message: 'Class updated',
    data: { class: toPublicClass(doc) },
  });
});

export const deleteClass = asyncHandler(async (req, res) => {
  const doc = await SchoolClass.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Class not found');

  const [
    studentCount,
    worksheetCount,
    unitTestCount,
    cetCount,
    assessmentCount,
    dppCount,
    slipTestCount,
  ] = await Promise.all([
    Student.countDocuments({ studentClass: doc._id, deletedAt: null }),
    Worksheet.countDocuments({ studentClass: doc._id }),
    UnitTest.countDocuments({ studentClass: doc._id }),
    ChapterEndTest.countDocuments({ studentClass: doc._id }),
    Assessment.countDocuments({ studentClass: doc._id }),
    Dpp.countDocuments({ studentClass: doc._id }),
    SlipTest.countDocuments({ studentClass: doc._id }),
  ]);

  if (
    studentCount > 0 ||
    worksheetCount > 0 ||
    unitTestCount > 0 ||
    cetCount > 0 ||
    assessmentCount > 0 ||
    dppCount > 0 ||
    slipTestCount > 0
  ) {
    throw new ApiError(
      409,
      `Cannot delete this class while it is used by ${studentCount} student(s), ${worksheetCount} worksheet(s), ${unitTestCount} unit test(s), ${cetCount} C.E.T.(s), ${assessmentCount} assessment(s), ${dppCount} DPP(s), and ${slipTestCount} slip test(s)`
    );
  }

  await doc.deleteOne();
  res.status(200).json({
    success: true,
    message: 'Class deleted',
  });
});
