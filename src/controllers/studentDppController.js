import { Dpp } from '../models/Dpp.js';
import { DppAttempt } from '../models/DppAttempt.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { classRefFields } from '../utils/schoolClass.js';
import { gradeAttempt, resultTier } from '../utils/quizGrading.js';

function studentClassId(user) {
  const value = user.studentClass;
  if (!value) return null;
  if (typeof value === 'object' && value._id) return value._id;
  return value;
}

/** Question shape sent while the test is being taken — correct answers stripped. */
function toAttemptQuestionJson(question, index) {
  return {
    id: question._id,
    number: index + 1,
    text: question.text,
    type: question.type,
    marks: question.marks,
    options: question.options.map((option, optionIndex) => ({
      index: optionIndex,
      text: option.text,
    })),
  };
}

function toDppSummaryJson(doc, attempt) {
  const classFields = classRefFields(doc.studentClass);
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    studentClass: classFields.studentClass,
    studentClassName: classFields.studentClassName,
    subject: doc.subject,
    practiceDate: doc.practiceDate,
    durationMinutes: doc.durationMinutes,
    negativeMarkPerWrong: doc.negativeMarkPerWrong,
    allowPartialCredit: doc.allowPartialCredit,
    questionCount: doc.questions.length,
    totalMarks: doc.totalMarks,
    attemptStatus: attempt ? attempt.status : 'not_started',
    scoredMarks: attempt?.status === 'submitted' ? attempt.scoredMarks : null,
    percentage: attempt?.status === 'submitted' ? attempt.percentage : null,
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

async function loadPublishedDpp(req) {
  const dpp = await Dpp.findOne({
    _id: req.params.id,
    isPublished: true,
    studentClass: studentClassId(req.user),
  }).populate('studentClass', 'name');

  if (!dpp) throw new ApiError(404, 'DPP not found');
  return dpp;
}

export const listStudentDpps = asyncHandler(async (req, res) => {
  const classId = studentClassId(req.user);

  const dpps = await Dpp.find({ isPublished: true, studentClass: classId })
    .populate('studentClass', 'name')
    .sort({ practiceDate: -1, createdAt: -1 });

  const attempts = await DppAttempt.find({
    student: req.user._id,
    dpp: { $in: dpps.map((doc) => doc._id) },
  });
  const attemptByDpp = new Map(attempts.map((attempt) => [String(attempt.dpp), attempt]));

  const classFields = classRefFields(req.user.studentClass);

  res.status(200).json({
    success: true,
    data: {
      studentClass: classFields.studentClass,
      studentClassName: classFields.studentClassName,
      dpps: dpps.map((doc) => toDppSummaryJson(doc, attemptByDpp.get(String(doc._id)))),
    },
  });
});

export const getStudentDpp = asyncHandler(async (req, res) => {
  const dpp = await loadPublishedDpp(req);
  let attempt = await DppAttempt.findOne({ dpp: dpp._id, student: req.user._id });

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, dpp);
  }

  res.status(200).json({
    success: true,
    data: { dpp: toDppSummaryJson(dpp, attempt) },
  });
});

export const startStudentDpp = asyncHandler(async (req, res) => {
  const dpp = await loadPublishedDpp(req);

  if (dpp.questions.length === 0) {
    throw new ApiError(400, 'This DPP has no questions yet');
  }

  let attempt = await DppAttempt.findOne({ dpp: dpp._id, student: req.user._id });

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, dpp);
  }

  if (attempt?.status === 'submitted') {
    throw new ApiError(409, 'You have already submitted this DPP');
  }

  if (!attempt) {
    const startedAt = new Date();
    try {
      attempt = await DppAttempt.create({
        dpp: dpp._id,
        student: req.user._id,
        studentClass: studentClassId(req.user),
        startedAt,
        expiresAt: new Date(startedAt.getTime() + dpp.durationMinutes * 60 * 1000),
        totalMarks: dpp.totalMarks,
      });
    } catch (err) {
      // Two tabs hitting start at once — the unique index keeps one attempt.
      if (err?.code !== 11000) throw err;
      attempt = await DppAttempt.findOne({ dpp: dpp._id, student: req.user._id });
    }
  }

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
        questions: dpp.questions.map(toAttemptQuestionJson),
      },
    },
  });
});

export const submitStudentDpp = asyncHandler(async (req, res) => {
  const dpp = await loadPublishedDpp(req);
  const attempt = await DppAttempt.findOne({ dpp: dpp._id, student: req.user._id });

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

  res.status(200).json({
    success: true,
    message: 'DPP submitted',
    data: { result: buildResult(dpp, attempt) },
  });
});

export const getStudentDppResult = asyncHandler(async (req, res) => {
  const dpp = await loadPublishedDpp(req);
  let attempt = await DppAttempt.findOne({ dpp: dpp._id, student: req.user._id });

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, dpp);
  }
  if (!attempt || attempt.status !== 'submitted') {
    throw new ApiError(404, 'No submitted attempt for this DPP yet');
  }

  res.status(200).json({
    success: true,
    data: { result: buildResult(dpp, attempt) },
  });
});

/** Result card payload. Review details are only attached when the admin allowed it. */
function buildResult(dpp, attempt) {
  const tier = resultTier(attempt.percentage);
  const questionById = new Map(dpp.questions.map((question) => [String(question._id), question]));

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
        options:
          question?.options.map((option, optionIndex) => ({
            index: optionIndex,
            text: option.text,
          })) || [],
        selectedOptions: response.selectedOptions,
        correctOptions: response.correctOptions,
        outcome: response.outcome,
        awardedMarks: response.awardedMarks,
        explanation: question?.explanation || '',
      };
    }),
  };
}
