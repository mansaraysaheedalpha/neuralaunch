// src/app/api/ideation/stage-runs/[id]/edit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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
 * Future cross-stage caveat (TODO): when stages 2..5 land, editing a
 * committed prior stage must mark downstream stages stale. Moot today.
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

    const prior = safeParseOutcomeDocument(run.output);
    if (!prior) {
      throw new HttpError(500, 'Existing output document could not be parsed');
    }

    await revertToEdit(id, userId, parsed.data.dimension, prior, run.status);

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/edit', userId, stageRunId: id })
          .debug('Stage 1 reverted to editing', { dimension: parsed.data.dimension, priorStatus: run.status });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
