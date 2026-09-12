import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  forgotParentPassword,
  getChild,
  getChildResults,
  getParentMe,
  listChildren,
  loginParent,
  logoutParent,
  registerParent,
  resetParentPassword,
  updateParentMe,
  verifyParentResetOtp,
} from '../controllers/parentAuthController.js';
import {
  getParentQuiz,
  getParentQuizResult,
  listParentQuizzes,
  startParentQuiz,
  submitParentQuiz,
} from '../controllers/parentQuizController.js';
import { protectParent } from '../middleware/parentAuth.js';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many auth attempts. Please try again in 15 minutes.',
  },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset requests. Please try again in 15 minutes.',
  },
});

const router = Router();

router.post('/register', authLimiter, registerParent);
router.post('/login', authLimiter, loginParent);
router.post('/logout', logoutParent);
router.post('/forgot-password', forgotPasswordLimiter, forgotParentPassword);
router.post('/verify-reset-otp', authLimiter, verifyParentResetOtp);
router.post('/reset-password', authLimiter, resetParentPassword);
router.get('/me', protectParent, getParentMe);
router.patch('/me', protectParent, updateParentMe);

router.get('/children', protectParent, listChildren);
router.get('/children/:studentId/results', protectParent, getChildResults);
router.get('/children/:studentId', protectParent, getChild);

router.get('/quizzes', protectParent, listParentQuizzes);
router.get('/quizzes/:id', protectParent, getParentQuiz);
router.post('/quizzes/:id/start', protectParent, startParentQuiz);
router.post('/quizzes/:id/submit', protectParent, submitParentQuiz);
router.get('/quizzes/:id/result', protectParent, getParentQuizResult);

export default router;
