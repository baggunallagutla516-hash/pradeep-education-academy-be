import { asyncHandler } from '../utils/asyncHandler.js';
import { createQuizParticipantHandlers } from '../utils/quizParticipant.js';

const handlers = createQuizParticipantHandlers('student');

function studentClassId(user) {
  const value = user.studentClass;
  if (!value) return null;
  if (typeof value === 'object' && value._id) return value._id;
  return value;
}

function visibilityOptions(req) {
  return { classId: studentClassId(req.user) };
}

export const listStudentQuizzes = asyncHandler(async (req, res) => {
  const data = await handlers.list(req.user._id, visibilityOptions(req));
  res.status(200).json({ success: true, data });
});

export const getStudentQuiz = asyncHandler(async (req, res) => {
  const data = await handlers.get(req.params.id, req.user._id, visibilityOptions(req));
  res.status(200).json({ success: true, data });
});

export const startStudentQuiz = asyncHandler(async (req, res) => {
  const data = await handlers.start(req.params.id, req.user._id, visibilityOptions(req));
  res.status(200).json({ success: true, data });
});

export const submitStudentQuiz = asyncHandler(async (req, res) => {
  const data = await handlers.submit(req.params.id, req.user._id, req.body, visibilityOptions(req));
  res.status(200).json({
    success: true,
    message: data.message || 'Quiz submitted',
    data,
  });
});

export const getStudentQuizResult = asyncHandler(async (req, res) => {
  const data = await handlers.result(req.params.id, req.user._id, visibilityOptions(req));
  res.status(200).json({ success: true, data });
});
