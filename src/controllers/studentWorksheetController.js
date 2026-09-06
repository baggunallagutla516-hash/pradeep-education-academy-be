import { Worksheet } from '../models/Worksheet.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { classRefFields } from '../utils/schoolClass.js';

function toStudentWorksheetJson(doc) {
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
    studentClass: classId,
  })
    .populate('studentClass', 'name')
    .sort({ publishedAt: -1, createdAt: -1 })
    .select(
      'title description studentClass coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt'
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
    studentClass: studentClassId(req.user),
  })
    .populate('studentClass', 'name')
    .select(
      'title description studentClass coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt'
    );

  if (!worksheet) throw new ApiError(404, 'Worksheet not found');

  res.status(200).json({
    success: true,
    data: { worksheet: toStudentWorksheetJson(worksheet) },
  });
});
