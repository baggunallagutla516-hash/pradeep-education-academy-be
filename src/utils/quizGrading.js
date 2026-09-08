export const QUESTION_TYPES = ['single', 'multiple'];

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

export const RESULT_TIERS = [
  {
    min: 90,
    emoji: '🏆',
    label: 'Outstanding',
    message: 'Brilliant work. You have really mastered this one.',
  },
  {
    min: 75,
    emoji: '🎉',
    label: 'Great work',
    message: 'Strong score. A little polish and you are at the top.',
  },
  {
    min: 60,
    emoji: '😊',
    label: 'Good effort',
    message: 'Solid attempt. Review the ones you missed and go again.',
  },
  {
    min: 40,
    emoji: '😐',
    label: 'Keep practising',
    message: 'You are getting there. Go back over the explanations carefully.',
  },
  {
    min: 0,
    emoji: '😔',
    label: 'Needs work',
    message: 'This topic needs another round. Ask your teacher for help.',
  },
];

export function resultTier(percentage) {
  const value = Number.isFinite(percentage) ? percentage : 0;
  return RESULT_TIERS.find((tier) => value >= tier.min) || RESULT_TIERS[RESULT_TIERS.length - 1];
}

export function totalMarksFor(questions = []) {
  return round2(questions.reduce((sum, question) => sum + Number(question.marks || 0), 0));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function uniqueSorted(values = []) {
  return [...new Set(values.map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
}

function sameSet(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Grades one question. Partial credit follows the standard rule: it is only
 * awarded when every option the student picked is correct but some are missing.
 * Picking any wrong option makes the whole answer wrong.
 */
function gradeQuestion(question, selectedRaw, { negativeMarkPerWrong, allowPartialCredit }) {
  const selected = uniqueSorted(selectedRaw);
  const correct = uniqueSorted(question.correctOptions);
  const marks = Number(question.marks || 0);

  if (selected.length === 0) {
    return { selected, outcome: 'unanswered', awardedMarks: 0 };
  }

  if (sameSet(selected, correct)) {
    return { selected, outcome: 'correct', awardedMarks: round2(marks) };
  }

  const pickedOnlyCorrect = selected.every((index) => correct.includes(index));

  if (question.type === 'multiple' && allowPartialCredit && pickedOnlyCorrect) {
    return {
      selected,
      outcome: 'partial',
      awardedMarks: round2((marks * selected.length) / correct.length),
    };
  }

  return { selected, outcome: 'wrong', awardedMarks: round2(-Math.abs(negativeMarkPerWrong || 0)) };
}

/**
 * Grades a whole attempt. `answers` is a list of { questionId, selectedOptions }.
 * Returns the per-question breakdown plus the totals stored on the attempt.
 */
export function gradeAttempt({ questions = [], answers = [], negativeMarkPerWrong = 0, allowPartialCredit = true }) {
  const selectionByQuestion = new Map();
  answers.forEach((answer) => {
    if (!answer || !answer.questionId) return;
    selectionByQuestion.set(String(answer.questionId), answer.selectedOptions || []);
  });

  const counts = { correct: 0, partial: 0, wrong: 0, unanswered: 0 };

  const responses = questions.map((question) => {
    const graded = gradeQuestion(question, selectionByQuestion.get(String(question._id)) || [], {
      negativeMarkPerWrong,
      allowPartialCredit,
    });
    counts[graded.outcome] += 1;

    return {
      question: question._id,
      selectedOptions: graded.selected,
      correctOptions: uniqueSorted(question.correctOptions),
      outcome: graded.outcome,
      awardedMarks: graded.awardedMarks,
    };
  });

  const totalMarks = totalMarksFor(questions);
  const scoredMarks = round2(responses.reduce((sum, item) => sum + item.awardedMarks, 0));
  const percentage =
    totalMarks > 0 ? Math.min(100, Math.max(0, round2((scoredMarks / totalMarks) * 100))) : 0;

  return {
    responses,
    totalMarks,
    scoredMarks,
    percentage,
    correctCount: counts.correct,
    partialCount: counts.partial,
    wrongCount: counts.wrong,
    unansweredCount: counts.unanswered,
  };
}

/**
 * Shared shape checks for admin-authored questions. Returns a list of human
 * readable problems so the controller can reject the whole payload at once.
 */
export function validateQuestions(questions) {
  const errors = [];

  if (!Array.isArray(questions) || questions.length === 0) {
    return ['Add at least one question.'];
  }

  questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;

    if (!question?.text?.trim()) {
      errors.push(`${label}: question text is required.`);
    }

    if (!QUESTION_TYPES.includes(question?.type)) {
      errors.push(`${label}: type must be single or multiple choice.`);
    }

    const options = Array.isArray(question?.options) ? question.options : [];
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      errors.push(`${label}: needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} options.`);
    }
    if (options.some((option) => !option?.text?.trim())) {
      errors.push(`${label}: every option needs text.`);
    }

    const correct = uniqueSorted(question?.correctOptions);
    if (correct.length === 0) {
      errors.push(`${label}: mark at least one correct option.`);
    }
    if (correct.some((optionIndex) => optionIndex < 0 || optionIndex >= options.length)) {
      errors.push(`${label}: a correct option points to an option that does not exist.`);
    }
    if (question?.type === 'single' && correct.length > 1) {
      errors.push(`${label}: single choice questions can only have one correct option.`);
    }

    const marks = Number(question?.marks);
    if (!Number.isFinite(marks) || marks <= 0) {
      errors.push(`${label}: marks must be greater than zero.`);
    }
  });

  return errors;
}

/**
 * Normalises an admin payload into the shape stored on the quiz document.
 */
export function normaliseQuestions(questions = []) {
  return questions.map((question) => ({
    text: question.text.trim(),
    type: question.type,
    options: question.options.map((option) => ({ text: option.text.trim() })),
    correctOptions: uniqueSorted(question.correctOptions),
    marks: Number(question.marks),
    explanation: (question.explanation || '').trim(),
  }));
}
