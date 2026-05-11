// src/app/api/ideation/stage-runs/[id]/discard-edit/route.ts
import { NextRequest, NextResponse } from 'next/server';
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
  safeParseStage1AuthoringState,
  restoreFromEditSnapshot,
} from '@/lib/ideation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/ideation/stage-runs/[id]/discard-edit
 *
 * Restore the OutcomeDocument snapshot taken when the founder
 * started an edit. Flips the row from 'authoring' back to whatever
 * its prior finalised status was ('output_ready' or 'committed') and
 * rewrites `output` with the snapshot document. The snapshot is
 * cleared as part of the restore.
 *
 * Surfaces 409 when no snapshot exists (the founder hit discard
 * outside an edit flow). The client UI gates the affordance behind
 * `priorCommittedSnapshot !== null` so this is defensive.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-discard-edit', RATE_LIMITS.API_AUTHENTICATED);

    const { id } = await params;

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 1) {
      throw new HttpError(409, 'Only Stage 1 supports discard-edit in this batch');
    }
    if (run.status !== 'authoring') {
      throw new HttpError(409, 'No edit in progress to discard');
    }

    const authoring = safeParseStage1AuthoringState(run.output);
    if (!authoring.priorCommittedSnapshot) {
      throw new HttpError(409, 'No prior-committed snapshot found for this row');
    }

    await restoreFromEditSnapshot(id, userId, authoring.priorCommittedSnapshot);

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/discard-edit', userId, stageRunId: id })
          .debug('Stage 1 edit discarded — restored from snapshot', {
            restoredStatus: authoring.priorCommittedSnapshot.priorStatus,
          });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
