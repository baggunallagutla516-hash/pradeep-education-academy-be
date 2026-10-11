import { Quiz } from '../models/Quiz.js';
import { Assessment } from '../models/Assessment.js';
import { Dpp } from '../models/Dpp.js';
import { SlipTest } from '../models/SlipTest.js';
import { ChapterEndTest } from '../models/ChapterEndTest.js';
import { UnitTest } from '../models/UnitTest.js';
import { Worksheet } from '../models/Worksheet.js';
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

const JOIN_MODELS = [Quiz, Assessment, Dpp, SlipTest, ChapterEndTest, UnitTest, Worksheet];

async function isJoinCodeTaken(code) {
  const checks = await Promise.all([
    ...JOIN_MODELS.map((Model) => Model.exists({ joinCode: code })),
    ClassroomSession.exists({ code }),
  ]);
  return checks.some(Boolean);
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

export async function ensureContentJoinCode(doc, { save = true } = {}) {
  if ((doc.accessMode || 'both') === 'list') return '';
  if (doc.joinCode) return doc.joinCode;
  doc.joinCode = await makeUniqueJoinCode();
  if (save) await doc.save();
  return doc.joinCode;
}

const PUBLISHED_JOIN_TARGETS = [
  { Model: Quiz, kind: 'quiz', select: 'title subject playMode accessMode joinCode' },
  { Model: Assessment, kind: 'assessment', select: 'title subject accessMode joinCode' },
  { Model: Dpp, kind: 'dpp', select: 'title subject accessMode joinCode' },
  { Model: SlipTest, kind: 'slipTest', select: 'title subject accessMode joinCode contentMode' },
  { Model: ChapterEndTest, kind: 'cet', select: 'title accessMode joinCode' },
  { Model: UnitTest, kind: 'unitTest', select: 'title accessMode joinCode' },
  { Model: Worksheet, kind: 'worksheet', select: 'title accessMode joinCode' },
];

export async function findPublishedJoin(code) {
  for (const target of PUBLISHED_JOIN_TARGETS) {
    const doc = await target.Model.findOne({ joinCode: code, isPublished: true }).select(target.select);
    if (!doc) continue;
    if (target.kind === 'quiz' && (doc.playMode || 'individual') === 'classroom') continue;
    if ((doc.accessMode || 'both') === 'list') {
      throw new ApiError(404, 'Students open this from their list.');
    }
    return { doc, kind: target.kind };
  }
  return null;
}
