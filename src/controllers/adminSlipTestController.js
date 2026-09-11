import { SlipTest } from '../models/SlipTest.js';
import { SlipTestAttempt } from '../models/SlipTestAttempt.js';
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

function toSlipTestJson(doc, extra = {}) {
  const classFields = classRefFields(doc.studentClass);
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    studentClass: classFields.studentClass,
    studentClassName: classFields.studentClassName,
    subject: doc.subject,
    chapter: doc.chapter,
    topic: doc.topic,
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

function toSlipTestDetailJson(doc) {
  return toSlipTestJson(doc, { questions: doc.questions.map(toQuestionJson) });
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

function readDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 1 || duration > 300) {
    throw new ApiError(400, 'Duration must be between 1 and 300 minutes');
  }
  return duration;
}

export const listSlipTests = asyncHandler(async (req, res) => {
  const slipTests = await SlipTest.find()
    .populate('studentClass', 'name')
    .sort({ createdAt: -1 });

  const counts = await SlipTestAttempt.aggregate([
    { $match: { status: 'submitted' } },
    { $group: { _id: '$slipTest', count: { $sum: 1 } } },
  ]);
  const countByTest = new Map(counts.map((row) => [String(row._id), row.count]));

  res.status(200).json({
    success: true,
    data: {
      slipTests: slipTests.map((doc) =>
        toSlipTestJson(doc, { attemptCount: countByTest.get(String(doc._id)) || 0 })
      ),
    },
  });
});

export const getSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id).populate('studentClass', 'name');
  if (!slipTest) throw new ApiError(404, 'Slip test not found');

  res.status(200).json({
    success: true,
    data: { slipTest: toSlipTestDetailJson(slipTest) },
  });
});

export const createSlipTest = asyncHandler(async (req, res) => {
  const { title, description, studentClass, subject, chapter, topic, questions } = req.body;

  if (!title?.trim()) throw new ApiError(400, 'Title is required');
  if (!chapter?.trim()) throw new ApiError(400, 'Chapter is required');
  await assertActiveClassId(studentClass);
  assertValidQuestions(questions);

  const normalised = normaliseQuestions(questions);

  const slipTest = await SlipTest.create({
    title: title.trim(),
    description: (description || '').trim(),
    studentClass,
    subject: (subject || '').trim(),
    chapter: chapter.trim(),
    topic: (topic || '').trim(),
    durationMinutes: readDuration(req.body.durationMinutes),
    negativeMarkPerWrong: Number(req.body.negativeMarkPerWrong) || 0,
    allowPartialCredit: parseBoolean(req.body.allowPartialCredit, true),
    showAnswersAfterSubmit: parseBoolean(req.body.showAnswersAfterSubmit, true),
    questions: normalised,
    totalMarks: totalMarksFor(normalised),
    isPublished: parseBoolean(req.body.isPublished, false),
    createdBy: req.admin._id,
  });

  await slipTest.populate('studentClass', 'name');

  res.status(201).json({
    success: true,
    message: 'Slip test created',
    data: { slipTest: toSlipTestDetailJson(slipTest) },
  });
});

export const updateSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id);
  if (!slipTest) throw new ApiError(404, 'Slip test not found');

  if (slipTest.isPublished) {
    throw new ApiError(400, 'Published slip tests cannot be edited');
  }

  const { title, description, studentClass, subject, chapter, topic, questions } = req.body;

  if (title !== undefined) {
    if (!title.trim()) throw new ApiError(400, 'Title is required');
    slipTest.title = title.trim();
  }
  if (description !== undefined) slipTest.description = description.trim();
  if (subject !== undefined) slipTest.subject = subject.trim();
  if (chapter !== undefined) {
    if (!chapter.trim()) throw new ApiError(400, 'Chapter is required');
    slipTest.chapter = chapter.trim();
  }
  if (topic !== undefined) slipTest.topic = topic.trim();
  if (studentClass !== undefined) {
    await assertActiveClassId(studentClass);
    slipTest.studentClass = studentClass;
  }
  if (req.body.durationMinutes !== undefined) {
    slipTest.durationMinutes = readDuration(req.body.durationMinutes);
  }
  if (req.body.negativeMarkPerWrong !== undefined) {
    slipTest.negativeMarkPerWrong = Number(req.body.negativeMarkPerWrong) || 0;
  }
  if (req.body.allowPartialCredit !== undefined) {
    slipTest.allowPartialCredit = parseBoolean(req.body.allowPartialCredit, true);
  }
  if (req.body.showAnswersAfterSubmit !== undefined) {
    slipTest.showAnswersAfterSubmit = parseBoolean(req.body.showAnswersAfterSubmit, true);
  }
  if (req.body.isPublished !== undefined) {
    slipTest.isPublished = parseBoolean(req.body.isPublished, slipTest.isPublished);
  }
  if (questions !== undefined) {
    assertValidQuestions(questions);
    const normalised = normaliseQuestions(questions);
    slipTest.questions = normalised;
    slipTest.totalMarks = totalMarksFor(normalised);
  }

  await slipTest.save();
  await slipTest.populate('studentClass', 'name');

  res.status(200).json({
    success: true,
    message: 'Slip test updated',
    data: { slipTest: toSlipTestDetailJson(slipTest) },
  });
});

export const deleteSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id);
  if (!slipTest) throw new ApiError(404, 'Slip test not found');

  await SlipTestAttempt.deleteMany({ slipTest: slipTest._id });
  await slipTest.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Slip test deleted',
    data: null,
  });
});

export const listSlipTestResults = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id).populate('studentClass', 'name');
  if (!slipTest) throw new ApiError(404, 'Slip test not found');

  const attempts = await SlipTestAttempt.find({ slipTest: slipTest._id, status: 'submitted' })
    .populate('student', 'fullName email rollNumber')
    .sort({ percentage: -1, submittedAt: 1 });

  const submitted = attempts.length;
  const averagePercentage = submitted
    ? Math.round((attempts.reduce((sum, a) => sum + a.percentage, 0) / submitted) * 100) / 100
    : 0;

  res.status(200).json({
    success: true,
    data: {
      slipTest: toSlipTestJson(slipTest),
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

export const releaseSlipTestResults = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id).populate('studentClass', 'name');
  if (!slipTest) throw new ApiError(404, 'Slip test not found');

  const attempts = await SlipTestAttempt.find({
    slipTest: slipTest._id,
    status: 'submitted',
  }).populate('student', 'fullName email isActive deletedAt');

  const alreadyReleased = Boolean(slipTest.resultsReleased);
  if (!alreadyReleased) {
    slipTest.resultsReleased = true;
    slipTest.resultsReleasedAt = new Date();
    await slipTest.save();
  }

  const clientOrigin = env.clientOrigins[0] || '';
  const resultUrl = clientOrigin
    ? `${clientOrigin.replace(/\/$/, '')}/slip-tests/${slipTest._id}/result`
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
        title: slipTest.title,
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
      slipTest: toSlipTestJson(slipTest),
      notify: {
        recipients: attempts.length,
        emailed,
        skipped,
        failed,
      },
    },
  });
});
