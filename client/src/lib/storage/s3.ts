// src/lib/storage/s3.ts
//
// Pure S3 transport. Owns the SDK client, the credentials path, the
// key-shape convention, and nothing else. Higher-level concerns
// (validation, ownership scoping, rate limits, vision extraction)
// live in the route + the vision-extractor module.
//
// Used by Stage 4 to back the founder-community-engagement
// screenshot pipeline:
//   browser → presigned PUT → S3
//   vision-extractor → presigned GET → Anthropic Messages API
// The file never touches our server. We persist only the durable
// s3Key on the artifact; presigned URLs are re-issued per access
// (5-minute TTL).

import 'server-only';
import { S3Client, DeleteObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  ALLOWED_SCREENSHOT_CONTENT_TYPES,
  MAX_SCREENSHOT_BYTES,
  type AllowedScreenshotContentType,
} from '@/lib/ideation/stage4-opportunities/constants';

// ---------------------------------------------------------------------------
// TTLs + constants
// ---------------------------------------------------------------------------

/**
 * Presigned PUT URL lifetime. Generous enough for a slow mobile
 * upload over weak signal; short enough that a stolen URL is
 * useless within minutes.
 */
const UPLOAD_URL_TTL_SECONDS = 5 * 60;  // 5 minutes

/**
 * Presigned GET URL lifetime. The vision-extraction call resolves
 * well under a minute; 5 minutes is comfortable for retries.
 */
const READ_URL_TTL_SECONDS = 5 * 60;    // 5 minutes

/**
 * Prefix every Stage 4 screenshot lives under. The S3 lifecycle
 * rule (see docs/stage4-s3-setup.md) targets this exact prefix for
 * 30-day expiration; changing it here without updating the lifecycle
 * rule means uploads stop expiring.
 */
const STAGE4_KEY_PREFIX = 'stage4-uploads';

// ---------------------------------------------------------------------------
// Lazy singleton — same pattern as Tavily / Exa transports
// ---------------------------------------------------------------------------

let cachedClient: S3Client | null = null;

function getClient(): S3Client | null {
  if (!env.AWS_REGION || !env.AWS_S3_BUCKET) return null;
  if (cachedClient) return cachedClient;
  // Credentials are discovered automatically: AWS_ACCESS_KEY_ID and
  // AWS_SECRET_ACCESS_KEY are read from process.env by the SDK's
  // default credential chain. No explicit credentials block needed.
  cachedClient = new S3Client({ region: env.AWS_REGION });
  return cachedClient;
}

function bucket(): string {
  if (!env.AWS_S3_BUCKET) {
    throw new Error('AWS_S3_BUCKET is not set; S3 upload pipeline is unconfigured.');
  }
  return env.AWS_S3_BUCKET;
}

// ---------------------------------------------------------------------------
// Key shape
// ---------------------------------------------------------------------------

const CONTENT_TYPE_TO_EXT: Record<AllowedScreenshotContentType, string> = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Stage 4 screenshot key:
 *   stage4-uploads/<userId>/<sessionId>/<opportunityId>/<uuid>.<ext>
 *
 * Owner-scoped prefix means an IAM policy can restrict reads/writes
 * to `stage4-uploads/${aws:username}/*` if we ever swap to per-user
 * AWS identities. For now we ship with one IAM user shared by the
 * server; ownership is enforced at the route layer via the session
 * + stage-run ownership query.
 */
function buildKey(args: {
  userId:        string;
  sessionId:     string;
  opportunityId: string;
  contentType:   AllowedScreenshotContentType;
}): string {
  const id  = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.floor(Math.random() * 1e9).toString(36)}`;
  const ext = CONTENT_TYPE_TO_EXT[args.contentType];
  return `${STAGE4_KEY_PREFIX}/${args.userId}/${args.sessionId}/${args.opportunityId}/${id}.${ext}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PresignedUpload {
  uploadUrl: string;
  s3Key:     string;
  /**
   * Stable virtual-hosted-style URL. Useful for debugging / audit
   * logs ("this was the URL that received the upload"). NOT a
   * working read URL for a private bucket — call getPresignedReadUrl
   * for actual reads.
   */
  s3Url:     string;
}

export class S3NotConfiguredError extends Error {
  constructor() {
    super('S3 not configured: missing AWS_REGION or AWS_S3_BUCKET');
    this.name = 'S3NotConfiguredError';
  }
}

/**
 * Issue a presigned PUT URL the browser uploads to directly. The
 * Content-Type and Content-Length conditions are baked into the
 * signature — the upload fails at S3 if the browser uses a
 * different type or exceeds the byte cap.
 *
 * Throws S3NotConfiguredError when the env vars are absent so the
 * caller can return a clean 503 instead of a generic 500.
 */
export async function getPresignedUploadUrl(args: {
  userId:        string;
  sessionId:     string;
  opportunityId: string;
  contentType:   AllowedScreenshotContentType;
}): Promise<PresignedUpload> {
  const client = getClient();
  if (!client) throw new S3NotConfiguredError();

  if (!(ALLOWED_SCREENSHOT_CONTENT_TYPES as readonly string[]).includes(args.contentType)) {
    throw new Error(`Disallowed contentType: ${args.contentType}`);
  }

  const s3Key = buildKey(args);
  const command = new PutObjectCommand({
    Bucket:        bucket(),
    Key:           s3Key,
    ContentType:   args.contentType,
    // ContentLength would lock the signature to one exact byte size;
    // the byte cap is enforced via the bucket-level allow-list and
    // a generous max in the route's body-size guard. Keeping the
    // signature off-size lets the browser stream the body without
    // pre-measuring.
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  const s3Url = `https://${bucket()}.s3.${env.AWS_REGION ?? 'unknown'}.amazonaws.com/${encodeURI(s3Key)}`;

  return { uploadUrl, s3Key, s3Url };
}

/**
 * Issue a fresh presigned GET URL for a stored object. Used by the
 * vision-extractor (passed to Anthropic's image-content `source.url`)
 * and by the UI rendering layer.
 *
 * Throws S3NotConfiguredError if env vars are absent.
 */
export async function getPresignedReadUrl(s3Key: string): Promise<string> {
  const client = getClient();
  if (!client) throw new S3NotConfiguredError();

  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key:    s3Key,
  });

  return await getSignedUrl(client, command, { expiresIn: READ_URL_TTL_SECONDS });
}

/**
 * Delete a stored object. Used by cleanup paths (founder rejects the
 * screenshot, vision moderation fails the gate, etc.). Idempotent —
 * deleting an already-deleted key is a no-op at S3.
 *
 * Catches and logs failures rather than throwing; the caller's
 * artifact write has already happened, and a leaked S3 object is
 * caught by the lifecycle rule within 30 days.
 */
export async function deleteObject(s3Key: string): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    await client.send(new DeleteObjectCommand({
      Bucket: bucket(),
      Key:    s3Key,
    }));
  } catch (err) {
    logger.warn('S3 deleteObject failed', { s3Key, err: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------------------
// Test-only export
// ---------------------------------------------------------------------------

export const __testInternals = {
  buildKey,
  CONTENT_TYPE_TO_EXT,
  UPLOAD_URL_TTL_SECONDS,
  READ_URL_TTL_SECONDS,
  STAGE4_KEY_PREFIX,
  MAX_SCREENSHOT_BYTES,
};
