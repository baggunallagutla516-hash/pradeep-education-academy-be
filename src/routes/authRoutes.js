import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  changePassword,
  forgotPassword,
  getClassOptions,
  getMe,
  listMyParents,
  login,
  logout,
  register,
  resetPassword,
  updateMe,
  uploadMyPhoto,
  verifyResetOtp,
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { uploadProfilePhoto } from '../middleware/upload.js';

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

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset requests. Please try again in 15 minutes.',
  },
});

const router = Router();

router.get('/classes', getClassOptions);
router.post('/register', authLimiter, uploadProfilePhoto, register);
router.post('/login', authLimiter, login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/verify-reset-otp', authLimiter, verifyResetOtp);
router.post('/reset-password', authLimiter, resetPassword);
router.get('/me', protect, getMe);
router.patch('/me', protect, updateMe);
router.post('/me/photo', protect, uploadProfilePhoto, uploadMyPhoto);
router.post('/change-password', protect, authLimiter, changePassword);
router.get('/parents', protect, listMyParents);

export default router;
