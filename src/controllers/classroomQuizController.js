import mongoose from 'mongoose';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { ClassroomSession } from '../models/ClassroomSession.js';
import { Student } from '../models/Student.js';
import { participantIdentity } from '../utils/examParticipant.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { assertExamWindow } from '../utils/examWindow.js';
import { assertDocInAssignedClasses, classVisibilityForStudent, docClassIds } from '../utils/schoolClass.js';
import {
  applyGroupAction,
  awardMasterMarks,
  rankGroups,
  round2,
  selectionsMatch,
} from '../utils/classroomScoring.js';
import { makeUniqueJoinCode, findPublishedJoin } from '../utils/joinCode.js';

const DEFAULT_GROUP_NAMES = ['Group 1', 'Group 2', 'Group 3', 'Group 4'];

export function normaliseRoomCode(value) {
  const code = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    throw new ApiError(400, 'Enter the 4-character quiz code.');
  }
  return code;
}

function playModeOf(quiz) {
  return quiz.playMode || 'individual';
}

function scoreState(session) {
  return {
    groups: session.groups.map((group) => ({
      id: String(group._id),
      name: group.name,
      score: group.score,
      members: (group.members || []).map((member) => ({
        userId: String(member.userId),
        name: member.name,
        role: member.role,
      })),
    })),
    turnIndex: session.turnIndex,
    openingTurnIndex: session.openingTurnIndex,
    questionIndex: session.questionIndex,
    stake: session.stake,
    failCount: session.failCount,
    masterScore: session.masterScore,
    questionOpen: session.questionOpen,
  };
}

function groupsForSave(groups) {
  return groups.map((group) => ({
    _id: group.id,
    name: group.name,
    score: group.score,
    members: (group.members || []).map((member) => ({
      userId: member.userId,
      name: member.name,
      role: member.role || 'student',
    })),
  }));
}

function toSessionJson(session, quiz, viewer = {}) {
  const question =
    session.status === 'lobby' ? null : quiz.questions[session.questionIndex] || null;
  const turnGroup = session.groups[session.turnIndex] || null;
  const userId = viewer.userId ? String(viewer.userId) : '';
  const mine = userId
    ? session.groups.find((group) =>
        (group.members || []).some((member) => String(member.userId) === userId)
      )
    : null;
  const showKey = Boolean(question && session.status !== 'lobby' && session.revealAnswer);

  const ranked = rankGroups(
    session.groups.map((group) => ({
      id: String(group._id),
      name: group.name,
      score: group.score,
      members: (group.members || []).map((member) => ({
        id: String(member.userId),
        name: member.name,
      })),
    }))
  );

  return {
    id: session._id,
    quizId: quiz._id,
    title: quiz.title,
    subject: quiz.subject || '',
    code: session.code,
    status: session.status,
    masterScore: session.masterScore,
    resultsSentCount: session.resultsSentCount || 0,
    classStudents: viewer.classStudents || [],
    isHost: Boolean(viewer.isHost),
    myGroupId: mine ? String(mine._id) : null,
    canAnswer: Boolean(
      session.status === 'live' &&
        session.questionOpen &&
        turnGroup &&
        (viewer.isHost || (mine && String(mine._id) === String(turnGroup._id)))
    ),
    groups: ranked,
    awards: (session.awards || []).map((award) => ({
      id: award._id,
      groupId: award.groupId,
      groupName: award.groupName,
      marks: award.marks,
      criteria: award.criteria,
      createdAt: award.createdAt,
    })),
    lastResult: session.lastResult?.emoji
      ? {
          emoji: session.lastResult.emoji,
          headline: session.lastResult.headline,
          detail: session.lastResult.detail,
          outcome: session.lastResult.outcome,
          groupId: session.lastResult.groupId,
          groupName: session.lastResult.groupName,
          revealCorrect: showKey && session.lastResult.outcome !== 'award',
          scoreDelta: session.lastResult.scoreDelta,
          masterGain: session.lastResult.masterGain,
          selectedOptions: session.lastResult.selectedOptions || [],
        }
      : null,
    question: question
      ? {
          index: session.questionIndex,
          number: session.questionIndex + 1,
          total: quiz.questions.length,
          text: question.text,
          imageUrl: question.imageUrl || '',
          type: question.type,
          marks: question.marks,
          stake: session.questionOpen ? session.stake : question.marks,
          failCount: session.failCount,
          open: session.questionOpen,
          turnGroupId: turnGroup ? String(turnGroup._id) : null,
          turnGroupName: turnGroup?.name || '',
          options: (question.options || []).map((option) => ({
            text: option.text || '',
            imageUrl: option.imageUrl || '',
          })),
          correctOptions: showKey ? question.correctOptions || [] : null,
        }
      : null,
  };
}

async function saveTurn(session, patch) {
  const set = { ...patch, turnToken: session.turnToken + 1 };
  const unset = {};
  if (set.lastResult === null) {
    delete set.lastResult;
    unset.lastResult = 1;
  }
  const updated = await ClassroomSession.findOneAndUpdate(
    { _id: session._id, turnToken: session.turnToken },
    Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set },
    { new: true }
  );
  if (!updated) {
    throw new ApiError(409, 'The board just changed. Try that again.');
  }
  return updated;
}

async function requireClassroomQuiz(quizId) {
  const quiz = await Quiz.findById(quizId);
  if (!quiz) throw new ApiError(404, 'Quiz not found');
  if (playModeOf(quiz) !== 'classroom') {
    throw new ApiError(400, 'This quiz is set to individual play.');
  }
  return quiz;
}

async function requirePublishedClassroom(quizId, classId) {
  const quiz = await Quiz.findOne({
    _id: quizId,
    isPublished: true,
    ...classVisibilityForStudent(classId),
  });
  if (!quiz) throw new ApiError(404, 'Quiz not found');
  if (playModeOf(quiz) !== 'classroom') {
    throw new ApiError(400, 'This quiz is played individually.');
  }
  return quiz;
}

function assertPublishedWindow(quiz) {
  if (!quiz.isPublished) {
    throw new ApiError(400, 'Publish the quiz before opening the classroom.');
  }
  assertExamWindow(quiz.startDate, quiz.endDate, 'quiz');
}

async function latestSession(quizId) {
  return ClassroomSession.findOne({ quiz: quizId }).sort({ updatedAt: -1 });
}

async function openSession(quizId) {
  return ClassroomSession.findOne({ quiz: quizId, status: { $in: ['lobby', 'live'] } });
}

function hostOf(role, req) {
  if (role === 'admin') {
    return { hostRole: 'admin', hostId: req.admin._id, actor: req.admin };
  }
  return { hostRole: 'educator', hostId: req.educator._id, actor: req.educator };
}

async function loadHostQuiz(role, req, quizId) {
  const quiz = await requireClassroomQuiz(quizId);
  if (role === 'educator') {
    assertDocInAssignedClasses(quiz, hostOf(role, req).actor, 'Quiz');
  }
  return quiz;
}

async function classStudentsFor(quiz) {
  const classIds = docClassIds(quiz);
  if (!classIds.length) return [];
  const students = await Student.find({
    deletedAt: null,
    isActive: true,
    studentClass: { $in: classIds },
  })
    .populate('studentClass', 'name')
    .select('fullName studentClass')
    .sort({ fullName: 1 })
    .lean();
  return students.map((student) => ({
    id: String(student._id),
    name: student.fullName,
    className: student.studentClass?.name || '',
  }));
}

function membersFromIds(studentIds, allowed, used) {
  const members = [];
  (Array.isArray(studentIds) ? studentIds : []).forEach((raw) => {
    const id = String(raw || '');
    if (!id) return;
    const student = allowed.get(id);
    if (!student) throw new ApiError(400, 'That student is not in this quiz’s class.');
    if (used.has(id)) throw new ApiError(400, `${student.name} is in more than one group.`);
    used.add(id);
    members.push({ userId: id, name: student.name, role: 'student' });
  });
  return members;
}

async function sendSession(res, session, quiz, viewer, status = 200) {
  const classStudents =
    viewer.isHost && session && (session.status === 'lobby' || session.status === 'finished')
      ? await classStudentsFor(quiz)
      : [];
  res.status(status).json({
    success: true,
    data: {
      session: session ? toSessionJson(session, quiz, { ...viewer, classStudents }) : null,
    },
  });
}

function currentQuestion(quiz, session) {
  const question = quiz.questions[session.questionIndex];
  if (!question) {
    throw new ApiError(400, 'This classroom is out of date. End it and start again.');
  }
  return question;
}

function readSelection(body, question) {
  const raw = body?.selectedOptions;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApiError(400, 'Choose an option, then lock it.');
  }
  const optionCount = question.options?.length || 0;
  const selected = [...new Set(raw.map(Number))]
    .filter((value) => Number.isInteger(value) && value >= 0 && value < optionCount)
    .sort((a, b) => a - b);
  if (selected.length === 0 || selected.length !== new Set(raw.map(Number)).size) {
    throw new ApiError(400, 'Choose an option, then lock it.');
  }
  if (question.type === 'single' && selected.length !== 1) {
    throw new ApiError(400, 'Lock one option for this question.');
  }
  return selected;
}

function assertCanAnswer(session, { isHost, userId }) {
  if (session.status !== 'live' || !session.questionOpen) {
    throw new ApiError(400, 'This question is not open for an answer.');
  }
  const turnGroup = session.groups[session.turnIndex];
  if (!turnGroup) throw new ApiError(400, 'No group is on turn.');
  if (isHost) return;
  const member = (turnGroup.members || []).some((item) => String(item.userId) === String(userId));
  if (!member) {
    throw new ApiError(403, `Waiting for ${turnGroup.name} to lock an answer.`);
  }
}

async function applyAnswer(session, quiz, body, viewer) {
  assertCanAnswer(session, viewer);
  const question = currentQuestion(quiz, session);
  const selected = readSelection(body, question);
  const outcome = selectionsMatch(selected, question.correctOptions || []) ? 'correct' : 'wrong';
  const next = applyGroupAction(
    { ...scoreState(session), questionMarks: question.marks },
    outcome
  );

  return saveTurn(session, {
    groups: groupsForSave(next.groups),
    turnIndex: next.turnIndex,
    stake: next.stake,
    failCount: next.failCount,
    masterScore: next.masterScore,
    questionOpen: next.questionOpen,
    revealAnswer: next.revealCorrect,
    lastResult: {
      emoji: next.emoji,
      headline: next.headline,
      detail: next.detail,
      outcome: next.outcome,
      groupId: next.groupId,
      groupName: next.groupName,
      revealCorrect: next.revealCorrect,
      scoreDelta: next.scoreDelta,
      masterGain: next.masterGain,
      selectedOptions: selected,
    },
  });
}

async function applyPass(session, quiz, viewer) {
  assertCanAnswer(session, viewer);
  const question = currentQuestion(quiz, session);
  const next = applyGroupAction(
    { ...scoreState(session), questionMarks: question.marks },
    'pass'
  );

  return saveTurn(session, {
    groups: groupsForSave(next.groups),
    turnIndex: next.turnIndex,
    stake: next.stake,
    failCount: next.failCount,
    masterScore: next.masterScore,
    questionOpen: next.questionOpen,
    revealAnswer: next.revealCorrect,
    lastResult: {
      emoji: next.emoji,
      headline: next.headline,
      detail: next.detail,
      outcome: next.outcome,
      groupId: next.groupId,
      groupName: next.groupName,
      revealCorrect: next.revealCorrect,
      scoreDelta: 0,
      masterGain: next.masterGain,
      selectedOptions: [],
    },
  });
}

export function createClassroomHostHandlers(role) {
  const getClassroom = asyncHandler(async (req, res) => {
    const quiz = await loadHostQuiz(role, req, req.params.id);
    const session = await latestSession(quiz._id);
    sendSession(res, session, quiz, { isHost: true });
  });

  const openClassroom = asyncHandler(async (req, res) => {
    const quiz = await loadHostQuiz(role, req, req.params.id);
    const restart = req.body?.restart === true || req.body?.restart === 'true';
    const existing = await openSession(quiz._id);
    if (existing) {
      sendSession(res, existing, quiz, { isHost: true });
      return;
    }

    if (!restart) {
      const finished = await ClassroomSession.findOne({ quiz: quiz._id, status: 'finished' }).sort({
        updatedAt: -1,
      });
      if (finished) {
        sendSession(res, finished, quiz, { isHost: true });
        return;
      }
    } else {
      await ClassroomSession.deleteMany({ quiz: quiz._id, status: 'finished' });
    }

    assertPublishedWindow(quiz);
    const host = hostOf(role, req);

    try {
      const session = await ClassroomSession.create({
        quiz: quiz._id,
        hostRole: host.hostRole,
        hostId: host.hostId,
        code: await makeUniqueJoinCode(),
        status: 'lobby',
        groups: DEFAULT_GROUP_NAMES.map((name) => ({ name, score: 0, members: [] })),
      });
      sendSession(res, session, quiz, { isHost: true }, 201);
    } catch (err) {
      if (err?.code !== 11000) throw err;
      const session = await openSession(quiz._id);
      sendSession(res, session, quiz, { isHost: true });
    }
  });

  const updateGroups = asyncHandler(async (req, res) => {
    const quiz = await loadHostQuiz(role, req, req.params.id);
    const session = await openSession(quiz._id);
    if (!session || session.status !== 'lobby') {
      throw new ApiError(400, 'Group names can be changed in the lobby only.');
    }

    const names = Array.isArray(req.body?.names) ? req.body.names : null;
    if (!names) throw new ApiError(400, 'Send the group names.');
    const cleaned = names.map((name) => String(name || '').trim()).filter(Boolean);
    if (cleaned.length < 2 || cleaned.length > 8) {
      throw new ApiError(400, 'Use between 2 and 8 groups.');
    }
    if (cleaned.some((name) => name.length > 40)) {
      throw new ApiError(400, 'Group names can be at most 40 characters.');
    }

    let groups = cleaned.map((name, index) => {
      const existing = session.groups[index];
      return {
        id: existing?._id || new mongoose.Types.ObjectId(),
        name,
        score: 0,
        members: existing
          ? (existing.members || []).map((member) => ({
              userId: member.userId,
              name: member.name,
              role: member.role,
            }))
          : [],
      };
    });

    if (Array.isArray(req.body?.members)) {
      if (req.body.members.length !== cleaned.length) {
        throw new ApiError(400, 'Send a student list for every group.');
      }
      const allowed = new Map((await classStudentsFor(quiz)).map((student) => [student.id, student]));
      const used = new Set();
      groups = groups.map((group, index) => ({
        ...group,
        members: membersFromIds(req.body.members[index], allowed, used),
      }));
    }

    const updated = await saveTurn(session, { groups: groupsForSave(groups) });
    sendSession(res, updated, quiz, { isHost: true });
  });

  const startClassroom = asyncHandler(async (req, res) => {
    const quiz = await loadHostQuiz(role, req, req.params.id);
    const session = await openSession(quiz._id);
    if (!session) throw new ApiError(400, 'Open the classroom lobby first.');
    if (session.status === 'live') {
      sendSession(res, session, quiz, { isHost: true });
      return;
    }
    if (session.groups.length < 2) {
      throw new ApiError(400, 'Add at least two groups before starting.');
    }
    if (session.groups.some((group) => !(group.members?.length))) {
      throw new ApiError(400, 'Add at least one student to each group before starting.');
    }
    assertPublishedWindow(quiz);
    const first = quiz.questions[0];
    if (!first) throw new ApiError(400, 'Add at least one question before starting.');

    const updated = await saveTurn(session, {
      status: 'live',
      questionIndex: 0,
      openingTurnIndex: 0,
      turnIndex: 0,
      stake: first.marks,
      failCount: 0,
      questionOpen: true,
      revealAnswer: false,
      masterScore: 0,
      lastResult: null,
      startedAt: new Date(),
      finishedAt: null,
    });
    sendSession(res, updated, quiz, { isHost: true });
  });

  const answerClassroom = asyncHandler(async (req, res) => {
    const quiz = await loadHostQuiz(role, req, req.params.id);
    const session = await openSession(quiz._id);
    if (!session) throw new ApiError(400, 'The classroom is not live.');
    const updated = await applyAnswer(session, quiz, req.body, { isHost: true });
    sendSession(res, updated, quiz, { isHost: true });
  });

  const passClassroom = asyncHandler(async (req, res) => {
    const quiz = await loadHostQuiz(role, req, req.params.id);
    const session = await openSession(quiz._id);
    if (!session) throw new ApiError(400, 'The classroom is not live.');
    const updated = await applyPass(session, quiz, { isHost: true });
    sendSession(res, updated, quiz, { isHost: true });
  });

  const nextQuestion = asyncHandler(async (req, res) => {
    const quiz = await loadHostQuiz(role, req, req.params.id);
    const session = await openSession(quiz._id);
    if (!session || session.status !== 'live') {
      throw new ApiError(400, 'The classroom is not live.');
    }
    if (session.questionOpen) {
      throw new ApiError(400, 'Lock this question before moving on.');
    }

    const nextIndex = session.questionIndex + 1;
    if (nextIndex >= quiz.questions.length) {
      const updated = await saveTurn(session, {
        status: 'finished',
        questionOpen: false,
        finishedAt: new Date(),
      });
      sendSession(res, updated, quiz, { isHost: true });
      return;
    }

    const opening = (session.openingTurnIndex + 1) % session.groups.length;
    const updated = await saveTurn(session, {
      questionIndex: nextIndex,
      openingTurnIndex: opening,
      turnIndex: opening,
      stake: quiz.questions[nextIndex].marks,
      failCount: 0,
      questionOpen: true,
      revealAnswer: false,
      lastResult: null,
    });
    sendSession(res, updated, quiz, { isHost: true });
  });

  const awardClassroom = asyncHandler(async (req, res) => {
    const quiz = await loadHostQuiz(role, req, req.params.id);
    const session = await latestSession(quiz._id);
    if (!session || session.status === 'lobby') {
      throw new ApiError(400, 'The master can award marks after the quiz has started.');
    }

    const criteria = String(req.body?.criteria || '').trim();
    if (criteria.length < 2 || criteria.length > 200) {
      throw new ApiError(400, 'Write a short reason for the award (2–200 characters).');
    }

    let awarded;
    try {
      awarded = awardMasterMarks(scoreState(session), {
        groupId: req.body?.groupId,
        marks: req.body?.marks,
      });
    } catch (err) {
      throw new ApiError(400, err.message);
    }

    const awards = [
      ...(session.awards || []).map((award) => ({
        _id: award._id,
        groupId: award.groupId,
        groupName: award.groupName,
        marks: award.marks,
        criteria: award.criteria,
        createdAt: award.createdAt,
      })),
      {
        _id: new mongoose.Types.ObjectId(),
        groupId: awarded.groupId,
        groupName: awarded.groupName,
        marks: awarded.amount,
        criteria,
        createdAt: new Date(),
      },
    ];

    const updated = await saveTurn(session, {
      groups: groupsForSave(awarded.groups),
      masterScore: awarded.masterScore,
      awards,
      lastResult: {
        emoji: '🏅',
        headline: 'Master award',
        detail: `The master gave ${awarded.amount} marks to ${awarded.groupName}. ${criteria}`,
        outcome: 'award',
        groupId: awarded.groupId,
        groupName: awarded.groupName,
        revealCorrect: false,
        scoreDelta: awarded.amount,
        masterGain: round2(-awarded.amount),
        selectedOptions: [],
      },
    });
    sendSession(res, updated, quiz, { isHost: true });
  });

  const finishClassroom = asyncHandler(async (req, res) => {
    const quiz = await loadHostQuiz(role, req, req.params.id);
    const session = await openSession(quiz._id);
    if (!session) {
      const finished = await latestSession(quiz._id);
      sendSession(res, finished, quiz, { isHost: true });
      return;
    }
    if (session.status === 'lobby') {
      await ClassroomSession.deleteOne({ _id: session._id });
      sendSession(res, null, quiz, { isHost: true });
      return;
    }
    const updated = await saveTurn(session, {
      status: 'finished',
      questionOpen: false,
      finishedAt: new Date(),
    });
    sendSession(res, updated, quiz, { isHost: true });
  });

  const publishResults = asyncHandler(async (req, res) => {
    const quiz = await loadHostQuiz(role, req, req.params.id);
    const session = await latestSession(quiz._id);
    if (!session || session.status !== 'finished') {
      throw new ApiError(400, 'Finish the quiz before sending results to students.');
    }

    let groups = scoreState(session).groups;
    if (Array.isArray(req.body?.assignments)) {
      const allowed = new Map((await classStudentsFor(quiz)).map((student) => [student.id, student]));
      const used = new Set();
      groups = groups.map((group) => ({ ...group, members: [] }));
      req.body.assignments.forEach((row) => {
        const group = groups.find((item) => item.id === String(row?.groupId || ''));
        if (!group) throw new ApiError(400, 'Choose a group from this quiz.');
        group.members.push(...membersFromIds(row?.studentIds, allowed, used));
      });
    }

    const seated = groups.reduce((count, group) => count + group.members.length, 0);
    if (seated === 0) {
      throw new ApiError(400, 'Add students to the groups before sending results.');
    }

    const now = new Date();
    const total = Number(quiz.totalMarks) || 0;
    await QuizAttempt.deleteMany({ quiz: quiz._id, participantRole: 'student' });
    const attempts = [];
    groups.forEach((group) => {
      const scored = round2(group.score);
      const percentage = total > 0 ? round2((scored / total) * 100) : 0;
      group.members.forEach((member) => {
        attempts.push({
          quiz: quiz._id,
          ...participantIdentity('student', member.userId),
          status: 'submitted',
          startedAt: session.startedAt || now,
          expiresAt: now,
          submittedAt: now,
          autoSubmitted: false,
          responses: [],
          totalMarks: total,
          scoredMarks: scored,
          percentage,
          unansweredCount: quiz.questions.length,
          resultsHidden: false,
        });
      });
    });
    await QuizAttempt.insertMany(attempts);
    quiz.resultsReleased = true;
    quiz.resultsReleasedAt = now;
    await quiz.save();

    const updated = await saveTurn(session, {
      groups: groupsForSave(groups),
      resultsSentAt: now,
      resultsSentCount: attempts.length,
    });
    sendSession(res, updated, quiz, { isHost: true });
  });

  return {
    getClassroom,
    openClassroom,
    updateGroups,
    startClassroom,
    answerClassroom,
    passClassroom,
    nextQuestion,
    awardClassroom,
    finishClassroom,
    publishResults,
  };
}

export const adminClassroom = createClassroomHostHandlers('admin');
export const educatorClassroom = createClassroomHostHandlers('educator');

function studentClassId(user) {
  const value = user.studentClass;
  if (!value) return null;
  if (typeof value === 'object' && value._id) return value._id;
  return value;
}

export const getStudentClassroom = asyncHandler(async (req, res) => {
  const quiz = await requirePublishedClassroom(req.params.id, studentClassId(req.user));
  const session = await latestSession(quiz._id);
  sendSession(res, session, quiz, { isHost: false, userId: req.user._id });
});

export const joinStudentClassroom = asyncHandler(async (req, res) => {
  const quiz = await requirePublishedClassroom(req.params.id, studentClassId(req.user));
  const session = await openSession(quiz._id);
  if (!session) throw new ApiError(400, 'The classroom is not open yet.');

  const groupId = String(req.body?.groupId || '');
  const group = session.groups.find((item) => String(item._id) === groupId);
  if (!group) throw new ApiError(400, 'Choose a group to join.');

  const userId = String(req.user._id);
  const groups = scoreState(session).groups.map((item) => ({
    ...item,
    members: item.members.filter((member) => member.userId !== userId),
  }));
  const target = groups.find((item) => item.id === groupId);
  target.members.push({
    userId: req.user._id,
    name: req.user.fullName,
    role: 'student',
  });

  const updated = await saveTurn(session, { groups: groupsForSave(groups) });
  sendSession(res, updated, quiz, { isHost: false, userId: req.user._id });
});

export const answerStudentClassroom = asyncHandler(async (req, res) => {
  const quiz = await requirePublishedClassroom(req.params.id, studentClassId(req.user));
  const session = await openSession(quiz._id);
  if (!session) throw new ApiError(400, 'The classroom is not live.');
  const updated = await applyAnswer(session, quiz, req.body, {
    isHost: false,
    userId: req.user._id,
  });
  sendSession(res, updated, quiz, { isHost: false, userId: req.user._id });
});

export const passStudentClassroom = asyncHandler(async (req, res) => {
  const quiz = await requirePublishedClassroom(req.params.id, studentClassId(req.user));
  const session = await openSession(quiz._id);
  if (!session) throw new ApiError(400, 'The classroom is not live.');
  const updated = await applyPass(session, quiz, { isHost: false, userId: req.user._id });
  sendSession(res, updated, quiz, { isHost: false, userId: req.user._id });
});

/** Public lookup so a QR scan or a typed code can open a quiz. */
export const lookupClassroomCode = asyncHandler(async (req, res) => {
  const code = normaliseRoomCode(req.params.code);
  const match = await findPublishedJoin(code);
  if (match) {
    const { doc, kind } = match;
    res.status(200).json({
      success: true,
      data: {
        id: doc._id,
        quizId: doc._id,
        title: doc.title,
        subject: doc.subject || '',
        status: 'open',
        code: doc.joinCode,
        playMode: kind === 'quiz' ? 'individual' : kind,
        kind,
        contentMode: doc.contentMode || '',
      },
    });
    return;
  }

  let session = await ClassroomSession.findOne({
    code,
    status: { $in: ['lobby', 'live'] },
  }).sort({ updatedAt: -1 });
  if (!session) {
    session = await ClassroomSession.findOne({ code, status: 'finished' }).sort({ updatedAt: -1 });
  }
  if (!session) throw new ApiError(404, 'No quiz is open for that code.');

  const quiz = await Quiz.findById(session.quiz).select('title subject isPublished');
  if (!quiz || !quiz.isPublished) throw new ApiError(404, 'No quiz is open for that code.');

  res.status(200).json({
    success: true,
    data: {
      quizId: quiz._id,
      title: quiz.title,
      subject: quiz.subject || '',
      status: session.status,
      code: session.code,
      playMode: 'classroom',
      kind: 'classroom',
      contentMode: '',
    },
  });
});
