import { MockSMS } from '../models/MockSMS';

/**
 * Send an SMS via the local simulator.
 * Non-fatal — logs errors but never throws, so SMS failures don't crash the app.
 */
export const sendSMS = async (to: string, message: string): Promise<void> => {
  console.log(`[Simulator SMS] Sending message to ${to}`);

  await MockSMS.create({
    phone: to,
    message,
    direction: 'outbound',
  }).catch((err) => {
    console.error('[MockSMS Log Outbound Error]', err);
  });
};
