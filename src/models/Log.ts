import { Schema, model, Document, Types } from 'mongoose';
import { Pipeline, LogStatus, SpoilageUrgencyTier } from '../types';

/**
 * WHAT IS A LOG?
 * ─────────────────────────────────────────────────────────────────────────────
 * A Log is a physical produce/waste entry created by an Aggregator on behalf
 * of a Farmer. Think of it as a "listing" in the marketplace.
 *
 * There are TWO types of Log, determined by the `pipeline` field:
 *
 *   1. FRESH_PRODUCE  — tomatoes, pepper, leafy greens, etc.
 *      The farmer harvested something and wants to sell it to a restaurant
 *      or food buyer before it spoils. Time is critical here.
 *      → Has a spoilageDeadline. The cron job marks it EXPIRED if unsold.
 *
 *   2. AGRI_WASTE     — cassava peel, corn chaff, groundnut shells, etc.
 *      By-products that factories (e.g. starch plants) buy as raw material.
 *      These don't expire the same way, so spoilageDeadline is never set.
 *
 * LIFECYCLE OF A LOG:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   PENDING_MATCH
 *       │
 *       │  matching engine runs (immediately after creation + every 15 min)
 *       │
 *       ├──► MATCHED ──► (buyer sees it on dashboard)
 *       │                     │
 *       │                     │  buyer clicks "Confirm" on dashboard
 *       │                     │
 *       │                     ▼
 *       │              CONFIRMED (wallet split fires here — payout done)
 *       │
 *       ├──► NO_MATCH  (no suitable buyer found after all retries)
 *       │
 *       ├──► DECLINED  (buyer declined — log re-queued back to PENDING_MATCH)
 *       │
 *       └──► EXPIRED   (fresh produce past spoilageDeadline — cron marks this)
 *
 * KEY DESIGN DECISION:
 *   We store matchId on the Log so the frontend can do a single Log query
 *   and immediately get the associated Match (using .populate('matchId')).
 *   Without this, you'd need two queries.
 */

export interface ILog extends Document {
  pipeline: Pipeline;
  aggregatorId: Types.ObjectId;
  farmerId: Types.ObjectId;

  /**
   * Type of produce or waste. Always stored lowercase.
   * e.g. 'tomatoes', 'cassava_peel', 'leafy_greens', 'corn_chaff'
   * The matching engine uses this to find StandingOrders with the same category.
   */
  category: string;
  weightKg: number;

  /**
   * Physical condition of the produce at the time of logging.
   * Fresh produce: 'fresh' | 'slightly_bruised' | 'poor'
   * Agri-waste:    'dry' | 'damp' | 'wet'
   * Stored for buyer reference — not used in matching logic for hackathon.
   */
  condition: string;

  /**
   * GPS coordinates of where the produce is being held (usually the aggregator's
   * collection point or the farm itself).
   *
   * IMPORTANT: MongoDB GeoJSON uses [longitude, latitude] order — NOT the
   * typical [lat, lng] you see in Google Maps. This trips people up constantly.
   * coordinates[0] = longitude (the X axis / east-west)
   * coordinates[1] = latitude  (the Y axis / north-south)
   *
   * We have a 2dsphere index on this field. That's what allows the matching
   * engine to do distance calculations efficiently.
   */
  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude] — lng first!
  };
  photoUrl: string;

  /**
   * When the produce was actually harvested. Entered by the aggregator.
   * This is the START of the spoilage clock for fresh produce:
   *   spoilageDeadline = harvestedAt + SHELF_LIFE_HOURS[category] hours
   *
   * For agri-waste, this is still recorded but has no expiry consequence.
   */
  harvestedAt: Date;

  /**
   * FRESH PRODUCE ONLY.
   * The point in time after which this log should be marked EXPIRED
   * if no buyer has confirmed it.
   *
   * Computed at log creation time:
   *   spoilageDeadline = harvestedAt + SHELF_LIFE_HOURS[category] * 3,600,000ms
   *
   * The spoilageExpiry cron job (runs every 30 min) checks all active fresh
   * produce logs and marks expired ones.
   *
   * Undefined for agri-waste logs — factories don't care about spoilage.
   */
  spoilageDeadline?: Date;

  /**
   * Simple boolean flag set to true when a fresh produce log has passed its
   * spoilageDeadline without being confirmed by a buyer.
   *
   * WHY A BOOLEAN AND NOT A TIER?
   * We originally had a 3-tier system (GREEN/AMBER/RED) that would trigger
   * price discounts as the deadline approached. That required continuous
   * recalculation and a state machine — too complex for a hackathon.
   *
   * Instead: once this is true, the log is just expired. No repricing.
   * Admin can use POST /admin/demo/simulate-spoilage/:logId to trigger this
   * manually during the demo pitch.
   */
  isExpired: boolean;

  /**
   * Current lifecycle stage of this log.
   * See the lifecycle diagram in the comment at the top of this file.
   *
   * The matching engine sets this to MATCHED when a buyer is found.
   * The buyer's confirm action sets it to CONFIRMED (and triggers payout).
   * The cron job sets it to EXPIRED when past the deadline.
   */
  status: LogStatus;

  /**
   * Set by the matching engine once a Match document is created.
   * Null/undefined while the log is PENDING_MATCH or NO_MATCH.
   *
   * Having this on the Log means the aggregator's dashboard can do:
   *   GET /aggregator/logs?populate=matchId
   * and get both the log data AND the match (payout preview) in one request.
   */
  matchId?: Types.ObjectId;

  /**
   * FRESH PRODUCE ONLY — computed from spoilageDeadline at log creation.
   * Updated by the spoilageExpiry cron when a log ages into a lower tier.
   *
   *   GREEN : 48+ hours remaining — standard matching, no price change
   *   AMBER : 12–48 hours remaining — 10% urgency price discount, higher match priority
   *   RED   : under 12 hours — 20% discount, community fallback queued
   *
   * Undefined for agri-waste logs.
   */
  urgencyTier?: SpoilageUrgencyTier;

  /**
   * AGRI_WASTE ONLY — generated at log creation time.
   * Alphanumeric reference for the QR Collection Ticket (e.g. 'AGRI-AB12CD').
   * Used as verbal fallback when the QR code cannot be scanned.
   */
  collectionRef?: string;

  /**
   * AGRI_WASTE ONLY — JSON string payload encoded into the QR Collection Ticket.
   * Contains: logId, collectionRef, category, weightKg, condition, zone, farmerMasked.
   * The frontend encodes this into an actual QR image; we just store the data.
   */
  qrPayload?: string;

  createdAt: Date;
  updatedAt: Date;
}

const logSchema = new Schema<ILog>(
  {
    pipeline:     { type: String, enum: Object.values(Pipeline), required: true },
    aggregatorId: { type: Schema.Types.ObjectId, ref: 'Aggregator', required: true },
    farmerId:     { type: Schema.Types.ObjectId, ref: 'Farmer', required: true },
    category:     { type: String, required: true, trim: true, lowercase: true },
    weightKg:     { type: Number, required: true, min: 0.1 },
    condition:    { type: String, required: true },
    location: {
      type:        { type: String, enum: ['Point'], required: true },
      coordinates: { type: [Number], required: true }, // [lng, lat] — lng first!
    },

    photoUrl:         { type: String, required: true },
    harvestedAt:      { type: Date, required: true },
    spoilageDeadline: { type: Date },
    isExpired: { type: Boolean, default: false },
    status:  { type: String, enum: Object.values(LogStatus), default: LogStatus.PENDING_MATCH },
    // Null until a Match document is created by the matching engine
    matchId: { type: Schema.Types.ObjectId, ref: 'Match' },

    // Fresh produce only — computed from spoilageDeadline at log creation
    urgencyTier: { type: String, enum: Object.values(SpoilageUrgencyTier) },

    // Waste pipeline only — QR Collection Ticket fields (generated at log creation)
    collectionRef: { type: String },
    qrPayload:     { type: String },
  },
  { timestamps: true },
);

logSchema.index({ location: '2dsphere' });
logSchema.index({ status: 1, pipeline: 1 });

export const Log = model<ILog>('Log', logSchema);
