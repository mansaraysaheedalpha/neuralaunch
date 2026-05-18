// src/app/api/discovery/recommendations/[id]/regenerate/route.ts
//
// Self-service repair endpoint. Re-runs the discovery synthesis chain
// for an existing Recommendation by re-firing the
// `discovery/synthesis.requested` Inngest event with the original
// sessionId + userId. The synthesis function loads belief state from
// Redis OR Postgres (getSession falls back), so a session whose Redis
// state has long since been cleaned up still rehydrates and re-runs.
//
// Persistence is idempotent: the existing function upserts on
// `findFirst({ sessionId, parentRecommendationId: null })` so the
// in-place overwrite hits the same row.
//
// Gating: requires the founder's session.user.email to be in the
// ADMIN_REGENERATE_EMAILS env var (comma-separated). Added 2026-05-18
// for the recovery of one malformed prod row. The gate fails closed
// when the env var is unset.
//
// Invariants this route enforces:
// - Founder owns the recommendation (findFirst with userId)
// - Recommendation is not yet accepted (no roadmap downstream churn)
// - No user-side pushback turns exist (preserves pushback coherence —
//   regenerating after pushback rounds would orphan the conversation)

import { NextResponse } from 'next/server';
import prisma           from '@/lib/prisma';
import { logger }       from '@/lib/logger';
import { inngest }      from '@/inngest/client';
import { auth }         from '@/auth';
import {
  HttpError,
  httpErrorToResponse,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { safeParsePushbackHistory } from '@/lib/discovery/pushback-engine';
import { isRegenerateAllowed } from '@/lib/discovery/regenerate-allowlist';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);

    const session = await auth();
    const userId = session?.user?.id;
    const email  = session?.user?.email;
    if (!userId) throw new HttpError(401, 'Unauthorized');
    if (!isRegenerateAllowed(email)) {
      // Generic 404 rather than 403 so the route's existence is not
      // leaked to non-allowlisted founders.
      throw new HttpError(404, 'Not found');
    }

    await rateLimitByUser(userId, 'rec-regenerate', RATE_LIMITS.AI_GENERATION);

    const { id: recommendationId } = await params;
    const log = logger.child({ route: 'POST recommendations/regenerate', recommendationId, userId });

    const rec = await prisma.recommendation.findFirst({
      where:  { id: recommendationId, userId },
      select: {
        id:              true,
        sessionId:       true,
        acceptedAt:      true,
        pushbackHistory: true,
      },
    });
    if (!rec) throw new HttpError(404, 'Not found');
    if (rec.acceptedAt) {
      throw new HttpError(409, 'Cannot regenerate an accepted recommendation');
    }

    const history = safeParsePushbackHistory(rec.pushbackHistory);
    const hasUserTurns = history.some(t => t.role === 'user');
    if (hasUserTurns) {
      throw new HttpError(409, 'Cannot regenerate after pushback rounds');
    }

    // Reset synthesisStep so the polling UI on the page reflects "in
    // progress" rather than the prior run's leftover value. The
    // synthesis function updates this on each step transition.
    await prisma.discoverySession
      .update({
        where: { id: rec.sessionId },
        data:  { synthesisStep: 'loading' },
        select: { id: true },
      })
      .catch(() => { /* non-fatal — the function will retry the update */ });

    await inngest.send({
      name: 'discovery/synthesis.requested',
      data: { sessionId: rec.sessionId, userId },
    });

    log.info('Recommendation regenerate event sent', { sessionId: rec.sessionId });
    return NextResponse.json({ ok: true, queued: true, sessionId: rec.sessionId }, { status: 202 });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
