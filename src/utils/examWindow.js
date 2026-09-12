import { ApiError } from './ApiError.js';

/**
 * Parse an end date/time from:
 * - date-only `YYYY-MM-DD` (legacy) → end of that UTC day
 * - ISO / datetime with time → exact instant
 */
export function readEndDate(value, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(400, 'A valid end date is required');
    return null;
  }

  const raw = String(value).trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnly) {
    return new Date(
      Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 23, 59, 59, 999)
    );
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'A valid end date is required');
  }

  return date;
}

/**
 * Parse a start date/time (exact instant). Date-only values open at start of that UTC day.
 */
export function readStartDate(value, { required = true, label = 'start date' } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(400, `A valid ${label} is required`);
    return null;
  }

  const raw = String(value).trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnly) {
    return new Date(
      Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 0, 0, 0, 0)
    );
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `A valid ${label} is required`);
  }

  return date;
}

/** True when the exam window has passed. Missing endDate (legacy) stays open. */
export function isExamClosed(endDate) {
  if (!endDate) return false;
  return Date.now() > new Date(endDate).getTime();
}

/** True when now is before the scheduled start. Missing startDate (legacy) is already open. */
export function isExamNotYetOpen(startDate) {
  if (!startDate) return false;
  return Date.now() < new Date(startDate).getTime();
}

export function assertExamStarted(startDate, label = 'exam') {
  if (isExamNotYetOpen(startDate)) {
    throw new ApiError(
      403,
      `This ${label} has not started yet. Please wait until the starting date and time.`
    );
  }
}

export function assertExamOpen(endDate, label = 'exam') {
  if (isExamClosed(endDate)) {
    throw new ApiError(403, `This ${label} is closed. The ending date and time has passed.`);
  }
}

/** Block start until the window is open (after start, before end). */
export function assertExamWindow(startDate, endDate, label = 'exam') {
  assertExamStarted(startDate, label);
  assertExamOpen(endDate, label);
}

/** Ensure end is not before start (same instant OK). */
export function assertEndDateNotBefore(endDate, startDate, startLabel = 'start date') {
  if (!endDate || !startDate) return;

  const end = new Date(endDate);
  const start = new Date(startDate);
  if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) return;

  if (end.getTime() < start.getTime()) {
    throw new ApiError(400, `Ending date and time cannot be before the ${startLabel}`);
  }
}
