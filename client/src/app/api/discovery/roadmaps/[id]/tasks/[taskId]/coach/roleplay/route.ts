// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/coach/roleplay/route.ts
//
// Stage 3 route: one role-play turn per POST. The founder sends a
// message, the route plays the other party in character, and persists
// both turns to rolePlayHistory on the coachSession. At the hard cap
// (ROLEPLAY_HARD_CAP_TURNS) the route returns { capped: true } without
// calling the engine.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  StoredPhasesArraySchema,
  readTask,
  patchTask,
  type StoredRoadmapPhase,
} from '@/lib/roadmap/checkin-types';
import {
  ConversationSetupSchema,
  PreparationPackageSchema,
  RolePlayTurnSchema,
  type RolePlayTurn,
} from '@/lib/roadmap/coach/schemas';
import { ROLEPLAY_HARD_CAP_TURNS } from '@/lib/roadmap/coach';
import { runRolePlayTurn } from '@/lib/roadmap/coach/roleplay-engine';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';

export const maxDuration = 30;

const BodySchema = z.object({
  message: z.string().min(1).max(3000),
});

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/coach/roleplay
 *
 * One role-play turn per call. The founder sends a message; the route
 * appends the founder turn, calls the engine for the other party's
 * response, persists both turns to coachSession.rolePlayHistory, and
 * returns the response. At the hard cap, returns { capped: true }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await enforceCycleQuota(userId, 'coach');
    await rateLimitByUser(userId, 'coach-roleplay', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId, taskId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST coach-roleplay', roadmapId, taskId, userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, phases: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (!phasesParsed.success) throw new HttpError(409, 'Roadmap content is malformed');
    const phases: StoredRoadmapPhase[] = phasesParsed.data;

    const found = readTask(phases, taskId);
    if (!found) throw new HttpError(404, 'Task not found');

    const session = found.task.coachSession as Record<string, unknown> | undefined;

    // Require completed setup and preparation
    if (!session?.setup) {
      throw new HttpError(409, 'Coach setup has not been completed. Run the setup stage first.');
    }
    if (!session?.preparation) {
      throw new HttpError(409, 'Coach preparation has not been completed. Run the preparation stage first.');
    }

    const setupParsed = ConversationSetupSchema.safeParse(session.setup);
    if (!setupParsed.success) throw new HttpError(409, 'Coach setup data is malformed.');

    const preparationParsed = PreparationPackageSchema.safeParse(session.preparation);
    if (!preparationParsed.success) throw new HttpError(409, 'Coach preparation data is malformed.');

    // Parse existing role-play history
    const existingHistory: RolePlayTurn[] = z.array(RolePlayTurnSchema)
      .catch([])
      .parse(session.rolePlayHistory ?? []);

    // Count founder turns (each founder turn = one turn number)
    const founderTurnsSoFar = existingHistory.filter(t => t.role === 'founder').length;
    const nextTurnNumber = founderTurnsSoFar + 1;

    // Hard cap check — return early without calling the engine
    if (founderTurnsSoFar >= ROLEPLAY_HARD_CAP_TURNS) {
      log.info('[CoachRolePlay] Hard cap reached, returning capped', { taskId, founderTurnsSoFar });
      return NextResponse.json({ capped: true });
    }

    const { message, turn } = await runRolePlayTurn({
      founderMessage: parsed.data.message,
      history:        existingHistory,
      preparation:    preparationParsed.data,
      setup:          setupParsed.data,
      turn:           nextTurnNumber,
    });

    // Append both turns: founder first, then the other party
    const founderTurn: RolePlayTurn = {
      role:    'founder',
      message: parsed.data.message,
      turn:    nextTurnNumber,
    };
    const otherPartyTurn: RolePlayTurn = {
      role:    'other_party',
      message,
      turn:    nextTurnNumber,
    };
    const updatedHistory: RolePlayTurn[] = [...existingHistory, founderTurn, otherPartyTurn];

    const updatedSession = {
      ...session,
      rolePlayHistory: updatedHistory,
      updatedAt: new Date().toISOString(),
    };

    const next = patchTask(phases, taskId, t => ({
      ...t,
      coachSession: updatedSession,
    }));
    if (!next) throw new HttpError(404, 'Task not found post-merge');

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { phases: toJsonValue(next) },
    });

    log.info('[CoachRolePlay] Turn persisted', { taskId, turn });

    return NextResponse.json({ message, turn, capped: false });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
