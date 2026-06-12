import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes       from './routes/auth.routes';
import aggregatorRoutes from './routes/aggregator.routes';
import buyerRoutes      from './routes/buyer.routes';
import dealerRoutes     from './routes/dealer.routes';
import adminRoutes      from './routes/admin.routes';
import webhookRoutes    from './routes/webhook.routes';

import { AppError } from './utils/AppError';
import { requestLogger } from './middleware/requestLogger';
import { logger } from './utils/logger';

const app = express();

app.set('trust proxy', 1)


// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? '*' }));

// Request logging middleware
app.use(requestLogger);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Rate limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  message:  { status: 'error', code: 'RATE_LIMITED', message: 'Too many requests' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { status: 'error', code: 'RATE_LIMITED', message: 'Too many login attempts' },
});

app.use(globalLimiter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Routes ───────────────────────────────────────────────────────────────────
const BASE = '/api/v1';
app.use(`${BASE}/auth`,        authLimiter, authRoutes);
app.use(`${BASE}/aggregator`,  aggregatorRoutes);
app.use(`${BASE}/buyer`,       buyerRoutes);
app.use(`${BASE}/dealer`,      dealerRoutes);
app.use(`${BASE}/admin`,       adminRoutes);
app.use(`${BASE}/webhooks`,    webhookRoutes);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: `${req.method} ${req.path} not found` });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error | AppError, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message}`, { code: err.code, status: err.statusCode, url: req.originalUrl });
    return res.status(err.statusCode).json({ status: 'error', code: err.code, message: err.message });
  }
  logger.error('[Unhandled Error]', err);
  return res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong' });
});

export default app;
