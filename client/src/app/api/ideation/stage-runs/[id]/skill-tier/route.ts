// src/app/api/ideation/stage-runs/[id]/skill-tier/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SKILL_KEYS, SKILL_TIERS } from '@neuralaunch/constants';
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
  updateSkillTier,
} from '@/lib/ideation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const RequestSchema = z.object({
  /** 'founder' for the founder, integer index for a teammate. */
  person: z.union([z.literal('founder'), z.number().int().nonnegative()]),
  skill:  z.enum(SKILL_KEYS),
  tier:   z.enum(SKILL_TIERS),
});

/**
 * POST /api/ideation/stage-runs/[id]/skill-tier
 *
 * Drag-and-drop canvas write — atomically updates BOTH the working
 * authoring state in IdeationStageRun.output AND the persistent
 * FounderProfile.skillInventory inside a prisma.$transaction. No
 * LLM involved.
 *
 * Returns 409 when the row is no longer authoring (e.g. founder
 * committed elsewhere). Client refreshes on 409.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-skill-tier', RATE_LIMITS.API_AUTHENTICATED);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 2) throw new HttpError(409, 'Not a Stage 2 run');

    await updateSkillTier(id, userId, {
      person: parsed.data.person,
      skill:  parsed.data.skill,
      tier:   parsed.data.tier,
    });

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/skill-tier', userId, stageRunId: id })
          .debug('Skill tier updated');

    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
