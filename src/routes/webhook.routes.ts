import { Router } from 'express';
import { inboundSMS } from '../controllers/webhook.controller';

const router = Router();

// Termii calls this when a farmer sends an SMS
router.post('/sms/inbound', inboundSMS);

export default router;
