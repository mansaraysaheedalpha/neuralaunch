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
  evaluateScenario,
  loadContinuationEvidence,
} from '@/lib/continuation';

export const maxDuration = 30;

/**
 * POST /api/discovery/roadmaps/[id]/checkpoint
 *
 * The "What's Next?" button entry point. Single deterministic call:
 *   1. Load + parse the roadmap evidence (ownership scoped via findFirst).
 *   2. Run the scenario classifier on the parsed RoadmapProgress counts.
 *   3a. Scenario A or B → flip continuationStatus to DIAGNOSING and
 *       return the scenario verdict so the client opens the diagnostic chat.
 *   3b. Scenario C or D → flip continuationStatus to GENERATING_BRIEF
 *       and queue the discovery/continuation.requested Inngest event.
 *
 * The route does NOT call any LLM directly — Phase 3 owns the model
 * calls. This route is the deterministic gate that decides which path
 * the founder takes after they hit the button.
 *
 * Returns:
 *   200 with { scenario, status, percentComplete, explanation }
 *   404 if the roadmap is not found / not owned by the caller
 *   409 if the roadmap is in a continuation state that does not
 *       accept a fresh checkpoint (BRIEF_READY without an explicit
 *       reset, or FORK_SELECTED — at that point the next roadmap is
 *       already taking over).
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

    const loaded = await loadContinuationEvidence({ roadmapId, userId });
    if (!loaded.ok) {
      // Map evidence-load failure shapes to HTTP responses. The
      // distinction between not_found and no_belief_state matters
      // because the latter is recoverable (the upstream session row
      // is missing the JSON column) and the former is not.
      if (loaded.reason === 'not_found') throw new HttpError(404, 'Not found');
      if (loaded.reason === 'no_belief_state')
        throw new HttpError(409, 'Roadmap is missing its parent recommendation context');
      throw new HttpError(409, 'Roadmap content is malformed');
    }
    const evidence = loaded.evidence;

    // The fork-selected state means the next-cycle roadmap is already
    // generating or already exists; the founder cannot rerun the
    // checkpoint on this row. Brief-ready means the founder is in the
    // middle of picking a fork on the existing brief — re-running
    // would discard their in-flight choice. Both reject explicitly so
    // the client can refetch and surface the right view.
    if (evidence.continuationStatus === CONTINUATION_STATUSES.FORK_SELECTED) {
      throw new HttpError(409, 'A fork has already been selected for this roadmap. Open the next roadmap to continue.');
    }
    if (evidence.continuationStatus === CONTINUATION_STATUSES.BRIEF_READY) {
      throw new HttpError(409, 'A continuation brief already exists for this roadmap. Open it from the roadmap page.');
    }

    const evaluation = evaluateScenario({
      totalTasks:     evidence.progress.totalTasks,
      completedTasks: evidence.progress.completedTasks,
    });

    log.info('[Checkpoint] Scenario evaluated', {
      scenario: evaluation.scenario,
      percent:  evaluation.percentComplete,
    });

    if (evaluation.needsDiagnostic) {
      // Scenario A or B — open the diagnostic chat. The next POST
      // from the founder lands on /diagnostic which calls the
      // diagnostic engine. We do NOT clear the diagnostic history
      // here — if the founder hit the button before, those entries
      // are still relevant context for the next exchange.
      await prisma.roadmap.update({
        where: { id: roadmapId },
        data:  { continuationStatus: CONTINUATION_STATUSES.DIAGNOSING },
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
