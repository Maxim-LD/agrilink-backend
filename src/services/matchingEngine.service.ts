import { Types } from 'mongoose';
import { Log, ILog } from '../models/Log';
import { StandingOrder } from '../models/StandingOrder';
import { Match } from '../models/Match';
import { Buyer } from '../models/Buyer';
import { Aggregator } from '../models/Aggregator';
import { User } from '../models/User';
import { LogStatus, MatchStatus, Pipeline } from '../types';
import { haversineKm } from '../utils/haversine';
import { sendSMS } from './sms.service';
import {
  SMS,
  PLATFORM_FEE_RATE,
  MATCH_SCORE_THRESHOLD,
  TRANSPORT_RATE_PER_KM,
  AGRI_WALLET_SPLIT,
} from '../constants';

/**
 * MATCHING ENGINE — HOW IT WORKS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Called immediately after a Log is created (fire-and-forget, not awaited).
 * Also called every 15 min by the matchingPoll cron job for pending logs.
 *
 * STEP 1 — Anchor orders (cold start strategy):
 *   Before running the scoring algorithm, we look for StandingOrders where
 *   isAnchor = true. Anchor orders are pre-seeded buyers who have agreed to
 *   always accept supply in a category. They skip all scoring and are matched
 *   immediately with score 100.
 *
 *   WHY ANCHORS?
 *   On Day 1 with no transaction history, our scoring algorithm has no real
 *   demand data. Anchors give us real matches immediately without pretending
 *   the ML model is smarter than it is. We're honest: "this is a rule on day 1."
 *
 * STEP 2 — Score regular orders:
 *   For non-anchor orders, we compute a composite score from three factors:
 *
 *   a) Proximity Score (40% weight):
 *      Haversine distance from log GPS to buyer GPS.
 *      Formula: Math.max(0, 100 - (distance_km / 100) * 100)
 *      → 0km away  = 100 points
 *      → 100km away = 0 points  (linear falloff, capped at 0)
 *
 *   b) Demand Score (30% weight):
 *      Hardcoded to 70 for all buyers on day 1.
 *      In production, this would come from historical order fill rates,
 *      seasonal demand curves, and buyer reliability scores.
 *      We're transparent about this in the pitch: "static proxy, upgrades at 500 txns."
 *
 *   c) Quantity Score (30% weight):
 *      How well the log's weight fits the buyer's minimum requirement.
 *      Formula: Math.min(log.weightKg / order.minQuantityKg, 1) * 100
 *      → Log exactly meets minimum: 100 points
 *      → Log exceeds minimum: capped at 100 (more is fine, not penalised)
 *      → Log is below minimum: filtered out before scoring (not a candidate)
 *
 *   composite = (proximityScore × 0.4) + (demandScore × 0.3) + (quantityScore × 0.3)
 *
 * STEP 3 — Filter and rank:
 *   Only orders with composite >= MATCH_SCORE_THRESHOLD (default 40) qualify.
 *   The highest scorer wins.
 *
 * STEP 4 — Create Match and notify:
 *   All payout fields are pre-computed and stored on the Match document.
 *   This avoids recalculation at confirmation time (prices are locked in).
 */
export const matchLog = async (logId: string): Promise<void> => {
  try {
    const log = await Log.findById(logId);

    // Exit early if log is no longer waiting — another process may have matched it
    if (!log || log.status !== LogStatus.PENDING_MATCH) return;

    // ── STEP 1: Try anchor orders first ──────────────────────────────────────
    // Anchors skip scoring entirely — they're guaranteed buyers for cold start
    const anchorOrder = await StandingOrder.findOne({
      pipeline:      log.pipeline,
      category:      log.category,       // exact category match (both lowercase)
      isAnchor:      true,
      isActive:      true,
      minQuantityKg: { $lte: log.weightKg }, // buyer's minimum ≤ available weight
    });

    if (anchorOrder) {
      // Anchor found — skip scoring, create match with score 100
      await createMatch(log, anchorOrder._id as Types.ObjectId, 100);
      return;
    }

    // ── STEP 2: Find and score regular standing orders ────────────────────────
    const orders = await StandingOrder.find({
      pipeline:      log.pipeline,
      category:      log.category,
      isAnchor:      false,
      isActive:      true,
      minQuantityKg: { $lte: log.weightKg }, // pre-filter: log must meet minimum weight
    });

    if (orders.length === 0) {
      await handleNoMatch(log);
      return;
    }

    const logLat = log.location.coordinates[1]; // lat is index 1 (GeoJSON is [lng, lat])
    const logLng = log.location.coordinates[0]; // lng is index 0

    // Score every candidate in parallel with Promise.all for speed
    const scored = await Promise.all(
      orders.map(async (order) => {
        const buyer = await Buyer.findById(order.buyerId);

        // Skip inactive buyers (e.g. suspended accounts)
        if (!buyer || buyer.status !== 'active') return null;

        const buyerLat = buyer.location.coordinates[1];
        const buyerLng = buyer.location.coordinates[0];

        // Distance between log and buyer in kilometres
        const dist = haversineKm(logLat, logLng, buyerLat, buyerLng);

        // Score components (see algorithm explanation above)
        const proximityScore = Math.max(0, 100 - (dist / 100) * 100);
        const demandScore    = 70; // static proxy — graduates to ML at 500 txns
        const quantityScore  = Math.min(log.weightKg / order.minQuantityKg, 1) * 100;

        // Weighted composite
        const composite = proximityScore * 0.4 + demandScore * 0.3 + quantityScore * 0.3;

        return { order, composite, dist };
      }),
    );

    // Filter out null results (inactive buyers) and below-threshold scores, then rank
    const candidates = scored
      .filter((s): s is NonNullable<typeof s> => s !== null && s.composite >= MATCH_SCORE_THRESHOLD)
      .sort((a, b) => b.composite - a.composite); // highest score first

    if (candidates.length === 0) {
      await handleNoMatch(log);
      return;
    }

    // Winner = highest composite score
    const winner = candidates[0];
    await createMatch(log, winner.order._id as Types.ObjectId, winner.composite);

  } catch (err) {
    // Matching is fire-and-forget — errors here should never crash the request
    console.error('[MatchingEngine] Error matching log', logId, err);
  }
};

// ─── Create the Match document and notify ─────────────────────────────────────

/**
 * createMatch — called once a winning StandingOrder is selected.
 *
 * Responsible for:
 *   1. Computing all money values (totalValue, platformFee, farmerNetPayout, etc.)
 *   2. Creating the Match document with those pre-computed values
 *   3. Updating the Log's status to MATCHED and linking it to the new Match
 *   4. Sending an SMS to the aggregator ("Match found!")
 *
 * NOTE: Buyer is NOT notified via SMS here — they see it on their dashboard.
 * SMS to buyer is a future enhancement (or can be added if the SMS gateway allows
 * business-initiated SMS to non-opted-in numbers in production).
 */
const createMatch = async (
  log:             ILog,
  standingOrderId: Types.ObjectId,
  score:           number,
): Promise<void> => {
  const order = await StandingOrder.findById(standingOrderId);
  if (!order) return;

  const buyer = await Buyer.findById(order.buyerId);
  if (!buyer) return;

  // Calculate distance (needed for transport cost on fresh produce)
  const logLat   = log.location.coordinates[1];
  const logLng   = log.location.coordinates[0];
  const buyerLat = buyer.location.coordinates[1];
  const buyerLng = buyer.location.coordinates[0];
  const dist     = haversineKm(logLat, logLng, buyerLat, buyerLng);

  // ── Pre-compute all money fields (locked in at match time) ─────────────────
  const totalValue    = order.pricePerKg * log.weightKg;       // Naira, kobo in production
  const platformFee   = Math.floor(totalValue * PLATFORM_FEE_RATE); // 5% revenue

  // Transport cost only applies to fresh produce (factory arranges own for waste)
  const transportCost = log.pipeline === Pipeline.FRESH_PRODUCE
    ? Math.round(dist * TRANSPORT_RATE_PER_KM) : 0;

  // Farmer's take-home after platform fee and their 50% share of transport
  const farmerNetPayout = totalValue - platformFee - Math.floor(transportCost / 2);

  // Waste pipeline: split net payout into Agri-Wallet (70%) and Cash Wallet (30%)
  const agriWalletCredit = log.pipeline === Pipeline.AGRI_WASTE
    ? Math.floor(farmerNetPayout * AGRI_WALLET_SPLIT) : undefined;
  const cashWalletCredit = log.pipeline === Pipeline.AGRI_WASTE && agriWalletCredit !== undefined
    ? farmerNetPayout - agriWalletCredit : undefined; // remainder, not Math.floor

  // Create the Match document with all pre-computed fields
  const match = await Match.create({
    pipeline:         log.pipeline,
    logId:            log._id,
    standingOrderId,
    buyerId:          order.buyerId,
    farmerId:         log.farmerId,
    matchScore:       Math.round(score),
    agreedPricePerKg: order.pricePerKg,
    totalValue,
    platformFee,
    transportCost:    transportCost > 0 ? transportCost : undefined,
    farmerNetPayout,
    agriWalletCredit,
    cashWalletCredit,
    status: MatchStatus.PENDING, // buyer must confirm
  });

  // Update Log: link to this Match and advance to MATCHED status
  await Log.findByIdAndUpdate(log._id, {
    status:  LogStatus.MATCHED,
    matchId: match._id, // so aggregator dashboard can populate match in one query
  });

  // Notify the aggregator via SMS (fire-and-forget — SMS failure is non-fatal)
  const aggregator = await Aggregator.findById(log.aggregatorId);
  if (aggregator) {
    const aUser = await User.findById(aggregator.userId);
    if (aUser) {
      sendSMS(aUser.phone, SMS.matchFound(buyer.companyName)).catch(() => {});
    }
  }

  console.log(`[MatchingEngine] Match created: log=${log._id} → match=${match._id} score=${Math.round(score)}`);
};

// ─── No match handler ─────────────────────────────────────────────────────────

/**
 * handleNoMatch — called when no candidate passes the score threshold.
 *
 * Sets log status to NO_MATCH and notifies the aggregator.
 * The matchingPoll cron will retry this log every 15 minutes automatically
 * in case a new StandingOrder is registered that matches.
 *
 * NOTE: We do NOT re-queue immediately here. The cron handles retries.
 * Re-queuing immediately would cause an infinite loop on a no-match log.
 */
const handleNoMatch = async (log: ILog): Promise<void> => {
  await Log.findByIdAndUpdate(log._id, { status: LogStatus.NO_MATCH });

  const aggregator = await Aggregator.findById(log.aggregatorId);
  if (aggregator) {
    const aUser = await User.findById(aggregator.userId);
    if (aUser) {
      sendSMS(aUser.phone, SMS.noMatch(log.category)).catch(() => {});
    }
  }

  console.log(`[MatchingEngine] No match found for log=${log._id}`);
};
