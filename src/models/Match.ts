import { Schema, model, Document, Types } from 'mongoose';
import { Pipeline, MatchStatus } from '../types';

/**
 * WHAT IS A MATCH?
 * ─────────────────────────────────────────────────────────────────────────────
 * A Match is created by the matching engine when it finds a suitable buyer
 * (StandingOrder) for a Log. It represents a PROPOSED DEAL between a farmer
 * and a buyer, pending the buyer's confirmation.
 *
 * Think of it as a "quote" that the buyer can accept or decline.
 *
 * HOW IT FITS IN THE FLOW:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   Aggregator submits Log
 *       │
 *       │  matchingEngine.matchLog() runs (async)
 *       │  → Finds best StandingOrder
 *       │  → PRE-COMPUTES all money fields (see below)
 *       │  → Creates this Match document
 *       │  → Updates Log.matchId = this Match._id
 *       │  → SMS aggregator "Match found"
 *       │
 *       ▼
 *   Match status: PENDING
 *   (buyer sees it on their dashboard — "You have a new match")
 *       │
 *       │  Buyer clicks "Confirm" on their dashboard
 *       │  POST /buyer/matches/:id/confirm
 *       │
 *       ▼
 *   Match status: CONFIRMED
 *   Wallet payment fires IMMEDIATELY:
 *     → Waste pipeline:   farmer.agriWalletBalance += agriWalletCredit (70%)
 *                         farmer.cashWalletBalance  += cashWalletCredit (30%)
 *     → Fresh produce:    farmer.cashWalletBalance  += farmerNetPayout (100% cash)
 *   → SMS farmer with payout breakdown
 *       │
 *       └──► Or buyer clicks "Decline" → Match status: DECLINED
 *                                        Log re-queued to PENDING_MATCH
 *
 * WHY PRE-COMPUTE MONEY FIELDS?
 * ─────────────────────────────────────────────────────────────────────────────
 * All money fields (totalValue, platformFee, farmerNetPayout, etc.) are
 * calculated ONCE when the Match is created, and stored on the Match.
 *
 * Benefits:
 *   1. The buyer dashboard shows the exact payout breakdown immediately —
 *      no recalculation needed at confirm time.
 *   2. The confirm endpoint just reads these stored values — no risk of
 *      recalculating with a different price if rates change between match
 *      creation and buyer confirmation.
 *   3. The farmer's SMS shows EXACT numbers — not estimates.
 *
 * PAYOUT FORMULA (Waste Pipeline):
 * ─────────────────────────────────────────────────────────────────────────────
 *   totalValue       = standingOrder.pricePerKg × log.weightKg
 *   platformFee      = totalValue × 5%           (platform revenue)
 *   farmerNetPayout  = totalValue − platformFee  (no transport cost for waste)
 *   agriWalletCredit = farmerNetPayout × 70%     (locked in — spent at agro-dealer)
 *   cashWalletCredit = farmerNetPayout × 30%     (withdrawn as cash)
 *
 * PAYOUT FORMULA (Fresh Produce):
 * ─────────────────────────────────────────────────────────────────────────────
 *   totalValue       = standingOrder.pricePerKg × log.weightKg
 *   platformFee      = totalValue × 5%
 *   transportCost    = distance_km × ₦50/km      (farmer and buyer share 50/50)
 *   farmerNetPayout  = totalValue − platformFee − (transportCost / 2)
 *   → 100% goes to farmer's cashWalletBalance
 *
 * DISPUTE HANDLING (simplified for hackathon):
 * ─────────────────────────────────────────────────────────────────────────────
 * We replaced the full Dispute model with just two fields on Match:
 *   isDisputed:   boolean  — admin sets this if there's a problem
 *   disputeReason: string  — what went wrong
 *
 * Admin resolves disputes manually via:
 *   POST /admin/matches/:id/flag-dispute    → sets isDisputed = true
 *   POST /admin/matches/:id/resolve-dispute → sets isDisputed = false
 *
 * In production, this would be a separate Dispute collection with escalation,
 * fund holds, and a proper resolution workflow.
 */

export interface IMatch extends Document {
  pipeline: Pipeline;
  logId: Types.ObjectId;
  standingOrderId: Types.ObjectId;
  buyerId: Types.ObjectId;
  farmerId: Types.ObjectId;

  /**
   * The matching engine's composite score for this match (0–100+).
   * Calculated from: proximity (40%) + demand proxy (30%) + quantity fit (30%).
   * Anchor orders always get score 100 (bypasses calculation).
   * Stored for transparency — visible on the admin dashboard.
   */
  matchScore: number;
  agreedPricePerKg: number; // Naira, kobo in production
  totalValue: number; // Naira, kobo in production

  /**
   * AgriLink's revenue from this transaction.
   * Formula: totalValue × PLATFORM_FEE_RATE (default 5%)
   * Unit: Naira. (kobo in production)
   */
  platformFee: number; // Naira, kobo in production
  transportCost?: number; // Naira, fresh produce only
  farmerNetPayout: number; // Naira, kobo in production
  agriWalletCredit?: number; // Naira, waste pipeline only
  cashWalletCredit?: number; // Naira, waste pipeline only
  status: MatchStatus;
  isDisputed: boolean;
  disputeReason?: string;

  /** Timestamp of when the buyer clicked "Confirm". Also the payment timestamp. */
  buyerConfirmedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const matchSchema = new Schema<IMatch>(
  {
    pipeline:        { type: String, enum: Object.values(Pipeline), required: true },

    // These three form the "core triangle" of every match:
    logId:           { type: Schema.Types.ObjectId, ref: 'Log', required: true },
    standingOrderId: { type: Schema.Types.ObjectId, ref: 'StandingOrder', required: true },
    buyerId:         { type: Schema.Types.ObjectId, ref: 'Buyer', required: true },
    farmerId:        { type: Schema.Types.ObjectId, ref: 'Farmer', required: true },

    // Score stored for audit/transparency — not used after match creation
    matchScore: { type: Number, required: true },

    // All money pre-computed at match creation time — see formula above
    agreedPricePerKg:  { type: Number, required: true },  // Naira, kobo in production
    totalValue:        { type: Number, required: true },  // Naira, kobo in production
    platformFee:       { type: Number, required: true },  // Naira, kobo in production
    transportCost:     { type: Number },                  // Naira, fresh produce only
    farmerNetPayout:   { type: Number, required: true },  // Naira, kobo in production
    agriWalletCredit:  { type: Number },                  // Naira, waste only
    cashWalletCredit:  { type: Number },                  // Naira, waste only

    // PENDING until buyer acts — moves to CONFIRMED or DECLINED
    status:     { type: String, enum: Object.values(MatchStatus), default: MatchStatus.PENDING },

    // Simplified dispute tracking — no separate Dispute collection for hackathon
    isDisputed:    { type: Boolean, default: false },
    disputeReason: { type: String },

    // Set together when buyer confirms. Both timestamps for audit trail.
    buyerConfirmedAt: { type: Date },
    completedAt:      { type: Date },
  },
  { timestamps: true }, // auto-adds createdAt, updatedAt
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Buyer dashboard query: "show me my matches filtered by status"
matchSchema.index({ buyerId: 1, status: 1 });

// Admin and farmer lookup: "show me all matches for this farmer"
matchSchema.index({ farmerId: 1 });

export const Match = model<IMatch>('Match', matchSchema);
