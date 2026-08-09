import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { generateUploadUrl, generateDownloadUrl, getFileUrl } from '../services/r2';

const router = Router();

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

  try {
    const uploadUrl = await generateUploadUrl(key, contentType);
    const fileUrl = getFileUrl(key);
    console.log(`[files] Presign succeeded for key="${key}"`);
    res.json({ uploadUrl, fileUrl, maxBytes });
  } catch (err) {
    console.error('[files] POST /presign error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/files/:key(*) – no auth required
// Generates a presigned GET URL and 302-redirects to it
router.get('/:key(*)', async (req: Request, res: Response) => {
  const { key } = req.params;

  if (!key) {
    res.status(400).json({ error: 'key is required' });
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
