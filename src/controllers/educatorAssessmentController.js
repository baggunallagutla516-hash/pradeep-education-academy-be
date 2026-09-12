import { Assessment, MAX_FULLSCREEN_EXITS } from '../models/Assessment.js';
import { AssessmentAttempt } from '../models/AssessmentAttempt.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  assertDocInAssignedClasses,
  buildAssignedClassFilter,
  classRefFields,
  docClassIds,
  listClassesByIds,
  toPublicClass,
  toPublicClassList,
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

const EDUCATOR_ROLE = 'educator';

function examClassId(doc) {
  const ids = docClassIds(doc);
  return ids[0] || null;
}

function findAttemptQuery(assessmentId, educatorId) {
  return {
    assessment: assessmentId,
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
    section: question.section || 'Section A',
    options: toShuffledOptions(question, orderByQuestion),
    rows:
      question.type === 'matrix'
        ? (question.rows || []).map((row, rowIndex) => ({ index: rowIndex, text: row.text }))
        : [],
  };
}

function assessmentSections(doc) {
  if (Array.isArray(doc.sections) && doc.sections.length > 0) {
    return doc.sections.map((item) => item.name);
  }
  const seen = [];
  (doc.questions || []).forEach((question) => {
    const name = question.section || 'Section A';
    if (!seen.includes(name)) seen.push(name);
  });
  return seen.length > 0 ? seen : ['Section A'];
}

function toAssessmentSummaryJson(doc, attempt) {
  const classes = toPublicClassList(doc);
  const classFields = classRefFields(doc.studentClass || classes[0] || null);
  const submitted = attempt?.status === 'submitted';
  const resultsVisible = areAttemptResultsVisible(doc, attempt);

  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    studentClass: classFields.studentClass || classes[0]?.id || null,
    studentClassName:
      classes.map((item) => item.name).filter(Boolean).join(', ') || classFields.studentClassName,
    studentClasses: classes,
    subject: doc.subject,
    assessmentDate: doc.assessmentDate,
    endDate: doc.endDate || null,
    isClosed: isExamClosed(doc.endDate),
    isNotYetOpen: isExamNotYetOpen(doc.assessmentDate),
    durationMinutes: doc.durationMinutes,
    negativeMarkPerWrong: doc.negativeMarkPerWrong,
    allowPartialCredit: doc.allowPartialCredit,
    maxFullscreenExits: doc.maxFullscreenExits ?? MAX_FULLSCREEN_EXITS,
    sections: assessmentSections(doc),
    questionCount: doc.questions.length,
    totalMarks: doc.totalMarks,
    resultsReleased: resultsVisible,
    resultsReleasedAt: doc.resultsReleasedAt || null,
    attemptStatus: attempt ? attempt.status : 'not_started',
    scoredMarks: submitted && resultsVisible ? attempt.scoredMarks : null,
    percentage: submitted && resultsVisible ? attempt.percentage : null,
    submittedAt: attempt?.submittedAt || null,
  };
}

function remainingSeconds(attempt) {
  return Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000));
}

async function finaliseExpiredAttempt(attempt, assessment) {
  const graded = gradeAttempt({
    questions: assessment.questions,
    answers: [],
    negativeMarkPerWrong: assessment.negativeMarkPerWrong,
    allowPartialCredit: assessment.allowPartialCredit,
  });

  Object.assign(attempt, graded, {
    status: 'submitted',
    submittedAt: attempt.expiresAt,
    autoSubmitted: true,
    submitReason: 'expired',
    timeTakenSeconds: assessment.durationMinutes * 60,
  });

  await attempt.save();
  return attempt;
}

async function loadPublishedAssessment(id, educator) {
  const assessment = await Assessment.findOne({
    _id: id,
    isPublished: true,
  })
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');

  if (!assessment) throw new ApiError(404, 'Assessment not found');
  assertDocInAssignedClasses(assessment, educator, 'Assessment');
  return assessment;
}

async function withOptionOrder(attempt, questions) {
  ensureAttemptOptionOrder(attempt, questions);
  if (attempt.isModified?.('optionOrder')) {
    await attempt.save();
  }
  return attempt;
}

function attemptPayload(attempt, assessment) {
  const maxExits = assessment.maxFullscreenExits ?? MAX_FULLSCREEN_EXITS;
  return {
    id: attempt._id,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    remainingSeconds: remainingSeconds(attempt),
    fullscreenExitCount: attempt.fullscreenExitCount || 0,
    maxFullscreenExits: maxExits,
    exitsRemaining: Math.max(0, maxExits - (attempt.fullscreenExitCount || 0)),
  };
}

function buildResult(assessment, attempt) {
  const tier = resultTier(attempt.percentage);
  const questionById = new Map(
    assessment.questions.map((question) => [String(question._id), question])
  );
  const orderByQuestion = optionOrderMap(attempt);

  const base = {
    assessmentId: assessment._id,
    title: assessment.title,
    subject: assessment.subject,
    assessmentDate: assessment.assessmentDate,
    scoredMarks: attempt.scoredMarks,
    totalMarks: attempt.totalMarks,
    percentage: attempt.percentage,
    correctCount: attempt.correctCount,
    partialCount: attempt.partialCount,
    wrongCount: attempt.wrongCount,
    unansweredCount: attempt.unansweredCount,
    questionCount: assessment.questions.length,
    timeTakenSeconds: attempt.timeTakenSeconds,
    autoSubmitted: attempt.autoSubmitted,
    submitReason: attempt.submitReason,
    fullscreenExitCount: attempt.fullscreenExitCount || 0,
    submittedAt: attempt.submittedAt,
    emoji: tier.emoji,
    tierLabel: tier.label,
    tierMessage: tier.message,
    showAnswers: assessment.showAnswersAfterSubmit,
    resultsReleased: true,
  };

  if (!assessment.showAnswersAfterSubmit) return base;

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
        textAnswer: '',
        correctAnswers: [],
        matrixAnswers: response.matrixAnswers || [],
        correctMatrix: response.correctMatrix || [],
        outcome: response.outcome,
        awardedMarks: response.awardedMarks,
        explanation: question?.explanation || '',
      };
    }),
  };
}

export const listEducatorAssessments = asyncHandler(async (req, res) => {
  const queryClass =
    typeof req.query.studentClass === 'string' ? req.query.studentClass.trim() : '';
  const { filter: classFilter, assignedIds, selectedClass } = await buildAssignedClassFilter(
    req.educator,
    queryClass
  );
  const filter = { isPublished: true, ...classFilter };

  const [assessments, classDocs] = await Promise.all([
    Assessment.find(filter)
      .populate('studentClass', 'name')
      .populate('studentClasses', 'name')
      .sort({ assessmentDate: -1, createdAt: -1 }),
    listClassesByIds(assignedIds),
  ]);

  const attempts = await AssessmentAttempt.find({
    participantRole: EDUCATOR_ROLE,
    participantId: req.educator._id,
    assessment: { $in: assessments.map((doc) => doc._id) },
  });
  const attemptById = new Map(attempts.map((attempt) => [String(attempt.assessment), attempt]));

  res.status(200).json({
    success: true,
    data: {
      studentClass: selectedClass,
      classes: classDocs.map(toPublicClass),
      assessments: assessments.map((doc) =>
        toAssessmentSummaryJson(doc, attemptById.get(String(doc._id)))
      ),
    },
  });
});

export const getEducatorAssessment = asyncHandler(async (req, res) => {
  const assessment = await loadPublishedAssessment(req.params.id, req.educator);
  let attempt = await AssessmentAttempt.findOne(
    findAttemptQuery(assessment._id, req.educator._id)
  );

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, assessment);
  }

  res.status(200).json({
    success: true,
    data: { assessment: toAssessmentSummaryJson(assessment, attempt) },
  });
});

export const startEducatorAssessment = asyncHandler(async (req, res) => {
  const assessment = await loadPublishedAssessment(req.params.id, req.educator);

  if (assessment.questions.length === 0) {
    throw new ApiError(400, 'This assessment has no questions yet');
  }

  let attempt = await AssessmentAttempt.findOne(
    findAttemptQuery(assessment._id, req.educator._id)
  );

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, assessment);
  }

  if (attempt?.status === 'submitted') {
    throw new ApiError(409, 'You have already submitted this assessment');
  }

  if (!attempt) {
    assertExamWindow(assessment.assessmentDate, assessment.endDate, 'assessment');
    const startedAt = new Date();
    try {
      attempt = await AssessmentAttempt.create({
        assessment: assessment._id,
        participantRole: EDUCATOR_ROLE,
        participantId: req.educator._id,
        student: null,
        studentClass: examClassId(assessment),
        startedAt,
        expiresAt: new Date(startedAt.getTime() + assessment.durationMinutes * 60 * 1000),
        totalMarks: assessment.totalMarks,
        optionOrder: buildOptionOrder(assessment.questions),
        fullscreenExitCount: 0,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      attempt = await AssessmentAttempt.findOne(
        findAttemptQuery(assessment._id, req.educator._id)
      );
    }
  }

  attempt = await withOptionOrder(attempt, assessment.questions);
  const orderByQuestion = optionOrderMap(attempt);

  res.status(200).json({
    success: true,
    data: {
      attempt: attemptPayload(attempt, assessment),
      assessment: {
        ...toAssessmentSummaryJson(assessment, attempt),
        questions: assessment.questions.map((question, index) =>
          toAttemptQuestionJson(question, index, orderByQuestion)
        ),
      },
      student: {
        fullName: req.educator.fullName,
      },
    },
  });
});

export const recordEducatorFullscreenExit = asyncHandler(async (req, res) => {
  const assessment = await loadPublishedAssessment(req.params.id, req.educator);
  const attempt = await AssessmentAttempt.findOne(
    findAttemptQuery(assessment._id, req.educator._id)
  );

  if (!attempt) throw new ApiError(400, 'Start the assessment before continuing');
  if (attempt.status === 'submitted') {
    throw new ApiError(409, 'You have already submitted this assessment');
  }

  attempt.fullscreenExitCount = (attempt.fullscreenExitCount || 0) + 1;
  await attempt.save();

  const maxExits = assessment.maxFullscreenExits ?? MAX_FULLSCREEN_EXITS;
  const forceSubmit = attempt.fullscreenExitCount >= maxExits;

  res.status(200).json({
    success: true,
    data: {
      fullscreenExitCount: attempt.fullscreenExitCount,
      maxFullscreenExits: maxExits,
      exitsRemaining: Math.max(0, maxExits - attempt.fullscreenExitCount),
      forceSubmit,
    },
  });
});

export const submitEducatorAssessment = asyncHandler(async (req, res) => {
  const assessment = await loadPublishedAssessment(req.params.id, req.educator);
  const attempt = await AssessmentAttempt.findOne(
    findAttemptQuery(assessment._id, req.educator._id)
  );

  if (!attempt) throw new ApiError(400, 'Start the assessment before submitting');
  if (attempt.status === 'submitted') {
    throw new ApiError(409, 'You have already submitted this assessment');
  }

  const { answers, submitReason } = req.body;
  if (answers !== undefined && !Array.isArray(answers)) {
    throw new ApiError(400, 'Answers must be a list');
  }

  const graded = gradeAttempt({
    questions: assessment.questions,
    answers: answers || [],
    negativeMarkPerWrong: assessment.negativeMarkPerWrong,
    allowPartialCredit: assessment.allowPartialCredit,
  });

  const reason =
    submitReason === 'fullscreen_exits' || submitReason === 'timer' || submitReason === 'manual'
      ? submitReason
      : remainingSeconds(attempt) === 0
        ? 'timer'
        : 'manual';

  const submittedAt = new Date();
  Object.assign(attempt, graded, {
    status: 'submitted',
    submittedAt,
    autoSubmitted: reason !== 'manual',
    submitReason: reason,
    timeTakenSeconds: Math.max(
      0,
      Math.floor((submittedAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000)
    ),
  });

  await attempt.save();

  if (!areAttemptResultsVisible(assessment, attempt)) {
    res.status(200).json({
      success: true,
      message: 'Assessment submitted. Results will appear after the academy releases them.',
      data: {
        resultsHeld: true,
        submittedAt: attempt.submittedAt,
        assessment: {
          id: assessment._id,
          title: assessment.title,
          resultsReleased: false,
        },
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    message: 'Assessment submitted',
    data: { result: buildResult(assessment, attempt), resultsHeld: false },
  });
});

export const getEducatorAssessmentResult = asyncHandler(async (req, res) => {
  const assessment = await loadPublishedAssessment(req.params.id, req.educator);
  let attempt = await AssessmentAttempt.findOne(
    findAttemptQuery(assessment._id, req.educator._id)
  );

  if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
    attempt = await finaliseExpiredAttempt(attempt, assessment);
  }
  if (!attempt || attempt.status !== 'submitted') {
    throw new ApiError(404, 'No submitted attempt for this assessment yet');
  }

  if (!areAttemptResultsVisible(assessment, attempt)) {
    res.status(200).json({
      success: true,
      data: {
        resultsHeld: true,
        submittedAt: attempt.submittedAt,
        assessment: {
          id: assessment._id,
          title: assessment.title,
          subject: assessment.subject,
          assessmentDate: assessment.assessmentDate,
          resultsReleased: false,
        },
      },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: { result: buildResult(assessment, attempt), resultsHeld: false },
  });
});
