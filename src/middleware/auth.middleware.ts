import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, UserRole } from '../types';
import { AppError } from '../utils/AppError';

/**
 * authenticate — verifies the Bearer token in the Authorization header.
 *
 * HOW IT WORKS:
 *   1. Reads the 'Authorization' header. Must be "Bearer <token>".
 *   2. Strips the "Bearer " prefix and gets the raw JWT string.
 *   3. Calls jwt.verify() — this checks the token's signature using JWT_SECRET
 *      and also checks that it hasn't expired (we set expiresIn: '24h' at login).
 *   4. If valid: attaches the decoded payload to req.user and calls next().
 *   5. If invalid or missing: passes an AppError to the global error handler.
 *
 * USAGE:
 *   router.get('/profile', authenticate, handler);
 *
 * After this middleware runs, req.user is guaranteed to be populated:
 *   req.user.id    → User._id (as string)
 *   req.user.role  → 'aggregator' | 'buyer' | etc.
 *   req.user.phone → the user's phone number
 *
 * NOTE: Farmers do NOT use JWT. They interact via SMS commands only.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;

  // Check header exists and has the right format
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('No token provided', 401, 'UNAUTHORIZED'));
  }

  const token = header.split(' ')[1]; // Remove "Bearer " prefix

  try {
    // jwt.verify throws if:
    //   - signature is invalid (token was tampered with)
    //   - token is expired (past the expiresIn time)
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = payload; // attach to request for downstream handlers
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401, 'INVALID_TOKEN'));
  }
};

/**
 * authorize — a factory function that returns a middleware.
 * Checks that the authenticated user's role is in the allowed list.
 *
 * USAGE (call it with the roles you want to allow):
 *   router.post('/logs', authenticate, authorize(UserRole.AGGREGATOR), handler);
 *   router.get('/admin', authenticate, authorize(UserRole.ADMIN), handler);
 *   router.get('/data',  authenticate, authorize(UserRole.ADMIN, UserRole.BUYER), handler);
 *
 * WHY A FACTORY?
 * We need different routes to allow different roles. By returning a new
 * middleware function each time, we can configure the allowed roles per route
 * without writing separate middleware for each combination.
 *
 * MUST come AFTER authenticate — needs req.user to be populated.
 */
export const authorize = (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      // User is authenticated (has a valid token) but doesn't have the right role
      return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    }
    next();
  };
