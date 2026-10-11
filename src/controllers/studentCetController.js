import { ChapterEndTest } from '../models/ChapterEndTest.js';
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
  'title description studentClass studentClasses chapterNumber chapterName coverImageUrl fileUrl fileName fileMimeType fileSize startDate endDate publishedAt createdAt accessMode';

function toStudentCetJson(doc) {
  const window = downloadWindowFields(doc);
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
    chapterNumber: doc.chapterNumber,
    chapterName: doc.chapterName,
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

export const listStudentCets = asyncHandler(async (req, res) => {
  const classId = studentClassId(req.user);

  const cets = await ChapterEndTest.find({
    isPublished: true,
    ...classVisibilityForStudent(classId),
  })
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .sort({ chapterNumber: 1, createdAt: -1 })
    .select(PUBLIC_FIELDS);

  const classFields = classRefFields(req.user.studentClass);

  res.status(200).json({
    success: true,
    data: {
      studentClass: classFields.studentClass,
      studentClassName: classFields.studentClassName,
      cets: cets.filter((doc) => includeInStudentList(doc)).map(toStudentCetJson),
    },
  });
});

export const getStudentCet = asyncHandler(async (req, res) => {
  const cet = await ChapterEndTest.findOne({
    _id: req.params.id,
    isPublished: true,
    ...classVisibilityForStudent(studentClassId(req.user)),
  })
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .select(PUBLIC_FIELDS);

  if (!cet) throw new ApiError(404, 'C.E.T. not found');

  res.status(200).json({
    success: true,
    data: { cet: toStudentCetJson(cet) },
  });
});
