import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const R2_BUCKET = process.env.R2_BUCKET ?? 'coachxai';

// Warn at startup if any required R2 credentials are missing so the problem
// is immediately obvious in server logs rather than surfacing as a cryptic
// "upload failed" error when a user tries to save a lesson.
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.warn(
    '[r2] WARNING: One or more required R2 environment variables are missing ' +
    '(R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY). ' +
    'File uploads will fail until these are configured.'
  );
}

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate a presigned PUT URL so the client can upload directly to R2.
 * Expires in 1 hour.
 */
export async function generateUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(r2Client, command, { expiresIn: 3600 });
}

/**
 * Return the backend proxy URL for a stored file.
 * The actual redirect to R2 is handled by GET /api/files/:key.
 */
export function getFileUrl(key: string): string {
  return `/api/files/${key}`;
}

/**
 * Generate a presigned GET URL so the browser can fetch a private object directly.
 * Expires in 1 hour.
 */
export async function generateDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  });

  return getSignedUrl(r2Client, command, { expiresIn: 3600 });
}
