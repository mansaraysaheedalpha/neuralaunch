// src/app/api/ideation/stage-runs/[id]/edit/route.ts
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
  revertToEdit,
  safeParseOutcomeDocument,
  cascadeStage1EditToStage2,
  cascadeStage1OrStage2EditToStage3,
} from '@/lib/ideation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const EditRequestSchema = z.object({
  dimension: z.enum([
    'timeHorizon',
    'financialGoal',
    'riskTolerance',
    'lifestylePreference',
  ]),
});

/**
 * POST /api/ideation/stage-runs/[id]/edit
 *
 * Revert a Stage 1 row from 'output_ready' or 'committed' back to
 * 'authoring' so the founder can rework a single dimension. The prior
 * document is snapshotted inside the new authoring payload so a
 * /discard-edit can restore it.
 *
 * Cross-stage cascade: when Stage 1's status reverts, any
 * output_ready / committed Stage 2 row for the same session is
 * cascade-reverted to authoring with a cascadeSnapshot (so a
 * subsequent /discard-edit can restore it) and requiresRederivation
 * = true (the UI surfaces a "Stage 1 was updated — re-derive"
 * prompt). The cascade helper is idempotent — no Stage 2 row, or
 * Stage 2 already in authoring, is a no-op.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-edit', RATE_LIMITS.API_AUTHENTICATED);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = EditRequestSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 1) {
      throw new HttpError(409, 'Only Stage 1 supports edit in this batch');
    }
    if (run.status !== 'output_ready' && run.status !== 'committed') {
      throw new HttpError(409, 'Stage row is not in a finalised state');
    }

    // Keep the session discoverable by /discovery's resumption query —
    // editing a dimension is an active engagement signal. Fire-and-
    // forget; non-fatal.
    prisma.discoverySession
      .update({ where: { id: run.sessionId }, data: { lastTurnAt: new Date() }, select: { id: true } })
      .catch(() => { /* non-fatal */ });

    const prior = safeParseOutcomeDocument(run.output);
    if (!prior) {
      throw new HttpError(500, 'Existing output document could not be parsed');
    }

    await revertToEdit(id, userId, parsed.data.dimension, prior, run.status);

    // Cascade: revert any committed-or-output-ready Stage 2 row.
    // Idempotent if Stage 2 doesn't exist or is already in authoring.
    await cascadeStage1EditToStage2(run.sessionId, userId);
    // Cascade further: Stage 3 also reverts on a Stage 1 edit.
    // Idempotent if Stage 3 doesn't exist or is already in authoring.
    await cascadeStage1OrStage2EditToStage3(run.sessionId, userId, 'stage1');

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/edit', userId, stageRunId: id })
          .debug('Stage 1 reverted to editing (cascade fired to 2 + 3)', { dimension: parsed.data.dimension, priorStatus: run.status });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
