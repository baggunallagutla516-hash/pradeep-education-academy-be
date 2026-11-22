import mongoose from 'mongoose';
import { Student } from '../models/Student.js';
import { Educator } from '../models/Educator.js';
import { UnitTest } from '../models/UnitTest.js';
import { Worksheet } from '../models/Worksheet.js';
import { ChapterEndTest } from '../models/ChapterEndTest.js';
import { SlipTest } from '../models/SlipTest.js';
import {
  ContentPurchase,
  PURCHASE_CONTENT_TYPES,
} from '../models/ContentPurchase.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { priceJsonFields } from '../utils/paperPricing.js';

const MODEL_BY_TYPE = {
  'unit-test': UnitTest,
  worksheet: Worksheet,
  cet: ChapterEndTest,
  'slip-test': SlipTest,
};

function docClassIds(doc) {
  const ids = [];
  if (doc.studentClass) ids.push(doc.studentClass._id || doc.studentClass);
  for (const c of doc.studentClasses || []) {
    ids.push(c._id || c);
  }
  return [...new Set(ids.map((id) => String(id)))].map((id) => new mongoose.Types.ObjectId(id));
}

function studentDisplayName(student) {
  return (
    String(student.fullName || student.name || '').trim() ||
    String(student.email || '').trim() ||
    'Student'
  );
}

function educatorDisplayName(educator) {
  return (
    String(educator.fullName || educator.name || '').trim() ||
    String(educator.email || '').trim() ||
    'Educator'
  );
}

async function loadContent(contentType, contentId) {
  if (!PURCHASE_CONTENT_TYPES.includes(contentType)) {
    throw new ApiError(400, 'Invalid content type');
  }
  if (!mongoose.Types.ObjectId.isValid(contentId)) {
    throw new ApiError(400, 'Invalid content id');
  }
  const Model = MODEL_BY_TYPE[contentType];
  const doc = await Model.findById(contentId)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!doc) throw new ApiError(404, 'Content not found');
  return doc;
}

export const listContentPayments = asyncHandler(async (req, res) => {
  const { contentType, contentId } = req.params;
  const doc = await loadContent(contentType, contentId);
  const pricing = priceJsonFields(doc);

  if (!pricing.needsPayment) {
    return res.status(200).json({
      success: true,
      data: {
        content: {
          id: doc._id,
          title: doc.title,
          contentType,
          ...pricing,
        },
        entries: [],
        message: 'This paper is free of cost — no payments to track.',
      },
    });
  }

  const classIds = docClassIds(doc);
  const [students, educators, purchases] = await Promise.all([
    classIds.length
      ? Student.find({
          studentClass: { $in: classIds },
          deletedAt: null,
          isActive: true,
        })
          .populate('studentClass', 'name')
          .select('fullName name email studentClass')
          .sort({ fullName: 1, name: 1 })
          .lean()
      : [],
    classIds.length
      ? Educator.find({
          classes: { $in: classIds },
          deletedAt: null,
          isActive: true,
        })
          .select('fullName name email classes')
          .sort({ fullName: 1, name: 1 })
          .lean()
      : [],
    ContentPurchase.find({ contentType, contentId: doc._id }).lean(),
  ]);

  const purchaseByKey = new Map(
    purchases.map((row) => [`${row.buyerType}:${row.buyerId}`, row])
  );

  const entries = [];

  for (const student of students) {
    const key = `student:${student._id}`;
    const purchase = purchaseByKey.get(key);
    entries.push({
      buyerType: 'student',
      buyerId: String(student._id),
      name: studentDisplayName(student),
      email: student.email || '',
      className: student.studentClass?.name || '',
      status: purchase?.status || 'not_paid',
      utr: purchase?.utr || '',
      amount: purchase?.amount ?? pricing.priceAmount,
      purchaseId: purchase?._id ? String(purchase._id) : null,
      submittedAt: purchase?.updatedAt || purchase?.createdAt || null,
      confirmedAt: purchase?.confirmedAt || null,
    });
    purchaseByKey.delete(key);
  }

  for (const educator of educators) {
    const key = `educator:${educator._id}`;
    const purchase = purchaseByKey.get(key);
    entries.push({
      buyerType: 'educator',
      buyerId: String(educator._id),
      name: educatorDisplayName(educator),
      email: educator.email || '',
      className: 'Educator',
      status: purchase?.status || 'not_paid',
      utr: purchase?.utr || '',
      amount: purchase?.amount ?? pricing.priceAmount,
      purchaseId: purchase?._id ? String(purchase._id) : null,
      submittedAt: purchase?.updatedAt || purchase?.createdAt || null,
      confirmedAt: purchase?.confirmedAt || null,
    });
    purchaseByKey.delete(key);
  }

  // Purchases from buyers no longer matching class filters (still show)
  for (const purchase of purchaseByKey.values()) {
    let name = purchase.buyerType === 'educator' ? 'Educator' : 'Student';
    let email = '';
    let className = '';
    if (purchase.buyerType === 'student') {
      const student = await Student.findById(purchase.buyerId)
        .populate('studentClass', 'name')
        .select('fullName name email studentClass')
        .lean();
      if (student) {
        name = studentDisplayName(student);
        email = student.email || '';
        className = student.studentClass?.name || '';
      }
    } else {
      const educator = await Educator.findById(purchase.buyerId)
        .select('fullName name email')
        .lean();
      if (educator) {
        name = educatorDisplayName(educator);
        email = educator.email || '';
        className = 'Educator';
      }
    }
    entries.push({
      buyerType: purchase.buyerType,
      buyerId: String(purchase.buyerId),
      name,
      email,
      className,
      status: purchase.status,
      utr: purchase.utr || '',
      amount: purchase.amount,
      purchaseId: String(purchase._id),
      submittedAt: purchase.updatedAt || purchase.createdAt || null,
      confirmedAt: purchase.confirmedAt || null,
    });
  }

  const statusRank = { pending: 0, not_paid: 1, rejected: 2, confirmed: 3 };
  entries.sort((a, b) => {
    const ra = statusRank[a.status] ?? 9;
    const rb = statusRank[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name));
  });

  res.status(200).json({
    success: true,
    data: {
      content: {
        id: doc._id,
        title: doc.title,
        contentType,
        ...pricing,
      },
      entries,
      summary: {
        pending: entries.filter((e) => e.status === 'pending').length,
        confirmed: entries.filter((e) => e.status === 'confirmed').length,
        notPaid: entries.filter((e) => e.status === 'not_paid' || e.status === 'rejected').length,
      },
    },
  });
});

export const enableContentPayment = asyncHandler(async (req, res) => {
  const { contentType, contentId } = req.params;
  const buyerType = String(req.body?.buyerType || '').trim();
  const buyerId = String(req.body?.buyerId || '').trim();

  if (!['student', 'educator'].includes(buyerType)) {
    throw new ApiError(400, 'buyerType must be student or educator');
  }
  if (!mongoose.Types.ObjectId.isValid(buyerId)) {
    throw new ApiError(400, 'Invalid buyer id');
  }

  const doc = await loadContent(contentType, contentId);
  const pricing = priceJsonFields(doc);
  if (!pricing.needsPayment) {
    throw new ApiError(400, 'This paper is free of cost');
  }

  if (buyerType === 'student') {
    const student = await Student.findOne({ _id: buyerId, deletedAt: null });
    if (!student) throw new ApiError(404, 'Student not found');
  } else {
    const educator = await Educator.findOne({ _id: buyerId, deletedAt: null });
    if (!educator) throw new ApiError(404, 'Educator not found');
  }

  const optionalUtr = String(req.body?.utr || '')
    .trim()
    .toUpperCase();

  let purchase = await ContentPurchase.findOne({
    buyerType,
    buyerId,
    contentType,
    contentId: doc._id,
  });

  if (!purchase) {
    purchase = await ContentPurchase.create({
      buyerType,
      buyerId,
      contentType,
      contentId: doc._id,
      priceType: pricing.priceType,
      amount: pricing.priceAmount,
      upiId: '',
      utr: optionalUtr,
      paymentNote: 'Enabled by admin',
      status: 'confirmed',
      confirmedAt: new Date(),
      confirmedBy: req.admin._id,
    });
  } else {
    purchase.priceType = pricing.priceType;
    purchase.amount = pricing.priceAmount;
    purchase.status = 'confirmed';
    purchase.confirmedAt = new Date();
    purchase.confirmedBy = req.admin._id;
    if (optionalUtr && !purchase.utr) purchase.utr = optionalUtr;
    await purchase.save();
  }

  res.status(200).json({
    success: true,
    message: 'Payment enabled. Download is unlocked for this user.',
    data: {
      purchase: {
        id: purchase._id,
        buyerType: purchase.buyerType,
        buyerId: purchase.buyerId,
        contentType: purchase.contentType,
        contentId: purchase.contentId,
        status: purchase.status,
        utr: purchase.utr || '',
        confirmedAt: purchase.confirmedAt,
      },
    },
  });
});
