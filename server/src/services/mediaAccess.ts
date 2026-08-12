import crypto from 'crypto';

/**
 * Short-lived HMAC access token for stored media (R2 objects).
 *
 * Purpose: browsers can't attach an Authorization header to a plain
 * <video src> or <img src>, so protected files need per-URL authentication
 * via query string. When the server returns a lesson (or presigns an
 * upload), any /api/files/... URL it hands to the client is signed here;
 * GET /api/files/:key then requires either a valid signature or a Bearer
 * token to pass.
 *
 * The signature covers only the object key plus expiry — it doesn't grant
 * any other capability, and expires within an hour, so a leaked URL from a
 * log rotates out quickly.
 */

const DEFAULT_TTL_SEC = 60 * 60; // 1 hour — matches R2 signed URL lifetime

function getSecret(): string {
  const secret = process.env.MEDIA_SIGNING_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'MEDIA_SIGNING_SECRET (or JWT_SECRET fallback) is not configured'
    );
  }
  return secret;
}

/** Compute the raw HMAC-SHA256 signature for a given key + expiry. */
function computeSig(key: string, expEpochSec: number, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${key}|${expEpochSec}`)
    .digest('hex');
}

export interface SignedMediaUrl {
  url: string; // /api/files/{key}?t={sig}&e={exp}
  expiresAt: number; // epoch seconds
}

/** Sign a stored object key into a self-authenticating GET URL. */
export function signMediaUrl(key: string, ttlSec: number = DEFAULT_TTL_SEC): SignedMediaUrl {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = computeSig(key, exp, getSecret());
  const encodedKey = key
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return {
    url: `/api/files/${encodedKey}?t=${sig}&e=${exp}`,
    expiresAt: exp,
  };
}

/**
 * Verify a query-string access token for the given key. Returns true only
 * when the signature matches AND the expiry is in the future. Uses a
 * constant-time comparison to avoid signature-timing leaks.
 */
export function verifyMediaToken(
  key: string,
  sig: string | undefined,
  exp: string | undefined
): boolean {
  if (!sig || !exp) return false;
  const expNum = Number.parseInt(exp, 10);
  if (!Number.isFinite(expNum)) return false;
  if (expNum < Math.floor(Date.now() / 1000)) return false;

  const expected = computeSig(key, expNum, getSecret());
  const provided = sig;
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(provided, 'utf8'),
    Buffer.from(expected, 'utf8')
  );
}

/**
 * Given a URL that may already be an /api/files/... path (absolute or
 * relative), re-sign it. Non-media URLs (blob:, absolute non-file HTTP)
 * are returned unchanged. Extracts the key from the path portion so both
 * `/api/files/lessons/x/main.mp4` and `https://api/api/files/lessons/x/main.mp4?t=old&e=old`
 * resolve to a fresh signature.
 */
export function reSignIfMedia(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  if (typeof value !== 'string') return value as unknown as null;
  if (value.startsWith('blob:') || value.startsWith('data:') || value.startsWith('idb://')) {
    return value;
  }
  const marker = '/api/files/';
  const idx = value.indexOf(marker);
  if (idx < 0) return value;
  const afterMarker = value.slice(idx + marker.length);
  // Strip any existing query string
  const [pathOnly] = afterMarker.split('?');
  if (!pathOnly) return value;
  const decodedKey = pathOnly
    .split('/')
    .map(decodeURIComponent)
    .join('/');
  return signMediaUrl(decodedKey).url;
}
