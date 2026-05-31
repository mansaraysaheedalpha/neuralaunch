// src/app/api/discovery/recommendations/[id]/revert/route.ts
//
// Single-level undo for a refine/replace pushback commit. Pops the
// latest snapshot off Recommendation.versions[] and writes its fields
// back onto the row. Added in PR 16-data, wired to the post-commit
// toast's Undo action in RecommendationView. Idempotency: if there
// are no versions to pop, returns 409.
//
// Constraints:
//   - founder owns the recommendation (findFirst with userId)
//   - recommendation is not yet accepted (we do not undo into a state
//     that would orphan a downstream roadmap)
//   - optimistic concurrency on pushbackVersion so a racing pushback
//     POST cannot clobber the revert (and vice-versa) — 409 + the
//     client refetches

import { NextResponse } from 'next/server';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { auth } from '@/auth';
import {
  HttpError,
  httpErrorToResponse,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { RecommendationSchema } from '@/lib/discovery/recommendation-schema';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) throw new HttpError(401, 'Unauthorized');

    await rateLimitByUser(userId, 'rec-revert', RATE_LIMITS.API_AUTHENTICATED);

    const { id: recommendationId } = await params;
    const log = logger.child({ route: 'POST recommendations/revert', recommendationId, userId });

    const rec = await prisma.recommendation.findFirst({
      where:  { id: recommendationId, userId },
      select: {
        id:              true,
        acceptedAt:      true,
        pushbackVersion: true,
        versions:        true,
      },
    });
    if (!rec) throw new HttpError(404, 'Not found');
    if (rec.acceptedAt) {
      throw new HttpError(409, 'Cannot revert an accepted recommendation');
    }

    const versionsRaw = Array.isArray(rec.versions)
      ? (rec.versions as unknown[])
      : [];
    if (versionsRaw.length === 0) {
      throw new HttpError(409, 'Nothing to undo');
    }

    const last = versionsRaw[versionsRaw.length - 1] as { snapshot?: unknown } | undefined;
    if (!last || typeof last !== 'object' || !('snapshot' in last)) {
      throw new HttpError(409, 'Latest version is malformed — nothing to undo');
    }

    // The snapshot was written as the PRE-update state (see
    // pushback/route.ts), so restoring its fields is exactly what
    // "undo" should do. Validate through the canonical schema to
    // refuse a corrupt JSONB row instead of writing nonsense back.
    const snapshot = RecommendationSchema.parse(last.snapshot);

    const nextVersions = versionsRaw.slice(0, -1);
    const prevVersion = rec.pushbackVersion;

    const writeResult = await prisma.recommendation.updateMany({
      where: { id: recommendationId, pushbackVersion: prevVersion },
      data: {
        recommendationType:     snapshot.recommendationType,
        summary:                snapshot.summary,
        path:                   snapshot.path,
        reasoning:              snapshot.reasoning,
        firstThreeSteps:        toJsonValue(snapshot.firstThreeSteps),
        timeToFirstResult:      snapshot.timeToFirstResult,
        risks:                  toJsonValue(snapshot.risks),
        assumptions:            toJsonValue(snapshot.assumptions),
        whatWouldMakeThisWrong: snapshot.whatWouldMakeThisWrong,
        alternativeRejected:    toJsonValue(snapshot.alternativeRejected),
        versions:               toJsonValue(nextVersions),
        pushbackVersion:        { increment: 1 },
      },
    });

    if (writeResult.count === 0) {
      // A concurrent pushback POST raced us between read and write —
      // refuse rather than overwrite the racing update's content.
      throw new HttpError(409, 'Conflicting update — please refresh and retry');
    }

    log.info('Recommendation reverted', { remainingVersions: nextVersions.length });
    return NextResponse.json(
      { ok: true, remainingVersions: nextVersions.length },
      { status: 200 },
    );
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
