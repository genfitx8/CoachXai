import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthPayload } from './auth';

/**
 * adminAuthMiddleware – gates admin-only routes.
 *
 * Preferred: an admin JWT issued by POST /api/auth/login/admin, sent as
 * `Authorization: Bearer <token>`. The credentials behind it live only on the
 * server (ADMIN_EMAIL / ADMIN_PASSWORD_HASH).
 *
 * Legacy: a shared secret sent via the `x-admin-token` header, matched against
 * ADMIN_API_TOKEN. Kept so server-to-server callers and the manual token entry
 * in the admin UI keep working; prefer the JWT for anything new.
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const secret = process.env.JWT_SECRET;
    if (secret) {
      try {
        const payload = jwt.verify(header.slice(7), secret) as AuthPayload;
        if (payload.role === 'admin') {
          req.admin = { id: payload.id };
          next();
          return;
        }
      } catch {
        // Fall through to the legacy shared-secret check below.
      }
    }
  }

  const expected = process.env.ADMIN_API_TOKEN;
  if (expected && req.headers['x-admin-token'] === expected) {
    next();
    return;
  }

  res.status(401).json({ error: 'Admin authentication required' });
}
