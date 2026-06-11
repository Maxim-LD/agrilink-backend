import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '../types';
import {
  getPendingUsers, approveUser, suspendUser,
  getAllMatches, getAllLogs,
  flagDispute, resolveDispute,
  triggerMatching,
  sendForecastAlert, simulateSpoilage,
} from '../controllers/admin.controller';

const router = Router();

// All admin routes require auth + admin role
router.use(authenticate, authorize(UserRole.ADMIN));

// User management
router.get('/users/pending',           getPendingUsers);
router.post('/users/:id/approve',      approveUser);
router.post('/users/:id/suspend',      suspendUser);

// Data views
router.get('/matches',                 getAllMatches);
router.get('/logs',                    getAllLogs);

// Dispute management
router.post('/matches/:id/flag-dispute',    flagDispute);
router.post('/matches/:id/resolve-dispute', resolveDispute);

// Manual matching trigger
router.post('/matching/run',           triggerMatching);

// Demo-only endpoints
router.post('/demo/forecast-alert',          sendForecastAlert);
router.post('/demo/simulate-spoilage/:logId', simulateSpoilage);

export default router;
