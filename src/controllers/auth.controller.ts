import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import { User } from '../models/User';
import { Aggregator } from '../models/Aggregator';
import { Dealer } from '../models/Dealer';
import { Buyer } from '../models/Buyer';
import { AppError } from '../utils/AppError';
import { ok } from '../utils/response';
import { UserStatus } from '../types';

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const loginSchema = Joi.object({
  phone:    Joi.string().required(),
  password: Joi.string().required(),
});

// ─── Login ────────────────────────────────────────────────────────────────────

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone, password } = req.body as { phone: string; password: string };

    const user = await User.findOne({ phone });
    if (!user || !user.passwordHash) return next(new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS'));
    if (user.status !== UserStatus.ACTIVE)  return next(new AppError('Account not active', 403, 'ACCOUNT_NOT_ACTIVE'));

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return next(new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS'));

    const token = jwt.sign(
      { id: String(user._id), role: user.role, phone: user.phone },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' },
    );

    ok(res, 
      { 
        token, 
        user: { 
          id: user._id, 
          role: user.role,
          fullName: user.fullName
        } 
      });
  } catch (err) {
    next(err);
  }
};
