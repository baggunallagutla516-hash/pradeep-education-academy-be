import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { submitContact } from '../controllers/contactController.js';

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many messages sent. Please try again later.',
  },
});

const router = Router();

router.post('/', contactLimiter, submitContact);

export default router;
