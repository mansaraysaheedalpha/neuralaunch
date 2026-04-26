// src/app/api/discovery/roadmaps/[id]/research/followup/route.ts
//
// Step 3+ of the standalone Research Tool: queue a follow-up round.
//
// Post-Inngest-migration shape (2026-04-24): the LLM follow-up call
// now runs in `researchFollowupJobFunction`. This route validates,
// creates a ToolJob, fires the event, returns 202 immediately. See
// docs/inngest-tools-migration-plan-2026-04-24.md.

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
import {
  FOLLOWUP_MAX_ROUNDS,
  safeParseResearchSession,
} from '@/lib/roadmap/research-tool';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureWritable } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';
import { createToolJob } from '@/lib/tool-jobs/helpers';

export const maxDuration = 30;

const BodySchema = z.object({
  sessionId: z.string().min(1),
  query:     z.string().min(1).max(3000),
});

/**
 * POST /api/discovery/roadmaps/[id]/research/followup
 *
 * Queues a follow-up round on an existing standalone research session.
 * Returns 202 with { jobId, sessionId }. The Inngest worker enforces
 * the FOLLOWUP_MAX_ROUNDS cap again at execution time so the route
 * does the same gate here for fast failure on cap hits.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await enforceCycleQuota(userId, 'research');
    await rateLimitByUser(userId, 'research-standalone-followup', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    await assertVentureWritable(userId, roadmapId);
    const log = logger.child({ route: 'POST research-standalone-followup', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    // Verify session exists, has a report, and isn't already at the
    // follow-up cap. Fast-fail before queuing a doomed job.
    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, toolSessions: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const rawSessions: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>)
      : [];
    const rawSession = rawSessions.find(s => s['id'] === parsed.data.sessionId);
    if (!rawSession) throw new HttpError(404, 'Session not found');
    const existingSession = safeParseResearchSession(rawSession);
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
      sessionId: parsed.data.sessionId,
    });

    await sendToolJobEvent(job.id, {
      name: 'tool/research-followup.requested',
      data: {
        jobId:     job.id,
        userId,
        roadmapId,
        sessionId: parsed.data.sessionId,
        taskId:    null,
        query:     parsed.data.query,
      },
    });

    log.info('[ResearchStandaloneFollowUp] Job queued', {
      jobId:     job.id,
      sessionId: parsed.data.sessionId,
      round:     currentRounds + 1,
    });

    return NextResponse.json(
      { jobId: job.id, sessionId: parsed.data.sessionId },
      { status: 202 },
    );
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
