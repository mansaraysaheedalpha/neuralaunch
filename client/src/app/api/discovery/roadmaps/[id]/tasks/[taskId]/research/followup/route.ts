// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/research/followup/route.ts
//
// Step 3+ of the task-launched Research Tool: queue a follow-up round.
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
import {
  FOLLOWUP_MAX_ROUNDS,
  safeParseResearchSession,
} from '@/lib/roadmap/research-tool';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';
import { createToolJob } from '@/lib/tool-jobs';

export const maxDuration = 30;

const BodySchema = z.object({
  query: z.string().min(1).max(3000),
});

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/research/followup
 *
 * Queues a follow-up round on a task-bound research session. Returns
 * 202 with { jobId, sessionId }.
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
    await rateLimitByUser(userId, 'research-task-followup', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId, taskId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST research-task-followup', roadmapId, taskId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

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
    if (!existingSession?.report) {
      throw new HttpError(409, 'Research has not been executed. Run the execute stage first.');
    }
    const currentRounds = existingSession.followUps?.length ?? 0;
    if (currentRounds >= FOLLOWUP_MAX_ROUNDS) {
      throw new HttpError(409, `Follow-up round limit of ${FOLLOWUP_MAX_ROUNDS} reached. Start a new research session.`);
    }

    const job = await createToolJob({
      userId,
      roadmapId,
      toolType:  'research_followup',
      sessionId: existingSession.id,
      taskId,
    });

    await inngest.send({
      name: 'tool/research-followup.requested',
      data: {
        jobId:     job.id,
        userId,
        roadmapId,
        sessionId: existingSession.id,
        taskId,
        query:     parsed.data.query,
      },
    });

    log.info('[ResearchTaskFollowUp] Job queued', {
      jobId:     job.id,
      sessionId: existingSession.id,
      round:     currentRounds + 1,
    });

    return NextResponse.json(
      { jobId: job.id, sessionId: existingSession.id },
      { status: 202 },
    );
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
