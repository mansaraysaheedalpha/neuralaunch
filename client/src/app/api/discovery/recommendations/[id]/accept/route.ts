// src/app/api/discovery/recommendations/[id]/accept/route.ts
import { NextResponse } from 'next/server';
import prisma          from '@/lib/prisma';
import { logger }      from '@/lib/logger';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { safeParsePushbackHistory } from '@/lib/discovery/pushback-engine';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import {
  assertVentureLimitNotReached,
  bootstrapVentureAndCycleForRecommendation,
} from '@/lib/lifecycle';

/**
 * POST /api/discovery/recommendations/[id]/accept
 *
 * The founder explicitly commits to this recommendation. Sets acceptedAt
 * and acceptedAtRound. The "Generate Roadmap" button only enables after
 * this — acceptance is non-negotiable and cannot be inferred from
 * agent-side actions like refine or replace.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'rec-accept', RATE_LIMITS.API_AUTHENTICATED);

    const { id: recommendationId } = await params;
    const log = logger.child({ route: 'POST recommendations/accept', recommendationId, userId });

    const rec = await prisma.recommendation.findFirst({
      where:  { id: recommendationId, userId },
      select: { id: true, acceptedAt: true, pushbackHistory: true, cycleId: true, path: true },
    });
    if (!rec) throw new HttpError(404, 'Not found');
    if (rec.acceptedAt) {
      // Idempotent: a second accept on an already-accepted recommendation
      // is a no-op success
      return NextResponse.json({ ok: true, alreadyAccepted: true });
    }

    const history = safeParsePushbackHistory(rec.pushbackHistory);
    const userTurns = history.filter(t => t.role === 'user').length;

    // When the recommendation is not yet linked to a Cycle (first
    // acceptance from a fresh discovery — not the fork flow, which
    // pre-links before this route is hit), check the venture cap
    // BEFORE opening the transaction. The cap helper uses non-tx
    // reads; opening a tx, discovering the cap is hit, and then
    // rolling back wastes round-trips.
    if (!rec.cycleId) {
      await assertVentureLimitNotReached(userId);
    }

    // Single transaction: bootstrap venture+cycle if needed, then
    // apply the acceptedAt guard. The guard is a compare-and-swap
    // on `acceptedAt: null`, so parallel accept POSTs race safely —
    // only the winning tx's update affects a row, and the loser
    // throws RACE_LOST to roll back the bootstrapped venture+cycle
    // so no orphan rows survive.
    const RACE_LOST = 'neuralaunch.accept.race-lost';
    let txResult: { cycleId: string; bootstrapped: boolean };
    try {
      txResult = await prisma.$transaction(async (tx) => {
        let cycleIdToLink = rec.cycleId;
        const bootstrapped = !cycleIdToLink;
        if (!cycleIdToLink) {
          const bootstrap = await bootstrapVentureAndCycleForRecommendation(tx, {
            userId,
            recommendationId,
            recommendationPath: rec.path,
          });
          cycleIdToLink = bootstrap.cycleId;
        }

        const updated = await tx.recommendation.updateMany({
          where: { id: recommendationId, acceptedAt: null },
          data:  {
            acceptedAt:      new Date(),
            acceptedAtRound: userTurns,
            // Only writes when we bootstrapped — the pre-fork path
            // set cycleId at fork-pick time and we do not overwrite.
            ...(rec.cycleId ? {} : { cycleId: cycleIdToLink }),
          },
        });

        if (updated.count === 0) {
          // Lost the race. Throw so the tx rolls back, discarding
          // any freshly-bootstrapped venture+cycle rows the loser
          // just created. Caught below and mapped to the
          // alreadyAccepted success response.
          throw new Error(RACE_LOST);
        }

        return { cycleId: cycleIdToLink, bootstrapped };
      });
    } catch (err) {
      if (err instanceof Error && err.message === RACE_LOST) {
        log.info('Recommendation accept raced — already accepted by concurrent request');
        return NextResponse.json({ ok: true, alreadyAccepted: true });
      }
      throw err;
    }

    log.info('Recommendation accepted', {
      acceptedAtRound: userTurns,
      cycleId:         txResult.cycleId,
      bootstrapped:    txResult.bootstrapped,
    });
    return NextResponse.json({ ok: true, acceptedAtRound: userTurns });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}

/**
 * DELETE /api/discovery/recommendations/[id]/accept
 *
 * Un-accept. Clears acceptedAt and increments unacceptCount. The roadmap
 * (if already generated) is not deleted — it remains accessible via the
 * Past Recommendations dashboard. Un-accept is for "I want to think
 * more before committing further", not for "undo what is already built".
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'rec-unaccept', RATE_LIMITS.API_AUTHENTICATED);

    const { id: recommendationId } = await params;
    const log = logger.child({ route: 'DELETE recommendations/accept', recommendationId, userId });

    const rec = await prisma.recommendation.findFirst({
      where:  { id: recommendationId, userId },
      select: { id: true, acceptedAt: true },
    });
    if (!rec) throw new HttpError(404, 'Not found');
    if (!rec.acceptedAt) {
      return NextResponse.json({ ok: true, alreadyUnaccepted: true });
    }

    await prisma.recommendation.update({
      where: { id: recommendationId },
      data:  {
        acceptedAt:      null,
        acceptedAtRound: null,
        unacceptCount:   { increment: 1 },
      },
    });

    log.info('Recommendation un-accepted');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
