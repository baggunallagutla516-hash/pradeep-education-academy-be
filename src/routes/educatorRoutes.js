import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getEducatorMe,
  loginEducator,
  logoutEducator,
  registerEducator,
  updateEducatorMe,
} from '../controllers/educatorAuthController.js';
import {
  getEducatorWorksheet,
  listEducatorWorksheets,
} from '../controllers/educatorWorksheetController.js';
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

const router = Router();

router.post('/register', authLimiter, registerEducator);
router.post('/login', authLimiter, loginEducator);
router.post('/logout', logoutEducator);
router.get('/me', protectEducator, getEducatorMe);
router.patch('/me', protectEducator, updateEducatorMe);

router.get('/worksheets', protectEducator, listEducatorWorksheets);
router.get('/worksheets/:id', protectEducator, getEducatorWorksheet);

export default router;
