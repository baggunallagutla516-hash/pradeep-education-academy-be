import mongoose from 'mongoose';
import { ApiError } from './ApiError.js';
import { assertExamWindow } from './examWindow.js';
import { EXAM_PARTICIPANT_ROLES } from './examParticipant.js';

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
  if (!mongoose.isValidObjectId(attemptId)) {
    throw new ApiError(400, 'Invalid attempt');
  }

  assertExamWindow(startDate, endDate, label);

  const attempt = await model.findOne({
    _id: attemptId,
    [examField]: examId,
    status: 'submitted',
  });
  if (!attempt) throw new ApiError(404, 'Submitted attempt not found');

  const role = attempt.participantRole || (attempt.student ? 'student' : null);
  if (!EXAM_PARTICIPANT_ROLES.includes(role)) {
    throw new ApiError(400, 'This participant cannot reattempt');
  }

  await attempt.deleteOne();
  return { id: attempt._id, participantRole: role };
}
