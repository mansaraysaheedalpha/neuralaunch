// src/app/api/discovery/recommendations/[id]/roadmap/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { inngest } from '@/inngest/client';
import { ROADMAP_EVENT } from '@/lib/roadmap';
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { z } from 'zod';

const ParamsSchema = z.object({ id: z.string().min(1) });

/**
 * POST /api/discovery/recommendations/[id]/roadmap
 *
 * Triggers the roadmap generation Inngest function for the given recommendation.
 * Returns 202 immediately — the roadmap is generated asynchronously.
 * Returns 409 if a READY roadmap already exists.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(req);
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    throw err;
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid recommendation ID' }, { status: 400 });
  }

  const { id: recommendationId } = parsed.data;
  const userId = session.user.id;

  try {
    await rateLimitByUser(userId, 'roadmap-trigger', RATE_LIMITS.AI_GENERATION);
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    throw err;
  }

  // Single query for ownership + roadmap status — no existence-leak.
  const recommendation = await prisma.recommendation.findFirst({
    where:  { id: recommendationId, userId },
    select: { roadmap: { select: { status: true } } },
  });

  if (!recommendation) {
    return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 });
  }
  if (recommendation.roadmap?.status === 'READY') {
    return NextResponse.json({ status: 'ready' }, { status: 200 });
  }

  // Reset to GENERATING synchronously before firing Inngest so the polling
  // client never sees a stale FAILED status from a previous attempt.
  await prisma.roadmap.upsert({
    where:  { recommendationId },
    create: { userId, recommendationId, status: 'GENERATING', phases: [] },
    update: { status: 'GENERATING', phases: [] },
  });

  await inngest.send({
    name: ROADMAP_EVENT,
    data: { recommendationId, userId },
  });

  return NextResponse.json({ status: 'generating' }, { status: 202 });
}

/**
 * GET /api/discovery/recommendations/[id]/roadmap
 *
 * Returns the current roadmap status and data for polling from the UI.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(req);
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    throw err;
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await rateLimitByUser(session.user.id, 'roadmap-poll', RATE_LIMITS.API_READ);
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    throw err;
  }

  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid recommendation ID' }, { status: 400 });
  }

  // Scope by userId so a leaked recommendation cuid cannot be used to
  // read another user's roadmap. findFirst because (recommendationId, userId)
  // is not a Prisma unique key.
  const roadmap = await prisma.roadmap.findFirst({
    where:  { recommendationId: parsed.data.id, userId: session.user.id },
    select: {
      id:                 true,
      status:             true,
      phases:             true,
      closingThought:     true,
      weeklyHours:        true,
      totalWeeks:         true,
      createdAt:          true,
      // Roadmap continuation — surface the parking lot and the
      // continuation lifecycle status so the client can render the
      // "What's Next?" button, the parked-idea sidebar, and the
      // brief reveal page without a second round-trip.
      parkingLot:         true,
      continuationStatus: true,
      // Concern 4 — surface the per-roadmap progress / nudge state
      // so the client can render the proactive nudge banner and the
      // progress counters without a second round-trip.
      progress: {
        select: {
          totalTasks:     true,
          completedTasks: true,
          blockedTasks:   true,
          lastActivityAt: true,
          nudgePending:   true,
          // A11: surface the exact stale task title persisted by the
          // nudge cron so the NudgeBanner reads ground truth instead
          // of re-deriving "the first in-progress task".
          staleTaskTitle: true,
          outcomePromptPending: true,
        },
      },
    },
  });

  if (!roadmap) {
    return NextResponse.json({ status: 'not_started' }, { status: 200 });
  }

  return NextResponse.json(roadmap, { status: 200 });
}
