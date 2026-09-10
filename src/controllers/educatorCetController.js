import mongoose from 'mongoose';
import { ChapterEndTest } from '../models/ChapterEndTest.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  assertActiveClassId,
  classRefFields,
  listActiveClasses,
  toPublicClass,
} from '../utils/schoolClass.js';

const PUBLIC_FIELDS =
  'title description studentClass chapterNumber chapterName coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt';

function toEducatorCetJson(doc) {
  const classFields = classRefFields(doc.studentClass);
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    studentClass: classFields.studentClass,
    studentClassName: classFields.studentClassName,
    chapterNumber: doc.chapterNumber,
    chapterName: doc.chapterName,
    coverImageUrl: doc.coverImageUrl,
    fileUrl: doc.fileUrl,
    fileName: doc.fileName,
    fileMimeType: doc.fileMimeType,
    fileSize: doc.fileSize,
    publishedAt: doc.publishedAt,
    createdAt: doc.createdAt,
  };
}

export const listEducatorCets = asyncHandler(async (req, res) => {
  const filter = { isPublished: true };
  const studentClass =
    typeof req.query.studentClass === 'string' ? req.query.studentClass.trim() : '';

  if (studentClass) {
    await assertActiveClassId(studentClass);
    filter.studentClass = new mongoose.Types.ObjectId(studentClass);
  }

  const [cets, classes] = await Promise.all([
    ChapterEndTest.find(filter)
      .populate('studentClass', 'name')
      .sort({ studentClass: 1, chapterNumber: 1, createdAt: -1 })
      .select(PUBLIC_FIELDS),
    listActiveClasses(),
  ]);

  res.status(200).json({
    success: true,
    data: {
      studentClass: studentClass || null,
      classes: classes.map(toPublicClass),
      cets: cets.map(toEducatorCetJson),
    },
  });
});

export const getEducatorCet = asyncHandler(async (req, res) => {
  const cet = await ChapterEndTest.findOne({
    _id: req.params.id,
    isPublished: true,
  })
    .populate('studentClass', 'name')
    .select(PUBLIC_FIELDS);

  if (!cet) throw new ApiError(404, 'C.E.T. not found');

  res.status(200).json({
    success: true,
    data: { cet: toEducatorCetJson(cet) },
  });
});
