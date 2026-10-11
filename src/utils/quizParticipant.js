import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { latestClassroomStatuses } from '../models/ClassroomSession.js';
import { ApiError } from './ApiError.js';
import { gradeAttempt, resultTier } from './quizGrading.js';
import {
  buildOptionOrder,
  ensureAttemptOptionOrder,
  optionOrderMap,
  toShuffledOptions,
} from './optionOrder.js';
import { assertExamWindow, isExamClosed, isExamNotYetOpen } from './examWindow.js';
import { areAttemptResultsVisible } from './resultsRelease.js';
import { participantIdentity } from './examParticipant.js';
import {
  assertDocInAssignedClasses,
  buildAssignedClassFilter,
  classVisibilityForStudent,
  contentClassJsonFields,
} from './schoolClass.js';

function toAttemptQuestionJson(question, index, orderByQuestion) {
  return {
    id: question._id,
    number: index + 1,
    text: question.text,
    imageUrl: question.imageUrl || '',
    type: question.type,
    marks: question.marks,
    options: toShuffledOptions(question, orderByQuestion),
    rows: [],
  };
}

function toQuizSummaryJson(doc, attempt, viewerClassId = null, extra = {}) {
  const submitted = attempt?.status === 'submitted';
  const resultsVisible = areAttemptResultsVisible(doc, attempt);
  return {
    id: doc._id,
    title: doc.title,
    description: doc.description,
    ...contentClassJsonFields(doc, { viewerClassId }),
    subject: doc.subject,
    playMode: doc.playMode || 'individual',
    accessMode: (doc.playMode || 'individual') === 'classroom' ? 'both' : doc.accessMode || 'both',
    endDate: doc.endDate || null,
    isClosed: isExamClosed(doc.endDate),
    isNotYetOpen: isExamNotYetOpen(doc.startDate),
    startDate: doc.startDate || null,
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
    ...extra,
  };
}

function remainingSeconds(attempt) {
  return Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000));
}

async function finaliseExpiredAttempt(attempt, quiz) {
  const graded = gradeAttempt({
    questions: quiz.questions,
    answers: [],
    negativeMarkPerWrong: quiz.negativeMarkPerWrong,
    allowPartialCredit: quiz.allowPartialCredit,
  });

  Object.assign(attempt, graded, {
    status: 'submitted',
    submittedAt: attempt.expiresAt,
    autoSubmitted: true,
    timeTakenSeconds: quiz.durationMinutes * 60,
  });

  await attempt.save();
  return attempt;
}

function assigneeFromOptions(role, options = {}) {
  if (role === 'educator') return options.educator;
  if (role === 'parent') return options.parent;
  return null;
}

async function resolveQuizListFilter(role, options = {}) {
  if (role === 'student') {
    return {
      isPublished: true,
      ...classVisibilityForStudent(options.classId),
    };
  }

  if (role === 'educator' || role === 'parent') {
    const { filter: classFilter } = await buildAssignedClassFilter(
      assigneeFromOptions(role, options) || {},
      ''
    );
    return { isPublished: true, ...classFilter };
  }

  return { isPublished: true, studentClass: { $in: [] } };
}

async function loadPublishedQuiz(quizId, role, options = {}) {
  const query = { _id: quizId, isPublished: true };

  if (role === 'student') {
    Object.assign(query, classVisibilityForStudent(options.classId));
  }

  const quiz = await Quiz.findOne(query)
    .populate('studentClass', 'name')
    .populate('studentClasses', 'name');
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  if (role === 'educator' || role === 'parent') {
    assertDocInAssignedClasses(quiz, assigneeFromOptions(role, options) || {}, 'Quiz');
  }

  return quiz;
}

async function withOptionOrder(attempt, questions) {
  ensureAttemptOptionOrder(attempt, questions);
  if (attempt.isModified?.('optionOrder')) {
    await attempt.save();
  }
  return attempt;
}

function findAttemptQuery(quizId, role, participantId) {
  return {
    quiz: quizId,
    participantRole: role,
    participantId,
  };
}

function buildResult(quiz, attempt) {
  const tier = resultTier(attempt.percentage);
  const questionById = new Map(quiz.questions.map((question) => [String(question._id), question]));
  const orderByQuestion = optionOrderMap(attempt);

  const base = {
    quizId: quiz._id,
    title: quiz.title,
    subject: quiz.subject,
    scoredMarks: attempt.scoredMarks,
    totalMarks: attempt.totalMarks,
    percentage: attempt.percentage,
    correctCount: attempt.correctCount,
    partialCount: attempt.partialCount,
    wrongCount: attempt.wrongCount,
    unansweredCount: attempt.unansweredCount,
    questionCount: quiz.questions.length,
    timeTakenSeconds: attempt.timeTakenSeconds,
    autoSubmitted: attempt.autoSubmitted,
    submittedAt: attempt.submittedAt,
    emoji: tier.emoji,
    tierLabel: tier.label,
    tierMessage: tier.message,
    showAnswers: quiz.showAnswersAfterSubmit,
  };

  if (!quiz.showAnswersAfterSubmit) return base;

  return {
    ...base,
    review: attempt.responses.map((response, index) => {
      const question = questionById.get(String(response.question));
      return {
        number: index + 1,
        text: question?.text || '',
        imageUrl: question?.imageUrl || '',
        type: question?.type || 'single',
        marks: question?.marks || 0,
        options: toShuffledOptions(question, orderByQuestion),
        rows: [],
        selectedOptions: response.selectedOptions,
        correctOptions: response.correctOptions,
        textAnswer: '',
        correctAnswers: [],
        matrixAnswers: [],
        correctMatrix: [],
        outcome: response.outcome,
        awardedMarks: response.awardedMarks,
        explanation: question?.explanation || '',
      };
    }),
  };
}

/** Shared quiz attempt handlers for student / educator / parent. */
export function createQuizParticipantHandlers(role) {
  return {
    list: async (participantId, options = {}) => {
      const quizzes = await Quiz.find(await resolveQuizListFilter(role, options))
        .populate('studentClass', 'name')
        .populate('studentClasses', 'name')
        .sort({ createdAt: -1 });

      const attempts = await QuizAttempt.find({
        participantRole: role,
        participantId,
        quiz: { $in: quizzes.map((doc) => doc._id) },
      });
      const attemptByQuiz = new Map(attempts.map((attempt) => [String(attempt.quiz), attempt]));
      const visible = quizzes.filter((doc) => {
        if ((doc.playMode || 'individual') === 'classroom') return true;
        if ((doc.accessMode || 'both') !== 'code') return true;
        return attemptByQuiz.has(String(doc._id));
      });
      const classroomStatus = await latestClassroomStatuses(visible.map((doc) => doc._id));

      return {
        quizzes: visible.map((doc) =>
          toQuizSummaryJson(
            doc,
            attemptByQuiz.get(String(doc._id)),
            role === 'student' ? options.classId : null,
            { classroomStatus: classroomStatus.get(String(doc._id)) || null }
          )
        ),
      };
    },

    get: async (quizId, participantId, options = {}) => {
      const quiz = await loadPublishedQuiz(quizId, role, options);
      let attempt = await QuizAttempt.findOne(findAttemptQuery(quiz._id, role, participantId));

      if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
        attempt = await finaliseExpiredAttempt(attempt, quiz);
      }

      return {
        quiz: toQuizSummaryJson(quiz, attempt, role === 'student' ? options.classId : null),
      };
    },

    start: async (quizId, participantId, options = {}) => {
      const quiz = await loadPublishedQuiz(quizId, role, options);

      if ((quiz.playMode || 'individual') === 'classroom') {
        throw new ApiError(
          400,
          'This quiz is played in the classroom. Join your group on the classroom board.'
        );
      }

      if (quiz.questions.length === 0) {
        throw new ApiError(400, 'This quiz has no questions yet');
      }

      let attempt = await QuizAttempt.findOne(findAttemptQuery(quiz._id, role, participantId));

      if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
        attempt = await finaliseExpiredAttempt(attempt, quiz);
      }

      if (attempt?.status === 'submitted') {
        throw new ApiError(409, 'You have already submitted this quiz');
      }

      if (!attempt) {
        assertExamWindow(quiz.startDate, quiz.endDate, 'quiz');
        const startedAt = new Date();
        try {
          attempt = await QuizAttempt.create({
            quiz: quiz._id,
            ...participantIdentity(role, participantId),
            startedAt,
            expiresAt: new Date(startedAt.getTime() + quiz.durationMinutes * 60 * 1000),
            totalMarks: quiz.totalMarks,
            optionOrder: buildOptionOrder(quiz.questions),
          });
        } catch (err) {
          if (err?.code !== 11000) throw err;
          attempt = await QuizAttempt.findOne(findAttemptQuery(quiz._id, role, participantId));
        }
      }

      attempt = await withOptionOrder(attempt, quiz.questions);
      const orderByQuestion = optionOrderMap(attempt);

      return {
        attempt: {
          id: attempt._id,
          startedAt: attempt.startedAt,
          expiresAt: attempt.expiresAt,
          remainingSeconds: remainingSeconds(attempt),
        },
        quiz: {
          ...toQuizSummaryJson(quiz, attempt, role === 'student' ? options.classId : null),
          questions: quiz.questions.map((question, index) =>
            toAttemptQuestionJson(question, index, orderByQuestion)
          ),
        },
      };
    },

    submit: async (quizId, participantId, body = {}, options = {}) => {
      const quiz = await loadPublishedQuiz(quizId, role, options);
      const attempt = await QuizAttempt.findOne(findAttemptQuery(quiz._id, role, participantId));

      if (!attempt) throw new ApiError(400, 'Start the quiz before submitting');
      if (attempt.status === 'submitted') {
        throw new ApiError(409, 'You have already submitted this quiz');
      }

      const { answers } = body;
      if (answers !== undefined && !Array.isArray(answers)) {
        throw new ApiError(400, 'Answers must be a list');
      }

      const graded = gradeAttempt({
        questions: quiz.questions,
        answers: answers || [],
        negativeMarkPerWrong: quiz.negativeMarkPerWrong,
        allowPartialCredit: quiz.allowPartialCredit,
      });

      const submittedAt = new Date();
      Object.assign(attempt, graded, {
        status: 'submitted',
        submittedAt,
        autoSubmitted: Boolean(body.autoSubmitted) || remainingSeconds(attempt) === 0,
        timeTakenSeconds: Math.max(
          0,
          Math.floor((submittedAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000)
        ),
      });

      await attempt.save();

      if (!areAttemptResultsVisible(quiz, attempt)) {
        return {
          resultsHeld: true,
          submittedAt: attempt.submittedAt,
          quiz: {
            id: quiz._id,
            title: quiz.title,
            subject: quiz.subject,
            resultsReleased: false,
          },
          message: 'Quiz submitted. Results will be available after the academy releases them.',
        };
      }

      return {
        resultsHeld: false,
        result: buildResult(quiz, attempt),
        message: 'Quiz submitted',
      };
    },

    result: async (quizId, participantId, options = {}) => {
      const quiz = await loadPublishedQuiz(quizId, role, options);
      let attempt = await QuizAttempt.findOne(findAttemptQuery(quiz._id, role, participantId));

      if (attempt && attempt.status === 'in_progress' && remainingSeconds(attempt) === 0) {
        attempt = await finaliseExpiredAttempt(attempt, quiz);
      }
      if (!attempt || attempt.status !== 'submitted') {
        throw new ApiError(404, 'No submitted attempt for this quiz yet');
      }

      if (!areAttemptResultsVisible(quiz, attempt)) {
        return {
          resultsHeld: true,
          submittedAt: attempt.submittedAt,
          quiz: {
            id: quiz._id,
            title: quiz.title,
            subject: quiz.subject,
            resultsReleased: false,
          },
        };
      }

      return { result: buildResult(quiz, attempt), resultsHeld: false };
    },
  };
}
