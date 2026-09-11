export const QUESTION_TYPES = ['single', 'multiple', 'blank', 'matrix'];

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MIN_BLANK_ANSWERS = 1;
export const MAX_BLANK_ANSWERS = 6;
export const MIN_MATRIX_ROWS = 2;
export const MAX_MATRIX_ROWS = 8;

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

/** Trim, collapse spaces, and lowercase for fill-in-the-blank matching. */
export function normalizeTextAnswer(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function cleanAnswerList(values = []) {
  const seen = new Set();
  const cleaned = [];
  values.forEach((value) => {
    const trimmed = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    cleaned.push(trimmed);
  });
  return cleaned;
}

function answersMatch(given, acceptedList) {
  const normalized = normalizeTextAnswer(given);
  if (!normalized) return false;
  return acceptedList.some((accepted) => normalizeTextAnswer(accepted) === normalized);
}

/**
 * Grades one question. Partial credit follows the standard rule: it is only
 * awarded when every option the student picked is correct but some are missing.
 * Picking any wrong option makes the whole answer wrong.
 * Fill-in-the-blank answers are matched case-insensitively against accepted texts.
 * Matrix questions score one column pick per row (partial credit is per-row).
 */
function gradeQuestion(question, answer, { negativeMarkPerWrong, allowPartialCredit }) {
  if (question.type === 'blank') {
    const textAnswer = String(answer?.textAnswer ?? '').trim().replace(/\s+/g, ' ');
    const correctAnswers = cleanAnswerList(question.correctAnswers);
    const marks = Number(question.marks || 0);

    if (!textAnswer) {
      return {
        selected: [],
        textAnswer: '',
        correctAnswers,
        matrixAnswers: [],
        correctMatrix: [],
        outcome: 'unanswered',
        awardedMarks: 0,
      };
    }

    if (answersMatch(textAnswer, correctAnswers)) {
      return {
        selected: [],
        textAnswer,
        correctAnswers,
        matrixAnswers: [],
        correctMatrix: [],
        outcome: 'correct',
        awardedMarks: round2(marks),
      };
    }

    return {
      selected: [],
      textAnswer,
      correctAnswers,
      matrixAnswers: [],
      correctMatrix: [],
      outcome: 'wrong',
      awardedMarks: round2(-Math.abs(negativeMarkPerWrong || 0)),
    };
  }

  if (question.type === 'matrix') {
    const rows = Array.isArray(question.rows) ? question.rows : [];
    const columns = Array.isArray(question.options) ? question.options : [];
    const correctMatrix = rows.map((_, index) => {
      const value = Number(question.correctMatrix?.[index]);
      return Number.isInteger(value) ? value : -1;
    });
    const rawAnswers = Array.isArray(answer?.matrixAnswers) ? answer.matrixAnswers : [];
    const matrixAnswers = rows.map((_, index) => {
      const value = Number(rawAnswers[index]);
      return Number.isInteger(value) && value >= 0 && value < columns.length ? value : -1;
    });
    const marks = Number(question.marks || 0);
    const answeredCount = matrixAnswers.filter((value) => value >= 0).length;

    if (answeredCount === 0) {
      return {
        selected: [],
        textAnswer: '',
        correctAnswers: [],
        matrixAnswers,
        correctMatrix,
        outcome: 'unanswered',
        awardedMarks: 0,
      };
    }

    let correctRows = 0;
    matrixAnswers.forEach((pick, index) => {
      if (pick >= 0 && pick === correctMatrix[index]) correctRows += 1;
    });

    if (correctRows === rows.length) {
      return {
        selected: [],
        textAnswer: '',
        correctAnswers: [],
        matrixAnswers,
        correctMatrix,
        outcome: 'correct',
        awardedMarks: round2(marks),
      };
    }

    if (allowPartialCredit && correctRows > 0) {
      return {
        selected: [],
        textAnswer: '',
        correctAnswers: [],
        matrixAnswers,
        correctMatrix,
        outcome: 'partial',
        awardedMarks: round2((marks * correctRows) / rows.length),
      };
    }

    return {
      selected: [],
      textAnswer: '',
      correctAnswers: [],
      matrixAnswers,
      correctMatrix,
      outcome: 'wrong',
      awardedMarks: round2(-Math.abs(negativeMarkPerWrong || 0)),
    };
  }

  const selected = uniqueSorted(answer?.selectedOptions);
  const correct = uniqueSorted(question.correctOptions);
  const marks = Number(question.marks || 0);

  if (selected.length === 0) {
    return {
      selected,
      textAnswer: '',
      correctAnswers: [],
      matrixAnswers: [],
      correctMatrix: [],
      outcome: 'unanswered',
      awardedMarks: 0,
    };
  }

  if (sameSet(selected, correct)) {
    return {
      selected,
      textAnswer: '',
      correctAnswers: [],
      matrixAnswers: [],
      correctMatrix: [],
      outcome: 'correct',
      awardedMarks: round2(marks),
    };
  }

  const pickedOnlyCorrect = selected.every((index) => correct.includes(index));

  if (question.type === 'multiple' && allowPartialCredit && pickedOnlyCorrect) {
    return {
      selected,
      textAnswer: '',
      correctAnswers: [],
      matrixAnswers: [],
      correctMatrix: [],
      outcome: 'partial',
      awardedMarks: round2((marks * selected.length) / correct.length),
    };
  }

  return {
    selected,
    textAnswer: '',
    correctAnswers: [],
    matrixAnswers: [],
    correctMatrix: [],
    outcome: 'wrong',
    awardedMarks: round2(-Math.abs(negativeMarkPerWrong || 0)),
  };
}

/**
 * Grades a whole attempt. `answers` is a list of
 * { questionId, selectedOptions?, textAnswer?, matrixAnswers? }.
 * Returns the per-question breakdown plus the totals stored on the attempt.
 */
export function gradeAttempt({ questions = [], answers = [], negativeMarkPerWrong = 0, allowPartialCredit = true }) {
  const answerByQuestion = new Map();
  answers.forEach((answer) => {
    if (!answer || !answer.questionId) return;
    answerByQuestion.set(String(answer.questionId), {
      selectedOptions: answer.selectedOptions || [],
      textAnswer: answer.textAnswer || '',
      matrixAnswers: Array.isArray(answer.matrixAnswers) ? answer.matrixAnswers : [],
    });
  });

  const counts = { correct: 0, partial: 0, wrong: 0, unanswered: 0 };

  const responses = questions.map((question) => {
    const graded = gradeQuestion(question, answerByQuestion.get(String(question._id)) || {}, {
      negativeMarkPerWrong,
      allowPartialCredit,
    });
    counts[graded.outcome] += 1;

    return {
      question: question._id,
      selectedOptions: graded.selected,
      correctOptions: question.type === 'blank' || question.type === 'matrix' ? [] : uniqueSorted(question.correctOptions),
      textAnswer: graded.textAnswer,
      correctAnswers: graded.correctAnswers,
      matrixAnswers: graded.matrixAnswers,
      correctMatrix: graded.correctMatrix,
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
      errors.push(`${label}: type must be single choice, multi-select, fill in the blanks, or matrix.`);
    }

    const marks = Number(question?.marks);
    if (!Number.isFinite(marks) || marks <= 0) {
      errors.push(`${label}: marks must be greater than zero.`);
    }

    if (question?.type === 'blank') {
      const accepted = cleanAnswerList(question?.correctAnswers);
      if (accepted.length < MIN_BLANK_ANSWERS || accepted.length > MAX_BLANK_ANSWERS) {
        errors.push(
          `${label}: needs between ${MIN_BLANK_ANSWERS} and ${MAX_BLANK_ANSWERS} accepted answers.`
        );
      }
      if (accepted.some((answer) => answer.length > 200)) {
        errors.push(`${label}: each accepted answer can be at most 200 characters.`);
      }
      return;
    }

    if (question?.type === 'matrix') {
      const rows = Array.isArray(question?.rows) ? question.rows : [];
      const columns = Array.isArray(question?.options) ? question.options : [];
      if (rows.length < MIN_MATRIX_ROWS || rows.length > MAX_MATRIX_ROWS) {
        errors.push(
          `${label}: matrix needs between ${MIN_MATRIX_ROWS} and ${MAX_MATRIX_ROWS} rows.`
        );
      }
      if (rows.some((row) => !row?.text?.trim())) {
        errors.push(`${label}: every matrix row needs text.`);
      }
      if (columns.length < MIN_OPTIONS || columns.length > MAX_OPTIONS) {
        errors.push(
          `${label}: matrix needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} columns.`
        );
      }
      if (columns.some((column) => !column?.text?.trim())) {
        errors.push(`${label}: every matrix column needs text.`);
      }
      const correctMatrix = Array.isArray(question?.correctMatrix) ? question.correctMatrix : [];
      if (correctMatrix.length !== rows.length) {
        errors.push(`${label}: mark the correct column for every matrix row.`);
      }
      if (
        correctMatrix.some(
          (value) => !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) >= columns.length
        )
      ) {
        errors.push(`${label}: a matrix correct answer points to a column that does not exist.`);
      }
      return;
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
  });

  return errors;
}

/**
 * Normalises an admin payload into the shape stored on the quiz document.
 */
export function normaliseQuestions(questions = []) {
  return questions.map((question) => {
    if (question.type === 'blank') {
      return {
        text: question.text.trim(),
        type: 'blank',
        options: [],
        rows: [],
        correctOptions: [],
        correctAnswers: cleanAnswerList(question.correctAnswers),
        correctMatrix: [],
        marks: Number(question.marks),
        explanation: (question.explanation || '').trim(),
      };
    }

    if (question.type === 'matrix') {
      const rows = (question.rows || []).map((row) => ({ text: String(row?.text || '').trim() }));
      return {
        text: question.text.trim(),
        type: 'matrix',
        options: (question.options || []).map((option) => ({ text: option.text.trim() })),
        rows,
        correctOptions: [],
        correctAnswers: [],
        correctMatrix: rows.map((_, index) => Number(question.correctMatrix?.[index])),
        marks: Number(question.marks),
        explanation: (question.explanation || '').trim(),
      };
    }

    return {
      text: question.text.trim(),
      type: question.type,
      options: question.options.map((option) => ({ text: option.text.trim() })),
      rows: [],
      correctOptions: uniqueSorted(question.correctOptions),
      correctAnswers: [],
      correctMatrix: [],
      marks: Number(question.marks),
      explanation: (question.explanation || '').trim(),
    };
  });
}
