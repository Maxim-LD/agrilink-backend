import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { OTP } from '../models/OTP';
import { AppError } from '../utils/AppError';

const OTP_EXPIRY_MS  = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS   = 3;
const BCRYPT_ROUNDS  = 10;

/**
 * Generate a 6-digit OTP, store bcrypt hash, return plaintext.
 * Caller must send the plaintext code via SMS immediately — it is never stored.
 */
export const generateOTP = async (
  farmerId:    Types.ObjectId,
  dealerId:    Types.ObjectId,
  amountNaira: number, // kobo in production
): Promise<string> => {
  const code     = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);

  await OTP.create({
    farmerId,
    dealerId,
    amountNaira, // kobo in production
    codeHash,
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
  });

  return code; // plaintext — returned to caller, never stored
};

/**
 * Verify a dealer-submitted OTP code.
 * Increments attemptCount on mismatch.
 * Sets usedAt on success inside walletService (not here).
 */
export const verifyOTP = async (
  code:     string,
  farmerId: Types.ObjectId,
  dealerId: Types.ObjectId,
): Promise<InstanceType<typeof OTP>> => {
  const otp = await OTP.findOne({
    farmerId,
    dealerId,
    expiresAt: { $gt: new Date() },
    usedAt:    null,
  }).sort({ createdAt: -1 }); // most recent first

  if (!otp) throw new AppError('OTP not found or expired', 404, 'OTP_NOT_FOUND');
  if (otp.attemptCount >= MAX_ATTEMPTS) throw new AppError('OTP locked — too many attempts', 429, 'OTP_LOCKED');

  const match = await bcrypt.compare(code, otp.codeHash);
  if (!match) {
    otp.attemptCount += 1;
    await otp.save();
    throw new AppError('Invalid OTP code', 400, 'INVALID_OTP');
  }

  return otp;
};
