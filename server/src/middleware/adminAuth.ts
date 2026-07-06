import { Request, Response, NextFunction } from 'express';

/**
 * adminAuthMiddleware – gates admin-only routes behind a shared secret token.
 * The admin frontend has no JWT session (see services/authService.ts loginAdmin),
 * so this checks a static token sent via the `x-admin-token` header instead.
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) {
    res.status(500).json({ error: 'ADMIN_API_TOKEN is not configured' });
    return;
  }

  const provided = req.headers['x-admin-token'];
  if (provided !== expected) {
    res.status(401).json({ error: 'Invalid admin token' });
    return;
  }

  next();
}
