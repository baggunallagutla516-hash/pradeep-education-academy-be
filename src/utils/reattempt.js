import mongoose from 'mongoose';
import { ApiError } from './ApiError.js';
import { assertExamWindow } from './examWindow.js';
import { EXAM_PARTICIPANT_ROLES } from './examParticipant.js';

async function findSubmittedAttempt({ model, examField, examId, attemptId }) {
  if (!mongoose.isValidObjectId(attemptId)) {
    throw new ApiError(400, 'Invalid attempt');
  }

  const attempt = await model.findOne({
    _id: attemptId,
    [examField]: examId,
    status: 'submitted',
  });
  if (!attempt) throw new ApiError(404, 'Submitted attempt not found');
  return attempt;
}

/** Staff action: clear one submitted row so that participant can write again. */
export async function clearAttemptById({
  model,
  examField,
  examId,
  attemptId,
  label,
  startDate,
  endDate,
}) {
  assertExamWindow(startDate, endDate, label);

  const attempt = await findSubmittedAttempt({ model, examField, examId, attemptId });

  const role = attempt.participantRole || (attempt.student ? 'student' : null);
  if (!EXAM_PARTICIPANT_ROLES.includes(role)) {
    throw new ApiError(400, 'This participant cannot reattempt');
  }

  await attempt.deleteOne();
  return { id: attempt._id, participantRole: role };
}

/** Staff action: permanently remove a submitted result everywhere. */
export async function deleteAttemptById({ model, examField, examId, attemptId }) {
  const attempt = await findSubmittedAttempt({ model, examField, examId, attemptId });
  await attempt.deleteOne();
  return { id: attempt._id };
}

/** Staff action: hide or unhide a submitted result for participants everywhere. */
export async function setAttemptResultsHidden({
  model,
  examField,
  examId,
  attemptId,
  resultsHidden,
}) {
  const attempt = await findSubmittedAttempt({ model, examField, examId, attemptId });
  attempt.resultsHidden = Boolean(resultsHidden);
  await attempt.save();
  return { id: attempt._id, resultsHidden: attempt.resultsHidden };
}
