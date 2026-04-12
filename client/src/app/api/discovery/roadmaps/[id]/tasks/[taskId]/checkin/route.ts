// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/checkin/route.ts
import { NextResponse } from 'next/server';
import { z }            from 'zod';
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
  CHECKIN_ENTRY_SOURCES,
  CHECKIN_HARD_CAP_ROUND,
  RECALIBRATION_MIN_COVERAGE,
  StoredPhasesArraySchema,
  patchTask,
  readTask,
  computeProgressSummary,
  countTasksWithCheckins,
  type CheckInEntry,
  type StoredRoadmapPhase,
} from '@/lib/roadmap/checkin-types';
import { runCheckIn } from '@/lib/roadmap/checkin-agent';
import { summariseConversationArc } from '@/lib/roadmap/conversation-arc-summariser';
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import { captureParkingLotFromCheckin } from '@/lib/continuation';
import {
  safeParseResearchLog,
  appendResearchLog,
  type ResearchLogEntry,
} from '@/lib/research';

// Pro plan: 90s gives headroom for the conditional research path
// (trigger detector LLM call + up to 2 Tavily queries in parallel)
// followed by the Sonnet check-in call. Worst case: ~3s extractor +
// ~15s parallel Tavily + ~30s Sonnet check-in = ~50s. The cap is
// 90s so we don't sit on the boundary under transient slowness.
export const maxDuration = 90;

const BodySchema = z.object({
  category: z.enum(CHECKIN_CATEGORIES),
  freeText: z.string().min(1).max(4000),
  /**
   * A12: provenance of the freeText. Set by the InteractiveTaskCard's
   * two-option completion flow. 'success_criteria_confirmed' means
   * the founder clicked "It went as planned" and freeText holds the
   * task's success criteria text rather than a founder reflection.
   * Optional and defaults to 'founder' on the entry write.
   */
  source:   z.enum(CHECKIN_ENTRY_SOURCES).optional(),
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
    const { category, freeText, source } = parsed.data;

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: {
        id:          true,
        phases:      true,
        parkingLot:  true,
        researchLog: true,
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
    // A2 Part 5: updated cap message routes to existing help surfaces
    // instead of ejecting the founder from the platform.
    if (currentRound > CHECKIN_HARD_CAP_ROUND) {
      throw new HttpError(409, `You've used all ${CHECKIN_HARD_CAP_ROUND} check-ins on this task. You can get more help by clicking "Get help with this task" for focused support, or by clicking "What's Next?" on your roadmap to evaluate your overall progress.`);
    }

    const phaseRow = phases[found.phaseIndex];
    const context  = safeParseDiscoveryContext(roadmap.recommendation.session.beliefState);

    // B1: the check-in agent now decides per-query whether and how to
    // research via two named tools (exa_search, tavily_search). The
    // accumulator is owned by this route and captures every tool call
    // so it can be appended to Roadmap.researchLog inside the
    // existing transaction below.
    const researchAccumulator: ResearchLogEntry[] = [];

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
      contextId:          roadmapId,
      researchAccumulator,
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
      id:            `ci_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      timestamp:     new Date().toISOString(),
      category,
      freeText,
      agentResponse: response.message,
      agentAction:   response.action,
      round:         currentRound,
      ...(response.proposedChanges && response.proposedChanges.length > 0
        ? { proposedChanges: response.proposedChanges }
        : {}),
      // Phase 2 — mid-roadmap execution support. Each of these fields
      // is optional on the agent's response. Persist them only when
      // present so old entries (and entries where the agent did not
      // surface any of them) stay structurally identical.
      ...(response.subSteps && response.subSteps.length > 0
        ? { subSteps: response.subSteps }
        : {}),
      ...(response.recommendedTools && response.recommendedTools.length > 0
        ? { recommendedTools: response.recommendedTools }
        : {}),
      // A2 Part 2: code-level gate. The agent may emit a
      // recalibrationOffer based on prompt reasoning, but the route
      // only persists it when at least 40% of tasks have at least
      // one check-in entry. Below that threshold the agent's message
      // still renders but the structured offer is suppressed —
      // there is not enough execution evidence to justify
      // questioning the recommendation. The coverage check uses the
      // CURRENT phases (before patching in this entry) because the
      // founder's coverage at the moment they file this check-in is
      // the relevant denominator.
      ...(() => {
        if (!response.recalibrationOffer) return {};
        const summary2 = computeProgressSummary(phases);
        const coverage = countTasksWithCheckins(phases) / Math.max(summary2.totalTasks, 1);
        if (coverage < RECALIBRATION_MIN_COVERAGE) return {};
        return { recalibrationOffer: response.recalibrationOffer };
      })(),
      // A12: persist the provenance so the brief generator can weight
      // founder reflections higher than success-criteria confirmations
      // and so analytics can tell the two paths apart. Default to
      // 'founder' for any entry that did not pass an explicit source.
      source: source ?? 'founder',
    };

    const next = patchTask(phases, taskId, t => ({
      ...t,
      checkInHistory: [...(t.checkInHistory ?? []), newEntry],
    }));
    if (!next) throw new HttpError(404, 'Task not found in roadmap (post-merge)');

    const summary = computeProgressSummary(next);

    // Parking-lot auto-capture: when the agent detected an adjacent
    // idea in the founder's free text, append it to the roadmap's
    // parking lot column. Duplicates and cap-overflows are silently
    // dropped — the agent does not need to know about them, and a
    // failed parking-lot append must NEVER fail the check-in itself.
    // The append happens inside the same transaction as the phases
    // write so the JSON column never observes a partial state.
    const { previous: currentParkingLot, next: nextParkingLot } =
      captureParkingLotFromCheckin({
        rawParkingLot: roadmap.parkingLot,
        capturedIdea:  response.parkingLotItem?.idea,
        taskTitle:     found.task.title,
      });

    // Research log append. The accumulator carries every tool call
    // the agent fired during runCheckIn (zero, one, or up to the
    // per-agent step budget). appendResearchLog bounds the column at
    // MAX_RESEARCH_LOG_ENTRIES so the JSONB never grows without
    // limit on a multi-cycle roadmap.
    const nextResearchLog = researchAccumulator.length > 0
      ? appendResearchLog(safeParseResearchLog(roadmap.researchLog), researchAccumulator)
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.roadmap.update({
        where: { id: roadmapId },
        data:  {
          phases: toJsonValue(next),
          ...(nextParkingLot   ? { parkingLot:  toJsonValue(nextParkingLot) }   : {}),
          ...(nextResearchLog  ? { researchLog: toJsonValue(nextResearchLog) }  : {}),
        },
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
          // A11: clear the persisted stale-task title alongside
          // nudgePending so the banner does not name a task that is
          // no longer stale on the next render.
          staleTaskTitle: null,
        },
      });
    });

    log.info('Check-in persisted', {
      taskId,
      action:        response.action,
      round:         currentRound,
      parkedIdea:    !!nextParkingLot,
      researchCalls: researchAccumulator.length,
    });

    // A7: conversation arc summarisation. Fires only at the terminal
    // moments of a per-task check-in conversation:
    //   - Round 5 (the cap) — there will be no more rounds.
    //   - completed-with-2+-entries — the founder is closing this
    //     task and we have a real arc to summarise.
    // The historyAfter array is the in-memory shape we just patched
    // into the phases JSON; using it directly avoids a round-trip
    // through Prisma. Fail-open: any error from the helper returns
    // null and we skip the second update.
    const historyAfter = [...priorHistory, newEntry];
    const isCapRound = currentRound === CHECKIN_HARD_CAP_ROUND;
    const isCompletedWithHistory = category === 'completed' && historyAfter.length >= 2;
    if (isCapRound || isCompletedWithHistory) {
      const arc = await summariseConversationArc({
        taskTitle: found.task.title,
        history:   historyAfter,
      });
      if (arc != null) {
        // Read-then-write the latest phases JSON so a concurrent
        // check-in on a different task of the same roadmap does not
        // get clobbered by this targeted arc-only update. The patch
        // is best-effort: if the second write fails or the parse
        // fails the conversationArc field stays null and the brief
        // generator's fallback path takes over.
        try {
          const fresh = await prisma.roadmap.findUnique({
            where:  { id: roadmapId },
            select: { phases: true },
          });
          if (fresh) {
            const freshParsed = StoredPhasesArraySchema.safeParse(fresh.phases);
            if (freshParsed.success) {
              const phasesWithArc = patchTask(freshParsed.data, taskId, t => ({
                ...t,
                conversationArc: arc,
              }));
              if (phasesWithArc) {
                await prisma.roadmap.update({
                  where: { id: roadmapId },
                  data:  { phases: toJsonValue(phasesWithArc) },
                });
                log.info('[ConversationArc] Persisted', { taskId });
              }
            }
          }
        } catch (err) {
          log.warn('[ConversationArc] Persist failed — leaving field null', {
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // A2 Part 4: progress-aware routing for the recalibration offer.
    // When the entry carries a recalibrationOffer (i.e. it passed the
    // code-level gate), determine where the founder should go:
    //   - Below 50% complete → pushback flow (reconsider the recommendation)
    //   - 50%+ complete → task-level diagnostic (get help with what's left)
    const hasRecal = !!newEntry.recalibrationOffer;
    const completionPct = summary.totalTasks > 0
      ? summary.completedTasks / summary.totalTasks
      : 0;

    return NextResponse.json({
      entry:    newEntry,
      progress: summary,
      recommendationId: roadmap.recommendation.id,
      // A2: progress-aware routing info for the client. The client
      // renders different link text and different target surfaces
      // depending on the founder's completion percentage.
      recalibration: hasRecal
        ? {
            route: completionPct >= 0.5 ? 'task_diagnostic' as const : 'pushback' as const,
            reason: newEntry.recalibrationOffer!.reason,
          }
        : null,
      parkingLot: nextParkingLot ?? currentParkingLot,
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
