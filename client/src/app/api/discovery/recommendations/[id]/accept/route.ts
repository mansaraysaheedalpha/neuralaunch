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
import type { PushbackTurn } from '@/lib/discovery/pushback-engine';

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
    await rateLimitByUser(userId, 'rec-accept', RATE_LIMITS.API_AUTHENTICATED);

    const { id: recommendationId } = await params;
    const log = logger.child({ route: 'POST recommendations/accept', recommendationId, userId });

    const rec = await prisma.recommendation.findFirst({
      where:  { id: recommendationId, userId },
      select: { id: true, acceptedAt: true, pushbackHistory: true },
    });
    if (!rec) throw new HttpError(404, 'Not found');
    if (rec.acceptedAt) {
      // Idempotent: a second accept on an already-accepted recommendation
      // is a no-op success
      return NextResponse.json({ ok: true, alreadyAccepted: true });
    }

    const history = (rec.pushbackHistory ?? []) as unknown as PushbackTurn[];
    const userTurns = history.filter(t => t.role === 'user').length;

    await prisma.recommendation.update({
      where: { id: recommendationId },
      data:  {
        acceptedAt:      new Date(),
        acceptedAtRound: userTurns,
      },
    });

    log.info('Recommendation accepted', { acceptedAtRound: userTurns });
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
