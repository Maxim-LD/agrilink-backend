import { TransactionType, WalletType } from '../types';

// ─── Fee Rates (all overridable via env) ─────────────────────────────────────

export const PLATFORM_FEE_RATE     = Number(process.env.PLATFORM_FEE_RATE)  || 0.05;
export const AGRI_WALLET_SPLIT     = Number(process.env.AGRI_WALLET_SPLIT)  || 0.70;
export const MATCH_SCORE_THRESHOLD = Number(process.env.MATCH_THRESHOLD)    || 40;
export const TRANSPORT_RATE_PER_KM = 50; // ₦50/km — hardcoded for hackathon

// ─── Shelf life for fresh produce spoilage clock ─────────────────────────────

export const SHELF_LIFE_HOURS: Record<string, number> = {
  tomatoes:      48,
  pepper:        72,
  leafy_greens:  24,
  fresh_cassava: 36,
  other:         48,
  // Agri-waste has no shelf life — spoilageDeadline is not set
};

// ─── SMS Message Templates ───────────────────────────────────────────────────

export const SMS = {
  matchFound: (company: string) =>
    `AgriLink: Match found! Buyer: ${company}. Check your dashboard.`,

  matchConfirmedWaste: (company: string, agri: number, cash: number) =>
    `AgriLink: ${company} confirmed your waste pickup. ₦${agri} → Agri-Wallet. ₦${cash} → Cash Wallet.`,

  matchConfirmedProduce: (company: string, net: number) =>
    `AgriLink: Produce sold to ${company}. ₦${net} added to your Cash Wallet.`,

  otpCode: (code: string) =>
    `AgriLink OTP: ${code}. Valid 10 mins. Share ONLY with your verified agro-dealer.`,

  redemptionDone: (amount: number, shop: string) =>
    `AgriLink: ₦${amount} redeemed at ${shop}. Farm inputs secured. `,

  balance: (agri: number, cash: number) =>
    `AgriLink — Agri-Wallet: ₦${agri} | Cash Wallet: ₦${cash}`,

  withdrawPending: (amount: number) =>
    `AgriLink: ₦${amount} withdrawal recorded. Our team will process it shortly.`,

  noMatch: (category: string) =>
    `AgriLink: No buyer match found for your ${category} log. Our team will follow up.`,

  expired: (category: string) =>
    `AgriLink: Your ${category} log has expired without a match. Log again when ready.`,

  forecastDemo: () =>
    `AgriLink Advisory: Tomato demand from Lagos restaurants is up 40% this season. Suggested planting window: March 1–15.`,

  spoilageAlert: (category: string, price: number) =>
    `AgriLink CLEARANCE: ${category} nearing spoilage. Sent to community buyers at ₦${price}/kg (30% off).`,

  unknownCommand: () =>
    `AgriLink: Unknown command. Available: BAL | REDEEM [amount] [dealerCode] | WITHDRAW [amount]`,
};

// ─── Transaction reference generator ─────────────────────────────────────────

export const generateRef = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
