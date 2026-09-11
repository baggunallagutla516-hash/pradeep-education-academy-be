import { asyncHandler } from '../utils/asyncHandler.js';
import { createQuizParticipantHandlers } from '../utils/quizParticipant.js';

const handlers = createQuizParticipantHandlers('student');

export const listStudentQuizzes = asyncHandler(async (req, res) => {
  const data = await handlers.list(req.user._id);
  res.status(200).json({ success: true, data });
});

export const getStudentQuiz = asyncHandler(async (req, res) => {
  const data = await handlers.get(req.params.id, req.user._id);
  res.status(200).json({ success: true, data });
});

export const startStudentQuiz = asyncHandler(async (req, res) => {
  const data = await handlers.start(req.params.id, req.user._id);
  res.status(200).json({ success: true, data });
});

export const submitStudentQuiz = asyncHandler(async (req, res) => {
  const data = await handlers.submit(req.params.id, req.user._id, req.body);
  res.status(200).json({
    success: true,
    message: data.message || 'Quiz submitted',
    data,
  });
});

export const getStudentQuizResult = asyncHandler(async (req, res) => {
  const data = await handlers.result(req.params.id, req.user._id);
  res.status(200).json({ success: true, data });
});
