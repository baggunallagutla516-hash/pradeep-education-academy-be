import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  getStudentSlipTest,
  getStudentSlipTestResult,
  listStudentSlipTests,
  startStudentSlipTest,
  submitStudentSlipTest,
} from '../controllers/studentSlipTestController.js';

const router = Router();

router.use(protect);
router.get('/', listStudentSlipTests);
router.get('/:id', getStudentSlipTest);
router.post('/:id/start', startStudentSlipTest);
router.post('/:id/submit', submitStudentSlipTest);
router.get('/:id/result', getStudentSlipTestResult);

export default router;
