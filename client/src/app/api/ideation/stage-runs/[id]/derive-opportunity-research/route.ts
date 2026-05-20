// src/app/api/ideation/stage-runs/[id]/derive-opportunity-research/route.ts
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
  safeParseRequirementsDocument,
  persistLayerAResearch,
  runLayerAResearch,
} from '@/lib/ideation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// One Layer A call uses up to 6 research steps under
// withModelFallback. p99 latency runs comparable to Stage 3's
// pain-scout (sub-30s) but the 90s ceiling gives the fallback chain
// headroom when Anthropic is overloaded.
export const maxDuration = 90;

const RequestSchema = z.object({
  opportunityId: z.string().min(1),
});

/**
 * POST /api/ideation/stage-runs/[id]/derive-opportunity-research
 *
 * Fires Layer A per-opportunity research for ONE opportunity. Returns
 * { ok, dimensionCount, researchSteps } so the founder UI can render
 * a "derived 4/4 dimensions across N research steps" success line.
 *
 * Idempotent in shape: re-running for the same opportunity rewrites
 * the LayerAResearch bundle. The status transition is one-way
 * (awaiting_research → awaiting_engagement) — re-running after
 * engagement has started does NOT reset engagement progress.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-derive-opportunity-research', RATE_LIMITS.AI_GENERATION);

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

    // Load committed upstream docs (Stage 1 outcome + Stage 2 requirements).
    const upstream = await prisma.ideationStageRun.findMany({
      where:  { sessionId: run.sessionId, stageNumber: { in: [1, 2] }, status: 'committed' },
      select: { stageNumber: true, output: true },
    });
    const stage1 = upstream.find(r => r.stageNumber === 1);
    const stage2 = upstream.find(r => r.stageNumber === 2);
    if (!stage1 || !stage2) {
      throw new HttpError(409, 'Commit Stage 1 and Stage 2 first — Layer A research reads them as input.');
    }
    const outcomeDocument      = safeParseOutcomeDocument(stage1.output);
    const requirementsDocument = safeParseRequirementsDocument(stage2.output);
    if (!outcomeDocument)      throw new HttpError(500, 'Stage 1 outcome failed to parse');
    if (!requirementsDocument) throw new HttpError(500, 'Stage 2 requirements failed to parse');

    const result = await runLayerAResearch({
      painPointSummary: target.painPointSummary,
      outcomeDocument,
      requirementsDocument,
      contextId:        run.sessionId,
    });

    await persistLayerAResearch(id, userId, target.id, result.layerA, result.researchLog);

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/derive-opportunity-research', userId, stageRunId: id })
          .debug('Layer A research persisted', {
            opportunityId: target.id,
            researchSteps: result.researchLog.length,
          });

    return NextResponse.json({
      ok:             true,
      opportunityId:  target.id,
      dimensionCount: 4,
      researchSteps:  result.researchLog.length,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
