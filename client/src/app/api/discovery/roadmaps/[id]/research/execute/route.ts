// src/app/api/discovery/roadmaps/[id]/research/execute/route.ts
//
// Step 2 of the standalone Research Tool: kick off deep research.
//
// Post-Inngest-migration shape (2026-04-24): this route no longer runs
// the LLM tool loop synchronously. Instead it validates the request,
// creates a ToolJob row in 'queued' state, fires a
// `tool/research-execute.requested` Inngest event, and returns 202
// with the jobId immediately. The actual work runs in
// `researchExecuteJobFunction` and writes the report into
// roadmap.toolSessions on completion. The client polls
// /tool-jobs/[jobId]/status and renders the step-progress ladder.
//
// See docs/inngest-tools-migration-plan-2026-04-24.md for the full
// migration plan.

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
import { safeParseResearchSession } from '@/lib/roadmap/research-tool';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';
import { createToolJob } from '@/lib/tool-jobs/helpers';

// Accept-and-queue route — under a second of work. The Inngest worker
// owns the long-running execution and is not bounded by this ceiling.
export const maxDuration = 30;

const BodySchema = z.object({
  sessionId: z.string().min(1),
  plan:      z.string().min(1).max(5000),
});

/**
 * POST /api/discovery/roadmaps/[id]/research/execute
 *
 * Kicks off a research execution job. Returns 202 with
 * { jobId, sessionId } so the client can poll status and render
 * progress while the Inngest worker does the actual research.
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
    await rateLimitByUser(userId, 'research-standalone-execute', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST research-standalone-execute', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    // Verify the session exists (so we fail fast with a 404 rather than
    // queuing a job that will fail in stage 1) and pull the query — the
    // Inngest job needs the original query the founder asked, which
    // lives on the existing toolSessions entry.
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
    if (!existingSession) throw new HttpError(409, 'Session data is malformed. Re-run the plan stage.');

    const job = await createToolJob({
      userId,
      roadmapId,
      toolType:  'research_execute',
      sessionId: parsed.data.sessionId,
    });

    await sendToolJobEvent(job.id, {
      name: 'tool/research-execute.requested',
      data: {
        jobId:     job.id,
        userId,
        roadmapId,
        sessionId: parsed.data.sessionId,
        taskId:    null,
        planText:  parsed.data.plan,
        query:     existingSession.query,
      },
    });

    log.info('[ResearchStandaloneExecute] Job queued', {
      jobId:     job.id,
      sessionId: parsed.data.sessionId,
    });

    return NextResponse.json(
      { jobId: job.id, sessionId: parsed.data.sessionId },
      { status: 202 },
    );
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
