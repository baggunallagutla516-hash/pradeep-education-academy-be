import { Worksheet } from '../models/Worksheet.js';
import { findPurchaseStatusByContentIds, purchaseStatusFields } from '../models/ContentPurchase.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  classRefFields,
  classVisibilityForStudent,
  contentClassJsonFields,
} from '../utils/schoolClass.js';
import { downloadWindowFields } from '../utils/examWindow.js';
import { includeInStudentList } from '../utils/contentAccess.js';
import { applyPurchaseGate } from '../utils/paperPricing.js';

const PUBLIC_FIELDS =
  'title description studentClass studentClasses coverImageUrl fileUrl fileName fileMimeType fileSize startDate endDate publishedAt createdAt accessMode priceType';

function toStudentWorksheetJson(doc, { isPurchased = false, paymentStatus = 'none', paymentUtr = '' } = {}) {
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

function studentClassId(user) {
  const value = user.studentClass;
  if (!value) return null;
  if (typeof value === 'object' && value._id) return value._id;
  return value;
}

export const listStudentWorksheets = asyncHandler(async (req, res) => {
  const classId = studentClassId(req.user);

  const worksheets = await Worksheet.find({
    isPublished: true,
    ...classVisibilityForStudent(classId),
  })
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .sort({ publishedAt: -1, createdAt: -1 })
    .select(PUBLIC_FIELDS);

  const visible = worksheets.filter((doc) => includeInStudentList(doc));
  const statusMap = await findPurchaseStatusByContentIds({
    buyerType: 'student',
    buyerId: req.user._id,
    contentType: 'worksheet',
    contentIds: visible.map((doc) => doc._id),
  });

  const classFields = classRefFields(req.user.studentClass);

  res.status(200).json({
    success: true,
    data: {
      studentClass: classFields.studentClass,
      studentClassName: classFields.studentClassName,
      worksheets: visible.map((doc) => {
        const info = statusMap.get(String(doc._id));
        return toStudentWorksheetJson(doc, {
          isPurchased: info?.isPurchased,
          paymentStatus: info?.status || 'none',
          paymentUtr: info?.utr || '',
        });
      }),
    },
  });
});

export const getStudentWorksheet = asyncHandler(async (req, res) => {
  const worksheet = await Worksheet.findOne({
    _id: req.params.id,
    isPublished: true,
    ...classVisibilityForStudent(studentClassId(req.user)),
  })
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .select(PUBLIC_FIELDS);

  if (!worksheet) throw new ApiError(404, 'Worksheet not found');

  const statusMap = await findPurchaseStatusByContentIds({
    buyerType: 'student',
    buyerId: req.user._id,
    contentType: 'worksheet',
    contentIds: [worksheet._id],
  });
  const info = statusMap.get(String(worksheet._id));

  res.status(200).json({
    success: true,
    data: {
      worksheet: toStudentWorksheetJson(worksheet, {
        isPurchased: info?.isPurchased,
        paymentStatus: info?.status || 'none',
        paymentUtr: info?.utr || '',
      }),
    },
  });
});
