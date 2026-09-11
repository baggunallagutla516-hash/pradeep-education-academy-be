import { Dpp } from '../models/Dpp.js';
import { DppAttempt } from '../models/DppAttempt.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { assertActiveClassId, classRefFields } from '../utils/schoolClass.js';
import { normaliseQuestions, totalMarksFor, validateQuestions } from '../utils/quizGrading.js';
import { sendAssessmentResultsReleasedEmail } from '../utils/mailer.js';

function toQuestionJson(question) {
  return {
    id: question._id,
    text: question.text,
    type: question.type,
    options: question.options.map((option) => ({ text: option.text })),
    rows: (question.rows || []).map((row) => ({ text: row.text })),
    correctOptions: question.correctOptions,
    correctAnswers: question.correctAnswers || [],
    correctMatrix: question.correctMatrix || [],
    marks: question.marks,
    explanation: question.explanation,
  };
}

function toDppJson(doc, extra = {}) {
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

function toDppDetailJson(doc) {
  return toDppJson(doc, { questions: doc.questions.map(toQuestionJson) });
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true';
}

function assertValidQuestions(questions) {
  const errors = validateQuestions(questions);
  if (errors.length > 0) {
    throw new ApiError(400, 'Please fix the questions before saving', errors);
  }
}

function readPracticeDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'A valid practice date is required');
  }
  return date;
}

function readDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 1 || duration > 300) {
    throw new ApiError(400, 'Duration must be between 1 and 300 minutes');
  }
  return duration;
}

export const listDpps = asyncHandler(async (req, res) => {
  const dpps = await Dpp.find().populate('studentClass', 'name').sort({ practiceDate: -1, createdAt: -1 });

  const counts = await DppAttempt.aggregate([
    { $match: { status: 'submitted' } },
    { $group: { _id: '$dpp', count: { $sum: 1 } } },
  ]);
  const countByDpp = new Map(counts.map((row) => [String(row._id), row.count]));

  res.status(200).json({
    success: true,
    data: {
      dpps: dpps.map((doc) => toDppJson(doc, { attemptCount: countByDpp.get(String(doc._id)) || 0 })),
    },
  });
});

export const getDpp = asyncHandler(async (req, res) => {
  const dpp = await Dpp.findById(req.params.id).populate('studentClass', 'name');
  if (!dpp) throw new ApiError(404, 'DPP not found');

  res.status(200).json({
    success: true,
    data: { dpp: toDppDetailJson(dpp) },
  });
});

export const createDpp = asyncHandler(async (req, res) => {
  const { title, description, studentClass, subject, practiceDate, questions } = req.body;

  if (!title?.trim()) throw new ApiError(400, 'Title is required');
  await assertActiveClassId(studentClass);
  assertValidQuestions(questions);

  const normalised = normaliseQuestions(questions);

  const dpp = await Dpp.create({
    title: title.trim(),
    description: (description || '').trim(),
    studentClass,
    subject: (subject || '').trim(),
    practiceDate: readPracticeDate(practiceDate),
    durationMinutes: readDuration(req.body.durationMinutes),
    negativeMarkPerWrong: Number(req.body.negativeMarkPerWrong) || 0,
    allowPartialCredit: parseBoolean(req.body.allowPartialCredit, true),
    showAnswersAfterSubmit: parseBoolean(req.body.showAnswersAfterSubmit, true),
    questions: normalised,
    totalMarks: totalMarksFor(normalised),
    isPublished: parseBoolean(req.body.isPublished, false),
    createdBy: req.admin._id,
  });

  await dpp.populate('studentClass', 'name');

  res.status(201).json({
    success: true,
    message: 'DPP created',
    data: { dpp: toDppDetailJson(dpp) },
  });
});

export const updateDpp = asyncHandler(async (req, res) => {
  const dpp = await Dpp.findById(req.params.id);
  if (!dpp) throw new ApiError(404, 'DPP not found');

  if (dpp.isPublished) {
    throw new ApiError(400, 'Published DPPs cannot be edited');
  }

  const { title, description, studentClass, subject, practiceDate, questions } = req.body;

  if (title !== undefined) {
    if (!title.trim()) throw new ApiError(400, 'Title is required');
    dpp.title = title.trim();
  }
  if (description !== undefined) dpp.description = description.trim();
  if (subject !== undefined) dpp.subject = subject.trim();
  if (studentClass !== undefined) {
    await assertActiveClassId(studentClass);
    dpp.studentClass = studentClass;
  }
  if (practiceDate !== undefined) dpp.practiceDate = readPracticeDate(practiceDate);
  if (req.body.durationMinutes !== undefined) {
    dpp.durationMinutes = readDuration(req.body.durationMinutes);
  }
  if (req.body.negativeMarkPerWrong !== undefined) {
    dpp.negativeMarkPerWrong = Number(req.body.negativeMarkPerWrong) || 0;
  }
  if (req.body.allowPartialCredit !== undefined) {
    dpp.allowPartialCredit = parseBoolean(req.body.allowPartialCredit, true);
  }
  if (req.body.showAnswersAfterSubmit !== undefined) {
    dpp.showAnswersAfterSubmit = parseBoolean(req.body.showAnswersAfterSubmit, true);
  }
  if (req.body.isPublished !== undefined) {
    dpp.isPublished = parseBoolean(req.body.isPublished, dpp.isPublished);
  }
  if (questions !== undefined) {
    assertValidQuestions(questions);
    const normalised = normaliseQuestions(questions);
    dpp.questions = normalised;
    dpp.totalMarks = totalMarksFor(normalised);
  }

  await dpp.save();
  await dpp.populate('studentClass', 'name');

  res.status(200).json({
    success: true,
    message: 'DPP updated',
    data: { dpp: toDppDetailJson(dpp) },
  });
});

export const deleteDpp = asyncHandler(async (req, res) => {
  const dpp = await Dpp.findById(req.params.id);
  if (!dpp) throw new ApiError(404, 'DPP not found');

  await DppAttempt.deleteMany({ dpp: dpp._id });
  await dpp.deleteOne();

  res.status(200).json({
    success: true,
    message: 'DPP deleted',
    data: null,
  });
});

export const listDppResults = asyncHandler(async (req, res) => {
  const dpp = await Dpp.findById(req.params.id).populate('studentClass', 'name');
  if (!dpp) throw new ApiError(404, 'DPP not found');

  const attempts = await DppAttempt.find({ dpp: dpp._id, status: 'submitted' })
    .populate('student', 'fullName email rollNumber')
    .sort({ percentage: -1, submittedAt: 1 });

  const submitted = attempts.length;
  const averagePercentage = submitted
    ? Math.round((attempts.reduce((sum, a) => sum + a.percentage, 0) / submitted) * 100) / 100
    : 0;

  res.status(200).json({
    success: true,
    data: {
      dpp: toDppJson(dpp),
      summary: {
        submitted,
        averagePercentage,
        highestPercentage: submitted ? attempts[0].percentage : 0,
      },
      results: attempts.map((attempt) => ({
        id: attempt._id,
        studentId: attempt.student?._id || null,
        studentName: attempt.student?.fullName || 'Deleted student',
        studentEmail: attempt.student?.email || '',
        rollNumber: attempt.student?.rollNumber || '',
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
      })),
    },
  });
});

export const releaseDppResults = asyncHandler(async (req, res) => {
  const dpp = await Dpp.findById(req.params.id).populate('studentClass', 'name');
  if (!dpp) throw new ApiError(404, 'DPP not found');

  const attempts = await DppAttempt.find({
    dpp: dpp._id,
    status: 'submitted',
  }).populate('student', 'fullName email isActive deletedAt');

  const alreadyReleased = Boolean(dpp.resultsReleased);
  if (!alreadyReleased) {
    dpp.resultsReleased = true;
    dpp.resultsReleasedAt = new Date();
    await dpp.save();
  }

  const clientOrigin = env.clientOrigins[0] || '';
  const resultUrl = clientOrigin
    ? `${clientOrigin.replace(/\/$/, '')}/dpps/${dpp._id}/result`
    : '';

  let emailed = 0;
  let skipped = 0;
  let failed = 0;

  for (const attempt of attempts) {
    const student = attempt.student;
    if (!student?.email || student.deletedAt || student.isActive === false) {
      skipped += 1;
      continue;
    }

    try {
      const outcome = await sendAssessmentResultsReleasedEmail({
        to: student.email,
        studentName: student.fullName,
        title: dpp.title,
        resultUrl,
      });
      if (outcome.sent) emailed += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      console.error(`[mailer] Failed to email ${student.email}:`, err?.message || err);
    }
  }

  res.status(200).json({
    success: true,
    message: alreadyReleased
      ? 'Results were already released. Notification emails were sent again.'
      : 'Results released. Students can now view scores on the site.',
    data: {
      dpp: toDppJson(dpp),
      notify: {
        recipients: attempts.length,
        emailed,
        skipped,
        failed,
      },
    },
  });
});
