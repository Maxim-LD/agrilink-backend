import 'dotenv/config';
import app from './app';
import { connectDB } from './config/db';
import { startSpoilageExpiryJob } from './jobs/spoilageExpiry.job';
import { startMatchingPollJob }   from './jobs/matchingPoll.job';
import { startOTPCleanupJob }     from './jobs/otpCleanup.job';

const PORT = Number(process.env.PORT) || 5000;

const start = async () => {
  await connectDB();

  // Start background cron jobs after DB is connected
  startSpoilageExpiryJob();
  startMatchingPollJob();
  startOTPCleanupJob();

  app.listen(PORT, () => {
    console.log(`[Server] AgriLink backend running on port ${PORT}`);
    console.log(`[Server] Health: http://localhost:${PORT}/health`);
  });
};

start().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
