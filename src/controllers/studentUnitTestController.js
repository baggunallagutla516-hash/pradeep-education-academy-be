import { UnitTest } from '../models/UnitTest.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { classRefFields } from '../utils/schoolClass.js';

const PUBLIC_FIELDS =
  'title description studentClass unitNumber unitName coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt';

function toStudentUnitTestJson(doc) {
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

function studentClassId(user) {
  const value = user.studentClass;
  if (!value) return null;
  if (typeof value === 'object' && value._id) return value._id;
  return value;
}

export const listStudentUnitTests = asyncHandler(async (req, res) => {
  const classId = studentClassId(req.user);

  const unitTests = await UnitTest.find({
    isPublished: true,
    studentClass: classId,
  })
    .populate('studentClass', 'name')
    .sort({ unitNumber: 1, createdAt: -1 })
    .select(PUBLIC_FIELDS);

  const classFields = classRefFields(req.user.studentClass);

  res.status(200).json({
    success: true,
    data: {
      studentClass: classFields.studentClass,
      studentClassName: classFields.studentClassName,
      unitTests: unitTests.map(toStudentUnitTestJson),
    },
  });
});

export const getStudentUnitTest = asyncHandler(async (req, res) => {
  const unitTest = await UnitTest.findOne({
    _id: req.params.id,
    isPublished: true,
    studentClass: studentClassId(req.user),
  })
    .populate('studentClass', 'name')
    .select(PUBLIC_FIELDS);

  if (!unitTest) throw new ApiError(404, 'Unit test not found');

  res.status(200).json({
    success: true,
    data: { unitTest: toStudentUnitTestJson(unitTest) },
  });
});
