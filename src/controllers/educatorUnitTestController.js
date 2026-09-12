import { UnitTest } from '../models/UnitTest.js';
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
  'title description studentClass studentClasses unitNumber unitName coverImageUrl fileUrl fileName fileMimeType fileSize publishedAt createdAt';

function toEducatorUnitTestJson(doc) {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
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

export const listEducatorUnitTests = asyncHandler(async (req, res) => {
  const queryClass =
    typeof req.query.studentClass === 'string' ? req.query.studentClass.trim() : '';
  const { filter: classFilter, assignedIds, selectedClass } = await buildAssignedClassFilter(
    req.educator,
    queryClass
  );
  const filter = { isPublished: true, ...classFilter };

  const [unitTests, classDocs] = await Promise.all([
    UnitTest.find(filter)
      .populate('studentClass', 'name')
      .populate('studentClasses', 'name')
      .sort({ studentClass: 1, unitNumber: 1, createdAt: -1 })
      .select(PUBLIC_FIELDS),
    listClassesByIds(assignedIds),
  ]);

  res.status(200).json({
    success: true,
    data: {
      studentClass: selectedClass,
      classes: classDocs.map(toPublicClass),
      unitTests: unitTests.map(toEducatorUnitTestJson),
    },
  });
});

export const getEducatorUnitTest = asyncHandler(async (req, res) => {
  const unitTest = await UnitTest.findOne({
    _id: req.params.id,
    isPublished: true,
  })
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .select(PUBLIC_FIELDS);

  if (!unitTest) throw new ApiError(404, 'Unit test not found');
  assertDocInAssignedClasses(unitTest, req.educator, 'Unit test');

  res.status(200).json({
    success: true,
    data: { unitTest: toEducatorUnitTestJson(unitTest) },
  });
});
