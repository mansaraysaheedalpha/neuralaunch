// src/app/api/discovery/roadmaps/[id]/coach/prepare/route.ts
//
// Standalone Conversation Coach — Stage 2: Preparation.
//
// Post-Inngest-migration shape (2026-04-24): accept-and-queue. Validates
// the request (auth, tier, quota, session existence + setup completion)
// then queues `tool/coach-prepare.requested`. The Inngest worker runs
// runCoachPreparation (Opus + research, 30-90s) and persists the
// preparation back to the session.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sendToolJobEvent } from '@/lib/tool-jobs/queue';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { ConversationSetupSchema, safeParseToolSessions } from '@/lib/roadmap/coach/schemas';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureWritable } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';
import { createToolJob } from '@/lib/tool-jobs/helpers';

export const maxDuration = 30;

const BodySchema = z.object({
  sessionId: z.string().min(1),
});

/**
 * POST /api/discovery/roadmaps/[id]/coach/prepare
 *
 * Queues coach preparation. Returns 202 with { jobId, sessionId }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await enforceCycleQuota(userId, 'coach');
    await rateLimitByUser(userId, 'coach-standalone-prepare', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    await assertVentureWritable(userId, roadmapId);
    const log = logger.child({ route: 'POST standalone-coach-prepare', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, toolSessions: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const toolSessions = safeParseToolSessions(roadmap.toolSessions);
    const session = toolSessions.find(s => s.id === parsed.data.sessionId);
    if (!session) throw new HttpError(404, 'Session not found');

    if (!session.setup) {
      throw new HttpError(409, 'Coach setup has not been completed. Run the setup stage first.');
    }
    const setupParsed = ConversationSetupSchema.safeParse(session.setup);
    if (!setupParsed.success) throw new HttpError(409, 'Coach setup data is malformed.');

    const job = await createToolJob({
      userId, roadmapId,
      toolType:  'coach_prepare',
      sessionId: parsed.data.sessionId,
    });

    await sendToolJobEvent(job.id, {
      name: 'tool/coach-prepare.requested',
      data: {
        jobId:     job.id,
        userId,
        roadmapId,
        sessionId: parsed.data.sessionId,
        taskId:    null,
      },
    });

    log.info('[StandaloneCoachPrepare] Job queued', { jobId: job.id, sessionId: parsed.data.sessionId });
    return NextResponse.json(
      { jobId: job.id, sessionId: parsed.data.sessionId },
      { status: 202 },
    );
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
