import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getStudentCet, listStudentCets } from '../controllers/studentCetController.js';

const router = Router();

router.use(protect);
router.get('/', listStudentCets);
router.get('/:id', getStudentCet);

export default router;
