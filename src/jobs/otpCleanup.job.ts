import cron from 'node-cron';
import { OTP } from '../models/OTP';

/**
 * Every hour — logs OTP cleanup stats.
 * MongoDB TTL index handles actual deletion automatically.
 * This job exists for observability only.
 */
export const startOTPCleanupJob = (): void => {
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await OTP.deleteMany({ expiresAt: { $lt: new Date() } });
      if (result.deletedCount > 0) {
        console.log(`[Job:OTPCleanup] Removed ${result.deletedCount} expired OTPs`);
      }
    } catch (err) {
      console.error('[Job:OTPCleanup] Error:', err);
    }
  });
  console.log('[Job:OTPCleanup] Scheduled every hour');
};
