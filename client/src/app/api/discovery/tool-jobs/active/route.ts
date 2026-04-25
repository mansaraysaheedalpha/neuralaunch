// src/app/api/discovery/tool-jobs/active/route.ts
//
// GET active ToolJob rows for the authenticated founder (any
// non-terminal stage). Drives the global background-jobs banner
// rendered in (app)/layout.tsx so the founder can see in-flight work
// from any page — not just the tool page that started it.
//
// Capped at 10 active jobs; the founder shouldn't have more in flight
// at once and it keeps the polling response cheap.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  httpErrorToResponse,
  requireUserId,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  TERMINAL_STAGES,
  ToolJobStatusSchema,
  type ToolJobStage,
  type ToolJobType,
  type ToolJobStatus,
} from '@/lib/tool-jobs';

export const maxDuration = 30;

const MAX_ACTIVE_RETURNED = 10;

interface ActiveJobRow extends ToolJobStatus {
  /** Roadmap the job belongs to — needed by the banner so it can
   *  link the founder back to the right tool page. */
  roadmapId: string;
}

export async function GET(_request: Request) {
  try {
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'tool-jobs-active', RATE_LIMITS.API_READ);

    // Non-terminal = neither 'complete' nor 'failed'. Postgres
    // notIn handles both so a single query covers it.
    const jobs = await prisma.toolJob.findMany({
      where: {
        userId,
        stage: { notIn: TERMINAL_STAGES as readonly ToolJobStage[] as string[] },
      },
      orderBy: { startedAt: 'desc' },
      take:    MAX_ACTIVE_RETURNED,
      select: {
        id:           true,
        toolType:     true,
        stage:        true,
        sessionId:    true,
        roadmapId:    true,
        errorMessage: true,
        startedAt:    true,
        updatedAt:    true,
        completedAt:  true,
      },
    });

    const payload: ActiveJobRow[] = jobs.map(j => ({
      ...ToolJobStatusSchema.parse({
        id:           j.id,
        toolType:     j.toolType as ToolJobType,
        stage:        j.stage,
        sessionId:    j.sessionId,
        errorMessage: j.errorMessage,
        startedAt:    j.startedAt.toISOString(),
        updatedAt:    j.updatedAt.toISOString(),
        completedAt:  j.completedAt ? j.completedAt.toISOString() : null,
      }),
      roadmapId: j.roadmapId,
    }));

    return NextResponse.json({ jobs: payload });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
