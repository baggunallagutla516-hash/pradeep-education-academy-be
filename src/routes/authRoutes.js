import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getClassOptions,
  getMe,
  listMyParents,
  login,
  logout,
  register,
  updateMe,
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

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

router.get('/classes', getClassOptions);
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.patch('/me', protect, updateMe);
router.get('/parents', protect, listMyParents);

export default router;
