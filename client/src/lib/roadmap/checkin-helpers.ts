// src/lib/roadmap/checkin-helpers.ts
//
// Pure helpers extracted from the check-in route to keep that file
// within the 150-line route cap.
//
// persistConversationArc — A7 read-then-write for the conversationArc
//   field after a task hits its terminal check-in moment. Fail-open:
//   any error is logged and silently swallowed so a summariser blip
//   never fails the parent check-in response.
//
// gateRecalibrationOffer — A2 code-level gate that suppresses the
//   agent's recalibrationOffer when execution coverage is below 40%.
//   Pure function; no I/O.

import 'server-only';
import prisma, { toJsonValue }         from '@/lib/prisma';
import { logger }                       from '@/lib/logger';
import { summariseConversationArc }     from './conversation-arc-summariser';
import {
  StoredPhasesArraySchema,
  patchTask,
  countTasksWithCheckins,
  computeProgressSummary,
  CHECKIN_HARD_CAP_ROUND,
  RECALIBRATION_MIN_COVERAGE,
  type CheckInEntry,
  type CheckInCategory,
  type RecalibrationOfferEntry,
  type StoredRoadmapPhase,
} from './checkin-types';

// ---------------------------------------------------------------------------
// gateRecalibrationOffer
// ---------------------------------------------------------------------------

export interface GateRecalibrationOfferInput {
  /** Offer emitted by the agent, or falsy when the agent did not emit one. */
  recalibrationOffer: RecalibrationOfferEntry | null | undefined;
  /**
   * Current phases BEFORE patching in the new entry. The denominator
   * for coverage is the founder's state when they file this check-in,
   * not the state after it is appended.
   */
  phases: StoredRoadmapPhase[];
}

/**
 * Returns the recalibrationOffer when:
 *   1. The agent emitted one, AND
 *   2. At least RECALIBRATION_MIN_COVERAGE (40%) of tasks already have
 *      at least one check-in entry.
 *
 * Below the threshold the offer is suppressed — not enough execution
 * evidence exists to justify questioning the recommendation.
 * Returns undefined (not null) so spread into a CheckInEntry is a
 * clean no-op when omitted.
 */
export function gateRecalibrationOffer(
  input: GateRecalibrationOfferInput,
): RecalibrationOfferEntry | undefined {
  const { recalibrationOffer, phases } = input;
  if (!recalibrationOffer) return undefined;
  const summary  = computeProgressSummary(phases);
  const coverage = countTasksWithCheckins(phases) / Math.max(summary.totalTasks, 1);
  if (coverage < RECALIBRATION_MIN_COVERAGE) return undefined;
  return recalibrationOffer;
}

// ---------------------------------------------------------------------------
// persistConversationArc
// ---------------------------------------------------------------------------

export interface PersistConversationArcInput {
  roadmapId:    string;
  taskId:       string;
  /** History BEFORE the new entry was appended. */
  priorHistory: CheckInEntry[];
  /** The entry that was just appended by the main transaction. */
  newEntry:     CheckInEntry;
  /** 1-indexed round number of the new entry. */
  currentRound: number;
  /** Category submitted by the founder for this round. */
  category:     CheckInCategory;
  taskTitle:    string;
}

/**
 * A7: fires the Haiku conversation-arc summariser and persists the
 * result as a targeted read-then-write on the roadmap phases JSON.
 *
 * Triggers only at terminal moments:
 *   - Round 5 (the hard cap — no more rounds will follow).
 *   - category='completed' with 2+ entries in the history after
 *     appending the new entry (there is a real arc to summarise).
 *
 * Fail-open: any error is caught and logged. The conversationArc
 * field stays null and the brief generator's fallback path takes
 * over. Returns void — the caller does not await a meaningful value.
 */
export async function persistConversationArc(
  input: PersistConversationArcInput,
): Promise<void> {
  const { roadmapId, taskId, priorHistory, newEntry, currentRound, category, taskTitle } = input;
  const log = logger.child({ module: 'persistConversationArc', roadmapId, taskId });

  const historyAfter     = [...priorHistory, newEntry];
  const isCapRound       = currentRound === CHECKIN_HARD_CAP_ROUND;
  const isCompletedWithHistory = category === 'completed' && historyAfter.length >= 2;

  if (!isCapRound && !isCompletedWithHistory) return;

  const arc = await summariseConversationArc({ taskTitle, history: historyAfter });
  if (arc == null) return;

  // Read-then-write so a concurrent check-in on a different task of
  // the same roadmap does not clobber this targeted arc-only update.
  // Best-effort: if the write fails the field stays null and the brief
  // generator's fallback takes over.
  try {
    const fresh = await prisma.roadmap.findUnique({
      where:  { id: roadmapId },
      select: { phases: true },
    });
    if (!fresh) return;

    const freshParsed = StoredPhasesArraySchema.safeParse(fresh.phases);
    if (!freshParsed.success) return;

    const phasesWithArc = patchTask(freshParsed.data, taskId, t => ({
      ...t,
      conversationArc: arc,
    }));
    if (!phasesWithArc) return;

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { phases: toJsonValue(phasesWithArc) },
    });
    log.info('[ConversationArc] Persisted', { taskId });
  } catch (err) {
    log.warn('[ConversationArc] Persist failed — leaving field null', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
