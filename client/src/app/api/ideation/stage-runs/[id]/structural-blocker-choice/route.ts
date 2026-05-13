// src/app/api/ideation/stage-runs/[id]/structural-blocker-choice/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { STRUCTURAL_BLOCKER_CHOICES } from '@neuralaunch/constants';
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
  setStructuralBlockerChoice,
  safeParseStage2AuthoringState,
  safeParseRequirementsDocument,
} from '@/lib/ideation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const RequestSchema = z.object({
  choice: z.enum(STRUCTURAL_BLOCKER_CHOICES),
  notes:  z.string().max(800).nullable(),
});

/**
 * POST /api/ideation/stage-runs/[id]/structural-blocker-choice
 *
 * Record the founder's choice when the structural-blocker soft-
 * warning trips. Allowed in 'authoring' OR 'output_ready' status;
 * forbidden once committed (committed artifacts are immutable).
 *
 * Preserves the current `triggered` boolean — the founder's choice
 * doesn't reset the constraint computation. If they later add a
 * teammate that fills a gap, the next composer pass recomputes
 * `triggered` based on the new constraints.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-structural-blocker-choice', RATE_LIMITS.API_AUTHENTICATED);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 2) throw new HttpError(409, 'Not a Stage 2 run');
    if (run.status === 'committed') {
      throw new HttpError(409, 'Cannot change structural-blocker choice on a committed row');
    }

    // Read the current triggered state — the founder's choice
    // changes founderChoice + notes, not whether the blocker is
    // triggered (that's a function of constraints).
    const currentTriggered =
      run.status === 'authoring'
        ? safeParseStage2AuthoringState(run.output).structuralBlocker.triggered
        : safeParseRequirementsDocument(run.output)?.structuralBlocker.triggered ?? false;

    await setStructuralBlockerChoice(id, userId, {
      triggered:     currentTriggered,
      founderChoice: parsed.data.choice,
      notes:         parsed.data.notes,
    });

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/structural-blocker-choice', userId, stageRunId: id })
          .debug('Structural-blocker choice recorded', { choice: parsed.data.choice });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
