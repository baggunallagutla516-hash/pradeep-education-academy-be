import { asyncHandler } from '../utils/asyncHandler.js';
import { createQuizParticipantHandlers } from '../utils/quizParticipant.js';

const handlers = createQuizParticipantHandlers('parent');

export const listParentQuizzes = asyncHandler(async (req, res) => {
  const data = await handlers.list(req.parent._id);
  res.status(200).json({ success: true, data });
});

export const getParentQuiz = asyncHandler(async (req, res) => {
  const data = await handlers.get(req.params.id, req.parent._id);
  res.status(200).json({ success: true, data });
});

export const startParentQuiz = asyncHandler(async (req, res) => {
  const data = await handlers.start(req.params.id, req.parent._id);
  res.status(200).json({ success: true, data });
});

export const submitParentQuiz = asyncHandler(async (req, res) => {
  const data = await handlers.submit(req.params.id, req.parent._id, req.body);
  res.status(200).json({
    success: true,
    message: data.message || 'Quiz submitted',
    data,
  });
});

export const getParentQuizResult = asyncHandler(async (req, res) => {
  const data = await handlers.result(req.params.id, req.parent._id);
  res.status(200).json({ success: true, data });
});
