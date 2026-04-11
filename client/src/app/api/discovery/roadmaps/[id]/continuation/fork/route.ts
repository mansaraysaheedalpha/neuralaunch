// src/app/api/discovery/roadmaps/[id]/continuation/fork/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma, { toJsonValue } from '@/lib/prisma';
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
} from '@/lib/continuation';
import { ROADMAP_EVENT } from '@/lib/roadmap';
import { buildPhaseContext, PHASES } from '@/lib/phase-context';

export const maxDuration = 30;

const BodySchema = z.object({
  forkId: z.string().min(1),
});

/**
 * POST /api/discovery/roadmaps/[id]/continuation/fork
 *
 * Closes the continuation cycle. Builds a fork-derived Recommendation
 * via buildForkRecommendationPayload, persists it (auto-accepted,
 * inheriting the parent session + recommendationType, phaseContext
 * pointing back), flips the parent roadmap to FORK_SELECTED, and
 * fires the roadmap-generation event with parentRoadmapId so the
 * generator picks up the speed calibration. Returns the new
 * recommendationId for client navigation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
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
        id:                 true,
        continuationStatus: true,
        continuationBrief:  true,
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

    // Build the fork-derived Recommendation payload via the pure helper.
    // The synthesis is intentionally deterministic — no extra LLM call.
    const payload = buildForkRecommendationPayload({ fork, brief });

    const newRecommendationId = await prisma.$transaction(async (tx) => {
      const newRec = await tx.recommendation.create({
        data: {
          userId,
          sessionId:              row.recommendation!.sessionId,
          recommendationType:     row.recommendation!.recommendationType,
          summary:                payload.summary,
          path:                   payload.path,
          reasoning:              payload.reasoning,
          firstThreeSteps:        toJsonValue(payload.firstThreeSteps),
          timeToFirstResult:      payload.timeToFirstResult,
          risks:                  toJsonValue(payload.risks),
          assumptions:            toJsonValue(payload.assumptions),
          whatWouldMakeThisWrong: payload.whatWouldMakeThisWrong,
          alternativeRejected:    toJsonValue(payload.alternativeRejected),
          // Auto-accept — the founder explicitly picked this fork.
          acceptedAt:             new Date(),
          acceptedAtRound:        0,
          phaseContext: toJsonValue(buildPhaseContext(PHASES.RECOMMENDATION, {
            discoverySessionId: row.recommendation!.sessionId,
            recommendationId:   row.recommendation!.id,
          })),
        },
        select: { id: true },
      });

      await tx.roadmap.update({
        where: { id: roadmapId },
        data:  { continuationStatus: CONTINUATION_STATUSES.FORK_SELECTED },
      });

      return newRec.id;
    });

    // Fire the existing roadmap generation event with the new
    // recommendationId AND the parent roadmap id so the generator
    // picks up the speed calibration from the parent's executionMetrics.
    await inngest.send({
      name: ROADMAP_EVENT,
      data: { recommendationId: newRecommendationId, userId, parentRoadmapId: roadmapId },
    });

    log.info('[ContinuationFork] Cycle closed', {
      forkId:               fork.id,
      forkTitle:            fork.title,
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
