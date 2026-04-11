// src/app/api/discovery/roadmaps/[id]/continuation/fork/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
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
} from '@/lib/continuation';

export const maxDuration = 30;

const BodySchema = z.object({
  forkId: z.string().min(1),
});

/**
 * POST /api/discovery/roadmaps/[id]/continuation/fork
 *
 * Phase 4 implementation: persists the founder's pick by flipping
 * the parent roadmap's continuationStatus to FORK_SELECTED. Phase 6
 * extends this route to also fire the next-cycle roadmap generation
 * event with the chosen fork as the seed for the new recommendation.
 *
 * Validates:
 *   - The roadmap exists and is owned by the caller
 *   - The continuation brief exists and is in BRIEF_READY status
 *   - The forkId matches one of the brief's forks
 *
 * Returns the picked fork object so the client can render confirmation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'roadmap-continuation-fork', RATE_LIMITS.API_AUTHENTICATED);

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
      },
    });
    if (!row) throw new HttpError(404, 'Not found');
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

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { continuationStatus: CONTINUATION_STATUSES.FORK_SELECTED },
    });

    log.info('[ContinuationFork] Fork selected', {
      forkId:    fork.id,
      forkTitle: fork.title,
    });

    // Phase 6 will fire the next-cycle roadmap generation event here
    // with the chosen fork as the seed for the new recommendation.
    // Today the route just persists the pick.

    return NextResponse.json({
      forkSelected: fork,
      status:       CONTINUATION_STATUSES.FORK_SELECTED,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
