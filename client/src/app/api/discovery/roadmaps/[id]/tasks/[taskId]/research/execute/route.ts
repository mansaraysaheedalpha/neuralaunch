// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/research/execute/route.ts
//
// Step 2 of the task-launched Research Tool: queue deep research.
//
// Post-Inngest-migration shape (2026-04-24): same accept-and-queue
// pattern as the standalone variant. The Inngest worker addresses
// the right task via the taskId in the event payload.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { inngest } from '@/inngest/client';
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
} from '@/lib/roadmap/checkin-types';
import { safeParseResearchSession } from '@/lib/roadmap/research-tool';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';
import { createToolJob } from '@/lib/tool-jobs/helpers';

export const maxDuration = 30;

const BodySchema = z.object({
  plan: z.string().min(1).max(5000),
});

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/research/execute
 *
 * Queues a research execution scoped to a specific roadmap task.
 * Returns 202 with { jobId, sessionId }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await enforceCycleQuota(userId, 'research');
    await rateLimitByUser(userId, 'research-task-execute', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId, taskId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST research-task-execute', roadmapId, taskId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    // Resolve the task and pull the existing session id + query so the
    // Inngest worker has everything it needs in the event payload.
    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, phases: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (!phasesParsed.success) throw new HttpError(409, 'Roadmap content is malformed');
    const found = readTask(phasesParsed.data, taskId);
    if (!found) throw new HttpError(404, 'Task not found');

    const existingSession = safeParseResearchSession(found.task.researchSession);
    if (!existingSession) {
      throw new HttpError(409, 'Research plan has not been generated. Run the plan stage first.');
    }

    const job = await createToolJob({
      userId,
      roadmapId,
      toolType:  'research_execute',
      sessionId: existingSession.id,
      taskId,
    });

    await inngest.send({
      name: 'tool/research-execute.requested',
      data: {
        jobId:     job.id,
        userId,
        roadmapId,
        sessionId: existingSession.id,
        taskId,
        planText:  parsed.data.plan,
        query:     existingSession.query,
      },
    });

    log.info('[ResearchTaskExecute] Job queued', {
      jobId:     job.id,
      sessionId: existingSession.id,
    });

    return NextResponse.json(
      { jobId: job.id, sessionId: existingSession.id },
      { status: 202 },
    );
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
