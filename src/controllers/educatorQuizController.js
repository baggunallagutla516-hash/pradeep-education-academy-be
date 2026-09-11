import { asyncHandler } from '../utils/asyncHandler.js';
import { createQuizParticipantHandlers } from '../utils/quizParticipant.js';

const handlers = createQuizParticipantHandlers('educator');

export const listEducatorQuizzes = asyncHandler(async (req, res) => {
  const data = await handlers.list(req.educator._id);
  res.status(200).json({ success: true, data });
});

export const getEducatorQuiz = asyncHandler(async (req, res) => {
  const data = await handlers.get(req.params.id, req.educator._id);
  res.status(200).json({ success: true, data });
});

export const startEducatorQuiz = asyncHandler(async (req, res) => {
  const data = await handlers.start(req.params.id, req.educator._id);
  res.status(200).json({ success: true, data });
});

export const submitEducatorQuiz = asyncHandler(async (req, res) => {
  const data = await handlers.submit(req.params.id, req.educator._id, req.body);
  res.status(200).json({
    success: true,
    message: data.message || 'Quiz submitted',
    data,
  });
});

export const getEducatorQuizResult = asyncHandler(async (req, res) => {
  const data = await handlers.result(req.params.id, req.educator._id);
  res.status(200).json({ success: true, data });
});
