import { ChapterEndTest } from '../models/ChapterEndTest.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  assertDocInAssignedClasses,
  buildAssignedClassFilter,
  contentClassJsonFields,
  listClassesByIds,
  toPublicClass,
} from '../utils/schoolClass.js';

const PUBLIC_FIELDS =
  'title description studentClass studentClasses chapterNumber chapterName coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt';

function toEducatorCetJson(doc) {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
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
  const queryClass =
    typeof req.query.studentClass === 'string' ? req.query.studentClass.trim() : '';
  const { filter: classFilter, assignedIds, selectedClass } = await buildAssignedClassFilter(
    req.educator,
    queryClass
  );
  const filter = { isPublished: true, ...classFilter };

  const [cets, classDocs] = await Promise.all([
    ChapterEndTest.find(filter)
      .populate('studentClass', 'name')
      .populate('studentClasses', 'name')
      .sort({ studentClass: 1, chapterNumber: 1, createdAt: -1 })
      .select(PUBLIC_FIELDS),
    listClassesByIds(assignedIds),
  ]);

  res.status(200).json({
    success: true,
    data: {
      studentClass: selectedClass,
      classes: classDocs.map(toPublicClass),
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
    .populate('studentClasses', 'name')
    .select(PUBLIC_FIELDS);

  if (!cet) throw new ApiError(404, 'C.E.T. not found');
  assertDocInAssignedClasses(cet, req.educator, 'C.E.T.');

  res.status(200).json({
    success: true,
    data: { cet: toEducatorCetJson(cet) },
  });
});
