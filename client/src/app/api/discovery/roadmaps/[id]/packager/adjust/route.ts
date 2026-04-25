// src/app/api/discovery/roadmaps/[id]/packager/adjust/route.ts
//
// Standalone Service Packager — adjust route.
//
// Post-Inngest-migration shape (2026-04-24): accept-and-queue. Validates
// the request (auth, tier, quota, ownership, MAX_ADJUSTMENT_ROUNDS),
// queues `tool/packager-adjust.requested`, returns 202 with the jobId.
// The Inngest worker runs runPackagerAdjustment and persists the
// updated package; the client polls /tool-jobs/[jobId]/status.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sendToolJobEvent } from '@/lib/tool-jobs/queue';
import {
  HttpError, httpErrorToResponse, requireUserId,
  enforceSameOrigin, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  MAX_ADJUSTMENT_ROUNDS, safeParsePackagerSession,
} from '@/lib/roadmap/service-packager';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';
import { createToolJob } from '@/lib/tool-jobs/helpers';

export const maxDuration = 30;

const BodySchema = z.object({
  sessionId:         z.string().min(1),
  adjustmentRequest: z.string().min(1).max(2000),
});

/**
 * POST /api/discovery/roadmaps/[id]/packager/adjust
 *
 * Queues a single adjustment on a standalone packager session. Returns
 * 202 with { jobId, sessionId }. Pre-checks the round cap and the
 * session existence so the founder gets immediate 4xx feedback when a
 * job CAN'T be queued.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await enforceCycleQuota(userId, 'packager');
    await rateLimitByUser(userId, 'packager-standalone-adjust', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST packager-standalone-adjust', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, toolSessions: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const rawSessions: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>) : [];
    const existing = rawSessions.find(s => s['id'] === parsed.data.sessionId);
    if (!existing) throw new HttpError(404, 'Session not found');

    const session = safeParsePackagerSession(existing);
    if (!session?.package) throw new HttpError(409, 'No generated package found. Run generate first.');

    const priorAdjustments = session.adjustments ?? [];
    if (priorAdjustments.length >= MAX_ADJUSTMENT_ROUNDS) {
      throw new HttpError(409, `Adjustment limit reached (${MAX_ADJUSTMENT_ROUNDS} adjustments maximum).`);
    }

    const job = await createToolJob({
      userId, roadmapId,
      toolType:  'packager_adjust',
      sessionId: parsed.data.sessionId,
    });

    await sendToolJobEvent(job.id, {
      name: 'tool/packager-adjust.requested',
      data: {
        jobId:             job.id,
        userId,
        roadmapId,
        sessionId:         parsed.data.sessionId,
        taskId:            null,
        adjustmentRequest: parsed.data.adjustmentRequest,
      },
    });

    log.info('[StandalonePackager] Adjust job queued', { jobId: job.id, sessionId: parsed.data.sessionId });
    return NextResponse.json(
      { jobId: job.id, sessionId: parsed.data.sessionId },
      { status: 202 },
    );
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
