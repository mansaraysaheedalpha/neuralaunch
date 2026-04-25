// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/packager/adjust/route.ts
//
// Task-launched Service Packager — adjust route.
//
// Post-Inngest-migration shape (2026-04-24): accept-and-queue. Returns
// 202 with { jobId, sessionId }. Pre-checks round cap + session
// existence so the founder gets immediate 4xx feedback when a job
// CAN'T be queued.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { inngest } from '@/inngest/client';
import {
  HttpError, httpErrorToResponse, requireUserId,
  enforceSameOrigin, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { StoredPhasesArraySchema, readTask, type StoredRoadmapPhase } from '@/lib/roadmap/checkin-types';
import {
  MAX_ADJUSTMENT_ROUNDS, safeParsePackagerSession,
} from '@/lib/roadmap/service-packager';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';
import { createToolJob } from '@/lib/tool-jobs/helpers';

export const maxDuration = 30;

const BodySchema = z.object({
  adjustmentRequest: z.string().min(1).max(2000),
});

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/packager/adjust
 *
 * Queues a single adjustment on the task's packagerSession. Returns
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
    await enforceCycleQuota(userId, 'packager');
    await rateLimitByUser(userId, 'packager-task-adjust', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId, taskId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST packager-task-adjust', roadmapId, taskId, userId });

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
    const phases: StoredRoadmapPhase[] = phasesParsed.data;
    const found = readTask(phases, taskId);
    if (!found) throw new HttpError(404, 'Task not found');

    const session = safeParsePackagerSession(found.task.packagerSession);
    if (!session?.package) throw new HttpError(409, 'No generated package found. Run generate first.');

    const priorAdjustments = session.adjustments ?? [];
    if (priorAdjustments.length >= MAX_ADJUSTMENT_ROUNDS) {
      throw new HttpError(409, `Adjustment limit reached (${MAX_ADJUSTMENT_ROUNDS} adjustments maximum).`);
    }

    const sessionId = session.id;

    const job = await createToolJob({
      userId, roadmapId,
      toolType:  'packager_adjust',
      sessionId,
      taskId,
    });

    await inngest.send({
      name: 'tool/packager-adjust.requested',
      data: {
        jobId:             job.id,
        userId,
        roadmapId,
        sessionId,
        taskId,
        adjustmentRequest: parsed.data.adjustmentRequest,
      },
    });

    log.info('[PackagerTask] Adjust job queued', { jobId: job.id, taskId, sessionId });
    return NextResponse.json({ jobId: job.id, sessionId }, { status: 202 });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
