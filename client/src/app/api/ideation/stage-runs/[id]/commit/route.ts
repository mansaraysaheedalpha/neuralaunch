// src/app/api/ideation/stage-runs/[id]/commit/route.ts
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
  markStage1Committed,
  markStage2Committed,
  markStage3Committed,
  clearStage2CascadeSnapshot,
  clearStage3CascadeSnapshot,
  safeParseSkillInventory,
  createEmptySkillInventory,
} from '@/lib/ideation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/ideation/stage-runs/[id]/commit
 *
 * Flips a Stage 1 or Stage 2 row from 'output_ready' to 'committed'.
 * Idempotent — duplicate calls against an already-committed row are
 * no-ops. The client's commit button is safe to double-tap.
 *
 * Cross-stage cascade (Stage 1 recommit): any Stage 2 row with a
 * cascadeSnapshot must have it cleared. The snapshot's document was
 * derived against the now-stale OutcomeDocument, so a later
 * /discard-edit cannot resurrect inconsistent state.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-commit', RATE_LIMITS.API_AUTHENTICATED);

    const { id } = await params;

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 1 && run.stageNumber !== 2 && run.stageNumber !== 3) {
      throw new HttpError(409, 'Commit is supported for Stage 1, 2, and 3 only in this batch');
    }
    if (run.status === 'authoring') {
      // The founder is editing; commit is meaningless until they
      // recompose. Surface a 409 rather than silently no-op'ing so the
      // client UI can show a clear message.
      throw new HttpError(409, 'Cannot commit while editing — finish editing first');
    }

    // Keep the session discoverable by /discovery's resumption query —
    // it filters on lastTurnAt, and a commit means the session is being
    // actively used. Fire-and-forget; non-fatal.
    prisma.discoverySession
      .update({ where: { id: run.sessionId }, data: { lastTurnAt: new Date() }, select: { id: true } })
      .catch(() => { /* non-fatal */ });

    if (run.stageNumber === 1) {
      await markStage1Committed(id);
      // Cascade: clear any stale Stage 2 / Stage 3 cascadeSnapshot.
      // The Stage 1 recommit changed the upstream OutcomeDocument, so
      // downstream snapshots are no longer reachable from a
      // /discard-edit. Idempotent.
      await clearStage2CascadeSnapshot(run.sessionId, userId);
      await clearStage3CascadeSnapshot(run.sessionId, userId, 'stage1');
      logger.child({ route: 'POST /api/ideation/stage-runs/[id]/commit', userId, stageRunId: id })
            .debug('Stage 1 committed (cascade-snapshots cleared on 2 + 3)');
    } else if (run.stageNumber === 2) {
      // Stage 2 commit — snapshot the founder's current FounderProfile
      // skillInventory into the artifact at commit time.
      const profile = await prisma.founderProfile.findUnique({
        where:  { userId },
        select: { skillInventory: true },
      });
      const snapshotInventory =
        safeParseSkillInventory(profile?.skillInventory ?? null)
        ?? createEmptySkillInventory();
      await markStage2Committed(id, snapshotInventory);
      // Stage 2 recommit → clear Stage 3's cascade-snapshot for stage2.
      await clearStage3CascadeSnapshot(run.sessionId, userId, 'stage2');
      logger.child({ route: 'POST /api/ideation/stage-runs/[id]/commit', userId, stageRunId: id })
            .debug('Stage 2 committed (cascade-snapshot cleared on 3)');
    } else {
      // Stage 3 commit — no downstream cascade target yet (Stage 4
      // doesn't exist). The persisted PainInventoryDocument is now
      // frozen.
      await markStage3Committed(id);
      logger.child({ route: 'POST /api/ideation/stage-runs/[id]/commit', userId, stageRunId: id })
            .debug('Stage 3 committed');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
