import cron from 'node-cron';
import { Log } from '../models/Log';
import { LogStatus } from '../types';
import { matchLog } from '../services/matchingEngine.service';

/**
 * Every 15 minutes — re-attempts matching for logs that haven't been matched
 * in the last 14 minutes (e.g., if matching engine was busy at submission time).
 */
export const startMatchingPollJob = (): void => {
  cron.schedule('*/15 * * * *', async () => {
    console.log('[Job:MatchingPoll] Running...');
    try {
      const stale = await Log.find({
        status:    LogStatus.PENDING_MATCH,
        updatedAt: { $lt: new Date(Date.now() - 14 * 60_000) },
      }).limit(50); // cap per run to avoid thundering herd

      for (const log of stale) {
        await matchLog(String(log._id));
        // Small delay between attempts — don't hammer MongoDB
        await new Promise((r) => setTimeout(r, 200));
      }

      if (stale.length > 0) console.log(`[Job:MatchingPoll] Re-tried ${stale.length} stale logs`);
    } catch (err) {
      console.error('[Job:MatchingPoll] Error:', err);
    }
  });
  console.log('[Job:MatchingPoll] Scheduled every 15 min');
};
