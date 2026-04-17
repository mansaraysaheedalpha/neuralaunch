// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/research/execute/route.ts
//
// Step 2 of the task-level Research Tool: run deep research execution.
// Reads the original query from the existing researchSession, calls
// runResearchExecution with the approved/edited plan, and persists the
// full ResearchReport to the task's researchSession + research log.

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
import { safeParseResearchLog, appendResearchLog, type ResearchLogEntry } from '@/lib/research';
import { safeParseResearchSession, runResearchExecution } from '@/lib/roadmap/research-tool';
import { loadPerTaskAgentContext } from '@/lib/lifecycle';
import { renderFounderProfileBlock } from '@/lib/lifecycle/prompt-renderers';

// Opus + 25 research steps — can take 3-6 minutes
export const maxDuration = 300;

const BodySchema = z.object({
  plan: z.string().min(1).max(5000),
});

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/research/execute
 *
 * Takes the approved (possibly edited) plan, reads the query from the
 * existing researchSession, runs the full Opus-level research execution,
 * and writes the ResearchReport to task.researchSession + roadmap.researchLog.
 * Returns { report }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'research-task-execute', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId, taskId } = await params;
    const log = logger.child({ route: 'POST research-task-execute', roadmapId, taskId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

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

    const existingSession = safeParseResearchSession(found.task.researchSession);
    if (!existingSession) throw new HttpError(409, 'Research plan has not been generated. Run the plan stage first.');

    const bsRaw = roadmap.recommendation?.session?.beliefState;
    const bs    = bsRaw ? safeParseDiscoveryContext(bsRaw) : null;

    const { profile } = await loadPerTaskAgentContext(userId);
    const founderProfileBlock = renderFounderProfileBlock(profile);

    const accumulator: ResearchLogEntry[] = [];

    const report = await runResearchExecution({
      founderProfileBlock: founderProfileBlock || undefined,
      query:                  existingSession.query,
      plan:                   parsed.data.plan,
      beliefState: {
        geographicMarket:     bs?.geographicMarket?.value ?? null,
        primaryGoal:          bs?.primaryGoal?.value ?? null,
        situation:            bs?.situation?.value ?? null,
      },
      recommendationPath:     roadmap.recommendation?.path ?? null,
      recommendationSummary:  roadmap.recommendation?.summary ?? null,
      taskContext:             found.task.description ?? null,
      roadmapId,
      researchAccumulator:    accumulator,
    });

    const updatedSession = {
      ...existingSession,
      plan:      parsed.data.plan,
      report,
      updatedAt: new Date().toISOString(),
    };

    const next = patchTask(phases, taskId, t => ({ ...t, researchSession: updatedSession }));
    if (!next) throw new HttpError(404, 'Task not found post-merge');

    const nextLog = accumulator.length > 0
      ? appendResearchLog(safeParseResearchLog(roadmap.researchLog), accumulator)
      : null;

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  {
        phases: toJsonValue(next),
        ...(nextLog ? { researchLog: toJsonValue(nextLog) } : {}),
      },
    });

    log.info('[ResearchTaskExecute] Report persisted', {
      taskId,
      findings:      report.findings.length,
      researchCalls: accumulator.length,
    });

    return NextResponse.json({ report });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
