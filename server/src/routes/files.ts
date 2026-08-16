import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware, AuthRole } from '../middleware/auth';
import { generateUploadUrl, generateDownloadUrl } from '../services/r2';
import { signMediaUrl, verifyMediaToken } from '../services/mediaAccess';
import pool from '../services/db';

const router = Router();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guard a presign request against uploading over someone else's lesson.
 *
 * Keys follow `lessons/{lessonId}/{file}` (see services/apiService.ts). If
 * that lesson id already exists in the DB, only its coach or its student
 * may presign for it — otherwise anyone with a valid JWT could overwrite
 * an existing swing video. When no lesson row exists yet the presign is
 * allowed: the new-lesson flow generates a UUID client-side, presigns,
 * uploads, then POSTs /api/lessons; UUID v4 collision is astronomically
 * unlikely so allowing this path is safe.
 *
 * Non-lesson keys aren't currently issued anywhere in the app, so reject
 * them outright to keep the surface small.
 */
async function isKeyOwnedByUser(
  key: string,
  userId: string,
  userRole: AuthRole
): Promise<{ ok: true } | { ok: false; reason: string; status: number }> {
  // The admin token is read-only and owns no lessons, so it can never
  // presign an upload.
  if (userRole === 'admin') {
    return { ok: false, reason: 'Forbidden', status: 403 };
  }
  const parts = key.split('/');
  if (parts[0] !== 'lessons' || !parts[1]) {
    return { ok: false, reason: 'Only lesson media keys are allowed', status: 400 };
  }
  const lessonId = parts[1];
  if (!UUID_PATTERN.test(lessonId)) {
    return { ok: false, reason: 'Invalid lesson id in key', status: 400 };
  }
  const row = await pool.query(
    'SELECT coach_id, client_id, client_phone FROM lessons WHERE id = $1',
    [lessonId]
  );
  if (row.rows.length === 0) {
    // Brand-new lesson — the row will be created after the upload lands.
    return { ok: true };
  }
  const lesson = row.rows[0];
  if (userRole === 'coach') {
    if (lesson.coach_id === userId) return { ok: true };
    return { ok: false, reason: 'Not this lesson\'s coach', status: 403 };
  }
  // client role — match either the composite client_id or the phone.
  const clientRow = await pool.query(
    'SELECT name, phone FROM clients WHERE id = $1',
    [userId]
  );
  if (clientRow.rows.length === 0) {
    return { ok: false, reason: 'Client not found', status: 404 };
  }
  const { name, phone } = clientRow.rows[0];
  const composite = `${name}_${phone}`;
  const normalizedLesson = String(lesson.client_phone ?? '').replace(/[^0-9]/g, '');
  const normalizedClient = String(phone ?? '').replace(/[^0-9]/g, '');
  if (lesson.client_id === composite) return { ok: true };
  if (normalizedLesson && normalizedLesson === normalizedClient) return { ok: true };
  return { ok: false, reason: 'Not this lesson\'s student', status: 403 };
}

// Per-type upload size caps. Enforced trust-based against the client-reported
// contentLength — R2 direct PUT can't be capped after presigning, so a client
// could still lie about the size. Real enforcement would need a POST policy
// upload; this cap is enough to block accidental huge uploads and honest apps.
const MB = 1024 * 1024;
const UPLOAD_SIZE_CAPS: Array<{ prefix: string; maxBytes: number }> = [
  { prefix: 'video/', maxBytes: 500 * MB },
  { prefix: 'audio/', maxBytes: 50 * MB },
  { prefix: 'image/', maxBytes: 20 * MB },
];
const DEFAULT_UPLOAD_CAP = 10 * MB;

function maxBytesFor(contentType: string): number {
  for (const { prefix, maxBytes } of UPLOAD_SIZE_CAPS) {
    if (contentType.startsWith(prefix)) return maxBytes;
  }
  return DEFAULT_UPLOAD_CAP;
}

// POST /api/files/presign – requires auth
// Body: { key: string, contentType: string, contentLength?: number }
// Returns: { uploadUrl, fileUrl, maxBytes }
router.post('/presign', authMiddleware, async (req: Request, res: Response) => {
  const { key, contentType, contentLength } = req.body as {
    key?: string;
    contentType?: string;
    contentLength?: number;
  };

  if (!key || !contentType) {
    res.status(400).json({ error: 'key and contentType are required' });
    return;
  }

  const maxBytes = maxBytesFor(contentType);
  if (typeof contentLength === 'number' && contentLength > maxBytes) {
    const capMB = Math.round(maxBytes / MB);
    const gotMB = Math.round(contentLength / MB);
    console.warn(
      `[files] Rejecting presign: contentLength=${contentLength} (${gotMB}MB) > cap=${maxBytes} (${capMB}MB) for contentType=${contentType}`
    );
    res.status(413).json({
      error: `파일이 너무 큽니다. 최대 ${capMB}MB 까지 업로드할 수 있습니다 (요청: ${gotMB}MB).`,
      maxBytes,
    });
    return;
  }

  console.log(
    `[files] POST /presign key="${key}" contentType="${contentType}" contentLength=${contentLength ?? '?'} user=${req.user?.id}`
  );

  const ownership = await isKeyOwnedByUser(key, req.user!.id, req.user!.role);
  if (!ownership.ok) {
    console.warn(`[files] Presign rejected: ${ownership.reason} (key="${key}", user=${req.user?.id})`);
    res.status(ownership.status).json({ error: ownership.reason });
    return;
  }

  try {
    const uploadUrl = await generateUploadUrl(key, contentType);
    // Signed self-authenticating download URL — browsers can attach it to
    // <video src> without an Authorization header. The token expires within
    // the hour; long-lived media rendering re-signs on the next lesson fetch.
    const { url: fileUrl } = signMediaUrl(key);
    console.log(`[files] Presign succeeded for key="${key}"`);
    res.json({ uploadUrl, fileUrl, maxBytes });
  } catch (err) {
    console.error('[files] POST /presign error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Accept either a valid signed query token (?t=<sig>&e=<exp>) or a Bearer
 * JWT. Query tokens carry the request into <video>/<img> tags where headers
 * aren't an option; the header path stays open for API clients and tests.
 */
function isRequestAuthorized(req: Request, key: string): boolean {
  const t = typeof req.query.t === 'string' ? req.query.t : undefined;
  const e = typeof req.query.e === 'string' ? req.query.e : undefined;
  if (verifyMediaToken(key, t, e)) return true;

  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const secret = process.env.JWT_SECRET;
    if (secret) {
      try {
        jwt.verify(header.slice(7), secret);
        return true;
      } catch {
        // fall through to 401
      }
    }
  }
  return false;
}

// GET /api/files/:key(*)
// Requires either a valid HMAC query token (?t=&e=) or a Bearer JWT.
// Generates a presigned R2 URL and 302-redirects to it.
router.get('/:key(*)', async (req: Request, res: Response) => {
  const { key } = req.params;

  if (!key) {
    res.status(400).json({ error: 'key is required' });
    return;
  }

  if (!isRequestAuthorized(req, key)) {
    console.warn(`[files] Unauthenticated GET blocked for key="${key}"`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const downloadUrl = await generateDownloadUrl(key);
    res.redirect(302, downloadUrl);
  } catch (err) {
    console.error('[files] GET /:key error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
