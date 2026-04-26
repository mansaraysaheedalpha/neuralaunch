// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/research/plan/route.ts
//
// Step 1 of the task-level Research Tool: generate an editable research plan.
// Returns the plan text and estimated time for the founder to review before
// execution begins. Creates the researchSession on the task if absent.

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
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import { RESEARCH_TOOL_ID, runResearchPlan } from '@/lib/roadmap/research-tool';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureWritable } from '@/lib/lifecycle/tier-limits';

export const maxDuration = 30;

const BodySchema = z.object({
  query: z.string().min(1).max(3000),
});

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/research/plan
 *
 * Takes the founder's research question and task context, produces an
 * editable research plan via Sonnet. Creates a new researchSession on
 * the task (or resets an existing one). Returns { plan, estimatedTime,
 * sessionId }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'research-task-plan', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId, taskId } = await params;
    await assertVentureWritable(userId, roadmapId);
    const log = logger.child({ route: 'POST research-task-plan', roadmapId, taskId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: {
        id:     true,
        phases: true,
        recommendation: {
          select: {
            path:    true,
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

    const bsRaw = roadmap.recommendation?.session?.beliefState;
    const bs    = bsRaw ? safeParseDiscoveryContext(bsRaw) : null;

    const result = await runResearchPlan({
      query:               parsed.data.query,
      taskContext:         found.task.description ?? null,
      beliefState: {
        geographicMarket: bs?.geographicMarket?.value ?? null,
        primaryGoal:      bs?.primaryGoal?.value ?? null,
        situation:        bs?.situation?.value ?? null,
      },
      recommendationPath: roadmap.recommendation?.path ?? null,
    });

    const now       = new Date().toISOString();
    const sessionId = `rs_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const sessionData = {
      id:        sessionId,
      tool:      RESEARCH_TOOL_ID,
      query:     parsed.data.query,
      plan:      result.plan,
      createdAt: now,
      updatedAt: now,
    };

    const next = patchTask(phases, taskId, t => ({ ...t, researchSession: sessionData }));
    if (!next) throw new HttpError(404, 'Task not found post-merge');

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { phases: toJsonValue(next) },
    });

    log.info('[ResearchTaskPlan] Plan persisted', { taskId, sessionId });

    return NextResponse.json({ plan: result.plan, estimatedTime: result.estimatedTime, sessionId });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
