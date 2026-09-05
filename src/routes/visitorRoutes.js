import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getVisitorCount, trackVisitor } from '../controllers/visitorController.js';

const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
  },
});

const router = Router();

router.get('/', getVisitorCount);
router.post('/track', trackLimiter, trackVisitor);

export default router;
