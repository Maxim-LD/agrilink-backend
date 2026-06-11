import cron from 'node-cron';
import { Log } from '../models/Log';
import { Aggregator } from '../models/Aggregator';
import { User } from '../models/User';
import { LogStatus, Pipeline } from '../types';
import { sendSMS } from '../services/sms.service';
import { SMS } from '../constants';

/**
 * Every 30 minutes — marks fresh produce logs expired if past spoilage deadline.
 * Agri-waste has no shelf life and is never marked expired by this job.
 */
export const startSpoilageExpiryJob = (): void => {
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Job:SpoilageExpiry] Running...');
    try {
      const expiredLogs = await Log.find({
        pipeline:         Pipeline.FRESH_PRODUCE,
        status:           { $in: [LogStatus.PENDING_MATCH, LogStatus.MATCHED] },
        isExpired:        false,
        spoilageDeadline: { $lt: new Date() },
      });

      for (const log of expiredLogs) {
        await Log.findByIdAndUpdate(log._id, {
          status:    LogStatus.EXPIRED,
          isExpired: true,
        });

        // Notify aggregator
        const aggregator = await Aggregator.findById(log.aggregatorId);
        if (aggregator) {
          const aUser = await User.findById(aggregator.userId);
          if (aUser) {
            sendSMS(aUser.phone, SMS.expired(log.category)).catch(() => {});
          }
        }
        console.log(`[Job:SpoilageExpiry] Marked log ${log._id} as expired`);
      }
    } catch (err) {
      console.error('[Job:SpoilageExpiry] Error:', err);
    }
  });
  console.log('[Job:SpoilageExpiry] Scheduled every 30 min');
};
