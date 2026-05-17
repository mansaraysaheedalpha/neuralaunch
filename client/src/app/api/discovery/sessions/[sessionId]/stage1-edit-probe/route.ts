// src/app/api/discovery/sessions/[sessionId]/stage1-edit-probe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';
import { teeDiscoveryStream } from '@/lib/discovery';
import {
  getActiveStageRun,
  safeParseStage1AuthoringState,
  streamStage1EditProbe,
} from '@/lib/ideation';
import {
  withStreamingAgentSpan,
  ATTR_GENERATION_TYPE,
} from '@/lib/observability';

// Same ceiling as /turn so the fallback chain has the same headroom.
export const maxDuration = 90;

/**
 * POST /api/discovery/sessions/[sessionId]/stage1-edit-probe
 *
 * Fires the first agent message after the founder reverts a Stage 1
 * row to edit a single dimension. The /edit route sets
 * editTargetDimension + editStartedAt on the new authoring state; the
 * client lands back in the chat surface and calls THIS endpoint once
 * to stream a scoped probe that explicitly references the founder's
 * previously-captured value for the dimension they're editing.
 *
 * Symmetric to /stage1-opening but with two additional gates:
 *   1. editTargetDimension !== null (an edit must actually be in flight)
 *   2. No assistant Message with createdAt > editStartedAt
 *      (re-fire guard — once the probe has streamed once for this
 *      edit, subsequent calls 409 instead of overwriting it)
 *
 * Safeguards mirror the opening route:
 *   - CSRF + auth + DISCOVERY_TURN rate limit (shared budget with
 *     /turn and /stage1-opening so the founder can't multiply their
 *     quota by hopping endpoints)
 *   - Ownership scope via findFirst with userId
 *   - Scenario lock: presence of any IdeationStageRun row proves
 *     this is a no_idea session. Postgres-backed, survives Redis
 *     eviction (the previous Redis-state lifecycleScenario check
 *     broke when Postgres rehydration repopulated state without
 *     that field).
 *   - Stage gate: active stage run MUST be Stage 1 in 'authoring'
 *   - Termination check
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'discovery-turn', RATE_LIMITS.DISCOVERY_TURN);

    const { sessionId } = await params;
    const log = logger.child({
      route: 'POST /api/discovery/sessions/[id]/stage1-edit-probe',
      userId,
      sessionId,
    });

    // Ownership + termination + conversation linkage. We fetch the
    // conversationId here so teeDiscoveryStream can persist the
    // assistant message; the re-fire check uses a separate query
    // (after editStartedAt is in scope from the stage run).
    const dbSession = await prisma.discoverySession.findFirst({
      where:  { id: sessionId, userId },
      select: {
        conversationId: true,
        status:         true,
      },
    });
    if (!dbSession) throw new HttpError(404, 'Session not found');
    if (dbSession.status === 'TERMINATED') {
      throw new HttpError(403, 'Session terminated');
    }

    // Scenario lock via IdeationStageRun presence. Replaces the prior
    // Redis-backed lifecycleScenario check, which broke after Redis
    // TTL eviction (Postgres rehydration repopulated state without
    // lifecycleScenario). dbSession's userId filter already enforces
    // ownership; no separate Redis userId check needed.
    const stageRun = await getActiveStageRun(sessionId);
    if (!stageRun) {
      throw new HttpError(409, 'Edit probe only valid for no_idea sessions');
    }
    if (stageRun.stageNumber !== 1 || stageRun.status !== 'authoring') {
      throw new HttpError(409, 'Stage 1 is not in authoring state');
    }

    const authoring = safeParseStage1AuthoringState(stageRun.output);
    if (authoring.editTargetDimension === null) {
      throw new HttpError(409, 'No edit dimension in flight — call /turn instead');
    }

    // Re-fire guard. The /edit route stamped editStartedAt; if any
    // assistant Message has landed in the conversation AFTER that
    // timestamp, the probe already ran for this edit and a re-fire
    // would overwrite real conversation context.
    //
    // editStartedAt can be null on authoring states persisted BEFORE
    // the schema field landed. We treat null as "tracking just
    // started — first fire is allowed" and rely on the client-side
    // ref guard plus the row's transition history to prevent abuse.
    // The realistic exposure is bounded: a founder who began editing
    // before this deploy will see exactly one extra probe.
    if (authoring.editStartedAt !== null) {
      const laterAssistant = dbSession.conversationId
        ? await prisma.message.count({
            where: {
              conversationId: dbSession.conversationId,
              role:           'assistant',
              createdAt:      { gt: new Date(authoring.editStartedAt) },
            },
          })
        : 0;
      if (laterAssistant > 0) {
        throw new HttpError(409, 'Edit probe already fired for this edit');
      }
    }

    // Mark the session as recently active so the /discovery
    // resumption-detection redirect picks it up if the founder
    // navigates away mid-edit. Fire-and-forget — same pattern as
    // /stage1-opening.
    prisma.discoverySession
      .update({ where: { id: sessionId }, data: { lastTurnAt: new Date() }, select: { id: true } })
      .catch(() => { /* non-fatal */ });

    const result = streamStage1EditProbe({ state: authoring });

    const observed = await withStreamingAgentSpan(
      {
        name:       'ideation.stage1.edit_probe',
        attributes: { [ATTR_GENERATION_TYPE]: 'question' },
      },
      () => ({
        stream:    teeDiscoveryStream(result.textStream, dbSession.conversationId, result.modelUsed),
        modelUsed: result.modelUsed,
        usage:     result.usagePromise,
      }),
    );

    log.debug('Stage 1 edit probe streaming', {
      editTargetDimension: authoring.editTargetDimension,
    });

    const response = new NextResponse(observed);
    response.headers.set('Content-Type', 'text/plain; charset=utf-8');
    response.headers.set('X-Stage',      '1');
    response.headers.set('X-Stage-Move', 'edit_probe');
    return response;
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
