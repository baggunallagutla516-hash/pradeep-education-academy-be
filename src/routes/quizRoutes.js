import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  getStudentQuiz,
  getStudentQuizResult,
  listStudentQuizzes,
  startStudentQuiz,
  submitStudentQuiz,
} from '../controllers/studentQuizController.js';
import {
  answerStudentClassroom,
  getStudentClassroom,
  joinStudentClassroom,
  passStudentClassroom,
} from '../controllers/classroomQuizController.js';

const router = Router();

router.use(protect);
router.get('/', listStudentQuizzes);
router.get('/:id/classroom', getStudentClassroom);
router.post('/:id/classroom/join', joinStudentClassroom);
router.post('/:id/classroom/answer', answerStudentClassroom);
router.post('/:id/classroom/pass', passStudentClassroom);
router.get('/:id', getStudentQuiz);
router.post('/:id/start', startStudentQuiz);
router.post('/:id/submit', submitStudentQuiz);
router.get('/:id/result', getStudentQuizResult);

export default router;
