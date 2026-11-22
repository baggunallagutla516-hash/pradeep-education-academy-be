import mongoose from 'mongoose';
import { UnitTest } from '../models/UnitTest.js';
import { Worksheet } from '../models/Worksheet.js';
import { ChapterEndTest } from '../models/ChapterEndTest.js';
import { SlipTest } from '../models/SlipTest.js';
import {
  ContentPurchase,
  PURCHASE_CONTENT_TYPES,
  findPurchasedContentIds,
} from '../models/ContentPurchase.js';
import { getSiteSettings, toPublicSiteSettings } from '../models/SiteSettings.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildUpiPayUri, priceJsonFields } from '../utils/paperPricing.js';
import { isExamClosed, isExamNotYetOpen } from '../utils/examWindow.js';

const MODEL_BY_TYPE = {
  'unit-test': UnitTest,
  worksheet: Worksheet,
  cet: ChapterEndTest,
  'slip-test': SlipTest,
};

function studentClassId(user) {
  const value = user?.studentClass;
  if (!value) return null;
  if (typeof value === 'object' && value._id) return value._id;
  return value;
}

function educatorAssignedIds(educator) {
  const raw = educator?.classes || [];
  return raw
    .map((c) => {
      if (!c) return null;
      if (typeof c === 'object' && c._id) return String(c._id);
      return String(c);
    })
    .filter(Boolean);
}

function docClassIds(doc) {
  const ids = [];
  if (doc.studentClass) {
    ids.push(String(doc.studentClass._id || doc.studentClass));
  }
  for (const c of doc.studentClasses || []) {
    ids.push(String(c._id || c));
  }
  return [...new Set(ids)];
}

function assertBuyerCanAccess(doc, req) {
  if (!doc?.isPublished) {
    throw new ApiError(404, 'Content not found');
  }

  if (req.buyerType === 'student') {
    const classId = studentClassId(req.user);
    const allowed = docClassIds(doc);
    if (!classId || !allowed.includes(String(classId))) {
      throw new ApiError(403, 'This paper is not available for your class');
    }
    return;
  }

  const assigned = educatorAssignedIds(req.educator);
  const allowed = docClassIds(doc);
  if (!assigned.some((id) => allowed.includes(id))) {
    throw new ApiError(403, 'This paper is not available for your assigned classes');
  }
}

function assertDownloadWindowOpen(doc) {
  if (isExamNotYetOpen(doc.startDate)) {
    throw new ApiError(403, 'Download has not opened yet for this paper');
  }
  if (isExamClosed(doc.endDate)) {
    throw new ApiError(403, 'Download window has closed for this paper');
  }
}

function parseUtr(value) {
  const utr = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!utr) throw new ApiError(400, 'UTR / UPI transaction reference is required');
  if (utr.length < 6) throw new ApiError(400, 'UTR looks too short');
  if (utr.length > 64) throw new ApiError(400, 'UTR cannot exceed 64 characters');
  if (!/^[A-Z0-9/-]+$/.test(utr)) {
    throw new ApiError(400, 'UTR can only contain letters, numbers, / or -');
  }
  return utr;
}

async function loadContentDoc(contentType, contentId) {
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

  if (contentType === 'slip-test' && doc.contentMode && doc.contentMode !== 'file') {
    throw new ApiError(400, 'Only file slip tests can be purchased for download');
  }

  return doc;
}

function toCheckoutItem(doc, contentType) {
  const pricing = priceJsonFields(doc);
  return {
    contentType,
    contentId: String(doc._id),
    title: doc.title,
    ...pricing,
  };
}

export const getPaymentSettings = asyncHandler(async (_req, res) => {
  const settings = await getSiteSettings();
  const publicSettings = toPublicSiteSettings(settings);
  res.status(200).json({
    success: true,
    data: {
      upiId: publicSettings.upiId,
      upiPayeeName: publicSettings.upiPayeeName,
    },
  });
});

export const createCheckout = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) throw new ApiError(400, 'Select at least one paper to pay for');
  if (items.length > 40) throw new ApiError(400, 'Too many papers in one payment');

  const settings = await getSiteSettings();
  const upiId = settings.upiId || '9505820072@ybl';
  const upiPayeeName = settings.upiPayeeName || 'Pradeep Sir';

  const normalized = [];
  const seen = new Set();

  for (const raw of items) {
    const contentType = String(raw?.contentType || '').trim();
    const contentId = String(raw?.contentId || '').trim();
    const key = `${contentType}:${contentId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const doc = await loadContentDoc(contentType, contentId);
    assertBuyerCanAccess(doc, req);
    assertDownloadWindowOpen(doc);

    const pricing = priceJsonFields(doc);
    if (!pricing.needsPayment) {
      throw new ApiError(400, `"${doc.title}" is free and does not need payment`);
    }

    normalized.push(toCheckoutItem(doc, contentType));
  }

  if (!normalized.length) throw new ApiError(400, 'Select at least one paid paper');

  const byType = new Map();
  for (const item of normalized) {
    if (!byType.has(item.contentType)) byType.set(item.contentType, []);
    byType.get(item.contentType).push(item.contentId);
  }
  const purchased = new Set();
  for (const [contentType, ids] of byType) {
    const set = await findPurchasedContentIds({
      buyerType: req.buyerType,
      buyerId: req.buyerId,
      contentType,
      contentIds: ids,
    });
    for (const id of set) purchased.add(`${contentType}:${id}`);
  }

  const payable = normalized.filter((item) => !purchased.has(`${item.contentType}:${item.contentId}`));
  if (!payable.length) {
    throw new ApiError(400, 'All selected papers are already unlocked');
  }

  const totalAmount = payable.reduce((sum, item) => sum + item.priceAmount, 0);
  const note =
    payable.length === 1
      ? `Paper: ${payable[0].title}`.slice(0, 80)
      : `${payable.length} papers`.slice(0, 80);

  const upiUri = buildUpiPayUri({
    upiId,
    amount: totalAmount,
    note,
    payeeName: upiPayeeName,
  });

  res.status(200).json({
    success: true,
    data: {
      upiId,
      upiPayeeName,
      upiUri,
      totalAmount,
      items: payable,
    },
  });
});

/** Student/educator submits UTR after paying — stays pending until admin enables. */
export const submitUtrPayment = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const utr = parseUtr(req.body?.utr);
  const paymentNote = String(req.body?.paymentNote || '').trim().slice(0, 120);

  if (!items.length) throw new ApiError(400, 'No papers in this payment');
  if (items.length > 40) throw new ApiError(400, 'Too many papers in one payment');

  const settings = await getSiteSettings();
  const upiId = settings.upiId || '9505820072@ybl';

  const submitted = [];
  const seen = new Set();

  for (const raw of items) {
    const contentType = String(raw?.contentType || '').trim();
    const contentId = String(raw?.contentId || '').trim();
    const key = `${contentType}:${contentId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const doc = await loadContentDoc(contentType, contentId);
    assertBuyerCanAccess(doc, req);
    assertDownloadWindowOpen(doc);

    const pricing = priceJsonFields(doc);
    if (!pricing.needsPayment) {
      submitted.push({
        contentType,
        contentId: String(doc._id),
        title: doc.title,
        alreadyFree: true,
        paymentStatus: 'none',
      });
      continue;
    }

    const existing = await ContentPurchase.findOne({
      buyerType: req.buyerType,
      buyerId: req.buyerId,
      contentType,
      contentId: doc._id,
    });

    if (existing?.status === 'confirmed') {
      submitted.push({
        contentType,
        contentId: String(doc._id),
        title: doc.title,
        paymentStatus: 'confirmed',
        isPurchased: true,
      });
      continue;
    }

    const purchase = await ContentPurchase.findOneAndUpdate(
      {
        buyerType: req.buyerType,
        buyerId: req.buyerId,
        contentType,
        contentId: doc._id,
      },
      {
        $set: {
          buyerType: req.buyerType,
          buyerId: req.buyerId,
          contentType,
          contentId: doc._id,
          priceType: pricing.priceType,
          amount: pricing.priceAmount,
          upiId,
          utr,
          paymentNote,
          status: 'pending',
          confirmedAt: null,
          confirmedBy: null,
        },
      },
      { upsert: true, new: true }
    );

    submitted.push({
      contentType,
      contentId: String(doc._id),
      title: doc.title,
      priceType: pricing.priceType,
      priceAmount: pricing.priceAmount,
      paymentStatus: 'pending',
      isPaymentPending: true,
      isPurchased: false,
      paymentUtr: purchase.utr,
      purchaseId: purchase._id,
    });
  }

  res.status(200).json({
    success: true,
    message: 'UTR submitted. Download unlocks after admin verifies payment.',
    data: { submitted },
  });
});

/** @deprecated alias kept for older clients */
export const confirmPayment = submitUtrPayment;

export const listMyPurchases = asyncHandler(async (req, res) => {
  const rows = await ContentPurchase.find({
    buyerType: req.buyerType,
    buyerId: req.buyerId,
  })
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    data: {
      purchases: rows.map((row) => ({
        id: row._id,
        contentType: row.contentType,
        contentId: row.contentId,
        priceType: row.priceType,
        amount: row.amount,
        utr: row.utr || '',
        status: row.status,
        createdAt: row.createdAt,
        confirmedAt: row.confirmedAt || null,
      })),
    },
  });
});
