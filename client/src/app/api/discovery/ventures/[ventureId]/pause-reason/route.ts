// src/app/api/discovery/ventures/[ventureId]/pause-reason/route.ts
//
// POST — pause-reason agent classifier. The founder has clicked
// Pause and typed why; this route reads their reason against their
// venture history and returns one of three modes (acknowledge /
// reframe / mirror) plus a 1-3-sentence reply. Single-turn,
// synchronous, ~2-3s p50.
//
// Does NOT persist anything. Persistence happens on the actual
// pause click via PATCH /ventures/[ventureId] which receives the
// reason + mode in its body.
//
// Fallback: on engine timeout (>5s) or LLM error, returns a static
// shape with mode='static' so the client can render the existing
// pre-LLM motivational copy without a server error.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { logger } from '@/lib/logger';
import { runPauseReasonAgent } from '@/lib/ventures/pause-reason-engine';
import { loadCrossVentureAggregatesForPause } from '@/lib/ventures/pause-aggregates';

// p99 budget for the engine call. The engine itself uses
// withModelFallback which already gives one retry on Anthropic
// overload — this outer race is a hard ceiling so the founder
// never waits more than 5 seconds on the pause path.
export const maxDuration = 30;
const ENGINE_TIMEOUT_MS = 5_000;

const REASON_MAX_CHARS = 1_000;

const BodySchema = z.object({
  reason: z.string().min(1).max(REASON_MAX_CHARS),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ventureId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    // Free can't pause (no ventures); the assert is the explicit gate.
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'pause-reason', RATE_LIMITS.AI_GENERATION);

    const { ventureId } = await params;
    const log = logger.child({ route: 'POST pause-reason', ventureId, userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, `Reason must be 1 to ${REASON_MAX_CHARS} characters.`);
    }
    const reason = parsed.data.reason.trim();

    // Ownership + state-readiness check. The venture must be active
    // (you can't pause a venture that isn't active) AND not archived.
    const venture = await prisma.venture.findFirst({
      where: { id: ventureId, userId, archivedAt: null },
      select: {
        id:        true,
        name:      true,
        status:    true,
        createdAt: true,
        roadmaps: {
          select: {
            progress: { select: { completedTasks: true, totalTasks: true } },
          },
        },
      },
    });
    if (!venture) throw new HttpError(404, 'Not found');
    if (venture.status !== 'active') {
      throw new HttpError(409, 'Pause-reason is only available when the venture is active.');
    }

    // Aggregates run in parallel with the venture's own progress
    // computation since they hit different rows.
    const aggregates = await loadCrossVentureAggregatesForPause({
      userId,
      excludeVentureId: ventureId,
    });

    // Compute current cycle's completion-percent from the most-recent
    // RoadmapProgress row across the venture's roadmaps.
    const progress = venture.roadmaps
      .map(r => r.progress)
      .filter((p): p is { completedTasks: number; totalTasks: number } => p !== null && p.totalTasks > 0)
      .reduce((acc, p) => acc.totalTasks > p.totalTasks ? acc : p, {
        completedTasks: 0, totalTasks: 0,
      });
    const completionPercent = progress.totalTasks > 0
      ? Math.round((progress.completedTasks / progress.totalTasks) * 100)
      : null;
    const daysSinceStart = Math.max(0, Math.round(
      (Date.now() - venture.createdAt.getTime()) / (24 * 60 * 60 * 1000),
    ));

    // Race the engine against the timeout budget. If the engine wins,
    // return its structured response. If timeout wins, return a
    // static-fallback shape the client renders with the pre-existing
    // motivational copy.
    const enginePromise = runPauseReasonAgent({
      reason,
      ventureContext: {
        name:              venture.name,
        daysSinceStart,
        completionPercent,
        completedTasks:    progress.completedTasks,
        totalTasks:        progress.totalTasks,
      },
      crossVentureAggregates: aggregates,
      // Caller doesn't need the cap here — the route's job is the
      // agent reply, not the slot bookkeeping. The PATCH route still
      // enforces the paused-cap on the actual transition.
      pausedSlotAfter: aggregates.currentlyPausedCount + 1,
      pausedSlotCap:   aggregates.currentlyPausedCount + 1,
    });

    const timeoutPromise = new Promise<'__timeout__'>((resolve) =>
      setTimeout(() => resolve('__timeout__'), ENGINE_TIMEOUT_MS),
    );

    let result: 'static' | { mode: string; message: string };
    try {
      const winner = await Promise.race([enginePromise, timeoutPromise]);
      if (winner === '__timeout__') {
        log.warn('[PauseReason] engine timeout; falling back to static');
        result = 'static';
      } else {
        result = winner;
      }
    } catch (err) {
      log.warn('[PauseReason] engine error; falling back to static', {
        error: err instanceof Error ? err.message : String(err),
      });
      result = 'static';
    }

    if (result === 'static') {
      return NextResponse.json({
        mode:    'static',
        message: null,  // client renders its existing static copy
      });
    }

    return NextResponse.json({
      mode:    result.mode,
      message: result.message,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
