// src/app/api/ideation/stage-runs/[id]/community-response/route.ts
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
  runCommunityResponsePipeline,
} from '@/lib/ideation';
import { isS3KeyOwnedBy } from '@/lib/storage/s3';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Vision moderation (Haiku) + extraction (Sonnet) + aggregate
// recompute + verdict synthesis (Sonnet) all run sequentially inside
// the route. ~30-60s p99; 90s gives fallback-chain headroom.
export const maxDuration = 90;

const RequestSchema = z.union([
  z.object({
    opportunityId: z.string().min(1),
    source:        z.literal('text_paste'),
    pastedText:    z.string().min(1).max(2400),
  }),
  z.object({
    opportunityId: z.string().min(1),
    source:        z.literal('screenshot'),
    s3Key:         z.string().min(1),
    s3Url:         z.string().min(1),
  }),
]);

/**
 * POST /api/ideation/stage-runs/[id]/community-response
 *
 * Founder commits a community-engagement response (text paste OR
 * uploaded screenshot). Delegates the full vision + recompute +
 * verdict-synthesis pipeline to runCommunityResponsePipeline so this
 * route stays at orchestration shape.
 *
 * Fail-closed: if Haiku moderation throws, the response persists
 * with moderationPassed=false + moderationReason='moderation_call_failed';
 * vision extraction is skipped; verdict synthesis still fires (the new
 * response contributes null signal to the aggregate). Founder sees the
 * stored response without extracted detail and can retry later.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-community-response', RATE_LIMITS.AI_GENERATION);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 4) throw new HttpError(409, 'Not a Stage 4 run');
    if (run.status !== 'authoring') throw new HttpError(409, 'Stage 4 row is not in authoring state');

    const state = safeParseStage4AuthoringState(run.output);
    if (!state.opportunities.some(o => o.id === parsed.data.opportunityId)) {
      throw new HttpError(404, 'Opportunity not found on this stage run');
    }

    // Cross-tenant guard for screenshot uploads (see isS3KeyOwnedBy
    // in lib/storage/s3.ts). The s3Key MUST live under the current
    // user's own prefix; without this, a malicious founder who somehow
    // obtained another founder's s3Key could trigger our IAM-credentialed
    // vision pipeline against the foreign object and land the extracted
    // comments on their own artifact.
    if (parsed.data.source === 'screenshot' && !isS3KeyOwnedBy(parsed.data.s3Key, userId)) {
      throw new HttpError(400, 'Invalid s3Key — does not belong to this user');
    }

    const result = await runCommunityResponsePipeline({
      stageRunId: id,
      userId,
      input:      parsed.data,
    });

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/community-response', userId, stageRunId: id })
          .debug('Community response logged + verdict re-synthesized', {
            opportunityId: parsed.data.opportunityId,
            source:        parsed.data.source,
            verdict:       result.agentVerdict,
          });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
