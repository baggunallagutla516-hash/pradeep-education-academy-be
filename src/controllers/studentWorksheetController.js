import { Worksheet } from '../models/Worksheet.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

function toStudentWorksheetJson(doc) {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    studentClass: doc.studentClass,
    coverImageUrl: doc.coverImageUrl,
    fileUrl: doc.fileUrl,
    fileName: doc.fileName,
    fileMimeType: doc.fileMimeType,
    fileSize: doc.fileSize,
    publishedAt: doc.publishedAt,
    createdAt: doc.createdAt,
  };
}

export const listStudentWorksheets = asyncHandler(async (req, res) => {
  const studentClass = req.user.studentClass;

  const worksheets = await Worksheet.find({
    isPublished: true,
    studentClass,
  })
    .sort({ publishedAt: -1, createdAt: -1 })
    .select(
      'title description studentClass coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt'
    );

  res.status(200).json({
    success: true,
    data: {
      studentClass,
      worksheets: worksheets.map(toStudentWorksheetJson),
    },
  });
});

export const getStudentWorksheet = asyncHandler(async (req, res) => {
  const worksheet = await Worksheet.findOne({
    _id: req.params.id,
    isPublished: true,
    studentClass: req.user.studentClass,
  }).select(
    'title description studentClass coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt'
  );

  if (!worksheet) throw new ApiError(404, 'Worksheet not found');

  res.status(200).json({
    success: true,
    data: { worksheet: toStudentWorksheetJson(worksheet) },
  });
});
