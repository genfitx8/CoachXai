import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
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
  // AWS SDK v3 defaults to injecting x-amz-checksum-crc32 and
  // x-amz-sdk-checksum-algorithm on every PutObject request. Those headers
  // turn a browser PUT into a CORS preflighted request, and R2 rejects the
  // OPTIONS preflight unless the bucket CORS policy explicitly allows them
  // (which fails with "No 'Access-Control-Allow-Origin' header" from the
  // web app). Setting this to WHEN_REQUIRED means the SDK omits the
  // checksum headers, the presigned PUT only needs the `host` header (which
  // is signed), and the browser can send it as a CORS simple request.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
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

/**
 * Delete every object stored under `prefix`.
 *
 * Lesson media lives at `lessons/{lessonId}/…` (see services/apiService.ts),
 * so removing a lesson's whole prefix clears its main video, the additional
 * clips and the coach feedback recordings in one pass — nothing else shares
 * that namespace.
 *
 * Returns the number of objects actually deleted. Individual key failures are
 * logged and skipped rather than aborting the sweep: a half-deleted prefix is
 * still better than leaving the whole thing behind, and the caller is
 * cleaning up after a row that is already gone.
 *
 * Refuses an empty prefix — every key in the bucket matches it, and no caller
 * ever wants that.
 */
export async function deleteObjectsByPrefix(prefix: string): Promise<number> {
  if (!prefix) {
    throw new Error('[r2] deleteObjectsByPrefix requires a non-empty prefix');
  }

  let continuationToken: string | undefined;
  let deleted = 0;

  do {
    const listed = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    const keys = (listed.Contents ?? [])
      .map((object) => object.Key)
      .filter((key): key is string => Boolean(key));

    if (keys.length > 0) {
      // DeleteObjects accepts at most 1000 keys, which is also the default
      // ListObjectsV2 page size — so one listed page is always one call.
      const result = await r2Client.send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        })
      );

      const errors = result.Errors ?? [];
      for (const error of errors) {
        console.error(
          `[r2] Failed to delete "${error.Key}": ${error.Code ?? '?'} ${error.Message ?? ''}`
        );
      }
      deleted += keys.length - errors.length;
    }

    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}
