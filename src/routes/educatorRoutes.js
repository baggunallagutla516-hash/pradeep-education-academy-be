import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  forgotEducatorPassword,
  getEducatorMe,
  loginEducator,
  logoutEducator,
  registerEducator,
  resetEducatorPassword,
  updateEducatorMe,
  verifyEducatorResetOtp,
} from '../controllers/educatorAuthController.js';
import {
  getEducatorWorksheet,
  listEducatorWorksheets,
} from '../controllers/educatorWorksheetController.js';
import {
  getEducatorUnitTest,
  listEducatorUnitTests,
} from '../controllers/educatorUnitTestController.js';
import {
  getEducatorCet,
  listEducatorCets,
} from '../controllers/educatorCetController.js';
import {
  getEducatorQuiz,
  getEducatorQuizResult,
  listEducatorQuizzes,
  startEducatorQuiz,
  submitEducatorQuiz,
} from '../controllers/educatorQuizController.js';
import { protectEducator } from '../middleware/educatorAuth.js';

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

router.post('/register', authLimiter, registerEducator);
router.post('/login', authLimiter, loginEducator);
router.post('/logout', logoutEducator);
router.post('/forgot-password', forgotPasswordLimiter, forgotEducatorPassword);
router.post('/verify-reset-otp', authLimiter, verifyEducatorResetOtp);
router.post('/reset-password', authLimiter, resetEducatorPassword);
router.get('/me', protectEducator, getEducatorMe);
router.patch('/me', protectEducator, updateEducatorMe);

router.get('/worksheets', protectEducator, listEducatorWorksheets);
router.get('/worksheets/:id', protectEducator, getEducatorWorksheet);

router.get('/unit-tests', protectEducator, listEducatorUnitTests);
router.get('/unit-tests/:id', protectEducator, getEducatorUnitTest);

router.get('/cets', protectEducator, listEducatorCets);
router.get('/cets/:id', protectEducator, getEducatorCet);

router.get('/quizzes', protectEducator, listEducatorQuizzes);
router.get('/quizzes/:id', protectEducator, getEducatorQuiz);
router.post('/quizzes/:id/start', protectEducator, startEducatorQuiz);
router.post('/quizzes/:id/submit', protectEducator, submitEducatorQuiz);
router.get('/quizzes/:id/result', protectEducator, getEducatorQuizResult);

export default router;
