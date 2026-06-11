import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { UserRole } from '../types';
import {
  registerAggregator, registerAggregatorSchema,
  getProfile, submitLog, logSubmissionSchema, getLogs,
} from '../controllers/aggregator.controller';

const router = Router();

// Public
router.post('/register', validate(registerAggregatorSchema), registerAggregator);

// Protected — aggregator role only
router.use(
  authenticate, 
  authorize(UserRole.AGGREGATOR)
);

router.get('/profile', getProfile);

router.post(
  '/logs', 
  validate(logSubmissionSchema), 
  submitLog
);

router.get('/logs', getLogs);

export default router;
