import https from 'https';

/**
 * Send an SMS via Termii REST API using Node's built-in https module.
 * Non-fatal — logs errors but never throws, so SMS failures don't crash the app.
 */
export const sendSMS = async (to: string, message: string): Promise<void> => {
  const body = JSON.stringify({
    to,
    from:    process.env.TERMII_SENDER_ID ?? 'AGRILINK',
    sms:     message,
    type:    'plain',
    channel: 'generic',
    api_key: process.env.TERMII_API_KEY,
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.ng.termii.com',
      path:     '/api/sms/send',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      res.on('data', () => {}); // drain
      res.on('end', () => {
        console.log(`[SMS] Sent to ${to} — HTTP ${res.statusCode}`);
        resolve();
      });
    });

    req.on('error', (err) => {
      console.error('[SMS] Delivery failed to', to, err.message);
      resolve(); // non-fatal
    });

    req.write(body);
    req.end();
  });
};
