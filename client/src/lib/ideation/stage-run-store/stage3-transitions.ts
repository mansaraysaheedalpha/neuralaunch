// src/lib/ideation/stage-run-store/stage3-transitions.ts
//
// Stage 3 write paths for IdeationStageRun. Same shape conventions
// as stage1-transitions / stage2-transitions: updateMany with
// status filters as optimistic locks; idempotent on already-
// committed rows.

import 'server-only';
import prisma, { toJsonValue } from '@/lib/prisma';
import { HttpError } from '@/lib/validation/server-helpers';
import type {
  PainInventoryDocument,
  PainPoint,
  Stage3AuthoringState,
} from '../stage3-opportunities/schema';
import {
  safeParseStage3AuthoringState,
  appendPainPoint,
  removePainPointById,
  replacePainPointById,
  appendStage3RecommendedAction,
} from '../stage3-opportunities/state';
import type { RecommendedAction } from '../stage1-outcome/schema';

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

export async function markStage3OutputReady(
  stageRunId: string,
  doc:        PainInventoryDocument,
): Promise<void> {
  const result = await prisma.ideationStageRun.updateMany({
    where: { id: stageRunId, status: 'authoring' },
    data:  { output: toJsonValue(doc), status: 'output_ready' },
  });
  if (result.count !== 1) {
    throw new HttpError(409, 'Stage 3 run is not in authoring state');
  }
}

export async function markStage3Committed(
  stageRunId: string,
  now:        Date = new Date(),
): Promise<void> {
  await prisma.ideationStageRun.updateMany({
    where: { id: stageRunId, status: 'output_ready' },
    data:  { status: 'committed', committedAt: now },
  });
}

// ---------------------------------------------------------------------------
// Authoring state writers
// ---------------------------------------------------------------------------

/**
 * Read-modify-write pattern for any function that mutates the
 * Stage 3 authoring state via a closure. Returns the next state
 * after the helper applied its transform. Uses updateMany with the
 * 'authoring' status filter as an optimistic lock.
 */
async function transformAuthoring(
  stageRunId: string,
  userId:     string,
  transform:  (s: Stage3AuthoringState) => Stage3AuthoringState,
): Promise<void> {
  const row = await prisma.ideationStageRun.findFirst({
    where:  { id: stageRunId, session: { userId }, status: 'authoring' },
    select: { output: true },
  });
  if (!row) throw new HttpError(409, 'Stage 3 run is not in authoring state');

  const current = safeParseStage3AuthoringState(row.output);
  const next    = transform(current);

  const result = await prisma.ideationStageRun.updateMany({
    where: { id: stageRunId, status: 'authoring' },
    data:  { output: toJsonValue(next) },
  });
  if (result.count !== 1) {
    throw new HttpError(409, 'Stage 3 row changed during transform');
  }
}

/**
 * Append a founder-sourced pain point (Human Scout layer). Idempotent
 * dedup by description is intentionally NOT enforced here — the
 * founder can choose to add the same pain twice if they want, and
 * the schema allows it.
 */
export async function persistFounderPainPoint(
  stageRunId: string,
  userId:     string,
  pp:         PainPoint,
): Promise<void> {
  await transformAuthoring(stageRunId, userId, s => appendPainPoint(s, pp));
}

/**
 * Replace a pain point's full record by id. Used by founder-pain-
 * point PATCH (description / context / notes edits).
 */
export async function persistReplacePainPoint(
  stageRunId: string,
  userId:     string,
  id:         string,
  next:       PainPoint,
): Promise<void> {
  await transformAuthoring(stageRunId, userId, s => replacePainPointById(s, id, next));
}

/**
 * Remove a pain point by id. Used by DELETE founder-pain-point AND
 * by the "reject this pain point" action.
 */
export async function persistRemovePainPoint(
  stageRunId: string,
  userId:     string,
  id:         string,
): Promise<void> {
  await transformAuthoring(stageRunId, userId, s => removePainPointById(s, id));
}

/**
 * Append a Stage 3 recommended action (the agent's homework
 * suggestions). FIFO eviction at MAX_RECOMMENDED_ACTIONS_STAGE3.
 */
export async function persistStage3RecommendedAction(
  stageRunId: string,
  userId:     string,
  action:     RecommendedAction,
): Promise<void> {
  await transformAuthoring(stageRunId, userId, s => appendStage3RecommendedAction(s, action));
}

/**
 * Write through a pushback-round result. The caller has already
 * validated the optimistic lock against priorVersion; this just
 * commits the mutated PainPoint into the state.
 */
export async function persistPainPointPushbackRound(
  stageRunId:    string,
  userId:        string,
  updatedPp:     PainPoint,
  priorVersion:  number,
): Promise<void> {
  await transformAuthoring(stageRunId, userId, (s) => {
    // Find the pain point in either bucket and check its current
    // version against priorVersion.
    const all = [...s.agentPainPoints, ...s.founderPainPoints];
    const current = all.find(p => p.id === updatedPp.id);
    if (!current) {
      throw new HttpError(404, 'Pain point not found');
    }
    if (current.scorePushbackVersion !== priorVersion) {
      throw new HttpError(409, 'Pain point pushback version mismatch');
    }
    return replacePainPointById(s, updatedPp.id, updatedPp);
  });
}

/**
 * Bulk-append agent-scouted pain points after a Pain Scout run.
 * Also increments scoutRunCount and merges the research log entries
 * from the run into the persisted researchLog.
 */
export async function persistPainScoutRunResult(
  stageRunId:    string,
  userId:        string,
  newPainPoints: PainPoint[],
  researchLogEntries: import('@/lib/research').ResearchLogEntry[],
): Promise<void> {
  await transformAuthoring(stageRunId, userId, (s) => ({
    ...s,
    agentPainPoints: [...s.agentPainPoints, ...newPainPoints],
    researchLog:     [...s.researchLog, ...researchLogEntries],
    scoutRunCount:   s.scoutRunCount + 1,
  }));
}
