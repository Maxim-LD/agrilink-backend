import { Request, Response, NextFunction, RequestHandler } from 'express';
import Joi from 'joi';
import { AppError } from '../utils/AppError';

export const validate =
  (schema: Joi.Schema): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      const message = error.details.map((d) => d.message).join(', ');
      return next(new AppError(message, 400, 'VALIDATION_ERROR'));
    }
    next();
  };
