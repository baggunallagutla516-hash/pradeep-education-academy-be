import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  getStudentQuiz,
  getStudentQuizResult,
  listStudentQuizzes,
  startStudentQuiz,
  submitStudentQuiz,
} from '../controllers/studentQuizController.js';

const router = Router();

router.use(protect);
router.get('/', listStudentQuizzes);
router.get('/:id', getStudentQuiz);
router.post('/:id/start', startStudentQuiz);
router.post('/:id/submit', submitStudentQuiz);
router.get('/:id/result', getStudentQuizResult);

export default router;
