// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/coach/prepare/route.ts
//
// Stage 2 route: generates the full PreparationPackage. Single Opus
// call with research tools. Takes the completed setup from the task's
// coachSession and returns the preparation. Persists the result back
// to the coachSession on the task.

import { NextResponse } from 'next/server';
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
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import { ConversationSetupSchema } from '@/lib/roadmap/coach/schemas';
import { runCoachPreparation } from '@/lib/roadmap/coach/preparation-engine';
import { safeParseResearchLog, appendResearchLog, type ResearchLogEntry } from '@/lib/research';
import { loadPerTaskAgentContext } from '@/lib/lifecycle';
import { renderFounderProfileBlock } from '@/lib/lifecycle/prompt-renderers';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';

// Opus + research tools can take 30-60s
export const maxDuration = 90;

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/coach/prepare
 *
 * Generates the preparation package from the completed setup.
 * No request body needed — reads setup from the task's coachSession.
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
    await rateLimitByUser(userId, 'coach-prepare', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId, taskId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST coach-prepare', roadmapId, taskId, userId });

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: {
        id:          true,
        phases:      true,
        researchLog: true,
        recommendation: {
          select: {
            path:    true,
            summary: true,
            session: { select: { beliefState: true } },
          },
        },
      },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (!phasesParsed.success) throw new HttpError(409, 'Roadmap content is malformed');
    const phases: StoredRoadmapPhase[] = phasesParsed.data;

    const found = readTask(phases, taskId);
    if (!found) throw new HttpError(404, 'Task not found');

    // Read the completed setup from coachSession
    const session = found.task.coachSession as Record<string, unknown> | undefined;
    if (!session?.setup) {
      throw new HttpError(409, 'Coach setup has not been completed. Run the setup stage first.');
    }
    const setupParsed = ConversationSetupSchema.safeParse(session.setup);
    if (!setupParsed.success) {
      throw new HttpError(409, 'Coach setup data is malformed.');
    }

    const context = roadmap.recommendation?.session?.beliefState
      ? safeParseDiscoveryContext(roadmap.recommendation.session.beliefState)
      : null;

    const { profile } = await loadPerTaskAgentContext(userId);
    const founderProfileBlock = renderFounderProfileBlock(profile);
    const accumulator: ResearchLogEntry[] = [];

    const preparation = await runCoachPreparation({
      setup:                setupParsed.data,
      beliefState: {
        primaryGoal:         context?.primaryGoal?.value ?? null,
        geographicMarket:    context?.geographicMarket?.value ?? null,
        situation:           context?.situation?.value ?? null,
        availableBudget:     context?.availableBudget?.value ?? null,
        technicalAbility:    context?.technicalAbility?.value ?? null,
        availableTimePerWeek: context?.availableTimePerWeek?.value ?? null,
      },
      recommendationPath:    roadmap.recommendation?.path ?? null,
      recommendationSummary: roadmap.recommendation?.summary ?? null,
      roadmapId,
      researchAccumulator:   accumulator,
      founderProfileBlock:   founderProfileBlock || undefined,
    });

    // Persist preparation + research log
    const updatedSession = {
      ...session,
      preparation,
      updatedAt: new Date().toISOString(),
    };

    const next = patchTask(phases, taskId, t => ({
      ...t,
      coachSession: updatedSession,
    }));
    if (!next) throw new HttpError(404, 'Task not found post-merge');

    const nextResearchLog = accumulator.length > 0
      ? appendResearchLog(safeParseResearchLog(roadmap.researchLog), accumulator)
      : null;

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  {
        phases: toJsonValue(next),
        ...(nextResearchLog ? { researchLog: toJsonValue(nextResearchLog) } : {}),
      },
    });

    log.info('[CoachPrepare] Package persisted', {
      taskId,
      objections:    preparation.objections.length,
      researchCalls: accumulator.length,
    });

    return NextResponse.json({ preparation });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
