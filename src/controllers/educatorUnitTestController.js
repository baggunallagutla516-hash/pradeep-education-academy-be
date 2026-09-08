import mongoose from 'mongoose';
import { UnitTest } from '../models/UnitTest.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  assertActiveClassId,
  classRefFields,
  listActiveClasses,
  toPublicClass,
} from '../utils/schoolClass.js';

const PUBLIC_FIELDS =
  'title description studentClass unitNumber unitName coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt';

function toEducatorUnitTestJson(doc) {
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
    publishedAt: doc.publishedAt,
    createdAt: doc.createdAt,
  };
}

export const listEducatorUnitTests = asyncHandler(async (req, res) => {
  const filter = { isPublished: true };
  const studentClass =
    typeof req.query.studentClass === 'string' ? req.query.studentClass.trim() : '';

  if (studentClass) {
    await assertActiveClassId(studentClass);
    filter.studentClass = new mongoose.Types.ObjectId(studentClass);
  }

  const [unitTests, classes] = await Promise.all([
    UnitTest.find(filter)
      .populate('studentClass', 'name')
      .sort({ studentClass: 1, unitNumber: 1, createdAt: -1 })
      .select(PUBLIC_FIELDS),
    listActiveClasses(),
  ]);

  res.status(200).json({
    success: true,
    data: {
      studentClass: studentClass || null,
      classes: classes.map(toPublicClass),
      unitTests: unitTests.map(toEducatorUnitTestJson),
    },
  });
});

export const getEducatorUnitTest = asyncHandler(async (req, res) => {
  const unitTest = await UnitTest.findOne({
    _id: req.params.id,
    isPublished: true,
  })
    .populate('studentClass', 'name')
    .select(PUBLIC_FIELDS);

  if (!unitTest) throw new ApiError(404, 'Unit test not found');

  res.status(200).json({
    success: true,
    data: { unitTest: toEducatorUnitTestJson(unitTest) },
  });
});
