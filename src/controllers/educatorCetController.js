import { ChapterEndTest } from '../models/ChapterEndTest.js';
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
  'title description studentClass studentClasses chapterNumber chapterName coverImageUrl fileUrl fileName fileMimeType fileSize startDate endDate publishedAt createdAt priceType';

function toEducatorCetJson(doc, { isPurchased = false, paymentStatus = 'none', paymentUtr = '' } = {}) {
  const window = applyPurchaseGate(downloadWindowFields(doc), doc, { isPurchased });
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

  const statusMap = await findPurchaseStatusByContentIds({
    buyerType: 'educator',
    buyerId: req.educator._id,
    contentType: 'cet',
    contentIds: cets.map((doc) => doc._id),
  });

  res.status(200).json({
    success: true,
    data: {
      studentClass: selectedClass,
      classes: classDocs.map(toPublicClass),
      cets: cets.map((doc) => {
        const info = statusMap.get(String(doc._id));
        return toEducatorCetJson(doc, {
          isPurchased: info?.isPurchased,
          paymentStatus: info?.status || 'none',
          paymentUtr: info?.utr || '',
        });
      }),
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

  const statusMap = await findPurchaseStatusByContentIds({
    buyerType: 'educator',
    buyerId: req.educator._id,
    contentType: 'cet',
    contentIds: [cet._id],
  });
  const info = statusMap.get(String(cet._id));

  res.status(200).json({
    success: true,
    data: {
      cet: toEducatorCetJson(cet, {
        isPurchased: info?.isPurchased,
        paymentStatus: info?.status || 'none',
        paymentUtr: info?.utr || '',
      }),
    },
  });
});
