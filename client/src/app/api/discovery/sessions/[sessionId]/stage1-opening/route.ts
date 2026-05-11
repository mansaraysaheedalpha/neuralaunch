// src/app/api/discovery/sessions/[sessionId]/stage1-opening/route.ts
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
import { getSession, teeDiscoveryStream } from '@/lib/discovery';
import {
  getActiveStageRun,
  streamStage1Opening,
} from '@/lib/ideation';
import {
  withStreamingAgentSpan,
  ATTR_GENERATION_TYPE,
} from '@/lib/observability';

// Same ceiling as /turn so the fallback chain has the same headroom.
export const maxDuration = 90;

/**
 * POST /api/discovery/sessions/[sessionId]/stage1-opening
 *
 * Fires the very first agent probe for a freshly-created no_idea
 * session. Called once by the Stage 1 client on mount when the
 * conversation has no prior assistant messages and the authoring
 * state is pristine. Streams a single LLM-generated probe question
 * anchored on the agent's chosen seed dimension.
 *
 * Why a dedicated route rather than /turn with an `opening: true` flag:
 *   - /turn's body schema requires message.min(1); the opening has no
 *     founder message. Two distinct request shapes deserve two routes.
 *   - The opening bypasses the safety gate (nothing to classify), the
 *     user-message persistence step, and the extractAndPlan call. A
 *     dedicated route makes that bypass explicit instead of branching
 *     deep inside /turn.
 *
 * Safeguards:
 *   - CSRF + auth + DISCOVERY_TURN rate limit (shared budget with /turn
 *     so the founder cannot double their quota by hopping endpoints)
 *   - Ownership scope via findFirst with userId
 *   - Pristine-state check: refuses if the conversation already has
 *     ANY assistant message, OR the Redis session state is missing,
 *     OR the active stage row is not Stage 1 in 'authoring'. The
 *     check is server-side authoritative; the client mount-guard is
 *     purely a UX optimisation.
 *   - Scenario lock: lifecycleScenario MUST be 'no_idea'.
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
      route: 'POST /api/discovery/sessions/[id]/stage1-opening',
      userId,
      sessionId,
    });

    // Ownership + termination check + assistant-message presence + first name
    // — all in one findFirst so a stale or non-owned id fails uniformly.
    const dbSession = await prisma.discoverySession.findFirst({
      where:  { id: sessionId, userId },
      select: {
        conversationId: true,
        status:         true,
        user:           { select: { name: true } },
        conversation: {
          select: {
            messages: {
              where:  { role: 'assistant' },
              select: { id: true },
              take:   1,
            },
          },
        },
      },
    });
    if (!dbSession) throw new HttpError(404, 'Session not found');
    if (dbSession.status === 'TERMINATED') {
      throw new HttpError(403, 'Session terminated');
    }

    // Pristine-conversation guard. Once any assistant message has
    // landed (either via this endpoint OR /turn), the opening cannot
    // be re-fired — that would overwrite real conversation context.
    if ((dbSession.conversation?.messages.length ?? 0) > 0) {
      throw new HttpError(409, 'Opening probe already fired for this session');
    }

    // Verify Redis state confirms scenario=no_idea. The Redis state
    // is the only source of truth for lifecycleScenario.
    const state = await getSession(sessionId);
    if (!state) throw new HttpError(404, 'Session state expired');
    if (state.userId !== userId) throw new HttpError(401, 'Unauthorised');
    if (state.lifecycleScenario !== 'no_idea') {
      throw new HttpError(409, 'Opening probe only valid for no_idea sessions');
    }

    // Active stage row must be Stage 1 in 'authoring'.
    const stageRun = await getActiveStageRun(sessionId);
    if (!stageRun || stageRun.stageNumber !== 1 || stageRun.status !== 'authoring') {
      throw new HttpError(409, 'Stage 1 is not in opening state');
    }

    const firstName = dbSession.user?.name?.split(' ')[0] ?? '';

    const result = streamStage1Opening({ firstName });

    const observed = await withStreamingAgentSpan(
      {
        name:       'ideation.stage1.opening',
        attributes: { [ATTR_GENERATION_TYPE]: 'question' },
      },
      () => ({
        stream:    teeDiscoveryStream(result.textStream, dbSession.conversationId, result.modelUsed),
        modelUsed: result.modelUsed,
        usage:     result.usagePromise,
      }),
    );

    log.debug('Stage 1 opening probe streaming');

    const response = new NextResponse(observed);
    response.headers.set('Content-Type',  'text/plain; charset=utf-8');
    response.headers.set('X-Stage',       '1');
    response.headers.set('X-Stage-Move',  'opening');
    return response;
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
