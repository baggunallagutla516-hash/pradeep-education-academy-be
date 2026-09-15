import { SlipTest } from '../models/SlipTest.js';
import { SlipTestAttempt } from '../models/SlipTestAttempt.js';
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
    rows: (question.rows || []).map((row) => ({ text: row.text })),
    correctOptions: question.correctOptions,
    correctAnswers: question.correctAnswers || [],
    correctMatrix: question.correctMatrix || [],
    marks: question.marks,
    explanation: question.explanation,
  };
}

function toSlipTestJson(doc, extra = {}) {
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
    subject: doc.subject,
    chapter: doc.chapter,
    topic: doc.topic,
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
    .populate('studentClasses', 'name')
    .sort({ createdAt: -1 });

  const counts = await SlipTestAttempt.aggregate([
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
  const slipTest = await SlipTest.findById(req.params.id)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!slipTest) throw new ApiError(404, 'Slip test not found');

  res.status(200).json({
    success: true,
    data: { slipTest: toSlipTestDetailJson(slipTest) },
  });
});

export const createSlipTest = asyncHandler(async (req, res) => {
  const { title, description, subject, chapter, topic, startDate, endDate, questions } = req.body;

  if (!title?.trim()) throw new ApiError(400, 'Title is required');
  if (!chapter?.trim()) throw new ApiError(400, 'Chapter is required');
  const { studentClasses, studentClass } = await resolveContentClasses(req.body);
  assertValidQuestions(questions);

  const normalised = normaliseQuestions(questions);
  const starts = readStartDate(startDate, { label: 'starting date and time' });
  const ends = readEndDate(endDate);
  assertEndDateNotBefore(ends, starts, 'starting date and time');

  const slipTest = await SlipTest.create({
    title: title.trim(),
    description: (description || '').trim(),
    studentClass,
    studentClasses,
    subject: (subject || '').trim(),
    chapter: chapter.trim(),
    topic: (topic || '').trim(),
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

  await slipTest.populate([
    { path: 'studentClass', select: 'name' },
    { path: 'studentClasses', select: 'name' },
  ]);

  res.status(201).json({
    success: true,
    message: 'Slip test created',
    data: { slipTest: toSlipTestDetailJson(slipTest) },
  });
});

export const updateSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id);
  if (!slipTest) throw new ApiError(404, 'Slip test not found');

  const wasPublished = Boolean(slipTest.isPublished);
  const { title, description, subject, chapter, topic, startDate, endDate, questions } = req.body;

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
  if (req.body.studentClasses !== undefined || req.body.studentClass !== undefined) {
    const { studentClasses, studentClass } = await resolveContentClasses(req.body);
    slipTest.studentClasses = studentClasses;
    slipTest.studentClass = studentClass;
  }
  if (startDate !== undefined) {
    slipTest.startDate = readStartDate(startDate, { label: 'starting date and time' });
  }
  if (endDate !== undefined) slipTest.endDate = readEndDate(endDate);
  assertEndDateNotBefore(slipTest.endDate, slipTest.startDate, 'starting date and time');
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

  const willBePublished = Boolean(slipTest.isPublished);
  const unpublishing = wasPublished && !willBePublished;
  const editingPublished = wasPublished;
  const needsWipe = unpublishing || editingPublished;

  if (needsWipe) {
    if (!parseBoolean(req.body.confirmWipeAttempts, false)) {
      throw new ApiError(
        400,
        'Saving or unpublishing a published slip test deletes all attempt data. Confirm to continue.'
      );
    }
    await SlipTestAttempt.deleteMany({ slipTest: slipTest._id });
    slipTest.resultsReleased = false;
    slipTest.resultsReleasedAt = null;
  }

  if (willBePublished && !slipTest.publishedAt) {
    slipTest.publishedAt = new Date();
  }
  if (!willBePublished) {
    slipTest.publishedAt = null;
  }

  await slipTest.save();
  await slipTest.populate([
    { path: 'studentClass', select: 'name' },
    { path: 'studentClasses', select: 'name' },
  ]);

  res.status(200).json({
    success: true,
    message: unpublishing
      ? 'Slip test unpublished. All attempt data was deleted.'
      : editingPublished
        ? 'Slip test updated. Previous attempt data was deleted so corrected answers apply for everyone.'
        : 'Slip test updated',
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
  const slipTest = await SlipTest.findById(req.params.id)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!slipTest) throw new ApiError(404, 'Slip test not found');

  const attempts = await SlipTestAttempt.find({ slipTest: slipTest._id, status: 'submitted' }).sort({
    percentage: -1,
    submittedAt: 1,
  });
  const participants = await loadParticipantsByRole(attempts);

  const submitted = attempts.length;
  const averagePercentage = submitted
    ? Math.round((attempts.reduce((sum, a) => sum + a.percentage, 0) / submitted) * 100) / 100
    : 0;
  const pendingReleaseCount = countPendingReleaseAttempts(slipTest, attempts);

  res.status(200).json({
    success: true,
    data: {
      slipTest: toSlipTestJson(slipTest),
      summary: {
        submitted,
        averagePercentage,
        highestPercentage: submitted ? attempts[0].percentage : 0,
        pendingReleaseCount,
      },
      results: attempts.map((attempt) => ({
        id: attempt._id,
        ...participantResultFields(attempt, participants.get(participantKey(attempt))),
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

export const reattemptSlipTest = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id);
  if (!slipTest) throw new ApiError(404, 'Slip test not found');

  await clearAttemptById({
    model: SlipTestAttempt,
    examField: 'slipTest',
    examId: slipTest._id,
    attemptId: req.params.attemptId,
    label: 'slip test',
    startDate: slipTest.startDate,
    endDate: slipTest.endDate,
  });

  res.status(200).json({
    success: true,
    message: 'Participant can write this slip test again.',
  });
});

export const releaseSlipTestResults = asyncHandler(async (req, res) => {
  const slipTest = await SlipTest.findById(req.params.id)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!slipTest) throw new ApiError(404, 'Slip test not found');

  const attempts = await SlipTestAttempt.find({
    slipTest: slipTest._id,
    status: 'submitted',
  });

  const toNotify = pendingReleaseAttempts(slipTest, attempts);
  if (toNotify.length === 0) {
    throw new ApiError(
      400,
      attempts.length === 0
        ? 'No submitted attempts to announce yet.'
        : 'All submitted results are already announced. The button unlocks when a new attempt is submitted.'
    );
  }

  const wasReleased = Boolean(slipTest.resultsReleased);
  slipTest.resultsReleased = true;
  slipTest.resultsReleasedAt = new Date();
  await slipTest.save();

  const participants = await loadParticipantsByRole(toNotify);
  const clientOrigin = env.clientOrigins[0] || '';

  let emailed = 0;
  let skipped = 0;
  let failed = 0;

  for (const attempt of toNotify) {
    const person = participants.get(participantKey(attempt));
    if (!person?.email || person.deletedAt || person.isActive === false) {
      skipped += 1;
      continue;
    }

    try {
      const outcome = await sendAssessmentResultsReleasedEmail({
        to: person.email,
        studentName: person.fullName,
        title: slipTest.title,
        resultUrl: resultUrlForRole(
          clientOrigin,
          'slip-tests',
          slipTest._id,
          attempt.participantRole
        ),
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
      slipTest: toSlipTestJson(slipTest),
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
