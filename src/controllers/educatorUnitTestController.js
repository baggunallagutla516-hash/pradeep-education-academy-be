import { UnitTest } from '../models/UnitTest.js';
import {
  findPurchaseStatusByContentIds,
  purchaseStatusFields,
} from '../models/ContentPurchase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  assertDocInAssignedClasses,
  buildAssignedClassFilter,
  contentClassJsonFields,
  listClassesByIds,
  toPublicClass,
} from '../utils/schoolClass.js';
import { downloadWindowFields } from '../utils/examWindow.js';
import { applyPurchaseGate } from '../utils/paperPricing.js';

const PUBLIC_FIELDS =
  'title description studentClass studentClasses subjectName unitName coverImageUrl fileUrl fileName fileMimeType fileSize startDate endDate publishedAt createdAt priceType';

function toEducatorUnitTestJson(doc, paymentInfo = {}) {
  const isPurchased = Boolean(paymentInfo.isPurchased);
  const window = applyPurchaseGate(downloadWindowFields(doc), doc, { isPurchased });
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
    subjectName: String(doc.subjectName || doc.unitName || '').trim(),
    coverImageUrl: doc.coverImageUrl,
    fileUrl: window.fileUrl,
    fileName: doc.fileName,
    fileMimeType: doc.fileMimeType,
    fileSize: doc.fileSize,
    startDate: window.startDate,
    endDate: window.endDate,
    isNotYetOpen: window.isNotYetOpen,
    isClosed: window.isClosed,
    priceType: window.priceType,
    priceAmount: window.priceAmount,
    priceLabel: window.priceLabel,
    priceCaption: window.priceCaption,
    needsPayment: window.needsPayment,
    ...purchaseStatusFields(paymentInfo),
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
      .sort({ studentClass: 1, createdAt: -1 })
      .select(PUBLIC_FIELDS),
    listClassesByIds(assignedIds),
  ]);

  const statusMap = await findPurchaseStatusByContentIds({
    buyerType: 'educator',
    buyerId: req.educator._id,
    contentType: 'unit-test',
    contentIds: unitTests.map((doc) => doc._id),
  });

  res.status(200).json({
    success: true,
    data: {
      studentClass: selectedClass,
      classes: classDocs.map(toPublicClass),
      unitTests: unitTests.map((doc) =>
        toEducatorUnitTestJson(doc, statusMap.get(String(doc._id)))
      ),
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

  const statusMap = await findPurchaseStatusByContentIds({
    buyerType: 'educator',
    buyerId: req.educator._id,
    contentType: 'unit-test',
    contentIds: [unitTest._id],
  });

  res.status(200).json({
    success: true,
    data: {
      unitTest: toEducatorUnitTestJson(unitTest, statusMap.get(String(unitTest._id))),
    },
  });
});
