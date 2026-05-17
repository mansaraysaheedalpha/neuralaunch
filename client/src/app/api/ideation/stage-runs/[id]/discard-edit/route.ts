// src/app/api/ideation/stage-runs/[id]/discard-edit/route.ts
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
import {
  requireOwnedStageRun,
  safeParseStage1AuthoringState,
  restoreFromEditSnapshot,
  restoreStage2FromCascadeSnapshot,
  restoreStage3FromCascadeSnapshot,
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

    // Keep the session discoverable by /discovery's resumption query —
    // discarding an edit is an active engagement signal. Fire-and-
    // forget; non-fatal.
    prisma.discoverySession
      .update({ where: { id: run.sessionId }, data: { lastTurnAt: new Date() }, select: { id: true } })
      .catch(() => { /* non-fatal */ });

    const authoring = safeParseStage1AuthoringState(run.output);
    if (!authoring.priorCommittedSnapshot) {
      throw new HttpError(409, 'No prior-committed snapshot found for this row');
    }

    await restoreFromEditSnapshot(id, userId, authoring.priorCommittedSnapshot);

    // Cascade-restore: any Stage 2 row that was reverted by the
    // matching /edit can restore its own snapshot. Idempotent if no
    // Stage 2 row exists or no cascade snapshot was set.
    await restoreStage2FromCascadeSnapshot(run.sessionId, userId);
    // Stage 3 also discharges 'stage1' from its triggeringStages
    // list. Restores only if Stage 2 had already discharged too.
    await restoreStage3FromCascadeSnapshot(run.sessionId, userId, 'stage1');

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/discard-edit', userId, stageRunId: id })
          .debug('Stage 1 edit discarded — restored from snapshot (cascade fired)', {
            restoredStatus: authoring.priorCommittedSnapshot.priorStatus,
          });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
