import { Router } from 'express';
import { protectBuyer } from '../middleware/buyerAuth.js';
import {
  createCheckout,
  getPaymentSettings,
  listMyPurchases,
  submitUtrPayment,
} from '../controllers/paymentController.js';

const router = Router();

router.use(protectBuyer);
router.get('/settings', getPaymentSettings);
router.get('/mine', listMyPurchases);
router.post('/checkout', createCheckout);
router.post('/submit-utr', submitUtrPayment);
router.post('/confirm', submitUtrPayment);

export default router;
