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
import { MockSMS } from '../models/MockSMS';
import { getSimulatorHTML } from '../utils/simulator_template';

/**
 * INBOUND SMS WEBHOOK
 * ─────────────────────────────────────────────────────────────────────────────
 * Telnyx (or Vonage) calls this URL whenever a farmer sends an SMS
 * to our virtual number/shortcode.
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
 * CRITICAL: Always return 200 immediately — SMS gateways retry on non-200.
 *   Retries would send duplicate SMS replies/OTPs to farmers. Return 200 first,
 *   then run handlers asynchronously.
 */
export const inboundSMS = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Support Telnyx (data.payload.from.phone_number, data.payload.text) and Vonage (msisdn, text) payloads, checking query params as well
    const rawPhone = req.body.data?.payload?.from?.phone_number ?? req.body.msisdn ?? req.query.msisdn ?? req.body.from ?? req.query.from ?? '';
    let phone = String(rawPhone).trim();
    if (phone && !phone.startsWith('+')) {
      phone = '+' + phone;
    }

    const rawBody = req.body.data?.payload?.text ?? req.body.text ?? req.query.text ?? '';
    const body = String(rawBody).trim().toUpperCase();

    // Always log to MockSMS for simulator
    if (phone && rawBody) {
      await MockSMS.create({
        phone,
        message: rawBody,
        direction: 'inbound',
      }).catch((err) => {
        console.error('[MockSMS Log Inbound Error]', err);
      });
    }

    // ── CRITICAL: Return 200 BEFORE running handlers ──────────────────────
    // The gateway considers the webhook delivered once it receives 200.
    // Everything after this line is fire-and-forget — they don't wait.
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


// ─── Simulator Actions ───────────────────────────────────────────────────────

/**
 * getSimulatorUI - renders the HTML dashboard for the simulator.
 */
export const getSimulatorUI = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const html = getSimulatorHTML();
    res.setHeader('Content-Type', 'text/html');
    
    // Override strict CSP headers (e.g., from Helmet) to allow inline scripts and styles for the simulator
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self';"
    );

    res.status(200).send(html);
  } catch (err) {
    next(err);
  }
};

/**
 * getSimulatorFarmers - returns a list of registered farmers with their phone numbers and balances.
 */
export const getSimulatorFarmers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const allUsers = await User.find();
   
    // Retrieve users with role FARMER, regardless of status for simulator access
    const farmerUsers = await User.find({ role: UserRole.FARMER });
    console.log(`[Simulator Debug] Found ${farmerUsers.length} users with role FARMER`);

    const result = [];

    for (const user of farmerUsers) {
      let farmer = await Farmer.findOne({ userId: user._id });
      if (!farmer) {
        console.log(`[Simulator Debug] User ${user.phone} (${user.fullName}) has no Farmer profile. Creating one...`);
        farmer = await Farmer.create({
          userId: user._id,
          zone: 'Ibadan North',
          agriWalletBalance: 0,
          cashWalletBalance: 0
        });
      }

      result.push({
        fullName:    user.fullName,
        phone:       user.phone,
        agriWallet:  farmer.agriWalletBalance,
        cashWallet:  farmer.cashWalletBalance,
      });
    }

    console.log(`[Simulator Debug] Returning ${result.length} farmers to simulator`);
    res.status(200).json(result);
  } catch (err) {
    console.error('[Simulator Debug Error]', err);
    next(err);
  }
};

/**
 * getMockSMSHistory - retrieves the conversation logs for a given phone number.
 */
export const getMockSMSHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone } = req.params;
    if (!phone) {
      res.status(400).json({ error: 'Phone number parameter is required' });
      return;
    }

    // Sort by timestamp: 1 to get chronological conversation history
    const logs = await MockSMS.find({ phone }).sort({ timestamp: 1 });
    res.status(200).json(logs);
  } catch (err) {
    next(err);
  }
};
