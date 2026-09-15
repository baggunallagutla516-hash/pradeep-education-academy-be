import { Quiz, QUIZ_QUESTION_TYPES } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { contentClassJsonFields, resolveContentClasses } from '../utils/schoolClass.js';
import { normaliseQuestions, totalMarksFor, validateQuestions } from '../utils/quizGrading.js';
import { sendAssessmentResultsReleasedEmail } from '../utils/mailer.js';
import { assertEndDateNotBefore, readEndDate, readStartDate } from '../utils/examWindow.js';
import { countPendingReleaseAttempts, pendingReleaseAttempts } from '../utils/resultsRelease.js';
import {
  loadParticipantsByRole,
  participantKey,
  participantResultFields,
  resultUrlForRole,
} from '../utils/examParticipant.js';
import { clearAttemptById } from '../utils/reattempt.js';

function toQuestionJson(question) {
  return {
    id: question._id,
    text: question.text,
    imageUrl: question.imageUrl || '',
    imageKey: question.imageKey || '',
    type: question.type,
    options: question.options.map((option) => ({
      text: option.text,
      imageUrl: option.imageUrl || '',
      imageKey: option.imageKey || '',
    })),
    correctOptions: question.correctOptions,
    marks: question.marks,
    explanation: question.explanation,
  };
}

function toQuizJson(doc, extra = {}) {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
    subject: doc.subject,
    startDate: doc.startDate || null,
    endDate: doc.endDate || null,
    durationMinutes: doc.durationMinutes,
    negativeMarkPerWrong: doc.negativeMarkPerWrong,
    allowPartialCredit: doc.allowPartialCredit,
    showAnswersAfterSubmit: doc.showAnswersAfterSubmit,
    resultsReleased: Boolean(doc.resultsReleased),
    resultsReleasedAt: doc.resultsReleasedAt || null,
    questionCount: doc.questions.length,
    totalMarks: doc.totalMarks,
    isPublished: doc.isPublished,
    publishedAt: doc.publishedAt,
    createdAt: doc.createdAt,
    ...extra,
  };
}

function toQuizDetailJson(doc) {
  return toQuizJson(doc, { questions: doc.questions.map(toQuestionJson) });
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true';
}

function assertValidQuestions(questions) {
  const errors = validateQuestions(questions);
  (questions || []).forEach((question, index) => {
    if (!QUIZ_QUESTION_TYPES.includes(question?.type)) {
      errors.push(`Question ${index + 1}: type must be single or multiple.`);
    }
  });
  if (errors.length > 0) {
    throw new ApiError(400, 'Please fix the questions before saving', errors);
  }
}

function readDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 1 || duration > 300) {
    throw new ApiError(400, 'Duration must be between 1 and 300 minutes');
  }
  return duration;
}

function normaliseQuizQuestions(questions) {
  return normaliseQuestions(questions).map((question) => ({
    ...question,
    rows: [],
    correctAnswers: [],
    correctMatrix: [],
  }));
}

export const listQuizzes = asyncHandler(async (_req, res) => {
  const quizzes = await Quiz.find()
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .sort({ createdAt: -1 });

  const counts = await QuizAttempt.aggregate([
    { $group: { _id: '$quiz', count: { $sum: 1 } } },
  ]);
  const countByQuiz = new Map(counts.map((row) => [String(row._id), row.count]));

  res.status(200).json({
    success: true,
    data: {
      quizzes: quizzes.map((doc) =>
        toQuizJson(doc, { attemptCount: countByQuiz.get(String(doc._id)) || 0 })
      ),
    },
  });
});

export const getQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  res.status(200).json({
    success: true,
    data: { quiz: toQuizDetailJson(quiz) },
  });
});

export const createQuiz = asyncHandler(async (req, res) => {
  const { title, description, subject, startDate, endDate, questions } = req.body;

  if (!title?.trim()) throw new ApiError(400, 'Title is required');
  const { studentClasses, studentClass } = await resolveContentClasses(req.body);
  assertValidQuestions(questions);

  const normalised = normaliseQuizQuestions(questions);
  const starts = readStartDate(startDate, { label: 'starting date and time' });
  const ends = readEndDate(endDate);
  assertEndDateNotBefore(ends, starts, 'starting date and time');

  const quiz = await Quiz.create({
    title: title.trim(),
    description: (description || '').trim(),
    studentClass,
    studentClasses,
    subject: (subject || '').trim(),
    startDate: starts,
    endDate: ends,
    durationMinutes: readDuration(req.body.durationMinutes),
    negativeMarkPerWrong: Number(req.body.negativeMarkPerWrong) || 0,
    allowPartialCredit: parseBoolean(req.body.allowPartialCredit, true),
    showAnswersAfterSubmit: parseBoolean(req.body.showAnswersAfterSubmit, true),
    questions: normalised,
    totalMarks: totalMarksFor(normalised),
    isPublished: parseBoolean(req.body.isPublished, false),
    createdBy: req.admin._id,
  });

  await quiz.populate([
    { path: 'studentClass', select: 'name' },
    { path: 'studentClasses', select: 'name' },
  ]);

  res.status(201).json({
    success: true,
    message: 'Quiz created',
    data: { quiz: toQuizDetailJson(quiz) },
  });
});

export const updateQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  const wasPublished = Boolean(quiz.isPublished);
  const { title, description, subject, startDate, endDate, questions } = req.body;

  if (title !== undefined) {
    if (!title.trim()) throw new ApiError(400, 'Title is required');
    quiz.title = title.trim();
  }
  if (description !== undefined) quiz.description = description.trim();
  if (subject !== undefined) quiz.subject = subject.trim();
  if (req.body.studentClasses !== undefined || req.body.studentClass !== undefined) {
    const { studentClasses, studentClass } = await resolveContentClasses(req.body);
    quiz.studentClasses = studentClasses;
    quiz.studentClass = studentClass;
  }
  if (startDate !== undefined) {
    quiz.startDate = readStartDate(startDate, { label: 'starting date and time' });
  }
  if (endDate !== undefined) quiz.endDate = readEndDate(endDate);
  assertEndDateNotBefore(quiz.endDate, quiz.startDate, 'starting date and time');
  if (req.body.durationMinutes !== undefined) {
    quiz.durationMinutes = readDuration(req.body.durationMinutes);
  }
  if (req.body.negativeMarkPerWrong !== undefined) {
    quiz.negativeMarkPerWrong = Number(req.body.negativeMarkPerWrong) || 0;
  }
  if (req.body.allowPartialCredit !== undefined) {
    quiz.allowPartialCredit = parseBoolean(req.body.allowPartialCredit, true);
  }
  if (req.body.showAnswersAfterSubmit !== undefined) {
    quiz.showAnswersAfterSubmit = parseBoolean(req.body.showAnswersAfterSubmit, true);
  }
  if (req.body.isPublished !== undefined) {
    quiz.isPublished = parseBoolean(req.body.isPublished, quiz.isPublished);
  }
  if (questions !== undefined) {
    assertValidQuestions(questions);
    const normalised = normaliseQuizQuestions(questions);
    quiz.questions = normalised;
    quiz.totalMarks = totalMarksFor(normalised);
  }

  const willBePublished = Boolean(quiz.isPublished);
  const unpublishing = wasPublished && !willBePublished;
  const editingPublished = wasPublished;
  const needsWipe = unpublishing || editingPublished;

  if (needsWipe) {
    if (!parseBoolean(req.body.confirmWipeAttempts, false)) {
      throw new ApiError(
        400,
        'Saving or unpublishing a published quiz deletes all attempt data. Confirm to continue.'
      );
    }
    await QuizAttempt.deleteMany({ quiz: quiz._id });
    quiz.resultsReleased = false;
    quiz.resultsReleasedAt = null;
  }

  if (willBePublished && !quiz.publishedAt) {
    quiz.publishedAt = new Date();
  }
  if (!willBePublished) {
    quiz.publishedAt = null;
  }

  await quiz.save();
  await quiz.populate([
    { path: 'studentClass', select: 'name' },
    { path: 'studentClasses', select: 'name' },
  ]);

  res.status(200).json({
    success: true,
    message: unpublishing
      ? 'Quiz unpublished. All attempt data was deleted.'
      : editingPublished
        ? 'Quiz updated. Previous attempt data was deleted so corrected answers apply for everyone.'
        : 'Quiz updated',
    data: { quiz: toQuizDetailJson(quiz) },
  });
});

export const deleteQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  await QuizAttempt.deleteMany({ quiz: quiz._id });
  await quiz.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Quiz deleted',
    data: null,
  });
});

export const listQuizResults = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  const attempts = await QuizAttempt.find({ quiz: quiz._id, status: 'submitted' }).sort({
    percentage: -1,
    submittedAt: 1,
  });
  const participants = await loadParticipantsByRole(attempts);

  const submitted = attempts.length;
  const averagePercentage = submitted
    ? Math.round((attempts.reduce((sum, a) => sum + a.percentage, 0) / submitted) * 100) / 100
    : 0;
  const pendingReleaseCount = countPendingReleaseAttempts(quiz, attempts);

  res.status(200).json({
    success: true,
    data: {
      quiz: toQuizJson(quiz),
      summary: {
        submitted,
        averagePercentage,
        highestPercentage: submitted ? attempts[0].percentage : 0,
        pendingReleaseCount,
      },
      results: attempts.map((attempt) => {
        const person = participants.get(participantKey(attempt));
        return {
          id: attempt._id,
          ...participantResultFields(attempt, person),
          scoredMarks: attempt.scoredMarks,
          totalMarks: attempt.totalMarks,
          percentage: attempt.percentage,
          correctCount: attempt.correctCount,
          partialCount: attempt.partialCount,
          wrongCount: attempt.wrongCount,
          unansweredCount: attempt.unansweredCount,
          timeTakenSeconds: attempt.timeTakenSeconds,
          autoSubmitted: attempt.autoSubmitted,
          submittedAt: attempt.submittedAt,
        };
      }),
    },
  });
});

export const reattemptQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  await clearAttemptById({
    model: QuizAttempt,
    examField: 'quiz',
    examId: quiz._id,
    attemptId: req.params.attemptId,
    label: 'quiz',
    startDate: quiz.startDate,
    endDate: quiz.endDate,
  });

  res.status(200).json({
    success: true,
    message: 'Participant can write this quiz again.',
  });
});

export const releaseQuizResults = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  const attempts = await QuizAttempt.find({
    quiz: quiz._id,
    status: 'submitted',
  });
  const toNotify = pendingReleaseAttempts(quiz, attempts);
  if (toNotify.length === 0) {
    throw new ApiError(
      400,
      attempts.length === 0
        ? 'No submitted attempts to announce yet.'
        : 'All submitted results are already announced. The button unlocks when a new attempt is submitted.'
    );
  }

  const participants = await loadParticipantsByRole(toNotify);

  const wasReleased = Boolean(quiz.resultsReleased);
  quiz.resultsReleased = true;
  quiz.resultsReleasedAt = new Date();
  await quiz.save();

  const clientOrigin = env.clientOrigins[0] || '';

  let emailed = 0;
  let skipped = 0;
  let failed = 0;

  for (const attempt of toNotify) {
    const role = attempt.participantRole || 'student';
    const person = participants.get(participantKey(attempt));
    if (!person?.email || person.deletedAt || person.isActive === false) {
      skipped += 1;
      continue;
    }

    try {
      const outcome = await sendAssessmentResultsReleasedEmail({
        to: person.email,
        studentName: person.fullName,
        title: quiz.title,
        resultUrl: resultUrlForRole(clientOrigin, 'quizzes', quiz._id, role),
      });
      if (outcome.sent) emailed += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      console.error(`[mailer] Failed to email ${person.email}:`, err?.message || err);
    }
  }

  res.status(200).json({
    success: true,
    message: wasReleased
      ? 'New results announced for late submissions. Participants can now view those scores.'
      : 'Results released. Participants can now view scores on the site.',
    data: {
      quiz: toQuizJson(quiz),
      notify: {
        recipients: toNotify.length,
        emailed,
        skipped,
        failed,
      },
      summary: {
        pendingReleaseCount: 0,
      },
    },
  });
});
