import { ApiError } from './ApiError.js';

/** Legacy fixed presets (still readable for older papers). */
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

const MAX_PRICE_AMOUNT = 100000;

export function priceTypePath() {
  return {
    priceType: {
      type: String,
      default: 'free',
      trim: true,
    },
  };
}

function customPriceOption(amount) {
  return {
    value: String(amount),
    amount,
    label: `Rs. ${amount}/-`,
    caption: `Rs. ${amount}/-`,
  };
}

export function getPriceOption(priceType) {
  if (OPTION_BY_VALUE[priceType]) return OPTION_BY_VALUE[priceType];
  const amount = Number(priceType);
  if (Number.isFinite(amount) && amount > 0) {
    return customPriceOption(Math.round(amount));
  }
  return OPTION_BY_VALUE.free;
}

export function amountForPriceType(priceType) {
  return getPriceOption(priceType).amount;
}

/**
 * Accepts "free", 0, legacy presets, or any whole-rupee amount (e.g. 50, 100, 150).
 */
export function parsePriceType(value, { fallback = 'free' } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const raw = String(value).trim();
  const lower = raw.toLowerCase();
  if (lower === 'free') return 'free';

  if (PAPER_PRICE_VALUES.includes(raw)) {
    return raw;
  }

  const amount = Number(raw);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0 || amount > MAX_PRICE_AMOUNT) {
    throw new ApiError(
      400,
      `Invalid price. Enter 0 for free, or a whole number up to ${MAX_PRICE_AMOUNT}.`
    );
  }
  if (amount === 0) return 'free';
  return String(amount);
}

export function priceJsonFields(doc) {
  const option = getPriceOption(doc?.priceType);
  return {
    priceType: option.value,
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
