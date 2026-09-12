import { Worksheet } from '../models/Worksheet.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  assertDocInAssignedClasses,
  buildAssignedClassFilter,
  contentClassJsonFields,
  listClassesByIds,
  toPublicClass,
} from '../utils/schoolClass.js';

function toEducatorWorksheetJson(doc) {
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

export const listEducatorWorksheets = asyncHandler(async (req, res) => {
  const queryClass =
    typeof req.query.studentClass === 'string' ? req.query.studentClass.trim() : '';
  const { filter: classFilter, assignedIds, selectedClass } = await buildAssignedClassFilter(
    req.educator,
    queryClass
  );
  const filter = { isPublished: true, ...classFilter };

  const [worksheets, classDocs] = await Promise.all([
    Worksheet.find(filter)
      .populate('studentClass', 'name')
      .populate('studentClasses', 'name')
      .sort({ publishedAt: -1, createdAt: -1 })
      .select(
        'title description studentClass studentClasses coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt'
      ),
    listClassesByIds(assignedIds),
  ]);

  res.status(200).json({
    success: true,
    data: {
      studentClass: selectedClass,
      classes: classDocs.map(toPublicClass),
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
    .populate('studentClasses', 'name')
    .select(
      'title description studentClass studentClasses coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt'
    );

  if (!worksheet) throw new ApiError(404, 'Worksheet not found');
  assertDocInAssignedClasses(worksheet, req.educator, 'Worksheet');

  res.status(200).json({
    success: true,
    data: { worksheet: toEducatorWorksheetJson(worksheet) },
  });
});
