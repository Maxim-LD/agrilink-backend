import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { UserRole } from '../types';
import {
  registerBuyer, registerBuyerSchema,
  getProfile, createOrder, standingOrderSchema, getOrders,
  getMatches, getMatch, confirmMatch, declineMatch,
} from '../controllers/buyer.controller';

const router = Router();

// Public
router.post('/register', validate(registerBuyerSchema), registerBuyer);

// Protected — buyer role only
router.use(
  authenticate, 
  authorize(UserRole.BUYER)
);

router.get('/profile', getProfile);

router.post(
  '/orders', 
  validate(standingOrderSchema), 
  createOrder
);

router.get('/orders', getOrders);
router.get('/matches', getMatches);
router.get('/matches/:id', getMatch);
router.post('/matches/:id/confirm', confirmMatch);
router.post('/matches/:id/decline', declineMatch);

export default router;
