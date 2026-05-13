// src/app/api/ideation/stage-runs/[id]/teammate/route.ts
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
  updateTeammate,
} from '@/lib/ideation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Discriminated union by `op`. zod's discriminatedUnion gives us the
// per-op field set without a hand-rolled refine.
const RequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'),    name: z.string().min(1).max(80) }),
  z.object({ op: z.literal('remove'), index: z.number().int().nonnegative() }),
  z.object({ op: z.literal('rename'), index: z.number().int().nonnegative(), name: z.string().min(1).max(80) }),
]);

/**
 * POST /api/ideation/stage-runs/[id]/teammate
 *
 * Add / remove / rename a teammate on the Stage 2 skill inventory.
 * Same dual-write pattern as /skill-tier — atomic across
 * IdeationStageRun.output and FounderProfile.skillInventory.
 *
 * 'add' creates a new PersonSkills with every skill at 'unknown'.
 * 'remove' shifts subsequent indices down (callers must refetch).
 * 'rename' is in-place.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-teammate', RATE_LIMITS.API_AUTHENTICATED);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 2) throw new HttpError(409, 'Not a Stage 2 run');

    await updateTeammate(id, userId, parsed.data);

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/teammate', userId, stageRunId: id })
          .debug('Teammate operation applied', { op: parsed.data.op });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
