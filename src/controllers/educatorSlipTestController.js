import { SlipTest } from '../models/SlipTest.js';
import { SlipTestAttempt } from '../models/SlipTestAttempt.js';
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
import { assertExamOpen, isExamClosed } from '../utils/examWindow.js';

const EDUCATOR_ROLE = 'educator';

function examClassId(doc) {
  return docClassIds(doc)[0] || null;
}

function findAttemptQuery(slipTestId, educatorId) {
  return {
    slipTest: slipTestId,
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

function toSlipTestSummaryJson(doc, attempt) {
  const submitted = attempt?.status === 'submitted';
  const resultsReleased = Boolean(doc.resultsReleased);
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
    subject: doc.subject,
    chapter: doc.chapter,
    topic: doc.topic,
    endDate: doc.endDate || null,
    isClosed: isExamClosed(doc.endDate),
    durationMinutes: doc.durationMinutes,
    negativeMarkPerWrong: doc.negativeMarkPerWrong,
    allowPartialCredit: doc.allowPartialCredit,
    questionCount: doc.questions.length,
    totalMarks: doc.totalMarks,
    attemptStatus: attempt ? attempt.status : 'not_started',
    resultsReleased,
    resultsReleasedAt: doc.resultsReleasedAt || null,
    scoredMarks: submitted && resultsReleased ? attempt.scoredMarks : null,
    percentage: submitted && resultsReleased ? attempt.percentage : null,
    submittedAt: attempt?.submittedAt || null,
  };
}

function remainingSeconds(attempt) {
  return Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000));
}

async function finaliseExpiredAttempt(attempt, slipTest) {
  const graded = gradeAttempt({
    questions: slipTest.questions,
    answers: [],
    negativeMarkPerWrong: slipTest.negativeMarkPerWrong,
    allowPartialCredit: slipTest.allowPartialCredit,
  });

  Object.assign(attempt, graded, {
    status: 'submitted',
    submittedAt: attempt.expiresAt,
    autoSubmitted: true,
    timeTakenSeconds: slipTest.durationMinutes * 60,
  });

  await attempt.save();
  return attempt;
}

async function loadPublishedSlipTest(id, educator) {
  const slipTest = await SlipTest.findOne({
    _id: id,
    isPublished: true,
  })
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');

  if (!slipTest) throw new ApiError(404, 'Slip test not found');
  assertDocInAssignedClasses(slipTest, educator, 'Slip test');
  return slipTest;
}

async function withOptionOrder(attempt, questions) {
  ensureAttemptOptionOrder(attempt, questions);
  if (attempt.isModified?.('optionOrder')) {
    await attempt.save();
  }
  return attempt;
}

function buildResult(slipTest, attempt) {
  const tier = resultTier(attempt.percentage);
  const questionById = new Map(
    slipTest.questions.map((question) => [String(question._id), question])
  );
  const orderByQuestion = optionOrderMap(attempt);

  const base = {
    slipTestId: slipTest._id,
    title: slipTest.title,
    subject: slipTest.subject,
    chapter: slipTest.chapter,
    topic: slipTest.topic,
    scoredMarks: attempt.scoredMarks,
    totalMarks: attempt.totalMarks,
    percentage: attempt.percentage,
    correctCount: attempt.correctCount,
    partialCount: attempt.partialCount,
    wrongCount: attempt.wrongCount,
    unansweredCount: attempt.unansweredCount,
    questionCount: slipTest.questions.length,
    timeTakenSeconds: attempt.timeTakenSeconds,
    autoSubmitted: attempt.autoSubmitted,
    submittedAt: attempt.submittedAt,
    emoji: tier.emoji,
    tierLabel: tier.label,
    tierMessage: tier.message,
    showAnswers: slipTest.showAnswersAfterSubmit,
  };

  if (!slipTest.showAnswersAfterSubmit) return base;

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

export const listEducatorSlipTests = asyncHandler(async (req, res) => {
  const queryClass =
    typeof req.query.studentClass === 'string' ? req.query.studentClass.trim() : '';
  const { filter: classFilter, assignedIds, selectedClass } = await buildAssignedClassFilter(
    req.educator,
    queryClass
  );
  const filter = { isPublished: true, ...classFilter };

  const [slipTests, classDocs] = await Promise.all([
    SlipTest.find(filter)
      .populate('studentClass', 'name')
      .populate('studentClasses', 'name')
      .sort({ createdAt: -1 }),
    listClassesByIds(assignedIds),
  ]);

  const attempts = await SlipTestAttempt.find({
    participantRole: EDUCATOR_ROLE,
    participantId: req.educator._id,
    slipTest: { $in: slipTests.map((doc) => doc._id) },
  });
  const attemptByTest = new Map(attempts.map((attempt) => [String(attempt.slipTest), attempt]));

  res.status(200).json({
    success: true,
    data: {
      studentClass: selectedClass,
      classes: classDocs.map(toPublicClass),
      slipTests: slipTests.map((doc) =>
        toSlipTestSummaryJson(doc, attemptByTest.get(String(doc._id)))
      ),
    },
  });
});

export const getEducatorSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await loadPublishedSlipTest(req.params.id, req.educator);
  let attempt = await SlipTestAttempt.findOne(findAttemptQuery(slipTest._id, req.educator._id));

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, slipTest);
  }

  res.status(200).json({
    success: true,
    data: { slipTest: toSlipTestSummaryJson(slipTest, attempt) },
  });
});

export const startEducatorSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await loadPublishedSlipTest(req.params.id, req.educator);

  if (slipTest.questions.length === 0) {
    throw new ApiError(400, 'This slip test has no questions yet');
  }

  let attempt = await SlipTestAttempt.findOne(findAttemptQuery(slipTest._id, req.educator._id));

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, slipTest);
  }

  if (attempt?.status === 'submitted') {
    throw new ApiError(409, 'You have already submitted this slip test');
  }

  if (!attempt) {
    assertExamOpen(slipTest.endDate, 'slip test');
    const startedAt = new Date();
    try {
      attempt = await SlipTestAttempt.create({
        slipTest: slipTest._id,
        participantRole: EDUCATOR_ROLE,
        participantId: req.educator._id,
        student: null,
        studentClass: examClassId(slipTest),
        startedAt,
        expiresAt: new Date(startedAt.getTime() + slipTest.durationMinutes * 60 * 1000),
        totalMarks: slipTest.totalMarks,
        optionOrder: buildOptionOrder(slipTest.questions),
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      attempt = await SlipTestAttempt.findOne(findAttemptQuery(slipTest._id, req.educator._id));
    }
  }

  attempt = await withOptionOrder(attempt, slipTest.questions);
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
      slipTest: {
        ...toSlipTestSummaryJson(slipTest, attempt),
        questions: slipTest.questions.map((question, index) =>
          toAttemptQuestionJson(question, index, orderByQuestion)
        ),
      },
      student: {
        fullName: req.educator.fullName,
      },
    },
  });
});

export const submitEducatorSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await loadPublishedSlipTest(req.params.id, req.educator);
  const attempt = await SlipTestAttempt.findOne(findAttemptQuery(slipTest._id, req.educator._id));

  if (!attempt) throw new ApiError(400, 'Start the slip test before submitting');
  if (attempt.status === 'submitted') {
    throw new ApiError(409, 'You have already submitted this slip test');
  }

  const { answers } = req.body;
  if (answers !== undefined && !Array.isArray(answers)) {
    throw new ApiError(400, 'Answers must be a list');
  }

  const graded = gradeAttempt({
    questions: slipTest.questions,
    answers: answers || [],
    negativeMarkPerWrong: slipTest.negativeMarkPerWrong,
    allowPartialCredit: slipTest.allowPartialCredit,
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

  if (!slipTest.resultsReleased) {
    res.status(200).json({
      success: true,
      message: 'Slip test submitted. Results will be available after the academy releases them.',
      data: {
        resultsHeld: true,
        submittedAt: attempt.submittedAt,
        slipTest: {
          id: slipTest._id,
          title: slipTest.title,
          subject: slipTest.subject,
          chapter: slipTest.chapter,
          resultsReleased: false,
        },
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    message: 'Slip test submitted',
    data: { result: buildResult(slipTest, attempt), resultsHeld: false },
  });
});

export const getEducatorSlipTestResult = asyncHandler(async (req, res) => {
  const slipTest = await loadPublishedSlipTest(req.params.id, req.educator);
  let attempt = await SlipTestAttempt.findOne(findAttemptQuery(slipTest._id, req.educator._id));

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, slipTest);
  }
  if (!attempt || attempt.status !== 'submitted') {
    throw new ApiError(404, 'No submitted attempt for this slip test yet');
  }

  if (!slipTest.resultsReleased) {
    res.status(200).json({
      success: true,
      data: {
        resultsHeld: true,
        submittedAt: attempt.submittedAt,
        slipTest: {
          id: slipTest._id,
          title: slipTest.title,
          subject: slipTest.subject,
          chapter: slipTest.chapter,
          resultsReleased: false,
        },
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: { result: buildResult(slipTest, attempt), resultsHeld: false },
  });
});
