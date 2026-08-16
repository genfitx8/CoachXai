import { Request } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

/**
 * Key a rate limiter by the authenticated user when there is one, and fall
 * back to the client IP otherwise.
 *
 * Why this matters in production: the API sits behind Render's proxy, so
 * without `trust proxy` every request looks like it came from the same
 * address and a single shared bucket throttles the whole user base. Even
 * with `trust proxy` on, students sitting in the same golf academy share
 * one NAT address, so an IP-only key would let one busy room exhaust the
 * quota for everybody in it. Keying on the JWT subject keeps the limit
 * per-account, which is what the limits are actually meant to express.
 */
export function userOrIpKey(req: Request): string {
  const userId = req.user?.id;
  if (userId) return `u:${userId}`;
  return ipKeyGenerator(req.ip ?? '');
}

/**
 * Build a limiter keyed per account (falling back to IP for anonymous
 * callers). `limit` is the number of requests allowed per `windowMs`.
 */
export function createUserLimiter(windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator: userOrIpKey,
    standardHeaders: true,
    legacyHeaders: false,
  });
}
