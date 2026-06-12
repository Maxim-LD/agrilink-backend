import { Router } from 'express';
import { inboundSMS } from '../controllers/webhook.controller';

const router = Router();

// Africa's Talking calls this when a farmer sends an SMS
router.post('/sms/inbound', inboundSMS);

export default router;
