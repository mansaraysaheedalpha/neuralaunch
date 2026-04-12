// src/app/api/discovery/roadmaps/[id]/checkpoint/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { inngest } from '@/inngest/client';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  CONTINUATION_BRIEF_EVENT,
  CONTINUATION_STATUSES,
  DIAGNOSTIC_HARD_CAP_TURNS,
  evaluateScenario,
  loadCheckpointStatus,
} from '@/lib/continuation';

export const maxDuration = 30;

/**
 * POST /api/discovery/roadmaps/[id]/checkpoint
 *
 * The "What's Next?" button entry point. Single deterministic call:
 *   1. Load only the row's continuationStatus + RoadmapProgress counters
 *      via the lightweight loadCheckpointStatus loader. The full evidence
 *      base (Recommendation, beliefState, phases, parking lot, diagnostic
 *      history) is NOT needed for the deterministic gate — the brief
 *      Inngest function loads it when there is real work to do.
 *   2. Run the scenario classifier on the live progress counters.
 *   3a. Scenario A or B → flip continuationStatus to DIAGNOSING and
 *       return the scenario verdict so the client opens the diagnostic chat.
 *   3b. Scenario C or D → flip continuationStatus to GENERATING_BRIEF
 *       and queue the discovery/continuation.requested Inngest event.
 *
 * Re-clicks while a brief is already generating return the in-flight
 * status without re-firing the event — the brief worker is itself
 * idempotent but we want to avoid burning rate-limit budget on a
 * pointless re-trigger that the worker will skip anyway.
 *
 * The route does NOT call any LLM directly — Phase 3 owns the model
 * calls. This route is the deterministic gate that decides which path
 * the founder takes after they hit the button.
 *
 * Returns:
 *   200 with { scenario, status, percentComplete, explanation }
 *   404 if the roadmap is not found / not owned by the caller
 *   409 if the roadmap is in a terminal continuation state that does
 *       not accept a fresh checkpoint (BRIEF_READY without an explicit
 *       reset, or FORK_SELECTED — at that point the next-cycle roadmap
 *       is already taking over).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    // The checkpoint POST is a state-changing write that may queue an
    // expensive LLM call downstream — fold it into the AI_GENERATION
    // tier rather than API_AUTHENTICATED. Same posture as the roadmap
    // trigger route, the pushback turn route, and the check-in route.
    await rateLimitByUser(userId, 'roadmap-checkpoint', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    const log = logger.child({ route: 'POST roadmap-checkpoint', roadmapId, userId });

    // Lightweight load — only the row's status + RoadmapProgress
    // counters. The full evidence base (Recommendation + beliefState
    // + phases + parking lot + diagnostic history) is not needed for
    // the deterministic gate; the brief Inngest function loads it
    // when there is real work to do. This is the highest-traffic
    // surface of the continuation feature, so the difference matters.
    const loaded = await loadCheckpointStatus({ roadmapId, userId });
    if (!loaded.ok) {
      throw new HttpError(404, 'Not found');
    }
    const checkpointStatus = loaded.status;

    // Terminal states: the founder cannot rerun the checkpoint on a
    // row whose brief is ready (would discard an in-flight pick) or
    // whose fork is already selected (the next-cycle roadmap is the
    // founder's new home). Both reject explicitly so the client can
    // refetch and surface the right view.
    if (checkpointStatus.continuationStatus === CONTINUATION_STATUSES.FORK_SELECTED) {
      throw new HttpError(409, 'A fork has already been selected for this roadmap. Open the next roadmap to continue.');
    }
    if (checkpointStatus.continuationStatus === CONTINUATION_STATUSES.BRIEF_READY) {
      throw new HttpError(409, 'A continuation brief already exists for this roadmap. Open it from the roadmap page.');
    }

    // GENERATING_BRIEF — a prior checkpoint already queued the brief
    // and the worker is in flight. Re-clicking the button must NOT
    // re-fire the event (would burn rate limit and risk a duplicate
    // worker run racing the idempotency guard). Tell the client the
    // brief is in flight; the client polling layer will pick up
    // BRIEF_READY when the worker persists.
    if (checkpointStatus.continuationStatus === CONTINUATION_STATUSES.GENERATING_BRIEF) {
      log.info('[Checkpoint] Brief already generating — returning existing status');
      return NextResponse.json({
        scenario:        null,
        status:          CONTINUATION_STATUSES.GENERATING_BRIEF,
        percentComplete: checkpointStatus.progress.totalTasks > 0
          ? checkpointStatus.progress.completedTasks / checkpointStatus.progress.totalTasks
          : 0,
        explanation:     'A continuation brief is already generating for this roadmap.',
      });
    }

    const evaluation = evaluateScenario({
      totalTasks:     checkpointStatus.progress.totalTasks,
      completedTasks: checkpointStatus.progress.completedTasks,
    });

    log.info('[Checkpoint] Scenario evaluated', {
      scenario: evaluation.scenario,
      percent:  evaluation.percentComplete,
    });

    if (evaluation.needsDiagnostic) {
      // Scenario A or B — open the diagnostic chat. The next POST
      // from the founder lands on /diagnostic which calls the
      // diagnostic engine.
      //
      // If the existing diagnostic history already has cap-many agent
      // turns (from a prior abandoned session), clear it so the
      // founder starts fresh. A stale full-length history would
      // cause the diagnostic route to hit the turn cap on the very
      // first message. Partial histories (under the cap) are
      // preserved — they carry useful context from the prior
      // exchange. This ONLY affects Roadmap.diagnosticHistory; task-
      // level diagnostic entries live in task.checkInHistory and are
      // completely untouched.
      const existingAgentTurns = checkpointStatus.briefAlreadyExists
        ? 0 // irrelevant — brief already exists guard fires above
        : await (async () => {
            const row = await prisma.roadmap.findUnique({
              where:  { id: roadmapId },
              select: { diagnosticHistory: true },
            });
            if (!row?.diagnosticHistory || !Array.isArray(row.diagnosticHistory)) return 0;
            return (row.diagnosticHistory as Array<{ role?: string }>).filter(t => t.role === 'agent').length;
          })();
      const clearHistory = existingAgentTurns >= DIAGNOSTIC_HARD_CAP_TURNS;
      if (clearHistory) {
        log.info('[Checkpoint] Clearing stale diagnostic history — prior session hit the cap');
      }

      await prisma.roadmap.update({
        where: { id: roadmapId },
        data:  {
          continuationStatus: CONTINUATION_STATUSES.DIAGNOSING,
          ...(clearHistory ? { diagnosticHistory: [] } : {}),
        },
      });
      return NextResponse.json({
        scenario:        evaluation.scenario,
        status:          CONTINUATION_STATUSES.DIAGNOSING,
        percentComplete: evaluation.percentComplete,
        explanation:     evaluation.explanation,
      });
    }

    // Scenario C or D — flip status and queue the Opus brief.
    // Order matters: the status MUST be set before the event is sent
    // so the worker's idempotency guard can identify a valid run.
    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { continuationStatus: CONTINUATION_STATUSES.GENERATING_BRIEF },
    });

    await inngest.send({
      name: CONTINUATION_BRIEF_EVENT,
      data: { roadmapId, userId },
    });

    log.info('[Checkpoint] Brief generation queued');

    return NextResponse.json({
      scenario:        evaluation.scenario,
      status:          CONTINUATION_STATUSES.GENERATING_BRIEF,
      percentComplete: evaluation.percentComplete,
      explanation:     evaluation.explanation,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
