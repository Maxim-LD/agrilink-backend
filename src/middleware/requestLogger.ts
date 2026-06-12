import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(startTime);
    const timeInMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
    
    const method = req.method;
    const url = req.originalUrl || req.url;
    const status = res.statusCode;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Exclude noise like health check endpoints from spamming logs
    if (url === '/health' || url === '/health/') {
      return;
    }

    const message = `${method} ${url} ${status} - ${timeInMs} ms`;
    const meta = {
      ip,
      userAgent,
      method,
      url,
      status,
      responseTimeMs: parseFloat(timeInMs),
    };

    if (status >= 400) {
      logger.error(message, meta);
    } else {
      logger.info(message, meta);
    }
  });

  next();
};
