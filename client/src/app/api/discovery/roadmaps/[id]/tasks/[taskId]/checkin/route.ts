// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/checkin/route.ts
import { NextResponse } from 'next/server';
import { z }            from 'zod';
import { Prisma }       from '@prisma/client';
import prisma, { toJsonValue }           from '@/lib/prisma';
import { logger }       from '@/lib/logger';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  CHECKIN_CATEGORIES,
  CHECKIN_HARD_CAP_ROUND,
  StoredPhasesArraySchema,
  patchTask,
  readTask,
  computeProgressSummary,
  type CheckInEntry,
  type StoredRoadmapPhase,
} from '@/lib/roadmap/checkin-types';
import { runCheckIn } from '@/lib/roadmap/checkin-agent';
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';

// Pro plan: 60s is comfortable for the Sonnet check-in call.
export const maxDuration = 60;

const BodySchema = z.object({
  category: z.enum(CHECKIN_CATEGORIES),
  freeText: z.string().min(1).max(4000),
});

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/checkin
 *
 * Submit a check-in for a single task. Calls the check-in Sonnet
 * agent, appends the result to the task's checkInHistory, and
 * updates RoadmapProgress.lastActivityAt + clears any pending
 * proactive nudge.
 *
 * Hard cap: CHECKIN_HARD_CAP_ROUND (5) check-in exchanges per task.
 * The 6th attempt returns 409 — the founder is told to start a new
 * discovery session if they need more support on this specific task.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    // AI_GENERATION tier — every check-in is a paid Sonnet call
    await rateLimitByUser(userId, 'roadmap-checkin', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId, taskId } = await params;
    const log = logger.child({ route: 'POST roadmap-checkin', roadmapId, taskId, userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid body');
    }
    const { category, freeText } = parsed.data;

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: {
        id:     true,
        phases: true,
        recommendation: {
          select: {
            id:        true,
            path:      true,
            summary:   true,
            reasoning: true,
            session:   { select: { beliefState: true } },
          },
        },
      },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');
    if (!roadmap.recommendation?.session?.beliefState) {
      throw new HttpError(409, 'Roadmap is missing its parent recommendation context');
    }

    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (!phasesParsed.success) {
      log.warn('Roadmap phases failed schema parse — refusing the check-in');
      throw new HttpError(409, 'Roadmap content is malformed');
    }
    const phases: StoredRoadmapPhase[] = phasesParsed.data;

    const found = readTask(phases, taskId);
    if (!found) throw new HttpError(404, 'Task not found in roadmap');

    const priorHistory = found.task.checkInHistory ?? [];
    const currentRound = priorHistory.length + 1;
    if (currentRound > CHECKIN_HARD_CAP_ROUND) {
      throw new HttpError(409, `You have reached the check-in cap on this task. If you are still stuck, start a fresh discovery session and bring this learning forward.`);
    }

    const phaseRow = phases[found.phaseIndex];
    const context  = safeParseDiscoveryContext(roadmap.recommendation.session.beliefState);

    const response = await runCheckIn({
      recommendation: {
        path:      roadmap.recommendation.path,
        summary:   roadmap.recommendation.summary,
        reasoning: roadmap.recommendation.reasoning,
      },
      context,
      phases,
      task:               found.task,
      taskPhaseTitle:     phaseRow.title,
      taskPhaseObjective: phaseRow.objective,
      history:            priorHistory,
      category,
      freeText,
      currentRound,
      taskId,
    });

    // Append the new entry. Future agent turns read this history.
    //
    // DEFERRED: Roadmap Adjustment Layer
    // proposedChanges is currently surfaced as readable text only —
    // the founder reads the suggestion in the task transcript and
    // applies it manually by editing the relevant tasks. The
    // accept/reject mechanism (where a click on "accept" mutates
    // the roadmap JSON automatically) is intentionally not built
    // yet. The trigger to build it: 15+ adjusted_next_step entries
    // logged in production. At that point, query CheckInEntry rows
    // where agentAction='adjusted_next_step', review the actual
    // proposedChanges payloads, and determine the structure (likely
    // resequence / rewrite / remove) the accept UI needs to handle.
    // Building the editor against assumptions risks the wrong shape.
    const newEntry: CheckInEntry = {
      id:            `ci_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp:     new Date().toISOString(),
      category,
      freeText,
      agentResponse: response.message,
      agentAction:   response.action,
      round:         currentRound,
      ...(response.proposedChanges && response.proposedChanges.length > 0
        ? { proposedChanges: response.proposedChanges }
        : {}),
    };

    const next = patchTask(phases, taskId, t => ({
      ...t,
      checkInHistory: [...(t.checkInHistory ?? []), newEntry],
    }));
    if (!next) throw new HttpError(404, 'Task not found in roadmap (post-merge)');

    const summary = computeProgressSummary(next);

    await prisma.$transaction(async (tx) => {
      await tx.roadmap.update({
        where: { id: roadmapId },
        data:  { phases: toJsonValue(next) },
      });
      await tx.roadmapProgress.upsert({
        where:  { roadmapId },
        create: {
          roadmapId,
          totalTasks:     summary.totalTasks,
          completedTasks: summary.completedTasks,
          blockedTasks:   summary.blockedTasks,
          lastActivityAt: new Date(),
        },
        update: {
          totalTasks:     summary.totalTasks,
          completedTasks: summary.completedTasks,
          blockedTasks:   summary.blockedTasks,
          lastActivityAt: new Date(),
          nudgePending:   false,
        },
      });
    });

    log.info('Check-in persisted', {
      taskId,
      action:    response.action,
      round:     currentRound,
    });

    return NextResponse.json({
      entry:    newEntry,
      progress: summary,
      // The client uses this to render the re-examine prompt that
      // links into the recommendation pushback flow when the agent
      // flagged a fundamental problem.
      flaggedFundamental: response.action === 'flagged_fundamental',
      recommendationId:   roadmap.recommendation.id,
    });
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    logger.error(
      'Roadmap check-in POST failed',
      err instanceof Error ? err : new Error(String(err)),
    );
    return httpErrorToResponse(err);
  }
}
