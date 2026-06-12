import https from 'https';


const sendVonageSMS = async (to: string, message: string): Promise<void> => {
  // Vonage expects E.164 format without the leading '+' for recipient numbers
  const formattedTo = to.startsWith('+') ? to.slice(1) : to;

  const postData = new URLSearchParams({
    api_key:    process.env.VONAGE_API_KEY ?? '',
    api_secret: process.env.VONAGE_API_SECRET ?? '',
    from:       process.env.VONAGE_SENDER_ID ?? 'AgriLink',
    to:         formattedTo,
    text:       message,
  }).toString();

  return new Promise((resolve) => {
    const options = {
      hostname: 'rest.nexmo.com',
      path:     '/sms/json',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        console.log(`[Vonage SMS] Sent to ${to} — HTTP ${res.statusCode}`);
        try {
          const parsed = JSON.parse(responseBody);
          const status = parsed.messages?.[0]?.status;
          if (status !== '0') {
            console.error(`[Vonage SMS] Error sending to ${to}:`, parsed.messages?.[0]?.['error-text']);
          }
        } catch (e) {
          // Ignore parsing error
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      console.error('[Vonage SMS] Delivery failed to', to, err.message);
      resolve(); // non-fatal
    });

    req.write(postData);
    req.end();
  });
};

const sendAfricasTalkingSMS = async (to: string, message: string): Promise<void> => {
  const username = process.env.AFRICASTALKING_USERNAME ?? 'sandbox';
  const apiKey = process.env.AFRICASTALKING_API_KEY ?? '';
  const senderId = process.env.AFRICASTALKING_SENDER_ID;

  const isSandbox = username.toLowerCase() === 'sandbox';
  const hostname = isSandbox ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';

  const postData = new URLSearchParams({
    username,
    to,
    message,
  });

  if (senderId) {
    postData.append('from', senderId);
  }

  const payload = postData.toString();

  return new Promise((resolve) => {
    const options = {
      hostname,
      path:     '/version1/messaging',
      method:   'POST',
      headers:  {
        'apiKey':         apiKey,
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
        'Accept':         'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        console.log(`[Africa's Talking SMS] Sent to ${to} — HTTP ${res.statusCode}`);
        try {
          const parsed = JSON.parse(responseBody);
          if (parsed.SMSMessageData?.Recipients) {
            const recipient = parsed.SMSMessageData.Recipients[0];
            if (recipient.status !== 'Success' && recipient.status !== 'Success (Sent)') {
              console.error(`[Africa's Talking SMS] Status warning for ${to}:`, recipient.status);
            }
          }
        } catch (e) {
          // Ignore parsing error
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      console.error("[Africa's Talking SMS] Delivery failed to", to, err.message);
      resolve(); // non-fatal
    });

    req.write(payload);
    req.end();
  });
};

/**
 * Send an SMS via Africa's Talking or Vonage depending on what environment keys are set.
 * Non-fatal — logs errors but never throws, so SMS failures don't crash the app.
 */
export const sendSMS = async (to: string, message: string): Promise<void> => {
  if (process.env.AFRICASTALKING_API_KEY && process.env.AFRICASTALKING_USERNAME) {
    return sendAfricasTalkingSMS(to, message);
  }
  if (process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET) {
    return sendVonageSMS(to, message);
  }
  console.warn('[SMS] No SMS provider configured. Unable to send to:', to);
};
