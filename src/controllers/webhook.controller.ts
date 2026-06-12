import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { Farmer } from '../models/Farmer';
import { Dealer } from '../models/Dealer';
import { AppError } from '../utils/AppError';
import { ok } from '../utils/response';
import { generateOTP } from '../services/otp.service';
import { withdrawCash } from '../services/wallet.service';
import { sendSMS } from '../services/sms.service';
import { UserRole, UserStatus } from '../types';
import { SMS } from '../constants';

/**
 * INBOUND SMS WEBHOOK
 * ─────────────────────────────────────────────────────────────────────────────
 * Termii calls this URL whenever a farmer sends an SMS to our virtual number.
 *
 * WHY THIS MATTERS:
 *   Farmers in rural areas have no smartphone or internet. Their ONLY way to
 *   interact with the platform is via SMS from a basic phone. This webhook is
 *   their entire user interface.
 *
 * SUPPORTED COMMANDS:
 *   BAL                       → Get wallet balances
 *   REDEEM [amount] [code]    → Generate OTP to spend Agri-Wallet at a dealer
 *   WITHDRAW [amount]         → Request Cash Wallet withdrawal
 *
 * Example farmer messages:
 *   "BAL"                     → "AgriLink — Agri-Wallet: ₦6,000 | Cash Wallet: ₦2,571"
 *   "REDEEM 4200 DEALER007"   → "AgriLink OTP: 834291. Valid 10 mins..."
 *   "WITHDRAW 2000"           → "AgriLink: ₦2,000 withdrawal recorded..."
 *
 * SECURITY NOTE — Termii does NOT send a webhook secret header.
 *   Unlike Stripe or GitHub, Termii simply POSTs to your URL with no HMAC
 *   signature or secret token. There is no field in the Termii dashboard
 *   to configure a secret.
 *
 *   Instead we use an optional IP allowlist:
 *   - If TERMII_WEBHOOK_SECRET is set in .env, we validate it (useful for
 *     local testing via Postman where you set the header manually).
 *   - If it is NOT set, we skip the check and rely on the URL being obscure
 *     (acceptable for a hackathon — use IP allowlisting in production).
 *
 * CRITICAL: Always return 200 immediately — Termii retries on non-200.
 *   Retries would send duplicate OTPs to farmers. Return 200 first, then
 *   run handlers async.
 */
export const inboundSMS = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Optional secret check — only enforced if TERMII_WEBHOOK_SECRET is set in .env.
    // Termii itself does not send this header; it is only used for local Postman testing.
    const configuredSecret = process.env.TERMII_WEBHOOK_SECRET;
    if (configuredSecret) {
      const incomingSecret = req.headers['x-termii-webhook-secret'];
      if (incomingSecret !== configuredSecret) {
        return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
      }
    }

    // Support Termii (from, phone_number, sms, text) and Vonage (msisdn, text) payloads, checking query params as well
    const rawPhone = req.body.from ?? req.query.from ?? req.body.phone_number ?? req.query.phone_number ?? req.body.msisdn ?? req.query.msisdn ?? '';
    let phone = String(rawPhone).trim();
    if (phone && !phone.startsWith('+')) {
      phone = '+' + phone;
    }

    const rawBody = req.body.text ?? req.query.text ?? req.body.sms ?? req.query.sms ?? '';
    const body = String(rawBody).trim().toUpperCase();

    // ── CRITICAL: Return 200 BEFORE running handlers ──────────────────────
    // Termii considers the webhook delivered once it receives 200.
    // Everything after this line is fire-and-forget — Termii doesn't wait.
    res.status(200).json({ status: 'received' });

    // Split message into command + arguments
    // "REDEEM 4200 DEALER007" → cmd="REDEEM", args=["4200", "DEALER007"]
    const [cmd, ...args] = body.split(/\s+/);

    switch (cmd) {
      case 'BAL':
        handleBalance(phone);
        break;
      case 'REDEEM':
        // args[0] = amount (e.g. "4200"), args[1] = dealerCode (e.g. "DEALER007")
        handleRedeem(phone, args[0], args[1]);
        break;
      case 'WITHDRAW':
        // args[0] = amount (e.g. "2000")
        handleWithdraw(phone, args[0]);
        break;
      default:
        // Unknown command — send usage instructions
        sendSMS(phone, SMS.unknownCommand()).catch(() => {});
    }
  } catch (err) {
    next(err);
  }
};

// ─── BAL command ──────────────────────────────────────────────────────────────

/**
 * handleBalance — replies with the farmer's current wallet balances.
 *
 * Looks up the farmer by phone number, reads the cached balance fields
 * on the Farmer document, and sends them back via SMS.
 *
 * The balance fields are write-through caches — always current because
 * walletService updates them atomically with every transaction.
 */
const handleBalance = async (phone: string): Promise<void> => {
  try {
    const farmerUser = await User.findOne({ phone, role: UserRole.FARMER });
    if (!farmerUser) {
      await sendSMS(phone, 'AgriLink: Phone number not registered as a farmer.');
      return;
    }

    const farmer = await Farmer.findOne({ userId: farmerUser._id });
    if (!farmer) {
      await sendSMS(phone, 'AgriLink: Farmer profile not found.');
      return;
    }

    // Reply with both wallet balances
    await sendSMS(phone, SMS.balance(farmer.agriWalletBalance, farmer.cashWalletBalance));
  } catch (err) {
    console.error('[SMS:BAL]', err);
  }
};

// ─── REDEEM command ───────────────────────────────────────────────────────────

/**
 * handleRedeem — the most critical SMS handler.
 *
 * FLOW:
 *   1. Farmer texts: "REDEEM 4200 DEALER007"
 *   2. We validate the amount and find the farmer + dealer
 *   3. We check the farmer has enough Agri-Wallet balance
 *   4. We generate a 6-digit OTP (bcrypt hashed, stored in OTP collection)
 *   5. We SMS the plaintext OTP to the farmer
 *   6. Farmer reads the OTP aloud to the dealer
 *   7. Dealer enters it on the web portal → POST /dealer/redeem
 *   8. walletService.redeemAgriWallet() debits and marks OTP used atomically
 *
 * WHY VALIDATE BALANCE HERE?
 *   Even though walletService will check again via the $gte guard, we check
 *   here to give the farmer a helpful error SMS before generating an OTP
 *   they can't use. Better UX — no wasted OTP generation.
 */
const handleRedeem = async (phone: string, amountStr: string, dealerCode: string): Promise<void> => {
  try {
    // Validate amount is a positive integer
    const amount = parseInt(amountStr, 10);
    if (!amountStr || isNaN(amount) || amount <= 0) {
      await sendSMS(phone, 'AgriLink: Invalid amount. Send: REDEEM [amount] [dealerCode]');
      return;
    }

    if (!dealerCode) {
      await sendSMS(phone, 'AgriLink: Missing dealer code. Send: REDEEM [amount] [dealerCode]');
      return;
    }

    const farmerUser = await User.findOne({ phone, role: UserRole.FARMER });
    if (!farmerUser) {
      await sendSMS(phone, 'AgriLink: Phone not registered as a farmer.');
      return;
    }

    const farmer = await Farmer.findOne({ userId: farmerUser._id });
    if (!farmer) {
      await sendSMS(phone, 'AgriLink: Farmer profile not found.');
      return;
    }

    // Pre-check balance — wallet service will also check, but this gives better SMS error
    if (farmer.agriWalletBalance < amount) {
      await sendSMS(phone, `AgriLink: Insufficient Agri-Wallet balance. Your balance: ₦${farmer.agriWalletBalance}`);
      return;
    }

    // Verify the dealer exists and is active
    // Dealer is already imported at the top of the file — no dynamic import needed
    const dealer = await Dealer.findOne({ dealerCode: dealerCode.toUpperCase() });
    if (!dealer || dealer.status !== UserStatus.ACTIVE) {
      await sendSMS(phone, `AgriLink: Dealer code ${dealerCode} not found or inactive.`);
      return;
    }

    // Generate OTP — returns 6-digit plaintext, stores bcrypt hash
    const code = await generateOTP(farmer._id, dealer._id, amount);

    // Send plaintext OTP to farmer — this is the only time the code is transmitted in plain
    await sendSMS(phone, SMS.otpCode(code));
  } catch (err) {
    console.error('[SMS:REDEEM]', err);
    await sendSMS(phone, 'AgriLink: Could not process redemption. Please try again.').catch(() => {});
  }
};

// ─── WITHDRAW command ─────────────────────────────────────────────────────────

/**
 * handleWithdraw — records a cash withdrawal request.
 *
 * For hackathon: debits the wallet and records the request.
 * Admin processes withdrawals manually via the admin dashboard.
 *
 * In production: walletService.withdrawCash() would call OPay/Moniepoint API
 * and the farmer would receive cash via mobile money within minutes.
 */
const handleWithdraw = async (phone: string, amountStr: string): Promise<void> => {
  try {
    const amount = parseInt(amountStr, 10);
    if (!amountStr || isNaN(amount) || amount <= 0) {
      await sendSMS(phone, 'AgriLink: Invalid amount. Send: WITHDRAW [amount]');
      return;
    }

    const farmerUser = await User.findOne({ phone, role: UserRole.FARMER });
    if (!farmerUser) {
      await sendSMS(phone, 'AgriLink: Phone not registered as a farmer.');
      return;
    }

    const farmer = await Farmer.findOne({ userId: farmerUser._id });
    if (!farmer) {
      await sendSMS(phone, 'AgriLink: Farmer profile not found.');
      return;
    }

    // withdrawCash uses $gte guard — throws if balance is insufficient
    await withdrawCash(farmer._id, amount);
    await sendSMS(phone, SMS.withdrawPending(amount));
  } catch (err: any) {
    // Catch the specific "insufficient balance" error to send a helpful SMS
    if (err?.code === 'WALLET_INSUFFICIENT_BALANCE') {
      await sendSMS(phone, 'AgriLink: Insufficient cash wallet balance.').catch(() => {});
    } else {
      console.error('[SMS:WITHDRAW]', err);
    }
  }
};
