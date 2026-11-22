import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { listStudentOnlineClasses } from '../controllers/onlineClassController.js';

const router = Router();

router.use(protect);
router.get('/', listStudentOnlineClasses);

export default router;
