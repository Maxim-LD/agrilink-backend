import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import Joi from 'joi';
import { User } from '../models/User';
import { Aggregator } from '../models/Aggregator';
import { Farmer } from '../models/Farmer';
import { Log } from '../models/Log';
import { AppError } from '../utils/AppError';
import { ok } from '../utils/response';
import { matchLog } from '../services/matchingEngine.service';
import { computeUrgencyTier } from '../services/matchingEngine.service';
import { UserRole, UserStatus, Pipeline, LogStatus, SpoilageUrgencyTier } from '../types';
import { SHELF_LIFE_HOURS } from '../constants';

const BCRYPT_ROUNDS = 10;

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const registerAggregatorSchema = Joi.object({
  phone:                Joi.string().pattern(/^\+[1-9]\d{1,14}$/).required(),
  fullName:             Joi.string().min(2).required(),
  password:             Joi.string().min(6).required(),
  zone:                 Joi.string().required(),
  governmentIdType:     Joi.string().valid('nin', 'drivers_licence', 'intl_passport').required(),
  governmentIdNumber:   Joi.string().required(),
  governmentIdPhotoUrl: Joi.string().uri().required(),
  guarantorPhone:       Joi.string().pattern(/^\+[1-9]\d{1,14}$/).required(),
});

export const logSubmissionSchema = Joi.object({
  farmerPhone:  Joi.string().pattern(/^\+[1-9]\d{1,14}$/).required(),
  pipeline:     Joi.string().valid(...Object.values(Pipeline)).required(),
  category:     Joi.string().required(),
  weightKg:     Joi.number().min(0.1).required(),
  condition:    Joi.string().required(),
  latitude:     Joi.number().min(-90).max(90).required(),
  longitude:    Joi.number().min(-180).max(180).required(),
  photoUrl:     Joi.string().uri().required(),
  harvestedAt:  Joi.string().isoDate().required(),
});

// ─── Register ─────────────────────────────────────────────────────────────────

export const registerAggregator = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone, fullName, password, zone, governmentIdType, governmentIdNumber, governmentIdPhotoUrl, guarantorPhone } = req.body;

    const existing = await User.findOne({ phone });
    if (existing) return next(new AppError('Phone already registered', 409, 'PHONE_TAKEN'));

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({ 
      phone, 
      fullName, 
      role: UserRole.AGGREGATOR, 
      status: UserStatus.PENDING, 
      passwordHash 
    });

    await Aggregator.create({
      userId: user._id, 
      zone, 
      governmentIdType, 
      governmentIdNumber, 
      governmentIdPhotoUrl, 
      guarantorPhone 
    });

    ok(res, { message: 'Registration submitted. Awaiting admin approval.' }, 201);
  } catch (err) { next(err); }
};

// ─── Profile ──────────────────────────────────────────────────────────────────

export const getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const aggregator = await Aggregator.findOne({ userId: req.user!.id }).populate('userId', 'fullName phone status');
    if (!aggregator) return next(new AppError('Aggregator not found', 404, 'NOT_FOUND'));
    ok(res, aggregator);
  } catch (err) { next(err); }
};

// ─── Submit Log ───────────────────────────────────────────────────────────────

export const submitLog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { 
      farmerPhone, 
      pipeline, 
      category, 
      weightKg, 
      condition, 
      latitude, 
      longitude, 
      photoUrl, 
      harvestedAt 
    } = req.body;

    const aggregator = await Aggregator.findOne({ userId: req.user!.id });
    if (!aggregator) return next(new AppError('Aggregator profile not found', 404, 'NOT_FOUND'));

    // Resolve or auto-create farmer
    let farmerUser = await User.findOne({ phone: farmerPhone, role: UserRole.FARMER });
    if (!farmerUser) {
      farmerUser = await User.create({ 
        phone: farmerPhone, 
        fullName: 'Farmer', 
        role: UserRole.FARMER, 
        status: UserStatus.ACTIVE,
      });
    }
    let farmer = await Farmer.findOne({ userId: farmerUser._id });
    if (!farmer) {
      farmer = await Farmer.create({ userId: farmerUser._id, zone: aggregator.zone });
    }

    // Compute spoilage deadline for fresh produce
    const harvestedDate = new Date(harvestedAt);
    const shelfHours    = SHELF_LIFE_HOURS[category] ?? 48;
    const spoilageDeadline = pipeline === Pipeline.FRESH_PRODUCE
      ? new Date(harvestedDate.getTime() + shelfHours * 3_600_000)
      : undefined;

    // Compute urgency tier for fresh produce logs at creation time
    const urgencyTier = pipeline === Pipeline.FRESH_PRODUCE && spoilageDeadline
      ? computeUrgencyTier(spoilageDeadline)
      : undefined;

    // Generate QR Collection Ticket for waste logs immediately at creation
    // (before matching, so the aggregator can show it to the farmer right away)
    let collectionRef: string | undefined;
    let qrPayload: string | undefined;
    if (pipeline === Pipeline.AGRI_WASTE) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      collectionRef = 'AGRI-';
      for (let i = 0; i < 6; i++) collectionRef += chars.charAt(Math.floor(Math.random() * chars.length));

      const maskedPhone = farmerPhone.length > 8
        ? farmerPhone.slice(0, 4) + '****' + farmerPhone.slice(-4)
        : '****';

      qrPayload = JSON.stringify({
        ref:          collectionRef,
        category:     category.toLowerCase(),
        weightKg,
        condition,
        zone:         aggregator.zone,
        farmerMasked: maskedPhone,
        timestamp:    harvestedDate.toISOString(),
        // logId is added after log creation below
      });
    }

    const log = await Log.create({
      pipeline,
      aggregatorId: aggregator._id,
      farmerId:     farmer._id,
      category:     category.toLowerCase(),
      weightKg,
      condition,
      location: { type: 'Point', coordinates: [longitude, latitude] },
      photoUrl,
      harvestedAt:  harvestedDate,
      spoilageDeadline,
      isExpired:    false,
      status:       LogStatus.PENDING_MATCH,
      urgencyTier,
      collectionRef,
      // Patch qrPayload with the real logId now that the log is created
      qrPayload: qrPayload
        ? qrPayload.replace('}', `, "logId": "__LOGID__"}`)
        : undefined,
    });

    // Patch the logId into the qrPayload now that we have the log._id
    if (pipeline === Pipeline.AGRI_WASTE && qrPayload) {
      const fullQrPayload = JSON.stringify({
        ref:          collectionRef,
        logId:        String(log._id),
        category:     (category as string).toLowerCase(),
        weightKg,
        condition,
        zone:         aggregator.zone,
        farmerMasked: farmerPhone.length > 8
          ? farmerPhone.slice(0, 4) + '****' + farmerPhone.slice(-4)
          : '****',
        timestamp:    harvestedDate.toISOString(),
      });
      await Log.findByIdAndUpdate(log._id, { qrPayload: fullQrPayload });
      log.qrPayload = fullQrPayload;
    }

    // Fire-and-forget — do not await, response returns immediately
    matchLog(String(log._id)).catch((err) => console.error('[MatchLog]', err));

    ok(res, log, 201);
  } catch (err) { next(err); }
};

// ─── List Logs ────────────────────────────────────────────────────────────────

export const getLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const aggregator = await Aggregator.findOne({ userId: req.user!.id });
    if (!aggregator) return next(new AppError('Aggregator not found', 404, 'NOT_FOUND'));

    const { pipeline, status, page = 1, limit = 20 } = req.query;
    const filter: Record<string, unknown> = { aggregatorId: aggregator._id };
    if (pipeline) filter.pipeline = pipeline;
    if (status)   filter.status   = status;

    const logs = await Log.find(filter)
      .populate('matchId')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    ok(res, logs);
  } catch (err) { next(err); }
};
