// src/app/api/discovery/sessions/[sessionId]/stage5/status/route.ts
//
// Polled by the Stage 5 client every 3s (foreground) / 30s
// (backgrounded) while a synthesis job is running. Returns a lean
// `{ jobId, status, error?, recommendationId? }` payload matching the
// contract in the commit brief — the simplified projection of
// IdeationStage5Job built for the founder UI.
//
// The actual Recommendation body is fetched separately via the
// existing Recommendation review surface once the client sees
// status='succeeded'.
//
// Defensive CSRF (enforceSameOrigin) on a read endpoint matches the
// codebase's convention — every authenticated route is same-origin
// for auditable consistency.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';
import type { Stage5JobStage } from '@/lib/ideation/stage5-handoff/job';

/**
 * Polling client's branch key. The full worker stage (loading_inputs,
 * synthesizing, persisting) is mapped to 'running' so existing branches
 * stay simple; the raw `stage` field is also surfaced below so the
 * Stage 5 polling UI can render the four-phase vertical checklist
 * (B.2 in docs/stage5-copy-review.md).
 */
type Stage5JobPublicStatus = 'queued' | 'running' | 'succeeded' | 'failed';

function projectStatus(stage: Stage5JobStage): Stage5JobPublicStatus {
  if (stage === 'succeeded') return 'succeeded';
  if (stage === 'failed')    return 'failed';
  if (stage === 'queued')    return 'queued';
  // loading_inputs | synthesizing | persisting → 'running'
  return 'running';
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId(request);
    await rateLimitByUser(userId, 'discovery:stage5:status', RATE_LIMITS.API_READ);

    const { sessionId } = await params;

    // Ownership-scoped lookup. The session relation filter on the
    // findFirst enforces ownership — a job that doesn't exist OR
    // belongs to another user 404s identically (no existence leak).
    // Returns the LATEST job for this session (sorted by startedAt
    // desc) so a refreshed page after a prior failed run still picks
    // up the new in-flight job.
    const job = await prisma.ideationStage5Job.findFirst({
      where:   {
        sessionId,
        userId,
      },
      orderBy: { startedAt: 'desc' },
      select:  {
        id:               true,
        stage:            true,
        errorMessage:     true,
        recommendationId: true,
      },
    });
    if (!job) throw new HttpError(404, 'No Stage 5 job found for this session');

    const status: Stage5JobPublicStatus = projectStatus(job.stage as Stage5JobStage);

    // Build the contract-aligned response. `error` is only set on the
    // failed path; `recommendationId` is only set on the succeeded
    // path. The polling client branches on `status` and reads the
    // optional fields when present. `stage` is the unprojected worker
    // pipeline phase — exposed so the Stage 5 polling UI can render the
    // four-phase vertical checklist.
    const body: {
      jobId:             string;
      status:            Stage5JobPublicStatus;
      stage:             Stage5JobStage;
      error?:            string;
      recommendationId?: string;
    } = { jobId: job.id, status, stage: job.stage as Stage5JobStage };
    if (status === 'failed' && job.errorMessage) {
      body.error = job.errorMessage;
    }
    if (status === 'succeeded' && job.recommendationId) {
      body.recommendationId = job.recommendationId;
    }

    // Cache-Control: never cache — the status flips state in real
    // time and the client polls on the assumption every fetch is
    // fresh.
    const response = NextResponse.json(body);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
