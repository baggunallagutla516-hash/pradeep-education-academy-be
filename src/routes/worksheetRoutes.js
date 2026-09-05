import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  getStudentWorksheet,
  listStudentWorksheets,
} from '../controllers/studentWorksheetController.js';

const router = Router();

router.use(protect);
router.get('/', listStudentWorksheets);
router.get('/:id', getStudentWorksheet);

export default router;
