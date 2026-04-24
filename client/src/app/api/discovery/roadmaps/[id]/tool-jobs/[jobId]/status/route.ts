// src/app/api/discovery/roadmaps/[id]/tool-jobs/[jobId]/status/route.ts
//
// Polled by the client every 3s (foreground) / 30s (backgrounded) to
// drive the step-progress ladder on tool pages. Returns a lean
// ToolJobStatus payload — just the stage, error message, and
// timestamps. The actual result body lives on roadmap.toolSessions
// and is fetched via the per-tool single-session GET endpoint when
// the client sees stage === 'complete'.
//
// Stays under API_READ rate limit (120/min) which comfortably fits
// the 3s/foreground polling cadence even on a slow run.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError, httpErrorToResponse, requireUserId, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { ToolJobStatusSchema, type ToolJobType } from '@/lib/tool-jobs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  try {
    const userId = await requireUserId(request);
    await rateLimitByUser(userId, 'tool-job-status', RATE_LIMITS.API_READ);

    const { id: roadmapId, jobId } = await params;

    // findFirst with userId scope — single-query ownership check
    // (CLAUDE.md §Security). A job that doesn't exist or belongs to
    // another user 404s identically; no existence-leak.
    const job = await prisma.toolJob.findFirst({
      where: { id: jobId, userId, roadmapId },
      select: {
        id:           true,
        toolType:     true,
        stage:        true,
        sessionId:    true,
        errorMessage: true,
        startedAt:    true,
        updatedAt:    true,
        completedAt:  true,
      },
    });
    if (!job) throw new HttpError(404, 'Job not found');

    const payload = ToolJobStatusSchema.parse({
      id:           job.id,
      toolType:     job.toolType as ToolJobType,
      stage:        job.stage,
      sessionId:    job.sessionId,
      errorMessage: job.errorMessage,
      startedAt:    job.startedAt.toISOString(),
      updatedAt:    job.updatedAt.toISOString(),
      completedAt:  job.completedAt ? job.completedAt.toISOString() : null,
    });

    return NextResponse.json(payload);
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
