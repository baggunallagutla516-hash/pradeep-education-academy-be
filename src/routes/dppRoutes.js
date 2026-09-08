import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  getStudentDpp,
  getStudentDppResult,
  listStudentDpps,
  startStudentDpp,
  submitStudentDpp,
} from '../controllers/studentDppController.js';

const router = Router();

router.use(protect);
router.get('/', listStudentDpps);
router.get('/:id', getStudentDpp);
router.post('/:id/start', startStudentDpp);
router.post('/:id/submit', submitStudentDpp);
router.get('/:id/result', getStudentDppResult);

export default router;
