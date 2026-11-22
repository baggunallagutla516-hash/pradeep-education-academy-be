import { Worksheet } from '../models/Worksheet.js';
import { findPurchaseStatusByContentIds, purchaseStatusFields } from '../models/ContentPurchase.js';
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
  'title description studentClass studentClasses coverImageUrl fileUrl fileName fileMimeType fileSize startDate endDate publishedAt createdAt priceType';

function toEducatorWorksheetJson(doc, { isPurchased = false, paymentStatus = 'none', paymentUtr = '' } = {}) {
  const window = applyPurchaseGate(downloadWindowFields(doc), doc, { isPurchased });
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
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
    ...purchaseStatusFields({ status: paymentStatus, utr: paymentUtr }),
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
      .select(PUBLIC_FIELDS),
    listClassesByIds(assignedIds),
  ]);

  const statusMap = await findPurchaseStatusByContentIds({
    buyerType: 'educator',
    buyerId: req.educator._id,
    contentType: 'worksheet',
    contentIds: worksheets.map((doc) => doc._id),
  });

  res.status(200).json({
    success: true,
    data: {
      studentClass: selectedClass,
      classes: classDocs.map(toPublicClass),
      worksheets: worksheets.map((doc) => {
        const info = statusMap.get(String(doc._id));
        return toEducatorWorksheetJson(doc, {
          isPurchased: info?.isPurchased,
          paymentStatus: info?.status || 'none',
          paymentUtr: info?.utr || '',
        });
      }),
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
    .select(PUBLIC_FIELDS);

  if (!worksheet) throw new ApiError(404, 'Worksheet not found');
  assertDocInAssignedClasses(worksheet, req.educator, 'Worksheet');

  const statusMap = await findPurchaseStatusByContentIds({
    buyerType: 'educator',
    buyerId: req.educator._id,
    contentType: 'worksheet',
    contentIds: [worksheet._id],
  });
  const info = statusMap.get(String(worksheet._id));

  res.status(200).json({
    success: true,
    data: {
      worksheet: toEducatorWorksheetJson(worksheet, {
        isPurchased: info?.isPurchased,
        paymentStatus: info?.status || 'none',
        paymentUtr: info?.utr || '',
      }),
    },
  });
});
