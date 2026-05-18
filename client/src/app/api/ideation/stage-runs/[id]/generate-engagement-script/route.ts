// src/app/api/ideation/stage-runs/[id]/generate-engagement-script/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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
import {
  requireOwnedStageRun,
  safeParseStage4AuthoringState,
  safeParseOutcomeDocument,
  persistLayerBScript,
  runLayerBScript,
} from '@/lib/ideation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// One Sonnet call, no tools. Sub-15s p99; 90s ceiling for fallback
// chain headroom.
export const maxDuration = 90;

const RequestSchema = z.object({
  opportunityId: z.string().min(1),
});

/**
 * POST /api/ideation/stage-runs/[id]/generate-engagement-script
 *
 * Fires Layer B test-script generation for ONE opportunity. The
 * script tells the founder which platforms to post on, what to
 * post, and what to ask in follow-ups — the founder runs it on
 * their own accounts (never us, never automated; see the system
 * prompt in layer-b-script-agent.ts for the policy framing).
 *
 * Re-running rewrites the script. Status transitions are NOT made
 * here — the opportunity stays in 'awaiting_engagement' until the
 * founder brings back actual community responses (commit #4).
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-generate-engagement-script', RATE_LIMITS.AI_GENERATION);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 4) throw new HttpError(409, 'Not a Stage 4 run');
    if (run.status !== 'authoring') {
      throw new HttpError(409, 'Stage 4 row is not in authoring state');
    }

    const state  = safeParseStage4AuthoringState(run.output);
    const target = state.opportunities.find(o => o.id === parsed.data.opportunityId);
    if (!target) throw new HttpError(404, 'Opportunity not found on this stage run');

    // Layer B reads from the founder's outcome (Stage 1) + the
    // opportunity's own Layer A research findings, if any. Doesn't
    // need Stage 2 requirements directly — the founder's outcome
    // synthesis carries enough framing.
    const stage1 = await prisma.ideationStageRun.findFirst({
      where:  { sessionId: run.sessionId, stageNumber: 1, status: 'committed' },
      select: { output: true },
    });
    if (!stage1) throw new HttpError(409, 'Stage 1 must be committed before Stage 4 script generation');
    const outcomeDocument = safeParseOutcomeDocument(stage1.output);
    if (!outcomeDocument) throw new HttpError(500, 'Stage 1 outcome failed to parse');

    const script = await runLayerBScript({
      painPointSummary: target.painPointSummary,
      layerAResearch:   target.layerAResearch,
      outcomeDocument,
    });

    await persistLayerBScript(id, userId, target.id, script);

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/generate-engagement-script', userId, stageRunId: id })
          .debug('Layer B script persisted', {
            opportunityId: target.id,
            platformCount: script.platforms.length,
            questionCount: script.questionsToAsk.length,
          });

    return NextResponse.json({
      ok:            true,
      opportunityId: target.id,
      platforms:     script.platforms,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
