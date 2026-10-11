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
import {
  getEducatorAssessment,
  getEducatorAssessmentResult,
  listEducatorAssessments,
  recordEducatorFullscreenExit,
  startEducatorAssessment,
  submitEducatorAssessment,
} from '../controllers/educatorAssessmentController.js';
import {
  getEducatorDpp,
  getEducatorDppResult,
  listEducatorDpps,
  startEducatorDpp,
  submitEducatorDpp,
} from '../controllers/educatorDppController.js';
import {
  getEducatorSlipTest,
  getEducatorSlipTestResult,
  listEducatorSlipTests,
  startEducatorSlipTest,
  submitEducatorSlipTest,
} from '../controllers/educatorSlipTestController.js';
import { educatorClassroom } from '../controllers/classroomQuizController.js';
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

router.get('/quizzes/:id/classroom', protectEducator, educatorClassroom.getClassroom);
router.post('/quizzes/:id/classroom', protectEducator, educatorClassroom.openClassroom);
router.patch('/quizzes/:id/classroom/groups', protectEducator, educatorClassroom.updateGroups);
router.post('/quizzes/:id/classroom/start', protectEducator, educatorClassroom.startClassroom);
router.post('/quizzes/:id/classroom/answer', protectEducator, educatorClassroom.answerClassroom);
router.post('/quizzes/:id/classroom/pass', protectEducator, educatorClassroom.passClassroom);
router.post('/quizzes/:id/classroom/next', protectEducator, educatorClassroom.nextQuestion);
router.post('/quizzes/:id/classroom/award', protectEducator, educatorClassroom.awardClassroom);
router.post('/quizzes/:id/classroom/finish', protectEducator, educatorClassroom.finishClassroom);
router.post('/quizzes/:id/classroom/results', protectEducator, educatorClassroom.publishResults);
router.get('/quizzes', protectEducator, listEducatorQuizzes);
router.get('/quizzes/:id', protectEducator, getEducatorQuiz);
router.post('/quizzes/:id/start', protectEducator, startEducatorQuiz);
router.post('/quizzes/:id/submit', protectEducator, submitEducatorQuiz);
router.get('/quizzes/:id/result', protectEducator, getEducatorQuizResult);

router.get('/assessments', protectEducator, listEducatorAssessments);
router.get('/assessments/:id', protectEducator, getEducatorAssessment);
router.post('/assessments/:id/start', protectEducator, startEducatorAssessment);
router.post('/assessments/:id/fullscreen-exit', protectEducator, recordEducatorFullscreenExit);
router.post('/assessments/:id/submit', protectEducator, submitEducatorAssessment);
router.get('/assessments/:id/result', protectEducator, getEducatorAssessmentResult);

router.get('/dpps', protectEducator, listEducatorDpps);
router.get('/dpps/:id', protectEducator, getEducatorDpp);
router.post('/dpps/:id/start', protectEducator, startEducatorDpp);
router.post('/dpps/:id/submit', protectEducator, submitEducatorDpp);
router.get('/dpps/:id/result', protectEducator, getEducatorDppResult);

router.get('/slip-tests', protectEducator, listEducatorSlipTests);
router.get('/slip-tests/:id', protectEducator, getEducatorSlipTest);
router.post('/slip-tests/:id/start', protectEducator, startEducatorSlipTest);
router.post('/slip-tests/:id/submit', protectEducator, submitEducatorSlipTest);
router.get('/slip-tests/:id/result', protectEducator, getEducatorSlipTestResult);

export default router;
