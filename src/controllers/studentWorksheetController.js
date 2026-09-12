import { Worksheet } from '../models/Worksheet.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  classRefFields,
  classVisibilityForStudent,
  contentClassJsonFields,
} from '../utils/schoolClass.js';

function toStudentWorksheetJson(doc) {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
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

export const listStudentWorksheets = asyncHandler(async (req, res) => {
  const classId = studentClassId(req.user);

  const worksheets = await Worksheet.find({
    isPublished: true,
    ...classVisibilityForStudent(classId),
  })
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .sort({ publishedAt: -1, createdAt: -1 })
    .select(
      'title description studentClass studentClasses coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt'
    );

  const classFields = classRefFields(req.user.studentClass);

  res.status(200).json({
    success: true,
    data: {
      studentClass: classFields.studentClass,
      studentClassName: classFields.studentClassName,
      worksheets: worksheets.map(toStudentWorksheetJson),
    },
  });
});

export const getStudentWorksheet = asyncHandler(async (req, res) => {
  const worksheet = await Worksheet.findOne({
    _id: req.params.id,
    isPublished: true,
    ...classVisibilityForStudent(studentClassId(req.user)),
  })
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .select(
      'title description studentClass studentClasses coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt'
    );

  if (!worksheet) throw new ApiError(404, 'Worksheet not found');

  res.status(200).json({
    success: true,
    data: { worksheet: toStudentWorksheetJson(worksheet) },
  });
});
