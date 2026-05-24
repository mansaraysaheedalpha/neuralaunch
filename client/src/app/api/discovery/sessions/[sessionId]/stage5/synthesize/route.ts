// src/app/api/discovery/sessions/[sessionId]/stage5/synthesize/route.ts
//
// Stage 5 (No Idea archetype) — accept-and-queue route for the
// synthesis bridge. Validates the request, dedups against any open
// IdeationStage5Job, creates a fresh job row, fires the Inngest
// event, and returns 202 immediately with the jobId. The worker
// (ideation-stage5-synthesize-function.ts) owns every LLM call.
//
// Pre-conditions enforced here (409 on violation):
//   - Stage 5 IdeationStageRun exists and is in 'authoring'
//   - Stage 4 IdeationStageRun is 'committed' (chosen opportunity
//     already pinned by the founder)
//   - No in-flight Stage 5 job exists for this session (idempotency)
//
// The founder's chosen opportunity is already pinned on the committed
// Stage 4 output; no body is required.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { inngest } from '@/inngest/client';
import { logger } from '@/lib/logger';
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';
import {
  captureTraceHeaders,
  withToolUiSpan,
} from '@/lib/observability';
import {
  createStage5Job,
  findOpenStage5Job,
} from '@/lib/ideation/stage5-handoff/job';

// Accept-and-queue route — sub-second of orchestration. The Inngest
// worker owns the long-running synthesis call and runs untethered to
// this ceiling.
export const maxDuration = 30;

/**
 * POST /api/discovery/sessions/[sessionId]/stage5/synthesize
 *
 * Returns 202 with { jobId, sessionId } on success. The client polls
 * the status endpoint until the job reaches 'succeeded' (then
 * navigates to the Recommendation review surface) or 'failed' (then
 * surfaces a retry CTA).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId(request);
    await rateLimitByUser(userId, 'discovery:stage5:synthesize', RATE_LIMITS.AI_GENERATION);

    const { sessionId } = await params;
    const log = logger.child({
      route: 'POST /api/discovery/sessions/[id]/stage5/synthesize',
      userId, sessionId,
    });

    // Ownership-scoped lookup. The session join filter on the stage-run
    // query is what enforces ownership — a row that doesn't exist OR
    // belongs to another user 404s identically (no existence leak).
    const stageRuns = await prisma.ideationStageRun.findMany({
      where:  {
        sessionId,
        session:     { userId },
        stageNumber: { in: [4, 5] },
      },
      select: { id: true, stageNumber: true, status: true },
    });
    if (stageRuns.length === 0) {
      throw new HttpError(404, 'Session not found');
    }

    const stage4 = stageRuns.find(r => r.stageNumber === 4);
    const stage5 = stageRuns.find(r => r.stageNumber === 5);
    if (!stage4 || stage4.status !== 'committed') {
      throw new HttpError(409, 'Stage 4 is not committed yet');
    }
    if (!stage5) {
      throw new HttpError(409, 'Stage 5 row is missing');
    }
    if (stage5.status !== 'authoring') {
      throw new HttpError(409, `Stage 5 is in ${stage5.status} state, not authoring`);
    }

    // Idempotency — re-POST while a job is in flight returns the
    // existing jobId. Combines with the partial unique on
    // IdeationStage5Job to ensure exactly one in-flight worker.
    const existing = await findOpenStage5Job(sessionId);
    if (existing) {
      log.info('[Stage5Synthesize] Idempotent re-POST', { jobId: existing.id });
      return NextResponse.json(
        { jobId: existing.id, sessionId },
        { status: 202 },
      );
    }

    return await withToolUiSpan(
      { name: 'ideation.stage5.synthesize.enqueue' },
      async () => {
        const job = await createStage5Job({ userId, sessionId });
        const traceHeaders = captureTraceHeaders();

        try {
          await inngest.send({
            name: 'ideation/stage5-synthesize.requested',
            data: {
              jobId:      job.id,
              userId,
              sessionId,
              stageRunId: stage5.id,
              ...(traceHeaders.sentryTrace ? { sentryTrace: traceHeaders.sentryTrace } : {}),
              ...(traceHeaders.baggage     ? { baggage:     traceHeaders.baggage }     : {}),
            },
          });
        } catch (sendErr) {
          // Orphan-row cleanup mirrors lib/tool-jobs/queue.ts. A failed
          // inngest.send must not strand a 'queued' row in the table;
          // the polling client would otherwise hit a dead jobId.
          await prisma.ideationStage5Job
            .delete({ where: { id: job.id } })
            .catch(() => { /* best-effort cleanup */ });
          throw sendErr;
        }

        log.info('[Stage5Synthesize] Job queued', { jobId: job.id, stageRunId: stage5.id });
        return NextResponse.json(
          { jobId: job.id, sessionId },
          { status: 202 },
        );
      },
    );
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
