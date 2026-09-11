import { Quiz, QUIZ_QUESTION_TYPES } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { Student } from '../models/Student.js';
import { Educator } from '../models/Educator.js';
import { Parent } from '../models/Parent.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { normaliseQuestions, totalMarksFor, validateQuestions } from '../utils/quizGrading.js';
import { sendAssessmentResultsReleasedEmail } from '../utils/mailer.js';
import { readEndDate } from '../utils/examWindow.js';

const ROLE_LABEL = {
  student: 'Student',
  educator: 'Educator',
  parent: 'Parent',
};

async function loadParticipantsByRole(attempts) {
  const idsByRole = {
    student: new Set(),
    educator: new Set(),
    parent: new Set(),
  };

  attempts.forEach((attempt) => {
    const role = attempt.participantRole || (attempt.student ? 'student' : null);
    const id = attempt.participantId || attempt.student;
    if (role && id && idsByRole[role]) idsByRole[role].add(String(id));
  });

  const [students, educators, parents] = await Promise.all([
    idsByRole.student.size
      ? Student.find({ _id: { $in: [...idsByRole.student] } }).select(
          'fullName email rollNumber isActive deletedAt'
        )
      : [],
    idsByRole.educator.size
      ? Educator.find({ _id: { $in: [...idsByRole.educator] } }).select(
          'fullName email isActive deletedAt'
        )
      : [],
    idsByRole.parent.size
      ? Parent.find({ _id: { $in: [...idsByRole.parent] } }).select('fullName email isActive')
      : [],
  ]);

  const map = new Map();
  students.forEach((doc) => map.set(`student:${doc._id}`, doc));
  educators.forEach((doc) => map.set(`educator:${doc._id}`, doc));
  parents.forEach((doc) => map.set(`parent:${doc._id}`, doc));
  return map;
}

function participantKey(attempt) {
  const role = attempt.participantRole || (attempt.student ? 'student' : 'student');
  const id = attempt.participantId || attempt.student;
  return `${role}:${id}`;
}

function resultUrlForRole(clientOrigin, quizId, role) {
  if (!clientOrigin) return '';
  const base = clientOrigin.replace(/\/$/, '');
  if (role === 'educator') return `${base}/educator/quizzes/${quizId}/result`;
  if (role === 'parent') return `${base}/parent/quizzes/${quizId}/result`;
  return `${base}/quizzes/${quizId}/result`;
}

function toQuestionJson(question) {
  return {
    id: question._id,
    text: question.text,
    type: question.type,
    options: question.options.map((option) => ({ text: option.text })),
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
    subject: doc.subject,
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
  const quizzes = await Quiz.find().sort({ createdAt: -1 });

  const counts = await QuizAttempt.aggregate([
    { $match: { status: 'submitted' } },
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
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  res.status(200).json({
    success: true,
    data: { quiz: toQuizDetailJson(quiz) },
  });
});

export const createQuiz = asyncHandler(async (req, res) => {
  const { title, description, subject, endDate, questions } = req.body;

  if (!title?.trim()) throw new ApiError(400, 'Title is required');
  assertValidQuestions(questions);

  const normalised = normaliseQuizQuestions(questions);

  const quiz = await Quiz.create({
    title: title.trim(),
    description: (description || '').trim(),
    subject: (subject || '').trim(),
    endDate: readEndDate(endDate),
    durationMinutes: readDuration(req.body.durationMinutes),
    negativeMarkPerWrong: Number(req.body.negativeMarkPerWrong) || 0,
    allowPartialCredit: parseBoolean(req.body.allowPartialCredit, true),
    showAnswersAfterSubmit: parseBoolean(req.body.showAnswersAfterSubmit, true),
    questions: normalised,
    totalMarks: totalMarksFor(normalised),
    isPublished: parseBoolean(req.body.isPublished, false),
    createdBy: req.admin._id,
  });

  res.status(201).json({
    success: true,
    message: 'Quiz created',
    data: { quiz: toQuizDetailJson(quiz) },
  });
});

export const updateQuiz = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  if (quiz.isPublished) {
    throw new ApiError(400, 'Published quizzes cannot be edited');
  }

  const { title, description, subject, endDate, questions } = req.body;

  if (title !== undefined) {
    if (!title.trim()) throw new ApiError(400, 'Title is required');
    quiz.title = title.trim();
  }
  if (description !== undefined) quiz.description = description.trim();
  if (subject !== undefined) quiz.subject = subject.trim();
  if (endDate !== undefined) quiz.endDate = readEndDate(endDate);
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

  await quiz.save();

  res.status(200).json({
    success: true,
    message: 'Quiz updated',
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
  const quiz = await Quiz.findById(req.params.id);
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

  res.status(200).json({
    success: true,
    data: {
      quiz: toQuizJson(quiz),
      summary: {
        submitted,
        averagePercentage,
        highestPercentage: submitted ? attempts[0].percentage : 0,
      },
      results: attempts.map((attempt) => {
        const role = attempt.participantRole || 'student';
        const person = participants.get(participantKey(attempt));
        return {
          id: attempt._id,
          participantRole: role,
          roleLabel: ROLE_LABEL[role] || role,
          studentId: person?._id || attempt.participantId || null,
          studentName: person?.fullName || `Deleted ${ROLE_LABEL[role] || 'user'}`,
          studentEmail: person?.email || '',
          rollNumber: person?.rollNumber || '',
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

export const releaseQuizResults = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  const attempts = await QuizAttempt.find({
    quiz: quiz._id,
    status: 'submitted',
  });
  const participants = await loadParticipantsByRole(attempts);

  const alreadyReleased = Boolean(quiz.resultsReleased);
  if (!alreadyReleased) {
    quiz.resultsReleased = true;
    quiz.resultsReleasedAt = new Date();
    await quiz.save();
  }

  const clientOrigin = env.clientOrigins[0] || '';

  let emailed = 0;
  let skipped = 0;
  let failed = 0;

  for (const attempt of attempts) {
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
        resultUrl: resultUrlForRole(clientOrigin, quiz._id, role),
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
    message: alreadyReleased
      ? 'Results were already released. Notification emails were sent again.'
      : 'Results released. Participants can now view scores on the site.',
    data: {
      quiz: toQuizJson(quiz),
      notify: {
        recipients: attempts.length,
        emailed,
        skipped,
        failed,
      },
    },
  });
});
