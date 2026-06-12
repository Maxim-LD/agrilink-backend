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
import { splitPayout, creditCash } from '../services/wallet.service';
import { sendSMS } from '../services/sms.service';
import { matchLog } from '../services/matchingEngine.service';
import { UserRole, UserStatus, BuyerType, Pipeline, MatchStatus, LogStatus } from '../types';
import { SMS } from '../constants';

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
      // ── Waste: 70/30 split fires immediately ─────────────────────────────
      await splitPayout(match);

      match.status          = MatchStatus.CONFIRMED;
      match.buyerConfirmedAt = new Date();
      match.completedAt     = new Date();
      await match.save();

      await Log.findByIdAndUpdate(match.logId, { status: LogStatus.CONFIRMED });

      if (
        farmerUser
        && match.agriWalletCredit !== undefined
        && match.cashWalletCredit !== undefined
      ) {
        sendSMS(
          farmerUser.phone,
          SMS.matchConfirmedWaste(buyer.companyName, match.agriWalletCredit, match.cashWalletCredit)
        ).catch(() => { });
      }
    } else {
      // ── Fresh produce: 100% cash payout ──────────────────────────────────
      await creditCash(match);

      match.status           = MatchStatus.CONFIRMED;
      match.buyerConfirmedAt  = new Date();
      match.completedAt      = new Date();
      await match.save();

      await Log.findByIdAndUpdate(match.logId, { status: LogStatus.CONFIRMED });

      if (farmerUser) {
        sendSMS(farmerUser.phone, SMS.matchConfirmedProduce(buyer.companyName, match.farmerNetPayout)).catch(() => {});
      }
    }

    ok(res, {
      match,
      payoutBreakdown: {
        totalValue:       match.totalValue,
        platformFee:      match.platformFee,
        transportCost:    match.transportCost,
        farmerNetPayout:  match.farmerNetPayout,
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

    match.status = MatchStatus.DECLINED;
    await match.save();

    // Re-queue log for matching
    await Log
      .findByIdAndUpdate(
        match.logId,
        { status: LogStatus.PENDING_MATCH, matchId: null }
      );
    matchLog(String(match.logId)).catch(() => {});

    ok(res, { message: 'Match declined. Log re-queued for matching.' });
  } catch (err) { next(err); }
};
