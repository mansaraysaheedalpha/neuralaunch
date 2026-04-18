// src/app/api/discovery/roadmaps/[id]/continuation/fork/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { inngest } from '@/inngest/client';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  CONTINUATION_STATUSES,
  safeParseContinuationBrief,
  buildForkRecommendationPayload,
  persistForkRecommendation,
} from '@/lib/continuation';
import { ROADMAP_EVENT } from '@/lib/roadmap';
import { requireTierOrThrow } from '@/lib/auth/require-tier';

export const maxDuration = 30;

const BodySchema = z.object({
  forkId: z.string().min(1),
});

/**
 * POST /api/discovery/roadmaps/[id]/continuation/fork
 *
 * Closes the continuation cycle. Idempotent: a retry of the same
 * fork pick (e.g. after a transient inngest.send failure) reads
 * Roadmap.forkRecommendationId, looks up the existing fork-derived
 * Recommendation, re-fires the roadmap-generation event, and returns
 * the existing id rather than creating a duplicate.
 *
 * Happy path:
 *   1. Build the payload from the picked fork via the pure helper.
 *   2. In one transaction: create the new Recommendation AND set
 *      Roadmap.forkRecommendationId + flip status to FORK_SELECTED.
 *      The unique constraint on forkRecommendationId guards against
 *      concurrent double-creates at the database level.
 *   3. Send the inngest event. If it fails, the row is in a stable
 *      state (FORK_SELECTED with the linkage column set) and the
 *      next retry will follow the idempotent re-fire path.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'compound');
    await rateLimitByUser(userId, 'roadmap-continuation-fork', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    const log = logger.child({ route: 'POST continuation-fork', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const row = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: {
        id:                   true,
        continuationStatus:   true,
        continuationBrief:    true,
        forkRecommendationId: true,
        recommendation: {
          select: {
            id:                 true,
            sessionId:          true,
            recommendationType: true,
          },
        },
      },
    });
    if (!row || !row.recommendation) throw new HttpError(404, 'Not found');

    // Idempotent re-fire path. If the row already has a linked
    // fork-derived Recommendation, the previous call succeeded at
    // the database level — only the inngest send may have failed.
    // Re-fire the event (it is itself idempotent) and return the
    // existing id so the founder lands on the same downstream
    // roadmap regardless of how many times they retry.
    if (row.forkRecommendationId) {
      await inngest.send({
        name: ROADMAP_EVENT,
        data: {
          recommendationId: row.forkRecommendationId,
          userId,
          parentRoadmapId:  roadmapId,
        },
      });
      log.info('[ContinuationFork] Idempotent re-fire', { newRecommendationId: row.forkRecommendationId });
      return NextResponse.json({
        status:              CONTINUATION_STATUSES.FORK_SELECTED,
        newRecommendationId: row.forkRecommendationId,
        replayed:            true,
      });
    }

    if (row.continuationStatus !== CONTINUATION_STATUSES.BRIEF_READY) {
      throw new HttpError(409, 'No continuation brief is ready for this roadmap');
    }

    const brief = safeParseContinuationBrief(row.continuationBrief);
    if (!brief) {
      throw new HttpError(409, 'Continuation brief is malformed — cannot select a fork');
    }

    const fork = brief.forks.find(f => f.id === parsed.data.forkId);
    if (!fork) {
      throw new HttpError(400, 'Fork id does not match this brief');
    }

    const payload = buildForkRecommendationPayload({ fork, brief });
    const { newRecommendationId } = await persistForkRecommendation({
      parentRoadmapId:          roadmapId,
      parentRecommendationId:   row.recommendation.id,
      parentSessionId:          row.recommendation.sessionId,
      parentRecommendationType: row.recommendation.recommendationType,
      userId,
      payload,
    });

    // Send the inngest event after the transaction commits. If this
    // fails (transient network), the row is in a stable state with
    // forkRecommendationId set — a client retry hits the idempotent
    // re-fire path above and recovers without creating duplicates.
    await inngest.send({
      name: ROADMAP_EVENT,
      data: { recommendationId: newRecommendationId, userId, parentRoadmapId: roadmapId },
    });

    log.info('[ContinuationFork] Cycle closed', {
      forkId:              fork.id,
      newRecommendationId,
    });

    return NextResponse.json({
      forkSelected:        fork,
      status:              CONTINUATION_STATUSES.FORK_SELECTED,
      newRecommendationId,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
