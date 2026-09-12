import { Dpp } from '../models/Dpp.js';
import { DppAttempt } from '../models/DppAttempt.js';
import { participantIdentity } from '../utils/examParticipant.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  assertDocInAssignedClasses,
  buildAssignedClassFilter,
  contentClassJsonFields,
  docClassIds,
  listClassesByIds,
  toPublicClass,
} from '../utils/schoolClass.js';
import { gradeAttempt, resultTier } from '../utils/quizGrading.js';
import {
  buildOptionOrder,
  ensureAttemptOptionOrder,
  optionOrderMap,
  toShuffledOptions,
} from '../utils/optionOrder.js';
import { assertExamWindow, isExamClosed, isExamNotYetOpen } from '../utils/examWindow.js';
import { areAttemptResultsVisible } from '../utils/resultsRelease.js';

const EDUCATOR_ROLE = 'educator';

function examClassId(doc) {
  return docClassIds(doc)[0] || null;
}

function findAttemptQuery(dppId, educatorId) {
  return {
    dpp: dppId,
    participantRole: EDUCATOR_ROLE,
    participantId: educatorId,
  };
}

function toAttemptQuestionJson(question, index, orderByQuestion) {
  return {
    id: question._id,
    number: index + 1,
    text: question.text,
    type: question.type,
    marks: question.marks,
    options: toShuffledOptions(question, orderByQuestion),
    rows:
      question.type === 'matrix'
        ? (question.rows || []).map((row, rowIndex) => ({ index: rowIndex, text: row.text }))
        : [],
  };
}

function toDppSummaryJson(doc, attempt) {
  const submitted = attempt?.status === 'submitted';
  const resultsVisible = areAttemptResultsVisible(doc, attempt);
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
    subject: doc.subject,
    practiceDate: doc.practiceDate,
    endDate: doc.endDate || null,
    isClosed: isExamClosed(doc.endDate),
    isNotYetOpen: isExamNotYetOpen(doc.practiceDate),
    durationMinutes: doc.durationMinutes,
    negativeMarkPerWrong: doc.negativeMarkPerWrong,
    allowPartialCredit: doc.allowPartialCredit,
    questionCount: doc.questions.length,
    totalMarks: doc.totalMarks,
    attemptStatus: attempt ? attempt.status : 'not_started',
    resultsReleased: resultsVisible,
    resultsReleasedAt: doc.resultsReleasedAt || null,
    scoredMarks: submitted && resultsVisible ? attempt.scoredMarks : null,
    percentage: submitted && resultsVisible ? attempt.percentage : null,
    submittedAt: attempt?.submittedAt || null,
  };
}

function remainingSeconds(attempt) {
  return Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000));
}

async function finaliseExpiredAttempt(attempt, dpp) {
  const graded = gradeAttempt({
    questions: dpp.questions,
    answers: [],
    negativeMarkPerWrong: dpp.negativeMarkPerWrong,
    allowPartialCredit: dpp.allowPartialCredit,
  });

  Object.assign(attempt, graded, {
    status: 'submitted',
    submittedAt: attempt.expiresAt,
    autoSubmitted: true,
    timeTakenSeconds: dpp.durationMinutes * 60,
  });

  await attempt.save();
  return attempt;
}

async function loadPublishedDpp(id, educator) {
  const dpp = await Dpp.findOne({
    _id: id,
    isPublished: true,
  })
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');

  if (!dpp) throw new ApiError(404, 'DPP not found');
  assertDocInAssignedClasses(dpp, educator, 'DPP');
  return dpp;
}

async function withOptionOrder(attempt, questions) {
  ensureAttemptOptionOrder(attempt, questions);
  if (attempt?.isModified?.('optionOrder')) {
    await attempt.save();
  }
  return attempt;
}

function buildResult(dpp, attempt) {
  const tier = resultTier(attempt.percentage);
  const questionById = new Map(dpp.questions.map((question) => [String(question._id), question]));
  const orderByQuestion = optionOrderMap(attempt);

  const base = {
    dppId: dpp._id,
    title: dpp.title,
    subject: dpp.subject,
    practiceDate: dpp.practiceDate,
    scoredMarks: attempt.scoredMarks,
    totalMarks: attempt.totalMarks,
    percentage: attempt.percentage,
    correctCount: attempt.correctCount,
    partialCount: attempt.partialCount,
    wrongCount: attempt.wrongCount,
    unansweredCount: attempt.unansweredCount,
    questionCount: dpp.questions.length,
    timeTakenSeconds: attempt.timeTakenSeconds,
    autoSubmitted: attempt.autoSubmitted,
    submittedAt: attempt.submittedAt,
    emoji: tier.emoji,
    tierLabel: tier.label,
    tierMessage: tier.message,
    showAnswers: dpp.showAnswersAfterSubmit,
  };

  if (!dpp.showAnswersAfterSubmit) return base;

  return {
    ...base,
    review: attempt.responses.map((response, index) => {
      const question = questionById.get(String(response.question));
      return {
        number: index + 1,
        text: question?.text || '',
        type: question?.type || 'single',
        marks: question?.marks || 0,
        options: toShuffledOptions(question, orderByQuestion),
        rows:
          question?.type === 'matrix'
            ? (question.rows || []).map((row, rowIndex) => ({ index: rowIndex, text: row.text }))
            : [],
        selectedOptions: response.selectedOptions,
        correctOptions: response.correctOptions,
        textAnswer: response.textAnswer || '',
        correctAnswers: response.correctAnswers || [],
        matrixAnswers: response.matrixAnswers || [],
        correctMatrix: response.correctMatrix || [],
        outcome: response.outcome,
        awardedMarks: response.awardedMarks,
        explanation: question?.explanation || '',
      };
    }),
  };
}

export const listEducatorDpps = asyncHandler(async (req, res) => {
  const queryClass =
    typeof req.query.studentClass === 'string' ? req.query.studentClass.trim() : '';
  const { filter: classFilter, assignedIds, selectedClass } = await buildAssignedClassFilter(
    req.educator,
    queryClass
  );
  const filter = { isPublished: true, ...classFilter };

  const [dpps, classDocs] = await Promise.all([
    Dpp.find(filter)
      .populate('studentClass', 'name')
      .populate('studentClasses', 'name')
      .sort({ practiceDate: -1, createdAt: -1 }),
    listClassesByIds(assignedIds),
  ]);

  const attempts = await DppAttempt.find({
    participantRole: EDUCATOR_ROLE,
    participantId: req.educator._id,
    dpp: { $in: dpps.map((doc) => doc._id) },
  });
  const attemptByDpp = new Map(attempts.map((attempt) => [String(attempt.dpp), attempt]));

  res.status(200).json({
    success: true,
    data: {
      studentClass: selectedClass,
      classes: classDocs.map(toPublicClass),
      dpps: dpps.map((doc) => toDppSummaryJson(doc, attemptByDpp.get(String(doc._id)))),
    },
  });
});

export const getEducatorDpp = asyncHandler(async (req, res) => {
  const dpp = await loadPublishedDpp(req.params.id, req.educator);
  let attempt = await DppAttempt.findOne(findAttemptQuery(dpp._id, req.educator._id));

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, dpp);
  }

  res.status(200).json({
    success: true,
    data: { dpp: toDppSummaryJson(dpp, attempt) },
  });
});

export const startEducatorDpp = asyncHandler(async (req, res) => {
  const dpp = await loadPublishedDpp(req.params.id, req.educator);

  if (dpp.questions.length === 0) {
    throw new ApiError(400, 'This DPP has no questions yet');
  }

  let attempt = await DppAttempt.findOne(findAttemptQuery(dpp._id, req.educator._id));

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, dpp);
  }

  if (attempt?.status === 'submitted') {
    throw new ApiError(409, 'You have already submitted this DPP');
  }

  if (!attempt) {
    assertExamWindow(dpp.practiceDate, dpp.endDate, 'DPP');
    const startedAt = new Date();
    try {
      attempt = await DppAttempt.create({
        dpp: dpp._id,
        ...participantIdentity(EDUCATOR_ROLE, req.educator._id),
        studentClass: examClassId(dpp),
        startedAt,
        expiresAt: new Date(startedAt.getTime() + dpp.durationMinutes * 60 * 1000),
        totalMarks: dpp.totalMarks,
        optionOrder: buildOptionOrder(dpp.questions),
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      attempt = await DppAttempt.findOne(findAttemptQuery(dpp._id, req.educator._id));
    }
  }

  if (!attempt) {
    throw new ApiError(409, 'Could not start this DPP. Please try again.');
  }

  attempt = await withOptionOrder(attempt, dpp.questions);
  const orderByQuestion = optionOrderMap(attempt);

  res.status(200).json({
    success: true,
    data: {
      attempt: {
        id: attempt._id,
        startedAt: attempt.startedAt,
        expiresAt: attempt.expiresAt,
        remainingSeconds: remainingSeconds(attempt),
      },
      dpp: {
        ...toDppSummaryJson(dpp, attempt),
        questions: dpp.questions.map((question, index) =>
          toAttemptQuestionJson(question, index, orderByQuestion)
        ),
      },
      student: {
        fullName: req.educator.fullName,
      },
    },
  });
});

export const submitEducatorDpp = asyncHandler(async (req, res) => {
  const dpp = await loadPublishedDpp(req.params.id, req.educator);
  const attempt = await DppAttempt.findOne(findAttemptQuery(dpp._id, req.educator._id));

  if (!attempt) throw new ApiError(400, 'Start the DPP before submitting');
  if (attempt.status === 'submitted') throw new ApiError(409, 'You have already submitted this DPP');

  const { answers } = req.body;
  if (answers !== undefined && !Array.isArray(answers)) {
    throw new ApiError(400, 'Answers must be a list');
  }

  const graded = gradeAttempt({
    questions: dpp.questions,
    answers: answers || [],
    negativeMarkPerWrong: dpp.negativeMarkPerWrong,
    allowPartialCredit: dpp.allowPartialCredit,
  });

  const submittedAt = new Date();
  Object.assign(attempt, graded, {
    status: 'submitted',
    submittedAt,
    autoSubmitted: Boolean(req.body.autoSubmitted) || remainingSeconds(attempt) === 0,
    timeTakenSeconds: Math.max(
      0,
      Math.floor((submittedAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000)
    ),
  });

  await attempt.save();

  if (!areAttemptResultsVisible(dpp, attempt)) {
    res.status(200).json({
      success: true,
      message: 'DPP submitted. Results will be available after the academy releases them.',
      data: {
        resultsHeld: true,
        submittedAt: attempt.submittedAt,
        dpp: {
          id: dpp._id,
          title: dpp.title,
          subject: dpp.subject,
          practiceDate: dpp.practiceDate,
          resultsReleased: false,
        },
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    message: 'DPP submitted',
    data: { result: buildResult(dpp, attempt), resultsHeld: false },
  });
});

export const getEducatorDppResult = asyncHandler(async (req, res) => {
  const dpp = await loadPublishedDpp(req.params.id, req.educator);
  let attempt = await DppAttempt.findOne(findAttemptQuery(dpp._id, req.educator._id));

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, dpp);
  }
  if (!attempt || attempt.status !== 'submitted') {
    throw new ApiError(404, 'No submitted attempt for this DPP yet');
  }

  if (!areAttemptResultsVisible(dpp, attempt)) {
    res.status(200).json({
      success: true,
      data: {
        resultsHeld: true,
        submittedAt: attempt.submittedAt,
        dpp: {
          id: dpp._id,
          title: dpp.title,
          subject: dpp.subject,
          practiceDate: dpp.practiceDate,
          resultsReleased: false,
        },
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: { result: buildResult(dpp, attempt), resultsHeld: false },
  });
});
