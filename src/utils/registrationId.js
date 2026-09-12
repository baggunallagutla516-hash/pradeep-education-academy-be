import { Student } from '../models/Student.js';

const PREFIX = 'PDPEDU';
const MAX_ATTEMPTS = 40;

function randomFourDigits() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

export function formatRegistrationId(digits) {
  return `${PREFIX}${digits}`;
}

/**
 * Generates a unique RegistrationId: PDPEDU + 4 digits (e.g. PDPEDU4821).
 */
export async function generateUniqueRegistrationId() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = formatRegistrationId(randomFourDigits());
    // eslint-disable-next-line no-await-in-loop
    const exists = await Student.exists({
      registrationId: new RegExp(`^${candidate}$`, 'i'),
    });
    if (!exists) return candidate;
  }

  throw new Error('Could not generate a unique Registration ID. Please try again.');
}

/**
 * Ensures a student document has an uppercase registrationId (for legacy records).
 * Saves when a new ID is assigned or an old lowercase ID is normalized.
 */
export async function ensureStudentRegistrationId(student) {
  if (student.registrationId) {
    const normalized = String(student.registrationId).toUpperCase();
    if (student.registrationId !== normalized) {
      student.registrationId = normalized;
      await student.save({ validateBeforeSave: false });
    }
    return student.registrationId;
  }

  student.registrationId = await generateUniqueRegistrationId();
  await student.save({ validateBeforeSave: false });
  return student.registrationId;
}
