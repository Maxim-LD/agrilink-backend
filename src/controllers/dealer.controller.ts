import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import Joi from 'joi';
import { User } from '../models/User';
import { Dealer } from '../models/Dealer';
import { Farmer } from '../models/Farmer';
import { OTP } from '../models/OTP';
import { AppError } from '../utils/AppError';
import { ok } from '../utils/response';
import { generateOTP, verifyOTP } from '../services/otp.service';
import { redeemAgriWallet } from '../services/wallet.service';
import { sendSMS } from '../services/sms.service';
import { UserRole, UserStatus } from '../types';
import { SMS } from '../constants';

const BCRYPT_ROUNDS = 10;

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const registerDealerSchema = Joi.object({
  phone:      Joi.string().pattern(/^(?:\+234|234|0)[0789][01]\d{8}$/).required(),
  fullName:   Joi.string().min(2).required(),
  password:   Joi.string().min(6).required(),
  shopName:   Joi.string().required(),
  dealerCode: Joi.string().alphanum().min(3).max(10).uppercase().required(),
  zone:       Joi.string().required(),
});

export const redeemSchema = Joi.object({
  code:        Joi.string().length(6).pattern(/^\d+$/).required(),
  farmerPhone: Joi.string().pattern(/^(?:\+234|234|0)[0789][01]\d{8}$/).required(),
});

// ─── Register ─────────────────────────────────────────────────────────────────

export const registerDealer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      phone,
      fullName,
      password,
      shopName,
      dealerCode,
      zone
    } = req.body;

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) return next(new AppError('Phone already registered', 409, 'PHONE_TAKEN'));

    const existingCode = await Dealer.findOne({ dealerCode: dealerCode.toUpperCase() });
    if (existingCode) return next(new AppError('Dealer code already taken', 409, 'DEALER_CODE_TAKEN'));

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({ 
      phone, 
      fullName, 
      role: UserRole.DEALER, 
      status: UserStatus.PENDING, 
      passwordHash 
    });
    await Dealer.create({
      userId: user._id, 
      shopName,
      dealerCode: dealerCode.toUpperCase(),
      zone,
      status: UserStatus.PENDING
    });

    ok(res, { message: 'Dealer registration submitted. Awaiting admin approval.' }, 201);
  } catch (err) { next(err); }
};

// ─── Profile ──────────────────────────────────────────────────────────────────

export const getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dealer = await Dealer.findOne({ userId: req.user!.id }).populate('userId', 'fullName phone status');
    if (!dealer) return next(new AppError('Dealer not found', 404, 'NOT_FOUND'));
    ok(res, dealer);
  } catch (err) { next(err); }
};

// ─── Redeem (single endpoint — verify + confirm combined) ────────────────────

export const redeem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { code, farmerPhone } = req.body as { code: string; farmerPhone: string };

    const dealer = await Dealer.findOne({ userId: req.user!.id });
    if (!dealer) return next(new AppError('Dealer not found', 404, 'NOT_FOUND'));
    if (dealer.status !== UserStatus.ACTIVE) return next(new AppError('Dealer account not active', 403, 'ACCOUNT_NOT_ACTIVE'));

    const farmerUser = await User.findOne({ phone: farmerPhone, role: UserRole.FARMER });
    if (!farmerUser) return next(new AppError('Farmer not found', 404, 'FARMER_NOT_FOUND'));

    const farmer = await Farmer.findOne({ userId: farmerUser._id });
    if (!farmer) return next(new AppError('Farmer profile not found', 404, 'FARMER_NOT_FOUND'));

    // Verify OTP — throws on mismatch/expiry/lock
    const otp = await verifyOTP(code, farmer._id, dealer._id);

    // Debit agri-wallet and mark OTP used atomically
    await redeemAgriWallet(farmer._id, otp._id, otp.amountNaira);

    // Confirm SMS to farmer
    sendSMS(farmerUser.phone, SMS.redemptionDone(otp.amountNaira, dealer.shopName)).catch(() => {});

    ok(res, {
      amountNaira:       otp.amountNaira,
      farmerPhone:       farmerPhone.replace(/(\+\d{3})\d{4}(\d{4})/, '$1****$2'), // masked
      dealerCode:        dealer.dealerCode,
      shopName:          dealer.shopName,
    });
  } catch (err) { next(err); }
};

// ─── List Redemptions ─────────────────────────────────────────────────────────

export const getRedemptions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dealer = await Dealer.findOne({ userId: req.user!.id });
    if (!dealer) return next(new AppError('Dealer not found', 404, 'NOT_FOUND'));

    const { page = 1, limit = 20 } = req.query;

    // Return used OTPs for this dealer as a proxy for completed redemptions
    const redemptions = await OTP.find({ dealerId: dealer._id, usedAt: { $ne: null } })
      .sort({ usedAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .select('-codeHash'); // never expose the hash

    ok(res, redemptions);
  } catch (err) { next(err); }
};
