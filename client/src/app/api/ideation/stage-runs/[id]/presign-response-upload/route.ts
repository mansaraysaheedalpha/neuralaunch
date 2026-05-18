// src/app/api/ideation/stage-runs/[id]/presign-response-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';
import {
  requireOwnedStageRun,
  safeParseStage4AuthoringState,
  allOpportunityIds,
  ALLOWED_SCREENSHOT_CONTENT_TYPES,
} from '@/lib/ideation';
import { getPresignedUploadUrl, S3NotConfiguredError } from '@/lib/storage/s3';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const RequestSchema = z.object({
  opportunityId: z.string().min(1),
  contentType:   z.enum(ALLOWED_SCREENSHOT_CONTENT_TYPES),
});

/**
 * POST /api/ideation/stage-runs/[id]/presign-response-upload
 *
 * Issues a presigned S3 PUT URL the browser uploads to directly. The
 * file never touches our server. Returns { uploadUrl, s3Key, s3Url }
 * — the client uploads to uploadUrl, then submits the s3Key to
 * /community-response (commit #4) to register the response and
 * trigger vision extraction.
 *
 * Safeguards:
 *   - CSRF + auth + AI_GENERATION rate limit (shares budget with
 *     other Stage 4 mutation routes so a malicious client can't
 *     burn quota by spamming presigns)
 *   - Ownership scope via requireOwnedStageRun
 *   - Stage gate: must be a Stage 4 row in 'authoring' status
 *   - Opportunity gate: opportunityId must exist on the authoring
 *     state's opportunities[] — otherwise founders could upload to
 *     other people's keys via guessable ids
 *   - Content-type allow-list: only image/png, image/jpeg, image/webp
 *   - S3-not-configured → 503 with a clear message rather than a
 *     generic 500 so the UI can render an actionable error
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-presign-upload', RATE_LIMITS.AI_GENERATION);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 4) throw new HttpError(409, 'Not a Stage 4 run');
    if (run.status !== 'authoring') {
      throw new HttpError(409, 'Stage 4 row is not in authoring state');
    }

    // Verify the opportunityId actually exists on this stage row —
    // the founder can only upload screenshots for opportunities they
    // own. Prevents a malicious client guessing IDs to write under
    // other founders' key prefixes.
    const state = safeParseStage4AuthoringState(run.output);
    if (!allOpportunityIds(state).includes(parsed.data.opportunityId)) {
      throw new HttpError(404, 'Opportunity not found on this stage run');
    }

    try {
      const presigned = await getPresignedUploadUrl({
        userId,
        sessionId:     run.sessionId,
        opportunityId: parsed.data.opportunityId,
        contentType:   parsed.data.contentType,
      });

      logger.child({ route: 'POST /api/ideation/stage-runs/[id]/presign-response-upload', userId, stageRunId: id })
            .debug('Presigned upload URL issued', { opportunityId: parsed.data.opportunityId });

      return NextResponse.json({
        ok:        true,
        uploadUrl: presigned.uploadUrl,
        s3Key:     presigned.s3Key,
        s3Url:     presigned.s3Url,
      });
    } catch (err) {
      if (err instanceof S3NotConfiguredError) {
        throw new HttpError(503, 'Screenshot upload is temporarily unavailable. Try again later or paste the response as text.');
      }
      throw err;
    }
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
