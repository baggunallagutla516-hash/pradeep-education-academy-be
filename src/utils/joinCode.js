import { Quiz } from '../models/Quiz.js';
import { ClassroomSession } from '../models/ClassroomSession.js';
import { ApiError } from './ApiError.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode() {
  let code = '';
  for (let index = 0; index < 4; index += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

async function isJoinCodeTaken(code) {
  const [quiz, session] = await Promise.all([
    Quiz.exists({ joinCode: code }),
    ClassroomSession.exists({ code }),
  ]);
  return Boolean(quiz || session);
}

export async function makeUniqueJoinCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = makeRoomCode();
    if (!(await isJoinCodeTaken(code))) return code;
  }
  throw new ApiError(500, 'Could not create a quiz code. Try again.');
}

export function allowsJoinCode(quiz) {
  if ((quiz.playMode || 'individual') === 'classroom') return false;
  const access = quiz.accessMode || 'both';
  return access === 'code' || access === 'both';
}

export async function ensureIndividualJoinCode(quiz, { save = true } = {}) {
  if (!allowsJoinCode(quiz)) return '';
  if (quiz.joinCode) return quiz.joinCode;
  quiz.joinCode = await makeUniqueJoinCode();
  if (save) await quiz.save();
  return quiz.joinCode;
}
