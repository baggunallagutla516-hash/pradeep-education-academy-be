/**
 * Per-attempt result visibility.
 * Once admin announces/releases, only attempts submitted at or before resultsReleasedAt
 * can see scores. Later attempts stay held until the next announce.
 */

export function areAttemptResultsVisible(exam, attempt) {
  if (!attempt || attempt.status !== 'submitted') return false;
  if (attempt.resultsHidden) return false;
  if (!exam?.resultsReleased) return false;

  // Legacy docs released without a timestamp: treat all submitted as visible.
  if (!exam.resultsReleasedAt || !attempt.submittedAt) {
    return true;
  }

  return new Date(attempt.submittedAt).getTime() <= new Date(exam.resultsReleasedAt).getTime();
}

export function isAttemptPendingRelease(exam, attempt) {
  if (!attempt || attempt.status !== 'submitted') return false;
  if (attempt.resultsHidden) return false;
  return !areAttemptResultsVisible(exam, attempt);
}

export function countPendingReleaseAttempts(exam, attempts = []) {
  return attempts.filter((attempt) => isAttemptPendingRelease(exam, attempt)).length;
}

export function pendingReleaseAttempts(exam, attempts = []) {
  return attempts.filter((attempt) => isAttemptPendingRelease(exam, attempt));
}
