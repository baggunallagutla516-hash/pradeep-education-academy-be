import mongoose from 'mongoose';
import { Worksheet } from '../models/Worksheet.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  assertActiveClassId,
  classRefFields,
  listActiveClasses,
  toPublicClass,
} from '../utils/schoolClass.js';

function toEducatorWorksheetJson(doc) {
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

export const listEducatorWorksheets = asyncHandler(async (req, res) => {
  const filter = { isPublished: true };
  const studentClass =
    typeof req.query.studentClass === 'string' ? req.query.studentClass.trim() : '';

  if (studentClass) {
    await assertActiveClassId(studentClass);
    filter.studentClass = new mongoose.Types.ObjectId(studentClass);
  }

  const [worksheets, classes] = await Promise.all([
    Worksheet.find(filter)
      .populate('studentClass', 'name')
      .sort({ publishedAt: -1, createdAt: -1 })
      .select(
        'title description studentClass coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt'
      ),
    listActiveClasses(),
  ]);

  res.status(200).json({
    success: true,
    data: {
      studentClass: studentClass || null,
      classes: classes.map(toPublicClass),
      worksheets: worksheets.map(toEducatorWorksheetJson),
    },
  });
});

export const getEducatorWorksheet = asyncHandler(async (req, res) => {
  const worksheet = await Worksheet.findOne({
    _id: req.params.id,
    isPublished: true,
  })
    .populate('studentClass', 'name')
    .select(
      'title description studentClass coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt'
    );

  if (!worksheet) throw new ApiError(404, 'Worksheet not found');

  res.status(200).json({
    success: true,
    data: { worksheet: toEducatorWorksheetJson(worksheet) },
  });
});
