import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { UserRole } from '../types';
import {
  registerDealer, registerDealerSchema,
  getProfile, redeem, redeemSchema, getRedemptions,
} from '../controllers/dealer.controller';

const router = Router();

// Public
router.post(
  '/register', 
  validate(registerDealerSchema), 
  registerDealer
);

// Protected — dealer role only
router.use(authenticate, authorize(UserRole.DEALER));
router.get('/profile', getProfile);
router.post(
  '/redeem', 
  validate(redeemSchema), 
  redeem
);
router.get('/redemptions', getRedemptions);

export default router;
