import { AssessmentAttempt } from '../models/AssessmentAttempt.js';
import { DppAttempt } from '../models/DppAttempt.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { SlipTestAttempt } from '../models/SlipTestAttempt.js';
import { backfillAttemptParticipants } from './examParticipant.js';

const ATTEMPT_MODELS = [AssessmentAttempt, DppAttempt, SlipTestAttempt, QuizAttempt];

/**
 * Point attempts at Student, Educator, or Parent, and keep the student unique
 * index from treating educator/parent attempts as the same student.
 */
export async function syncExamAttemptIndexes() {
  for (const model of ATTEMPT_MODELS) {
    await backfillAttemptParticipants(model);
    await model.syncIndexes();
  }
}
