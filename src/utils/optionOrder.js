/**
 * Per-attempt MCQ option shuffle.
 * Master DPP/SlipTest option indexes stay fixed for grading; only display order varies.
 */

function shuffleIndexes(length) {
  const order = Array.from({ length }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Build a fresh optionOrder payload for every choice question on an assessment. */
export function buildOptionOrder(questions = []) {
  return questions
    .filter(
      (question) =>
        question.type !== 'blank' &&
        question.type !== 'matrix' &&
        Array.isArray(question.options)
    )
    .map((question) => ({
      question: question._id,
      order: shuffleIndexes(question.options.length),
    }));
}

/** Map of questionId -> original-index order array. */
export function optionOrderMap(attempt) {
  const map = new Map();
  (attempt?.optionOrder || []).forEach((entry) => {
    if (!entry?.question) return;
    map.set(String(entry.question), Array.isArray(entry.order) ? entry.order : []);
  });
  return map;
}

/**
 * Ensure an attempt has optionOrder. For legacy attempts created before shuffle,
 * generate once and mark the attempt modified so the caller can save.
 * Blank-only assessments keep an empty order and do not re-shuffle.
 */
export function ensureAttemptOptionOrder(attempt, questions = []) {
  if (!attempt) return attempt;
  if (Array.isArray(attempt.optionOrder) && attempt.optionOrder.length > 0) {
    return attempt;
  }

  const nextOrder = buildOptionOrder(questions);
  if (nextOrder.length === 0) {
    return attempt;
  }

  attempt.optionOrder = nextOrder;
  attempt.markModified?.('optionOrder');
  return attempt;
}

/**
 * Options for the attempt UI / review, in this student's display order.
 * Each option keeps its original `index` so grading stays correct.
 */
export function toShuffledOptions(question, orderByQuestion) {
  if (!question || question.type === 'blank') return [];

  const options = question.options || [];
  // Keep matrix column order stable (Likert / scale labels).
  if (question.type === 'matrix') {
    return options.map((option, index) => ({
      index,
      text: option.text,
      imageUrl: option.imageUrl || '',
    }));
  }

  const stored = orderByQuestion?.get(String(question._id));
  const order =
    Array.isArray(stored) && stored.length === options.length
      ? stored
      : options.map((_, index) => index);

  return order
    .map((optionIndex) => {
      const option = options[optionIndex];
      if (!option) return null;
      return {
        index: optionIndex,
        text: option.text,
        imageUrl: option.imageUrl || '',
      };
    })
    .filter(Boolean);
}
