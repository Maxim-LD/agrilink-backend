import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import Joi from 'joi';
import { User } from '../models/User';
import { Buyer } from '../models/Buyer';
import { StandingOrder } from '../models/StandingOrder';
import { Match } from '../models/Match';
import { Log } from '../models/Log';
import { Farmer } from '../models/Farmer';
import { AppError } from '../utils/AppError';
import { ok } from '../utils/response';
import { splitPayout, creditCash, releaseStage1, releaseStage2 } from '../services/wallet.service';
import { sendSMS } from '../services/sms.service';
import { matchLog } from '../services/matchingEngine.service';
import { UserRole, UserStatus, BuyerType, Pipeline, MatchStatus, LogStatus, LogisticsMode } from '../types';
import { SMS, AGRI_WALLET_SPLIT, WEIGHT_DISCREPANCY_THRESHOLD } from '../constants';

const BCRYPT_ROUNDS = 10;

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const registerBuyerSchema = Joi.object({
  phone:         Joi.string().pattern(/^\+[1-9]\d{1,14}$/).required(),
  fullName:      Joi.string().min(2).required(),
  password:      Joi.string().min(6).required(),
  buyerType:     Joi.string().valid(...Object.values(BuyerType)).required(),
  companyName:   Joi.string().required(),
  address:       Joi.string().required(),
  latitude:      Joi.number().min(-90).max(90).required(),
  longitude:     Joi.number().min(-180).max(180).required(),
  logisticsMode: Joi.string().valid('mode_a', 'mode_b'),
  contactName:   Joi.string().required(),
  contactPhone:  Joi.string().required(),
});

export const standingOrderSchema = Joi.object({
  pipeline:      Joi.string().valid(...Object.values(Pipeline)).required(),
  category:      Joi.string().required(),
  minQuantityKg: Joi.number().min(0.1).required(),
  maxQuantityKg: Joi.number().min(0.1),
  pricePerKg:    Joi.number().min(1).required(),
  isAnchor:      Joi.boolean().default(false),
});

// ─── Register ─────────────────────────────────────────────────────────────────

export const registerBuyer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { 
      phone, 
      fullName, 
      password, 
      buyerType, 
      companyName, 
      address, 
      latitude, 
      longitude, 
      logisticsMode, 
      contactName, 
      contactPhone 
    } = req.body;

    const existing = await User.findOne({ phone });
    if (existing) return next(new AppError('Phone already registered', 409, 'PHONE_TAKEN'));

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({ phone, fullName, role: UserRole.BUYER, buyerType, status: UserStatus.PENDING, passwordHash });
    await Buyer.create({
      userId: user._id, buyerType, companyName, address,
      location: { type: 'Point', coordinates: [longitude, latitude] },
      logisticsMode, contactName, contactPhone,
      status: UserStatus.PENDING,
    });

    ok(res, { message: 'Registration submitted. Awaiting admin approval.' }, 201);
  } catch (err) { next(err); }
};

// ─── Profile ──────────────────────────────────────────────────────────────────

export const getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const buyer = await Buyer
      .findOne({ userId: req.user!.id })
      .populate('userId', 'fullName phone status');

    if (!buyer) return next(new AppError('Buyer not found', 404, 'NOT_FOUND'));
    ok(res, buyer);
  } catch (err) { next(err); }
};

// ─── Standing Orders ──────────────────────────────────────────────────────────

export const createOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const buyer = await Buyer.findOne({ userId: req.user!.id });
    if (!buyer) return next(new AppError('Buyer not found', 404, 'NOT_FOUND'));

    const order = await StandingOrder.create({
      ...req.body,
      buyerId: buyer._id,
      category: req.body.category.toLowerCase()
    });

    ok(res, order, 201);
  } catch (err) { next(err); }
};

export const getOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const buyer = await Buyer.findOne({ userId: req.user!.id });
    if (!buyer) return next(new AppError('Buyer not found', 404, 'NOT_FOUND'));

    const orders = await StandingOrder
      .find({ buyerId: buyer._id })
      .sort({ createdAt: -1 });

    ok(res, orders);
  } catch (err) { next(err); }
};

// ─── Matches ──────────────────────────────────────────────────────────────────

export const getMatches = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const buyer = await Buyer.findOne({ userId: req.user!.id });
    if (!buyer) return next(new AppError('Buyer not found', 404, 'NOT_FOUND'));

    const { status, page = 1, limit = 20 } = req.query;
    const filter: Record<string, unknown> = { buyerId: buyer._id };
    if (status) filter.status = status;

    const matches = await Match.find(filter)
      .populate('logId')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    ok(res, matches);
    
  } catch (err) { next(err); }
};

export const getMatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const buyer = await Buyer.findOne({ userId: req.user!.id });
    if (!buyer) return next(new AppError('Buyer not found', 404, 'NOT_FOUND'));

    const match = await Match.findOne({ _id: req.params.id, buyerId: buyer._id }).populate('logId farmerId');
    if (!match) return next(new AppError('Match not found', 404, 'NOT_FOUND'));
    ok(res, match);
  } catch (err) { next(err); }
};

// ─── Confirm Match (payment trigger) ─────────────────────────────────────────

export const confirmMatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const buyer = await Buyer.findOne({ userId: req.user!.id });
    if (!buyer) return next(new AppError('Buyer not found', 404, 'NOT_FOUND'));

    const match = await Match.findOne({ _id: req.params.id, buyerId: buyer._id });
    if (!match) return next(new AppError('Match not found', 404, 'NOT_FOUND'));
    if (match.status !== MatchStatus.PENDING) return next(new AppError('Match already processed', 400, 'MATCH_ALREADY_PROCESSED'));

    const farmer = await Farmer.findById(match.farmerId);
    const farmerUser = farmer ? await User.findById(farmer.userId) : null;

    if (match.pipeline === Pipeline.AGRI_WASTE) {
      // ── Waste pipeline: Stage 1 advance (10%) only ───────────────────────────
      // Stage 2 (90%) fires later when factory scans the QR goods-in ticket.
      await releaseStage1(match);

      match.status           = MatchStatus.STAGE1_RELEASED;
      match.buyerConfirmedAt = new Date();
      match.stage1PaidAt     = new Date();
      await match.save();

      // Log stays MATCHED — not CONFIRMED until Stage 2 (goods-in QR scan)
      await Log.findByIdAndUpdate(match.logId, { status: LogStatus.MATCHED });

      if (farmerUser && match.stage1Amount !== undefined) {
        const stage1AgriCredit = Math.floor(match.stage1Amount * AGRI_WALLET_SPLIT);
        const stage1CashCredit = match.stage1Amount - stage1AgriCredit;
        sendSMS(
          farmerUser.phone,
          SMS.stage1Released(buyer.companyName, stage1AgriCredit, stage1CashCredit),
        ).catch(() => {});
      }
    } else {
      // ── Fresh produce: 100% cash payout (instant, no staging) ───────────────
      const { logisticsMode } = req.body as { logisticsMode?: LogisticsMode };

      // Mode B (self-arrange): farmer doesn't pay transport cost
      // Mode A (platform): farmerNetPayout already deducts the farmer's 50% share
      const actualPayout = logisticsMode === LogisticsMode.SELF && match.transportCost
        ? match.totalValue - match.platformFee   // no transport deduction for farmer
        : match.farmerNetPayout;                 // Mode A default (pre-computed)

      await creditCash({ ...match.toObject(), farmerNetPayout: actualPayout } as any);

      match.status           = MatchStatus.CONFIRMED;
      match.buyerConfirmedAt = new Date();
      match.completedAt      = new Date();
      match.logisticsMode    = logisticsMode ?? LogisticsMode.PLATFORM;
      await match.save();

      await Log.findByIdAndUpdate(match.logId, { status: LogStatus.CONFIRMED });

      if (farmerUser) {
        sendSMS(farmerUser.phone, SMS.matchConfirmedProduce(buyer.companyName, actualPayout)).catch(() => {});
      }
    }

    ok(res, {
      match,
      payoutBreakdown: {
        totalValue:       match.totalValue,
        platformFee:      match.platformFee,
        transportCost:    match.transportCost,
        farmerNetPayout:  match.farmerNetPayout,
        stage1Amount:     match.stage1Amount,
        stage2Amount:     match.stage2Amount,
        agriWalletCredit: match.agriWalletCredit,
        cashWalletCredit: match.cashWalletCredit,
      },
    });
  } catch (err) { next(err); }
};


// ─── Decline Match ────────────────────────────────────────────────────────────

export const declineMatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const buyer = await Buyer.findOne({ userId: req.user!.id });
    if (!buyer) return next(new AppError('Buyer not found', 404, 'NOT_FOUND'));

    const match = await Match.findOne({ _id: req.params.id, buyerId: buyer._id });
    if (!match) return next(new AppError('Match not found', 404, 'NOT_FOUND'));
    if (match.status !== MatchStatus.PENDING) return next(new AppError('Match already processed', 400, 'MATCH_ALREADY_PROCESSED'));

    const { reason } = req.body as { reason?: string };

    match.status = MatchStatus.DECLINED;
    if (reason) match.declineReason = reason;
    await match.save();

    // Re-queue log for matching
    await Log
      .findByIdAndUpdate(
        match.logId,
        { status: LogStatus.PENDING_MATCH, matchId: null }
      );
    matchLog(String(match.logId)).catch(() => {});

    ok(res, { message: 'Match declined. Log re-queued for matching.', declineReason: reason ?? null });
  } catch (err) { next(err); }
};

// ─── QR Goods-In Scan (Factory only — triggers Stage 2 payout) ────────────────────

/**
 * scanGoodsIn — called when a factory operative scans the QR code at the goods-in gate.
 *
 * WHAT IT DOES:
 *   1. Verifies the match is in STAGE1_RELEASED state
 *   2. Checks the weight entered against the logged weight (>15% diff → DISPUTED)
 *   3. Releases Stage 2 payout (90% of farmerNetPayout, 70/30 agri/cash split)
 *   4. Sets match status to COLLECTED and log status to CONFIRMED
 *   5. SMS farmer with Stage 2 payout breakdown
 *
 * ROUTE: POST /api/v1/buyer/matches/:id/goods-in
 * BODY:  { receivedWeightKg: number }
 * GUARD: Buyer must be a factory (BuyerType.FACTORY)
 */
export const scanGoodsIn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const buyer = await Buyer.findOne({ userId: req.user!.id });
    if (!buyer) return next(new AppError('Buyer not found', 404, 'NOT_FOUND'));

    if ((buyer as any).buyerType !== BuyerType.FACTORY) {
      return next(new AppError('Only factory buyers can perform goods-in scanning', 403, 'FORBIDDEN'));
    }

    const match = await Match.findOne({ _id: req.params.id, buyerId: buyer._id });
    if (!match) return next(new AppError('Match not found', 404, 'NOT_FOUND'));
    if (match.status !== MatchStatus.STAGE1_RELEASED) {
      return next(new AppError(
        `Match must be in 'stage1_released' state to perform goods-in scan (current: ${match.status})`,
        400,
        'INVALID_MATCH_STATE',
      ));
    }

    const { receivedWeightKg } = req.body as { receivedWeightKg: number };
    if (!receivedWeightKg || receivedWeightKg <= 0) {
      return next(new AppError('receivedWeightKg is required and must be a positive number', 400, 'VALIDATION_ERROR'));
    }

    // Get the original logged weight for discrepancy check
    const log = await Log.findById(match.logId);
    if (!log) return next(new AppError('Log not found', 404, 'NOT_FOUND'));

    const discrepancyRatio = Math.abs(receivedWeightKg - log.weightKg) / log.weightKg;

    if (discrepancyRatio > WEIGHT_DISCREPANCY_THRESHOLD) {
      // Weight discrepancy exceeds 15% — block Stage 2, flag for admin review
      match.status          = MatchStatus.DISPUTED;
      match.receivedWeightKg = receivedWeightKg;
      match.isDisputed      = true;
      match.disputeReason   = `Weight discrepancy: logged ${log.weightKg}kg, received ${receivedWeightKg}kg (${Math.round(discrepancyRatio * 100)}% difference exceeds 15% threshold). Admin must resolve.`;
      await match.save();

      return next(new AppError(
        `Weight discrepancy of ${Math.round(discrepancyRatio * 100)}% exceeds 15% threshold (logged: ${log.weightKg}kg, received: ${receivedWeightKg}kg). Stage 2 payout blocked. Match flagged for admin review.`,
        400,
        'WEIGHT_DISCREPANCY',
      ));
    }

    // Weight is within tolerance — release Stage 2 (90%)
    await releaseStage2(match);

    match.status          = MatchStatus.COLLECTED;
    match.receivedWeightKg = receivedWeightKg;
    match.stage2PaidAt    = new Date();
    match.completedAt     = new Date();
    await match.save();

    await Log.findByIdAndUpdate(match.logId, { status: LogStatus.CONFIRMED });

    // Notify farmer of Stage 2 payout
    const farmer = await Farmer.findById(match.farmerId);
    const farmerUser = farmer ? await User.findById(farmer.userId) : null;
    if (farmerUser && match.stage2Amount !== undefined) {
      const stage2AgriCredit = Math.floor(match.stage2Amount * AGRI_WALLET_SPLIT);
      const stage2CashCredit = match.stage2Amount - stage2AgriCredit;
      sendSMS(
        farmerUser.phone,
        SMS.stage2Released(buyer.companyName, stage2AgriCredit, stage2CashCredit),
      ).catch(() => {});
    }

    ok(res, {
      match,
      goodsInSummary: {
        loggedWeightKg:   log.weightKg,
        receivedWeightKg,
        discrepancyPct:   Math.round(discrepancyRatio * 100),
        stage2Amount:     match.stage2Amount,
        message:          'Stage 2 payout released. Transaction complete.',
      },
    });
  } catch (err) { next(err); }
};
