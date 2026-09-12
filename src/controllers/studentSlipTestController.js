import { SlipTest } from '../models/SlipTest.js';
import { SlipTestAttempt } from '../models/SlipTestAttempt.js';
import { participantIdentity } from '../utils/examParticipant.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  classRefFields,
  classVisibilityForStudent,
  contentClassJsonFields,
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

function studentClassId(user) {
  const value = user.studentClass;
  if (!value) return null;
  if (typeof value === 'object' && value._id) return value._id;
  return value;
}

/** Question shape sent while the test is being taken — correct answers stripped. */
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

function toSlipTestSummaryJson(doc, attempt, viewerClassId = null) {
  const submitted = attempt?.status === 'submitted';
  const resultsVisible = areAttemptResultsVisible(doc, attempt);
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc, { viewerClassId }),
    subject: doc.subject,
    chapter: doc.chapter,
    topic: doc.topic,
    startDate: doc.startDate || null,
    endDate: doc.endDate || null,
    isClosed: isExamClosed(doc.endDate),
    isNotYetOpen: isExamNotYetOpen(doc.startDate),
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

/**
 * Closes out an attempt whose timer ran out while the student was away, so the
 * result card is still reachable instead of the attempt hanging in_progress.
 */
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

async function loadPublishedSlipTest(req) {
  const slipTest = await SlipTest.findOne({
    _id: req.params.id,
    isPublished: true,
    ...classVisibilityForStudent(studentClassId(req.user)),
  })
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');

  if (!slipTest) throw new ApiError(404, 'Slip test not found');
  return slipTest;
}

/** Persist shuffle for legacy in-progress attempts that predate optionOrder. */
async function withOptionOrder(attempt, questions) {
  ensureAttemptOptionOrder(attempt, questions);
  if (attempt.isModified?.('optionOrder')) {
    await attempt.save();
  }
  return attempt;
}

export const listStudentSlipTests = asyncHandler(async (req, res) => {
  const classId = studentClassId(req.user);

  const slipTests = await SlipTest.find({
    isPublished: true,
    ...classVisibilityForStudent(classId),
  })
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .sort({ createdAt: -1 });

  const attempts = await SlipTestAttempt.find({
    student: req.user._id,
    slipTest: { $in: slipTests.map((doc) => doc._id) },
  });
  const attemptByTest = new Map(attempts.map((attempt) => [String(attempt.slipTest), attempt]));

  const classFields = classRefFields(req.user.studentClass);

  res.status(200).json({
    success: true,
    data: {
      studentClass: classFields.studentClass,
      studentClassName: classFields.studentClassName,
      slipTests: slipTests.map((doc) =>
        toSlipTestSummaryJson(doc, attemptByTest.get(String(doc._id)), classId)
      ),
    },
  });
});

export const getStudentSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await loadPublishedSlipTest(req);
  let attempt = await SlipTestAttempt.findOne({ slipTest: slipTest._id, student: req.user._id });

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, slipTest);
  }

  res.status(200).json({
    success: true,
    data: { slipTest: toSlipTestSummaryJson(slipTest, attempt, studentClassId(req.user)) },
  });
});

export const startStudentSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await loadPublishedSlipTest(req);

  if (slipTest.questions.length === 0) {
    throw new ApiError(400, 'This slip test has no questions yet');
  }

  let attempt = await SlipTestAttempt.findOne({ slipTest: slipTest._id, student: req.user._id });

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, slipTest);
  }

  if (attempt?.status === 'submitted') {
    throw new ApiError(409, 'You have already submitted this slip test');
  }

  if (!attempt) {
    assertExamWindow(slipTest.startDate, slipTest.endDate, 'slip test');
    const startedAt = new Date();
    try {
      attempt = await SlipTestAttempt.create({
        slipTest: slipTest._id,
        ...participantIdentity('student', req.user._id),
        studentClass: studentClassId(req.user),
        startedAt,
        expiresAt: new Date(startedAt.getTime() + slipTest.durationMinutes * 60 * 1000),
        totalMarks: slipTest.totalMarks,
        optionOrder: buildOptionOrder(slipTest.questions),
      });
    } catch (err) {
      // Two tabs hitting start at once — the unique index keeps one attempt.
      if (err?.code !== 11000) throw err;
      attempt = await SlipTestAttempt.findOne({ slipTest: slipTest._id, student: req.user._id });
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
        ...toSlipTestSummaryJson(slipTest, attempt, studentClassId(req.user)),
        questions: slipTest.questions.map((question, index) =>
          toAttemptQuestionJson(question, index, orderByQuestion)
        ),
      },
    },
  });
});

export const submitStudentSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await loadPublishedSlipTest(req);
  const attempt = await SlipTestAttempt.findOne({ slipTest: slipTest._id, student: req.user._id });

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

  if (!areAttemptResultsVisible(slipTest, attempt)) {
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

export const getStudentSlipTestResult = asyncHandler(async (req, res) => {
  const slipTest = await loadPublishedSlipTest(req);
  let attempt = await SlipTestAttempt.findOne({ slipTest: slipTest._id, student: req.user._id });

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, slipTest);
  }
  if (!attempt || attempt.status !== 'submitted') {
    throw new ApiError(404, 'No submitted attempt for this slip test yet');
  }

  if (!areAttemptResultsVisible(slipTest, attempt)) {
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

/** Result card payload. Review details are only attached when the admin allowed it. */
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
