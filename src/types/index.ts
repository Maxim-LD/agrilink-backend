// ─── Enums ───────────────────────────────────────────────────────────────────
//
// Enums are used instead of raw strings everywhere in the codebase.
// This means TypeScript will catch typos at compile time:
//   pipeline: 'fresh_prodce'  ← TypeScript error (typo)
//   pipeline: Pipeline.FRESH_PRODUCE  ← correct
//

export enum UserRole {
  FARMER     = 'farmer',      // phone-only users; never log in via JWT
  AGGREGATOR = 'aggregator',  // field agents who submit logs
  DEALER     = 'dealer',      // agro-input shop owners who process wallet redemptions
  BUYER      = 'buyer',       // factories (waste) or restaurants (fresh produce)
  ADMIN      = 'admin',       // platform operators; manage approvals and disputes
}

export enum UserStatus {
  PENDING   = 'pending',    // newly registered — awaiting admin approval
  ACTIVE    = 'active',     // approved and can use the platform
  SUSPENDED = 'suspended',  // blocked by admin; cannot log in or transact
}

export enum BuyerType {
  FACTORY    = 'factory',    // buys agri-waste (e.g. cassava peel → starch)
  RESTAURANT = 'restaurant', // buys fresh produce (e.g. tomatoes, pepper)
}

export enum Pipeline {
  FRESH_PRODUCE = 'fresh_produce', // perishable food items; has spoilage clock
  AGRI_WASTE    = 'agri_waste',    // factory by-products; no spoilage deadline
}

/**
 * Three-tier spoilage urgency for fresh produce logs.
 * Calculated from hoursRemaining = (spoilageDeadline - now) / 3,600,000
 *   GREEN : 48+ hours  — standard matching, no price change
 *   AMBER : 12–48 hrs  — urgency pricing activates (10% discount)
 *   RED   : < 12 hrs   — maximum discount (20%), community fallback queued
 */
export enum SpoilageUrgencyTier {
  GREEN = 'green',
  AMBER = 'amber',
  RED   = 'red',
}

/**
 * Logistics mode chosen by the restaurant buyer at match confirmation.
 *   PLATFORM : AgriLink books courier — transport cost split 50/50 between
 *              restaurant and farmer. Farmer's payout is reduced by 50% of cost.
 *   SELF     : Restaurant self-arranges pickup — no platform transport fee,
 *              farmer receives full net payout (totalValue − platformFee).
 */
export enum LogisticsMode {
  PLATFORM = 'platform',
  SELF     = 'self',
}

export enum LogStatus {
  // Freshly submitted — matching engine hasn't run yet, or ran and is retrying
  PENDING_MATCH = 'pending_match',

  // Matching engine found a buyer and created a Match document
  MATCHED       = 'matched',

  // Buyer confirmed the match → wallet payment fired → deal done
  CONFIRMED     = 'confirmed',

  // Matching engine exhausted all candidates — no suitable buyer found
  NO_MATCH      = 'no_match',

  // Fresh produce log that passed its spoilageDeadline without being confirmed
  // Set by the spoilageExpiry cron job (runs every 30 min)
  EXPIRED       = 'expired',

  // Buyer declined the proposed match — log is re-queued to PENDING_MATCH
  DECLINED      = 'declined',
}

export enum MatchStatus {
  PENDING         = 'pending',          // match created — awaiting buyer decision
  STAGE1_RELEASED = 'stage1_released',  // waste only: 10% advance paid, awaiting QR goods-in scan
  CONFIRMED       = 'confirmed',        // restaurant: 100% payout fired immediately
  COLLECTED       = 'collected',        // waste only: QR scanned, Stage 2 (90%) payout fired
  DECLINED        = 'declined',         // buyer declined — log re-queued for re-matching
  DISPUTED        = 'disputed',         // weight discrepancy or admin flag — funds on hold
}

export enum TransactionType {
  // Waste pipeline — Stage 1: 10% advance paid when factory confirms match
  STAGE1_ADVANCE    = 'stage1_advance',

  // Waste pipeline — Stage 2: remaining 90% paid when factory scans QR goods-in
  STAGE2_PAYOUT     = 'stage2_payout',

  // Legacy: kept for backward-compat with existing waste_payout records
  WASTE_PAYOUT      = 'waste_payout',

  // Farmer receives payment when restaurant confirms a fresh produce match (100% instant)
  PRODUCE_PAYOUT    = 'produce_payout',

  // Farmer spends Agri-Wallet balance at an agro-dealer shop (OTP redemption)
  WALLET_REDEMPTION = 'wallet_redemption',

  // Farmer withdraws Cash Wallet balance via OPay/Moniepoint (mocked for hackathon)
  CASH_WITHDRAWAL   = 'cash_withdrawal',
}

export enum WalletType {
  // Locked wallet — can only be spent at registered agro-dealers via OTP
  // Receives 70% of waste pipeline payouts
  AGRI = 'agri_wallet',

  // Spendable wallet — can be withdrawn as cash
  // Receives 30% of waste payouts, or 100% of fresh produce payouts
  CASH = 'cash_wallet',
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

/**
 * The payload encoded inside every JWT token.
 * After authenticate() middleware runs, req.user contains this object.
 * Use req.user.id to find the User document, req.user.role for authorization.
 */
export interface JwtPayload {
  id:    string;   // User._id as string
  role:  UserRole;
  phone: string;
}

/**
 * A single financial transaction entry stored inside a Farmer's document.
 * We embed up to 50 transactions directly on the Farmer (instead of a
 * separate Transactions collection) for faster dashboard reads.
 *
 * WHY EMBEDDED?
 * The farmer dashboard needs recent transactions — and for a hackathon, a
 * $slice of the last 50 embedded entries is much faster than a join query
 * against a separate collection.
 *
 * WHY ONLY 50?
 * We cap it with $slice: -50 on every write. In production, old transactions
 * would be archived to a separate collection once the embedded array fills up.
 */
export interface EmbeddedTransaction {
  type:        TransactionType;
  wallet:      WalletType;
  direction:   'credit' | 'debit';
  amountNaira: number; // store as kobo in production — multiply by 100
  matchId?:    string; // links this transaction back to the Match that caused it
  reference:   string; // unique ID for idempotency (prevents duplicate payouts)
  createdAt:   Date;
}

// ─── Express augmentation ─────────────────────────────────────────────────────

/**
 * This extends Express's built-in Request type to add our `user` property.
 * Without this, TypeScript would error when you write req.user.id.
 *
 * It's declared globally so you don't need to import it in every file —
 * any file that imports from 'express' gets this augmentation automatically.
 */
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload; // set by authenticate() middleware
    }
  }
}
