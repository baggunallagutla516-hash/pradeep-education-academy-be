import { Assessment } from '../models/Assessment.js';
import { AssessmentAttempt } from '../models/AssessmentAttempt.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { contentClassJsonFields, resolveContentClasses } from '../utils/schoolClass.js';
import { normaliseQuestions, totalMarksFor, validateQuestions } from '../utils/quizGrading.js';
import { ASSESSMENT_QUESTION_TYPES } from '../models/Assessment.js';
import { env } from '../config/env.js';
import { sendAssessmentResultsReleasedEmail } from '../utils/mailer.js';
import { assertEndDateNotBefore, readEndDate } from '../utils/examWindow.js';
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
    correctMatrix: question.correctMatrix || [],
    section: question.section || 'Section A',
    marks: question.marks,
    explanation: question.explanation,
  };
}

function normaliseSections(sections, questions) {
  const fromPayload = (Array.isArray(sections) ? sections : [])
    .map((item) => String(item?.name ?? item ?? '').trim())
    .filter(Boolean)
    .slice(0, 30);

  const fromQuestions = (questions || [])
    .map((question) => String(question?.section || '').trim())
    .filter(Boolean);

  const ordered = [];
  [...fromPayload, ...fromQuestions].forEach((name) => {
    if (!ordered.some((item) => item.toLowerCase() === name.toLowerCase())) {
      ordered.push(name.slice(0, 80));
    }
  });

  if (ordered.length === 0) ordered.push('Section A');
  return ordered.map((name) => ({ name }));
}

function normaliseAssessmentQuestions(questions, sections) {
  const sectionNames = sections.map((item) => item.name);
  const fallback = sectionNames[0] || 'Section A';

  return normaliseQuestions(questions).map((question, index) => {
    const raw = String(questions[index]?.section || '').trim().slice(0, 80);
    const matched = sectionNames.find((name) => name.toLowerCase() === raw.toLowerCase());
    return {
      ...question,
      correctAnswers: [],
      section: matched || fallback,
    };
  });
}

function toAssessmentJson(doc, extra = {}) {
  const sections =
    Array.isArray(doc.sections) && doc.sections.length > 0
      ? doc.sections.map((item) => item.name)
      : [...new Set((doc.questions || []).map((question) => question.section || 'Section A'))];

  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc),
    subject: doc.subject,
    assessmentDate: doc.assessmentDate,
    endDate: doc.endDate || null,
    durationMinutes: doc.durationMinutes,
    negativeMarkPerWrong: doc.negativeMarkPerWrong,
    allowPartialCredit: doc.allowPartialCredit,
    showAnswersAfterSubmit: doc.showAnswersAfterSubmit,
    resultsReleased: Boolean(doc.resultsReleased),
    resultsReleasedAt: doc.resultsReleasedAt || null,
    maxFullscreenExits: doc.maxFullscreenExits,
    sections,
    questionCount: doc.questions.length,
    totalMarks: doc.totalMarks,
    isPublished: doc.isPublished,
    publishedAt: doc.publishedAt,
    createdAt: doc.createdAt,
    ...extra,
  };
}

function toAssessmentDetailJson(doc) {
  return toAssessmentJson(doc, { questions: doc.questions.map(toQuestionJson) });
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true';
}

function assertAssessmentQuestions(questions) {
  const errors = validateQuestions(questions);
  (questions || []).forEach((question, index) => {
    if (!ASSESSMENT_QUESTION_TYPES.includes(question?.type)) {
      errors.push(`Question ${index + 1}: type must be single, multiple, or matrix.`);
    }
  });
  if (errors.length > 0) {
    throw new ApiError(400, 'Please fix the questions before saving', errors);
  }
}

function readAssessmentDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'A valid assessment date is required');
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

export const listAssessments = asyncHandler(async (_req, res) => {
  const assessments = await Assessment.find()
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name')
    .sort({ assessmentDate: -1, createdAt: -1 });

  const counts = await AssessmentAttempt.aggregate([
    { $group: { _id: '$assessment', count: { $sum: 1 } } },
  ]);
  const countById = new Map(counts.map((row) => [String(row._id), row.count]));

  res.status(200).json({
    success: true,
    data: {
      assessments: assessments.map((doc) =>
        toAssessmentJson(doc, { attemptCount: countById.get(String(doc._id)) || 0 })
      ),
    },
  });
});

export const getAssessment = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!assessment) throw new ApiError(404, 'Assessment not found');

  res.status(200).json({
    success: true,
    data: { assessment: toAssessmentDetailJson(assessment) },
  });
});

export const createAssessment = asyncHandler(async (req, res) => {
  const { title, description, subject, assessmentDate, endDate, questions, sections } = req.body;

  if (!title?.trim()) throw new ApiError(400, 'Title is required');
  const { studentClasses, studentClass } = await resolveContentClasses(req.body);
  assertAssessmentQuestions(questions);

  const normalisedSections = normaliseSections(sections, questions);
  const normalised = normaliseAssessmentQuestions(questions, normalisedSections);
  const heldOn = readAssessmentDate(assessmentDate);
  const ends = readEndDate(endDate);
  assertEndDateNotBefore(ends, heldOn, 'starting date and time');

  const assessment = await Assessment.create({
    title: title.trim(),
    description: (description || '').trim(),
    studentClass,
    studentClasses,
    subject: (subject || '').trim(),
    assessmentDate: heldOn,
    endDate: ends,
    durationMinutes: readDuration(req.body.durationMinutes),
    negativeMarkPerWrong: Number(req.body.negativeMarkPerWrong) || 0,
    allowPartialCredit: parseBoolean(req.body.allowPartialCredit, true),
    showAnswersAfterSubmit: parseBoolean(req.body.showAnswersAfterSubmit, true),
    sections: normalisedSections,
    questions: normalised,
    totalMarks: totalMarksFor(normalised),
    isPublished: parseBoolean(req.body.isPublished, false),
    createdBy: req.admin._id,
  });

  await assessment.populate([
    { path: 'studentClass', select: 'name' },
    { path: 'studentClasses', select: 'name' },
  ]);

  res.status(201).json({
    success: true,
    message: 'Assessment created',
    data: { assessment: toAssessmentDetailJson(assessment) },
  });
});

export const updateAssessment = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw new ApiError(404, 'Assessment not found');

  const wasPublished = Boolean(assessment.isPublished);
  const { title, description, subject, assessmentDate, endDate, questions, sections } = req.body;

  if (title !== undefined) {
    if (!title.trim()) throw new ApiError(400, 'Title is required');
    assessment.title = title.trim();
  }
  if (description !== undefined) assessment.description = description.trim();
  if (subject !== undefined) assessment.subject = subject.trim();
  if (req.body.studentClasses !== undefined || req.body.studentClass !== undefined) {
    const { studentClasses, studentClass } = await resolveContentClasses(req.body);
    assessment.studentClasses = studentClasses;
    assessment.studentClass = studentClass;
  }
  if (assessmentDate !== undefined) {
    assessment.assessmentDate = readAssessmentDate(assessmentDate);
  }
  if (endDate !== undefined) {
    assessment.endDate = readEndDate(endDate);
  }
  if (assessment.endDate) {
    assertEndDateNotBefore(assessment.endDate, assessment.assessmentDate, 'starting date and time');
  }
  if (req.body.durationMinutes !== undefined) {
    assessment.durationMinutes = readDuration(req.body.durationMinutes);
  }
  if (req.body.negativeMarkPerWrong !== undefined) {
    assessment.negativeMarkPerWrong = Number(req.body.negativeMarkPerWrong) || 0;
  }
  if (req.body.allowPartialCredit !== undefined) {
    assessment.allowPartialCredit = parseBoolean(req.body.allowPartialCredit, true);
  }
  if (req.body.showAnswersAfterSubmit !== undefined) {
    assessment.showAnswersAfterSubmit = parseBoolean(req.body.showAnswersAfterSubmit, true);
  }
  if (req.body.isPublished !== undefined) {
    assessment.isPublished = parseBoolean(req.body.isPublished, assessment.isPublished);
  }
  if (questions !== undefined) {
    assertAssessmentQuestions(questions);
    const normalisedSections = normaliseSections(
      sections !== undefined ? sections : assessment.sections,
      questions
    );
    const normalised = normaliseAssessmentQuestions(questions, normalisedSections);
    assessment.sections = normalisedSections;
    assessment.questions = normalised;
    assessment.totalMarks = totalMarksFor(normalised);
  } else if (sections !== undefined) {
    const normalisedSections = normaliseSections(sections, assessment.questions);
    assessment.sections = normalisedSections;
    const fallback = normalisedSections[0]?.name || 'Section A';
    assessment.questions = assessment.questions.map((question) => {
      const matched = normalisedSections.find(
        (item) => item.name.toLowerCase() === String(question.section || '').toLowerCase()
      );
      question.section = matched?.name || fallback;
      return question;
    });
  }

  const willBePublished = Boolean(assessment.isPublished);
  const unpublishing = wasPublished && !willBePublished;
  const editingPublished = wasPublished;
  const needsWipe = unpublishing || editingPublished;

  if (needsWipe) {
    if (!parseBoolean(req.body.confirmWipeAttempts, false)) {
      throw new ApiError(
        400,
        'Saving or unpublishing a published assessment deletes all attempt data. Confirm to continue.'
      );
    }
    await AssessmentAttempt.deleteMany({ assessment: assessment._id });
    assessment.resultsReleased = false;
    assessment.resultsReleasedAt = null;
  }

  if (willBePublished && !assessment.publishedAt) {
    assessment.publishedAt = new Date();
  }
  if (!willBePublished) {
    assessment.publishedAt = null;
  }

  await assessment.save();
  await assessment.populate([
    { path: 'studentClass', select: 'name' },
    { path: 'studentClasses', select: 'name' },
  ]);

  res.status(200).json({
    success: true,
    message: unpublishing
      ? 'Assessment unpublished. All attempt data was deleted.'
      : editingPublished
        ? 'Assessment updated. Previous attempt data was deleted so corrected answers apply for everyone.'
        : 'Assessment updated',
    data: { assessment: toAssessmentDetailJson(assessment) },
  });
});

export const deleteAssessment = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw new ApiError(404, 'Assessment not found');

  await AssessmentAttempt.deleteMany({ assessment: assessment._id });
  await assessment.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Assessment deleted',
    data: null,
  });
});

export const listAssessmentResults = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!assessment) throw new ApiError(404, 'Assessment not found');

  const attempts = await AssessmentAttempt.find({
    assessment: assessment._id,
    status: 'submitted',
  }).sort({ percentage: -1, submittedAt: 1 });
  const participants = await loadParticipantsByRole(attempts);

  const submitted = attempts.length;
  const averagePercentage = submitted
    ? Math.round((attempts.reduce((sum, a) => sum + a.percentage, 0) / submitted) * 100) / 100
    : 0;
  const pendingReleaseCount = countPendingReleaseAttempts(assessment, attempts);

  res.status(200).json({
    success: true,
    data: {
      assessment: toAssessmentJson(assessment),
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
        submitReason: attempt.submitReason,
        fullscreenExitCount: attempt.fullscreenExitCount,
        submittedAt: attempt.submittedAt,
      })),
    },
  });
});

export const reattemptAssessment = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw new ApiError(404, 'Assessment not found');

  await clearAttemptById({
    model: AssessmentAttempt,
    examField: 'assessment',
    examId: assessment._id,
    attemptId: req.params.attemptId,
    label: 'assessment',
    startDate: assessment.assessmentDate,
    endDate: assessment.endDate,
  });

  res.status(200).json({
    success: true,
    message: 'Participant can write this assessment again.',
  });
});

export const releaseAssessmentResults = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!assessment) throw new ApiError(404, 'Assessment not found');

  const attempts = await AssessmentAttempt.find({
    assessment: assessment._id,
    status: 'submitted',
  });

  const toNotify = pendingReleaseAttempts(assessment, attempts);
  if (toNotify.length === 0) {
    throw new ApiError(
      400,
      attempts.length === 0
        ? 'No submitted attempts to announce yet.'
        : 'All submitted results are already announced. The button unlocks when a new attempt is submitted.'
    );
  }

  const wasReleased = Boolean(assessment.resultsReleased);
  assessment.resultsReleased = true;
  assessment.resultsReleasedAt = new Date();
  await assessment.save();

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
        assessmentTitle: assessment.title,
        resultUrl: resultUrlForRole(
          clientOrigin,
          'assessments',
          assessment._id,
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
      assessment: toAssessmentJson(assessment),
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
