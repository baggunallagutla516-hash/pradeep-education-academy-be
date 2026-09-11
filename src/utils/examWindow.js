import { ApiError } from './ApiError.js';

/**
 * Parse an end date from an <input type="date"> value (YYYY-MM-DD) or Date.
 * Stored as end-of-UTC-day so the selected calendar day stays open.
 */
export function readEndDate(value, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(400, 'A valid end date is required');
    return null;
  }

  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let date;

  if (match) {
    date = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999)
    );
  } else {
    date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new ApiError(400, 'A valid end date is required');
    }
    date = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
    );
  }

  return date;
}

/** True when the exam window has passed. Missing endDate (legacy) stays open. */
export function isExamClosed(endDate) {
  if (!endDate) return false;
  return Date.now() > new Date(endDate).getTime();
}

export function assertExamOpen(endDate, label = 'exam') {
  if (isExamClosed(endDate)) {
    throw new ApiError(403, `This ${label} is closed. The end date has passed.`);
  }
}

/** Ensure end date is not before a start/label date (same calendar day OK). */
export function assertEndDateNotBefore(endDate, startDate, startLabel = 'start date') {
  if (!endDate || !startDate) return;

  const endDay = Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate()
  );
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return;

  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  if (endDay < startDay) {
    throw new ApiError(400, `End date cannot be before the ${startLabel}`);
  }
}
