import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { Match } from '../models/Match';
import { Log } from '../models/Log';
import { AppError } from '../utils/AppError';
import { ok } from '../utils/response';
import { matchLog } from '../services/matchingEngine.service';
import { sendSMS } from '../services/sms.service';
import { UserStatus, LogStatus } from '../types';
import { SMS } from '../constants';

// ─── User Management ──────────────────────────────────────────────────────────

export const getPendingUsers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const users = await User
      .find({ status: UserStatus.PENDING })
      .sort({ createdAt: -1 });
      
    ok(res, users);
  } catch (err) { next(err); }
};

export const approveUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User
      .findByIdAndUpdate(
        req.params.id,
        { status: UserStatus.ACTIVE },
        { new: true }
      );

    if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND'));

    ok(res, { message: 'User approved', user });

  } catch (err) { next(err); }
};

export const suspendUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User
    .findByIdAndUpdate(
      req.params.id, 
      { status: UserStatus.SUSPENDED }, 
      { new: true }
    );

    if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND'));
    
    ok(res, { message: 'User suspended', user });

  } catch (err) { next(err); }
};

// ─── Matches & Logs ───────────────────────────────────────────────────────────

export const getAllMatches = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, pipeline, page = 1, limit = 30 } = req.query;
    const filter: Record<string, unknown> = {};
    if (status)   filter.status   = status;
    if (pipeline) filter.pipeline = pipeline;
    
    const matches = await Match
      .find(filter)
      .populate('logId buyerId farmerId')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    ok(res, matches);
  } catch (err) { next(err); }
};

export const getAllLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, pipeline, page = 1, limit = 30 } = req.query;
    const filter: Record<string, unknown> = {};
    if (status)   filter.status   = status;
    if (pipeline) filter.pipeline = pipeline;

    const logs = await Log.
      find(filter)
      .populate('aggregatorId farmerId matchId')
      .sort({ createdAt: -1 }).skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    
    ok(res, logs);
  } catch (err) { next(err); }
};

// ─── Dispute management (simplified — boolean flag only) ─────────────────────

export const flagDispute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { reason } = req.body as { reason: string };
    const match = await Match
    .findByIdAndUpdate(
      req.params.id, { 
        isDisputed: true, 
        disputeReason: reason }, 
        { new: true }
      );

    if (!match) return next(new AppError('Match not found', 404, 'NOT_FOUND'));
    
    ok(res, { message: 'Dispute flagged', match });
  } catch (err) { next(err); }
};

export const resolveDispute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const match = await Match
      .findByIdAndUpdate(
        req.params.id, {
          isDisputed: false, 
          disputeReason: undefined 
        }, 
        { new: true }
      );
    
    if (!match) return next(new AppError('Match not found', 404, 'NOT_FOUND'));

    ok(res, { message: 'Dispute resolved', match });
  } catch (err) { next(err); }
};

// ─── Manual matching trigger (demo / emergency use) ──────────────────────────

export const triggerMatching = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { logId } = req.body as { logId: string };
    if (!logId) return next(new AppError('logId is required', 400, 'VALIDATION_ERROR'));

    const log = await Log.findById(logId);
    if (!log) return next(new AppError('Log not found', 404, 'NOT_FOUND'));

    // Reset to pending so matchLog will process it
    await Log
    .findByIdAndUpdate(logId, { status: LogStatus.PENDING_MATCH, matchId: null });
    matchLog(logId).catch(() => {});

    ok(res, { message: 'Matching engine triggered', logId });
  } catch (err) { next(err); }
};

// ─── Demo endpoints ───────────────────────────────────────────────────────────

export const sendForecastAlert = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const demoPhone = process.env.DEMO_FARMER_PHONE;
    if (!demoPhone) return next(new AppError('DEMO_FARMER_PHONE not set', 500, 'CONFIG_ERROR'));
    await sendSMS(demoPhone, SMS.forecastDemo());
    ok(res, { message: 'Forecast advisory SMS sent', to: demoPhone });
  } catch (err) { next(err); }
};

export const simulateSpoilage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const log = await Log
      .findByIdAndUpdate(
        req.params.logId, 
        { 
          isExpired: true, 
          status: LogStatus.EXPIRED 
        }, 
        { new: true }
      );

    if (!log) return next(new AppError('Log not found', 404, 'NOT_FOUND'));

    const foodBankPhone = process.env.DEMO_FOODBANK_PHONE;
    if (foodBankPhone) {
      const clearancePrice = Math.round((log as any).agreedPrice * 0.70 || 500);
      sendSMS(foodBankPhone, SMS.spoilageAlert(log.category, clearancePrice)).catch(() => {});
    }
    ok(res, { message: 'Spoilage simulated', log });
  } catch (err) { next(err); }
};
