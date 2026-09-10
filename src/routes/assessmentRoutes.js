import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  getStudentAssessment,
  getStudentAssessmentResult,
  listStudentAssessments,
  recordFullscreenExit,
  startStudentAssessment,
  submitStudentAssessment,
} from '../controllers/studentAssessmentController.js';

const router = Router();

router.use(protect);
router.get('/', listStudentAssessments);
router.get('/:id', getStudentAssessment);
router.post('/:id/start', startStudentAssessment);
router.post('/:id/fullscreen-exit', recordFullscreenExit);
router.post('/:id/submit', submitStudentAssessment);
router.get('/:id/result', getStudentAssessmentResult);

export default router;
