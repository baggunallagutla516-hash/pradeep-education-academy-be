import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getChild,
  getChildResults,
  getParentMe,
  listChildren,
  loginParent,
  logoutParent,
  updateParentMe,
} from '../controllers/parentAuthController.js';
import { protectParent } from '../middleware/parentAuth.js';

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

router.post('/login', authLimiter, loginParent);
router.post('/logout', logoutParent);
router.get('/me', protectParent, getParentMe);
router.patch('/me', protectParent, updateParentMe);

router.get('/children', protectParent, listChildren);
router.get('/children/:studentId/results', protectParent, getChildResults);
router.get('/children/:studentId', protectParent, getChild);

export default router;
