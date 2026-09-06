import fs from 'fs';
import path from 'path';
import { SchoolClass, toPublicClass } from '../models/SchoolClass.js';
import { Student } from '../models/Student.js';
import { Worksheet } from '../models/Worksheet.js';
import { getSiteSettings, toPublicSiteSettings } from '../models/SiteSettings.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { uploadsDir } from '../middleware/upload.js';
import { listAllClasses } from '../utils/schoolClass.js';

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
  if (!req.file) {
    throw new ApiError(400, 'Logo image is required');
  }

  const settings = await getSiteSettings();
  const previousFile = settings.logoFileName;

  settings.logoUrl = `/uploads/${req.file.filename}`;
  settings.logoFileName = req.file.filename;
  await settings.save();

  if (previousFile && previousFile !== req.file.filename) {
    const prevPath = path.join(uploadsDir, previousFile);
    fs.promises.unlink(prevPath).catch(() => {});
  }

  res.status(200).json({
    success: true,
    message: 'Logo updated',
    data: { settings: toPublicSiteSettings(settings) },
  });
});

export const removeSiteLogo = asyncHandler(async (_req, res) => {
  const settings = await getSiteSettings();
  const previousFile = settings.logoFileName;

  settings.logoUrl = '';
  settings.logoFileName = '';
  await settings.save();

  if (previousFile) {
    const prevPath = path.join(uploadsDir, previousFile);
    fs.promises.unlink(prevPath).catch(() => {});
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

  const [studentCount, worksheetCount] = await Promise.all([
    Student.countDocuments({ studentClass: doc._id, deletedAt: null }),
    Worksheet.countDocuments({ studentClass: doc._id }),
  ]);

  if (studentCount > 0 || worksheetCount > 0) {
    throw new ApiError(
      409,
      `Cannot delete this class while it is used by ${studentCount} student(s) and ${worksheetCount} worksheet(s)`
    );
  }

  await doc.deleteOne();
  res.status(200).json({
    success: true,
    message: 'Class deleted',
  });
});
