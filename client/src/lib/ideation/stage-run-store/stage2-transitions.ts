// src/lib/ideation/stage-run-store/stage2-transitions.ts
//
// Stage-2-specific write paths. Each helper matches a single status
// transition or narrow in-place edit. Shared utilities (read paths,
// the authoring writer, the no_idea bootstrap helper) live in the
// folder's index.ts.
//
// Dual-write pattern: every helper that mutates the working
// skillInventory in IdeationStageRun.output ALSO writes the same
// inventory snapshot to FounderProfile.skillInventory in the same
// prisma.$transaction so the two cannot drift.

import 'server-only';
import prisma, { toJsonValue } from '@/lib/prisma';
import { HttpError } from '@/lib/validation/server-helpers';
import type {
  Stage2AuthoringState,
  RequirementsDocument,
  SkillInventory,
  ExpectedProfileEntry,
  StructuralBlocker,
} from '../stage2-requirements/schema';
import {
  safeParseStage2AuthoringState,
  applySkillUpdate,
  applyTeammateOp,
  type SkillUpdate,
  type TeammateOp,
} from '../stage2-requirements/state';
import { createEmptyStage3AuthoringState } from '../stage3-opportunities/state';
import type { ResearchLogEntry } from '@/lib/research';

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/**
 * Composer completion — flips Stage 2 status 'authoring' →
 * 'output_ready' with the composed RequirementsDocument in the
 * output column. Idempotent in the sense that a duplicate call
 * against an already-output-ready row will fail the where filter;
 * the caller decides whether that's a 409 or a benign re-render.
 */
export async function markStage2OutputReady(
  stageRunId: string,
  doc:        RequirementsDocument,
): Promise<void> {
  const result = await prisma.ideationStageRun.updateMany({
    where: { id: stageRunId, status: 'authoring', stageNumber: 2 },
    data:  { output: toJsonValue(doc), status: 'output_ready' },
  });
  if (result.count !== 1) {
    throw new HttpError(409, 'Stage 2 run is not in authoring state');
  }
}

/**
 * Commit — flips 'output_ready' to 'committed' and stamps committedAt,
 * THEN lazily creates the Stage 3 row in 'authoring' state if it
 * doesn't already exist. Both writes run inside the same transaction
 * so either both land or neither does.
 *
 * The brief specifies that at commit time, the founder's CURRENT
 * FounderProfile.skillInventory is copied into the artifact's
 * skillInventorySnapshot. We pass the snapshot in explicitly so the
 * caller can compose it with a freshly-read inventory (avoids a
 * stale read).
 *
 * Idempotency:
 *   - An already-committed Stage 2 row falls through both writes
 *     silently (the findUnique status filter rejects, and the upsert
 *     `update: {}` preserves any existing Stage 3 row).
 *   - Stage 3 upsert keyed on (sessionId, stageNumber=3) — no duplicate
 *     rows under concurrent commits.
 */
export async function markStage2Committed(
  stageRunId:       string,
  snapshotInventory: SkillInventory,
  now:              Date = new Date(),
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Read current output (must be RequirementsDocument shape),
    // overlay the snapshot, write back.
    const run = await tx.ideationStageRun.findUnique({
      where:  { id: stageRunId },
      select: { output: true, status: true, stageNumber: true, sessionId: true },
    });
    if (!run || run.stageNumber !== 2 || run.status !== 'output_ready') {
      return;
    }
    // Merge snapshot into the output document.
    const output = (run.output ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...output, skillInventorySnapshot: snapshotInventory };
    await tx.ideationStageRun.updateMany({
      where: { id: stageRunId, status: 'output_ready', stageNumber: 2 },
      data:  { status: 'committed', committedAt: now, output: toJsonValue(merged) },
    });

    // Lazy-create Stage 3 row. Idempotent via the unique constraint
    // on (sessionId, stageNumber). `update: {}` so we never overwrite
    // an existing Stage 3 row's authoring state.
    await tx.ideationStageRun.upsert({
      where:  { sessionId_stageNumber: { sessionId: run.sessionId, stageNumber: 3 } },
      create: {
        sessionId:   run.sessionId,
        stageNumber: 3,
        status:      'authoring',
        output:      toJsonValue(createEmptyStage3AuthoringState()),
        startedAt:   now,
      },
      update: {},
    });
  });
}

// ---------------------------------------------------------------------------
// Canvas narrow writes — dual-write into authoring state +
// FounderProfile.skillInventory in one transaction.
//
// These helpers throw 409 when the stage run isn't in 'authoring'
// status (e.g. a stale tab firing a write after the founder
// committed elsewhere). The route surfaces the 409 to the client so
// the UI can refresh.
// ---------------------------------------------------------------------------

async function loadAuthoringState(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  stageRunId: string,
  userId: string,
): Promise<Stage2AuthoringState> {
  const run = await tx.ideationStageRun.findFirst({
    where:  { id: stageRunId, status: 'authoring', stageNumber: 2, session: { userId } },
    select: { output: true },
  });
  if (!run) throw new HttpError(409, 'Stage 2 run is not in authoring state (or not owned)');
  return safeParseStage2AuthoringState(run.output);
}

async function persistAuthoringTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  stageRunId: string,
  state: Stage2AuthoringState,
): Promise<void> {
  const result = await tx.ideationStageRun.updateMany({
    where: { id: stageRunId, status: 'authoring', stageNumber: 2 },
    data:  { output: toJsonValue(state) },
  });
  if (result.count !== 1) throw new HttpError(409, 'Stage 2 run is no longer in authoring state');
}

async function syncFounderProfileTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  inventory: SkillInventory,
): Promise<void> {
  // Founder may not have a profile row yet (e.g. first cycle). We
  // intentionally don't bootstrap one here — the lifecycle flow
  // owns profile creation. Swallow the failure and continue so the
  // canvas state still persists into the IdeationStageRun.output.
  await tx.founderProfile.update({
    where: { userId },
    data:  { skillInventory: toJsonValue(inventory) },
  }).catch(() => undefined);
}

export async function updateSkillTier(
  stageRunId: string,
  userId:     string,
  update:     SkillUpdate,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const state = await loadAuthoringState(tx, stageRunId, userId);
    const nextInventory = applySkillUpdate(state.workingInventory, update);
    const nextState: Stage2AuthoringState = { ...state, workingInventory: nextInventory };
    await persistAuthoringTx(tx, stageRunId, nextState);
    await syncFounderProfileTx(tx, userId, nextInventory);
  });
}

export async function updateTeammate(
  stageRunId: string,
  userId:     string,
  op:         TeammateOp,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const state = await loadAuthoringState(tx, stageRunId, userId);
    const nextInventory = applyTeammateOp(state.workingInventory, op);
    const nextState: Stage2AuthoringState = { ...state, workingInventory: nextInventory };
    await persistAuthoringTx(tx, stageRunId, nextState);
    await syncFounderProfileTx(tx, userId, nextInventory);
  });
}

// ---------------------------------------------------------------------------
// Review-mode narrow writes
// ---------------------------------------------------------------------------

export async function setStructuralBlockerChoice(
  stageRunId: string,
  userId:     string,
  next:       StructuralBlocker,
): Promise<void> {
  // Allowed in 'authoring' OR 'output_ready' (founder updates their
  // choice on the review surface). Forbidden once committed —
  // committed artifacts are immutable.
  await prisma.$transaction(async (tx) => {
    const run = await tx.ideationStageRun.findFirst({
      where:  {
        id: stageRunId,
        stageNumber: 2,
        status: { in: ['authoring', 'output_ready'] },
        session: { userId },
      },
      select: { output: true, status: true },
    });
    if (!run) throw new HttpError(409, 'Stage 2 run is not in a mutable state (or not owned)');

    const output = (run.output ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...output, structuralBlocker: next };

    const result = await tx.ideationStageRun.updateMany({
      where: { id: stageRunId, stageNumber: 2, status: run.status },
      data:  { output: toJsonValue(merged) },
    });
    if (result.count !== 1) {
      throw new HttpError(409, 'Stage 2 run changed status during write');
    }
  });
}

/**
 * Write the freshly-derived Expected Profile + research log onto the
 * working authoring state. Called from the /derive-expected-profile
 * route after deriveExpectedProfile() returns.
 *
 * Clears requiresRederivation if it was set — the founder has just
 * re-derived against the current OutcomeDocument.
 */
export async function writeWorkingExpectedProfile(
  stageRunId: string,
  userId:     string,
  entries:    ExpectedProfileEntry[],
  researchLog: ResearchLogEntry[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const state = await loadAuthoringState(tx, stageRunId, userId);
    const nextState: Stage2AuthoringState = {
      ...state,
      workingExpectedProfile: entries,
      researchLog,
      requiresRederivation:   false,
    };
    await persistAuthoringTx(tx, stageRunId, nextState);
  });
}

/**
 * Write a single Expected Profile entry update — used by the pushback
 * round route after runExpectedProfilePushbackRound returns.
 * Optimistic lock: caller passes the priorVersion they read; if it
 * doesn't match the entry's current pushback.version, throws 409.
 */
export async function writeExpectedProfileEntry(
  stageRunId:   string,
  userId:       string,
  entryIndex:   number,
  updatedEntry: ExpectedProfileEntry,
  priorVersion: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const state = await loadAuthoringState(tx, stageRunId, userId);
    const profile = state.workingExpectedProfile;
    if (!profile || entryIndex < 0 || entryIndex >= profile.length) {
      throw new HttpError(404, 'Expected Profile entry not found');
    }
    const current = profile[entryIndex];
    const currentVersion = current.pushback?.version ?? 0;
    if (currentVersion !== priorVersion) {
      throw new HttpError(409, 'Expected Profile entry was modified concurrently');
    }
    const nextProfile = profile.slice();
    nextProfile[entryIndex] = updatedEntry;
    const nextState: Stage2AuthoringState = { ...state, workingExpectedProfile: nextProfile };
    await persistAuthoringTx(tx, stageRunId, nextState);
  });
}
