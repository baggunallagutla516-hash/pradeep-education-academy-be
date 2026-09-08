import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  getStudentUnitTest,
  listStudentUnitTests,
} from '../controllers/studentUnitTestController.js';

const router = Router();

router.use(protect);
router.get('/', listStudentUnitTests);
router.get('/:id', getStudentUnitTest);

export default router;
