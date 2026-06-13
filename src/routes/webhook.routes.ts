import { Router } from 'express';
import {
  inboundSMS,
  getSimulatorUI,
  getSimulatorFarmers,
  getMockSMSHistory,
} from '../controllers/webhook.controller';

const router = Router();

// Telnyx (or Vonage) calls this when a farmer sends an SMS
router.post('/sms/inbound', inboundSMS);

// SMS Simulator routes
router.get('/sms/simulator', getSimulatorUI);
router.get('/sms/simulator/farmers', getSimulatorFarmers);
router.get('/sms/mock-history/:phone', getMockSMSHistory);

export default router;
