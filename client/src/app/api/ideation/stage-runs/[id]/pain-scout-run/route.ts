// src/app/api/ideation/stage-runs/[id]/pain-scout-run/route.ts
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
  safeParseStage3AuthoringState,
  safeParseOutcomeDocument,
  safeParseRequirementsDocument,
  persistPainScoutRunResult,
  runPainScout,
  MAX_SCOUT_RUNS,
} from '@/lib/ideation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Pain Scout fires an Opus-tier agent against community_pulse + Tavily
// + Exa under an 8-step research budget. p99 latency is comparable to
// Stage 2 derivation. 90s margin lets the fallback chain kick in
// cleanly when Anthropic overloads.
export const maxDuration = 90;

const RequestSchema = z.object({
  founderQuery: z.string().max(600).nullable().optional(),
});

/**
 * POST /api/ideation/stage-runs/[id]/pain-scout-run
 *
 * Re-fires the Pain Scout against the founder's committed Outcome +
 * Requirements docs. Used by the "Run scout" / "Re-run with this
 * query" affordance on the Stage 3 canvas.
 *
 * Counts against scoutRunCount; caps at MAX_SCOUT_RUNS per Stage 3
 * row. Hitting the cap returns 429 with a clear message so the UI
 * can disable the button.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-pain-scout', RATE_LIMITS.AI_GENERATION);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 3) throw new HttpError(409, 'Not a Stage 3 run');
    if (run.status !== 'authoring') {
      throw new HttpError(409, 'Stage 3 row is not in authoring state');
    }

    const state = safeParseStage3AuthoringState(run.output);
    if (state.scoutRunCount >= MAX_SCOUT_RUNS) {
      // 429 — the founder must commit or refine before more runs.
      throw new HttpError(429, `You've used all ${MAX_SCOUT_RUNS} Pain Scout runs for this stage. Rate what's surfaced or add your own pain points to keep going.`);
    }

    // Load committed Stage 1 OutcomeDocument + Stage 2 RequirementsDocument.
    const upstream = await prisma.ideationStageRun.findMany({
      where:  { sessionId: run.sessionId, stageNumber: { in: [1, 2] }, status: 'committed' },
      select: { stageNumber: true, output: true },
    });
    const stage1 = upstream.find(r => r.stageNumber === 1);
    const stage2 = upstream.find(r => r.stageNumber === 2);
    if (!stage1 || !stage2) {
      throw new HttpError(409, 'Commit Stage 1 and Stage 2 first — the Pain Scout reads them as input.');
    }
    const outcomeDocument = safeParseOutcomeDocument(stage1.output);
    const requirementsDocument = safeParseRequirementsDocument(stage2.output);
    if (!outcomeDocument)      throw new HttpError(500, 'Stage 1 outcome failed to parse');
    if (!requirementsDocument) throw new HttpError(500, 'Stage 2 requirements failed to parse');

    const result = await runPainScout({
      outcomeDocument,
      requirementsDocument,
      contextId:    run.sessionId,
      founderQuery: parsed.data.founderQuery ?? null,
    });

    await persistPainScoutRunResult(id, userId, result.painPoints, result.researchLog);

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/pain-scout-run', userId, stageRunId: id })
          .debug('Pain Scout run completed', {
            emitted:       result.painPoints.length,
            researchSteps: result.researchLog.length,
          });

    return NextResponse.json({
      ok:            true,
      emitted:       result.painPoints.length,
      researchSteps: result.researchLog.length,
      // The freshly-appended ids let the client highlight new entries.
      newIds:        result.painPoints.map(p => p.id),
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
