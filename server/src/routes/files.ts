import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { generateUploadUrl, generateDownloadUrl, getFileUrl } from '../services/r2';

const router = Router();

// POST /api/files/presign – requires auth
// Body: { key: string, contentType: string }
// Returns: { uploadUrl, fileUrl }
router.post('/presign', authMiddleware, async (req: Request, res: Response) => {
  const { key, contentType } = req.body as { key?: string; contentType?: string };

  if (!key || !contentType) {
    res.status(400).json({ error: 'key and contentType are required' });
    return;
  }

  console.log(`[files] POST /presign key="${key}" contentType="${contentType}" user=${req.user?.id}`);

  try {
    const uploadUrl = await generateUploadUrl(key, contentType);
    const fileUrl = getFileUrl(key);
    console.log(`[files] Presign succeeded for key="${key}"`);
    res.json({ uploadUrl, fileUrl });
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
