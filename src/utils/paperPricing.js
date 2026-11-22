import { ApiError } from './ApiError.js';

/** Fixed price options for downloadable papers (question paper / marking / blueprint). */
export const PAPER_PRICE_OPTIONS = [
  {
    value: 'free',
    amount: 0,
    label: 'Free of cost',
    caption: 'Free of cost',
  },
  {
    value: '30',
    amount: 30,
    label: 'Rs. 30/-',
    caption: 'Question paper',
  },
  {
    value: '25',
    amount: 25,
    label: 'Rs. 25/-',
    caption: 'Marking scheme',
  },
  {
    value: '20',
    amount: 20,
    label: 'Rs. 20/-',
    caption: 'Blue Print',
  },
];

export const PAPER_PRICE_VALUES = PAPER_PRICE_OPTIONS.map((o) => o.value);

export const DEFAULT_UPI_ID = '9505820072@ybl';

const OPTION_BY_VALUE = Object.fromEntries(PAPER_PRICE_OPTIONS.map((o) => [o.value, o]));

export function priceTypePath() {
  return {
    priceType: {
      type: String,
      enum: PAPER_PRICE_VALUES,
      default: 'free',
    },
  };
}

export function getPriceOption(priceType) {
  return OPTION_BY_VALUE[priceType] || OPTION_BY_VALUE.free;
}

export function amountForPriceType(priceType) {
  return getPriceOption(priceType).amount;
}

export function parsePriceType(value, { fallback = 'free' } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const raw = String(value).trim();
  if (!PAPER_PRICE_VALUES.includes(raw)) {
    throw new ApiError(400, 'Invalid price option. Choose Free, Rs. 30, Rs. 25, or Rs. 20.');
  }
  return raw;
}

export function priceJsonFields(doc) {
  const priceType = PAPER_PRICE_VALUES.includes(doc.priceType) ? doc.priceType : 'free';
  const option = getPriceOption(priceType);
  return {
    priceType,
    priceAmount: option.amount,
    priceLabel: option.label,
    priceCaption: option.caption,
    needsPayment: option.amount > 0,
  };
}

/**
 * Apply purchase gate on top of downloadWindowFields.
 * Paid items keep metadata but hide fileUrl until purchased.
 */
export function applyPurchaseGate(windowFields, doc, { isPurchased = false } = {}) {
  const pricing = priceJsonFields(doc);
  const unlocked = !pricing.needsPayment || Boolean(isPurchased);

  return {
    ...windowFields,
    ...pricing,
    isPurchased: Boolean(isPurchased),
    fileUrl: unlocked ? windowFields.fileUrl || '' : '',
  };
}

export function buildUpiPayUri({ upiId, amount, note, payeeName = 'Pradeep Sir' }) {
  const pa = String(upiId || DEFAULT_UPI_ID).trim();
  const am = Number(amount);
  const params = new URLSearchParams({
    pa,
    pn: payeeName,
    cu: 'INR',
  });
  if (Number.isFinite(am) && am > 0) {
    params.set('am', am.toFixed(2));
  }
  if (note) params.set('tn', String(note).slice(0, 80));
  return `upi://pay?${params.toString()}`;
}
