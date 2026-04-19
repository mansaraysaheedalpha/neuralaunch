// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/coach/debrief/route.ts
//
// Stage 4 route: generates the debrief for a completed role-play.
// Single Haiku call — lightweight synthesis. No request body needed;
// everything is read from coachSession. Requires rolePlayHistory to
// exist with at least 2 turns before proceeding.

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
import { runDebrief } from '@/lib/roadmap/coach/debrief-engine';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';

// Haiku is fast but allow headroom for a longer transcript
export const maxDuration = 30;

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/coach/debrief
 *
 * Generates and persists the debrief for a completed role-play.
 * No request body — reads rolePlayHistory, preparation, and setup
 * from the task's coachSession. Requires at least 2 role-play turns.
 * Returns { debrief }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'coach-debrief', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId, taskId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST coach-debrief', roadmapId, taskId, userId });

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

    // Require all prior stages to be complete
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

    const rolePlayHistory: RolePlayTurn[] = z.array(RolePlayTurnSchema)
      .catch([])
      .parse(session.rolePlayHistory ?? []);

    if (rolePlayHistory.length < 2) {
      throw new HttpError(409, 'Role-play must have at least 2 turns before a debrief can be generated.');
    }

    const debrief = await runDebrief({
      rolePlayHistory,
      preparation: preparationParsed.data,
      setup:       setupParsed.data,
    });

    const updatedSession = {
      ...session,
      debrief,
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

    log.info('[CoachDebrief] Debrief persisted', {
      taskId,
      wellCount:  debrief.whatWentWell.length,
      watchCount: debrief.whatToWatchFor.length,
    });

    return NextResponse.json({ debrief });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
