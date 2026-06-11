import { Response } from 'express';

export const ok = (res: Response, data: unknown, status = 200): Response =>
  res.status(status).json({ status: 'success', data });

export const fail = (
  res: Response,
  message: string,
  code: string,
  status = 400,
): Response => res.status(status).json({ status: 'error', code, message });
