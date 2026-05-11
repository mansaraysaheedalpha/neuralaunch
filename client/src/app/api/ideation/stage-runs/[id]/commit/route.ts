// src/app/api/ideation/stage-runs/[id]/commit/route.ts
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
  markStage1Committed,
} from '@/lib/ideation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/ideation/stage-runs/[id]/commit
 *
 * Flips a Stage 1 row from 'output_ready' to 'committed'. Idempotent
 * — a duplicate call against an already-committed row is a no-op
 * (markStage1Committed's updateMany matches zero rows and the helper
 * returns silently). The client's commit button is therefore safe to
 * double-tap during a router refresh race.
 *
 * Future stages (2..5) will need a cascade-invalidation step here:
 * editing a previously committed prior stage must mark downstream
 * stages stale. Moot today since nothing lives downstream of Stage 1.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-commit', RATE_LIMITS.API_AUTHENTICATED);

    const { id } = await params;

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 1) {
      throw new HttpError(409, 'Only Stage 1 supports commit in this batch');
    }
    if (run.status === 'authoring') {
      // The founder is editing; commit is meaningless until they
      // recompose. Surface a 409 rather than silently no-op'ing so the
      // client UI can show a clear message.
      throw new HttpError(409, 'Cannot commit while editing — finish editing first');
    }

    await markStage1Committed(id);

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/commit', userId, stageRunId: id })
          .debug('Stage 1 committed');

    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
