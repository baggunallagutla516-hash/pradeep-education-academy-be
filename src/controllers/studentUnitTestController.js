import { UnitTest } from '../models/UnitTest.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  classRefFields,
  classVisibilityForStudent,
  contentClassJsonFields,
} from '../utils/schoolClass.js';
import { downloadWindowFields } from '../utils/examWindow.js';
import { includeInStudentList } from '../utils/contentAccess.js';

const PUBLIC_FIELDS =
  'title description studentClass studentClasses unitNumber unitName coverImageUrl fileUrl fileName fileMimeType fileSize startDate endDate publishedAt createdAt accessMode';

function toStudentUnitTestJson(doc) {
  const window = downloadWindowFields(doc);
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
    unitNumber: doc.unitNumber,
    unitName: doc.unitName,
    coverImageUrl: doc.coverImageUrl,
    fileUrl: window.fileUrl,
    fileName: doc.fileName,
    fileMimeType: doc.fileMimeType,
    fileSize: doc.fileSize,
    startDate: window.startDate,
    endDate: window.endDate,
    isNotYetOpen: window.isNotYetOpen,
    isClosed: window.isClosed,
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
    ...classVisibilityForStudent(classId),
  })
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .sort({ unitNumber: 1, createdAt: -1 })
    .select(PUBLIC_FIELDS);

  const classFields = classRefFields(req.user.studentClass);

  res.status(200).json({
    success: true,
    data: {
      studentClass: classFields.studentClass,
      studentClassName: classFields.studentClassName,
      unitTests: unitTests.filter((doc) => includeInStudentList(doc)).map(toStudentUnitTestJson),
    },
  });
});

export const getStudentUnitTest = asyncHandler(async (req, res) => {
  const unitTest = await UnitTest.findOne({
    _id: req.params.id,
    isPublished: true,
    ...classVisibilityForStudent(studentClassId(req.user)),
  })
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .select(PUBLIC_FIELDS);

  if (!unitTest) throw new ApiError(404, 'Unit test not found');

  res.status(200).json({
    success: true,
    data: { unitTest: toStudentUnitTestJson(unitTest) },
  });
});
