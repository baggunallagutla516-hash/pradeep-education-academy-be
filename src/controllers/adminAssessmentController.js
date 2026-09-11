import { Assessment } from '../models/Assessment.js';
import { AssessmentAttempt } from '../models/AssessmentAttempt.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { assertActiveClassId, classRefFields } from '../utils/schoolClass.js';
import { normaliseQuestions, totalMarksFor, validateQuestions } from '../utils/quizGrading.js';
import { ASSESSMENT_QUESTION_TYPES } from '../models/Assessment.js';
import { env } from '../config/env.js';
import { sendAssessmentResultsReleasedEmail } from '../utils/mailer.js';

function toQuestionJson(question) {
  return {
    id: question._id,
    text: question.text,
    type: question.type,
    options: question.options.map((option) => ({ text: option.text })),
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
  const classFields = classRefFields(doc.studentClass);
  const sections =
    Array.isArray(doc.sections) && doc.sections.length > 0
      ? doc.sections.map((item) => item.name)
      : [...new Set((doc.questions || []).map((question) => question.section || 'Section A'))];

  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    studentClass: classFields.studentClass,
    studentClassName: classFields.studentClassName,
    subject: doc.subject,
    assessmentDate: doc.assessmentDate,
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
    .sort({ assessmentDate: -1, createdAt: -1 });

  const counts = await AssessmentAttempt.aggregate([
    { $match: { status: 'submitted' } },
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
  const assessment = await Assessment.findById(req.params.id).populate('studentClass', 'name');
  if (!assessment) throw new ApiError(404, 'Assessment not found');

  res.status(200).json({
    success: true,
    data: { assessment: toAssessmentDetailJson(assessment) },
  });
});

export const createAssessment = asyncHandler(async (req, res) => {
  const { title, description, studentClass, subject, assessmentDate, questions, sections } =
    req.body;

  if (!title?.trim()) throw new ApiError(400, 'Title is required');
  await assertActiveClassId(studentClass);
  assertAssessmentQuestions(questions);

  const normalisedSections = normaliseSections(sections, questions);
  const normalised = normaliseAssessmentQuestions(questions, normalisedSections);

  const assessment = await Assessment.create({
    title: title.trim(),
    description: (description || '').trim(),
    studentClass,
    subject: (subject || '').trim(),
    assessmentDate: readAssessmentDate(assessmentDate),
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

  await assessment.populate('studentClass', 'name');

  res.status(201).json({
    success: true,
    message: 'Assessment created',
    data: { assessment: toAssessmentDetailJson(assessment) },
  });
});

export const updateAssessment = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id);
  if (!assessment) throw new ApiError(404, 'Assessment not found');

  if (assessment.isPublished) {
    throw new ApiError(400, 'Published assessments cannot be edited');
  }

  const { title, description, studentClass, subject, assessmentDate, questions, sections } =
    req.body;

  if (title !== undefined) {
    if (!title.trim()) throw new ApiError(400, 'Title is required');
    assessment.title = title.trim();
  }
  if (description !== undefined) assessment.description = description.trim();
  if (subject !== undefined) assessment.subject = subject.trim();
  if (studentClass !== undefined) {
    await assertActiveClassId(studentClass);
    assessment.studentClass = studentClass;
  }
  if (assessmentDate !== undefined) {
    assessment.assessmentDate = readAssessmentDate(assessmentDate);
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

  await assessment.save();
  await assessment.populate('studentClass', 'name');

  res.status(200).json({
    success: true,
    message: 'Assessment updated',
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
  const assessment = await Assessment.findById(req.params.id).populate('studentClass', 'name');
  if (!assessment) throw new ApiError(404, 'Assessment not found');

  const attempts = await AssessmentAttempt.find({
    assessment: assessment._id,
    status: 'submitted',
  })
    .populate('student', 'fullName email rollNumber')
    .sort({ percentage: -1, submittedAt: 1 });

  const submitted = attempts.length;
  const averagePercentage = submitted
    ? Math.round((attempts.reduce((sum, a) => sum + a.percentage, 0) / submitted) * 100) / 100
    : 0;

  res.status(200).json({
    success: true,
    data: {
      assessment: toAssessmentJson(assessment),
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
        submitReason: attempt.submitReason,
        fullscreenExitCount: attempt.fullscreenExitCount,
        submittedAt: attempt.submittedAt,
      })),
    },
  });
});

export const releaseAssessmentResults = asyncHandler(async (req, res) => {
  const assessment = await Assessment.findById(req.params.id).populate('studentClass', 'name');
  if (!assessment) throw new ApiError(404, 'Assessment not found');

  const attempts = await AssessmentAttempt.find({
    assessment: assessment._id,
    status: 'submitted',
  }).populate('student', 'fullName email isActive deletedAt');

  const alreadyReleased = Boolean(assessment.resultsReleased);
  if (!alreadyReleased) {
    assessment.resultsReleased = true;
    assessment.resultsReleasedAt = new Date();
    await assessment.save();
  }

  const clientOrigin = env.clientOrigins[0] || '';
  const resultUrl = clientOrigin
    ? `${clientOrigin.replace(/\/$/, '')}/assessments/${assessment._id}/result`
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
        assessmentTitle: assessment.title,
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
      assessment: toAssessmentJson(assessment),
      notify: {
        recipients: attempts.length,
        emailed,
        skipped,
        failed,
      },
    },
  });
});
