import mongoose from 'mongoose';

export const PURCHASE_CONTENT_TYPES = ['unit-test', 'worksheet', 'cet', 'slip-test'];
export const PURCHASE_BUYER_TYPES = ['student', 'educator'];
export const PURCHASE_STATUSES = ['pending', 'confirmed', 'rejected'];

const contentPurchaseSchema = new mongoose.Schema(
  {
    buyerType: {
      type: String,
      enum: PURCHASE_BUYER_TYPES,
      required: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    contentType: {
      type: String,
      enum: PURCHASE_CONTENT_TYPES,
      required: true,
    },
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    priceType: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    upiId: {
      type: String,
      trim: true,
      default: '',
    },
    utr: {
      type: String,
      trim: true,
      maxlength: [64, 'UTR cannot exceed 64 characters'],
      default: '',
    },
    paymentNote: {
      type: String,
      trim: true,
      maxlength: [120, 'Payment note cannot exceed 120 characters'],
      default: '',
    },
    status: {
      type: String,
      enum: PURCHASE_STATUSES,
      default: 'pending',
      index: true,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
  },
  { timestamps: true }
);

contentPurchaseSchema.index(
  { buyerType: 1, buyerId: 1, contentType: 1, contentId: 1 },
  { unique: true }
);

export const ContentPurchase = mongoose.model('ContentPurchase', contentPurchaseSchema);

export async function findPurchasedContentIds({ buyerType, buyerId, contentType, contentIds }) {
  if (!buyerId || !contentIds?.length) return new Set();

  const rows = await ContentPurchase.find({
    buyerType,
    buyerId,
    contentType,
    contentId: { $in: contentIds },
    status: 'confirmed',
  })
    .select('contentId')
    .lean();

  return new Set(rows.map((row) => String(row.contentId)));
}

export async function findPurchaseStatusByContentIds({
  buyerType,
  buyerId,
  contentType,
  contentIds,
}) {
  const map = new Map();
  if (!buyerId || !contentIds?.length) return map;

  const rows = await ContentPurchase.find({
    buyerType,
    buyerId,
    contentType,
    contentId: { $in: contentIds },
  })
    .select('contentId status utr')
    .lean();

  for (const row of rows) {
    map.set(String(row.contentId), {
      status: row.status,
      utr: row.utr || '',
      isPurchased: row.status === 'confirmed',
      isPending: row.status === 'pending',
    });
  }
  return map;
}

export async function hasPurchasedContent({ buyerType, buyerId, contentType, contentId }) {
  if (!buyerId || !contentId) return false;
  const row = await ContentPurchase.exists({
    buyerType,
    buyerId,
    contentType,
    contentId,
    status: 'confirmed',
  });
  return Boolean(row);
}

export function purchaseStatusFields(statusInfo) {
  const status = statusInfo?.status || 'none';
  return {
    paymentStatus: status === 'confirmed' || status === 'pending' || status === 'rejected' ? status : 'none',
    isPurchased: status === 'confirmed',
    isPaymentPending: status === 'pending',
    paymentUtr: statusInfo?.utr || '',
  };
}
