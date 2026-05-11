// src/lib/ideation/stage-run-store/index.ts
//
// Public barrel + shared persistence helpers for IdeationStageRun
// rows. The store is folder-shaped (rather than a single file) so each
// concern stays small and obvious:
//
//   - index.ts                — shared types, the canonical row
//                                projection, ownership-scoped read
//                                paths, the cross-stage-agnostic
//                                authoring-state writer, and the
//                                no_idea session bootstrap helper.
//   - stage1-transitions.ts   — Stage 1 commit / output-ready / edit /
//                                discard transitions.
//   - stage2-transitions.ts   — Stage 2 commit / output-ready / canvas
//                                narrow-write helpers (added by the
//                                Stage 2 batch).
//   - cross-stage-cascades.ts — Cascade helpers that span stages
//                                (Stage 1 edit ⇨ Stage 2 revert, etc.)
//                                — added by the Stage 2 batch.
//
// External callers should keep importing from `@/lib/ideation` (the
// top-level barrel) or directly from `@/lib/ideation/stage-run-store`
// (which Next.js / TS resolve to this index.ts). Never reach into a
// specific concern file from outside the folder.

import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import prisma, { toJsonValue } from '@/lib/prisma';
import { HttpError } from '@/lib/validation/server-helpers';
import { createEmptyStage1AuthoringState } from '../stage1-outcome/state';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type StageStatus = 'authoring' | 'output_ready' | 'committed';

/**
 * Minimal projection used by the turn handler and review-mode routes.
 * Never select the full row — callers always work against this shape.
 */
export const STAGE_RUN_SELECT = {
  id:          true,
  sessionId:   true,
  stageNumber: true,
  status:      true,
  output:      true,
  startedAt:   true,
  committedAt: true,
} satisfies Prisma.IdeationStageRunSelect;

export type StageRunRow = Prisma.IdeationStageRunGetPayload<{ select: typeof STAGE_RUN_SELECT }>;

export type TxClient = Prisma.TransactionClient | PrismaClient;

// ---------------------------------------------------------------------------
// Transactional bootstrap — called inside the session-create transaction
// ---------------------------------------------------------------------------

/**
 * Create the initial pair of stage runs for a new no_idea session:
 * stage 0 committed (mindset acknowledgement) + stage 1 authoring
 * (empty outcome state).
 *
 * Called inside the session-create transaction so the runs land or
 * neither does. The session-create route is responsible for the
 * caller-level scenario check; this helper is unconditional.
 */
export async function createInitialStageRunsForNoIdea(
  tx: TxClient,
  sessionId: string,
  now: Date = new Date(),
): Promise<void> {
  // Stage 0's `output` is left unset (defaults to NULL) — the row is
  // purely the "mindset acknowledged" marker, no payload. Stage 1
  // seeds an empty authoring state so the turn handler always sees
  // a parseable JSONB blob.
  await tx.ideationStageRun.createMany({
    data: [
      {
        sessionId,
        stageNumber: 0,
        status:      'committed',
        startedAt:   now,
        committedAt: now,
      },
      {
        sessionId,
        stageNumber: 1,
        status:      'authoring',
        output:      toJsonValue(createEmptyStage1AuthoringState()),
        startedAt:   now,
        committedAt: null,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Read paths
// ---------------------------------------------------------------------------

/**
 * Return the stage run that the founder is currently sitting on for a
 * given session.
 *
 * Algorithm: the highest stageNumber whose status is NOT 'committed',
 * OR if every stage is committed, the highest stageNumber overall. The
 * second case applies once Stages 2..5 exist; for a fully-committed
 * Stage 1 with no Stage 2 row yet this returns the Stage 1 row so the
 * UI can surface its review surface.
 *
 * Returns null when the session has no stage runs (i.e. it's not a
 * no_idea session — the turn handler treats this as a 500).
 */
export async function getActiveStageRun(sessionId: string): Promise<StageRunRow | null> {
  const runs = await prisma.ideationStageRun.findMany({
    where:   { sessionId },
    select:  STAGE_RUN_SELECT,
    orderBy: { stageNumber: 'desc' },
  });
  if (runs.length === 0) return null;

  const firstActive = runs.find(r => r.status !== 'committed');
  if (firstActive) return firstActive;

  // All committed — return the highest-numbered (already first in
  // the desc-ordered list).
  return runs[0];
}

/**
 * Owner-scoped fetch for the review-mode routes. Uses the session
 * relation filter so 404 and 401 are indistinguishable to the caller
 * (no existence leak).
 */
export async function requireOwnedStageRun(
  stageRunId: string,
  userId: string,
): Promise<StageRunRow> {
  const run = await prisma.ideationStageRun.findFirst({
    where:  { id: stageRunId, session: { userId } },
    select: STAGE_RUN_SELECT,
  });
  if (!run) throw new HttpError(404, 'Stage run not found');
  return run;
}

// ---------------------------------------------------------------------------
// Cross-stage write path
// ---------------------------------------------------------------------------

/**
 * Persist the latest authoring state during any-stage turn. Pure
 * overwrite — the caller has already merged extractions and any newly
 * appended recommendedActions into the in-memory state. Asserts the
 * row is currently 'authoring' so a race with an /edit or /commit
 * surfaces as a 409 rather than silently winning.
 *
 * Generic in TState so Stage 1 (Stage1AuthoringState) and Stage 2
 * (Stage2AuthoringState) both pass through without their own
 * single-purpose helpers. The body never reads TState's fields — it
 * just serialises to JSONB.
 */
export async function persistAuthoringState<TState>(
  stageRunId: string,
  state: TState,
): Promise<void> {
  const result = await prisma.ideationStageRun.updateMany({
    where: { id: stageRunId, status: 'authoring' },
    data:  { output: toJsonValue(state) },
  });
  if (result.count !== 1) {
    throw new HttpError(409, 'Stage run is no longer in authoring state');
  }
}

// ---------------------------------------------------------------------------
// Re-exports from concern shards
// ---------------------------------------------------------------------------

export {
  markStage1OutputReady,
  markStage1Committed,
  revertToEdit,
  restoreFromEditSnapshot,
} from './stage1-transitions';

export {
  markStage2OutputReady,
  markStage2Committed,
  updateSkillTier,
  updateTeammate,
  setStructuralBlockerChoice,
  writeWorkingExpectedProfile,
  writeExpectedProfileEntry,
} from './stage2-transitions';

export {
  cascadeStage1EditToStage2,
  restoreStage2FromCascadeSnapshot,
  clearStage2CascadeSnapshot,
} from './cross-stage-cascades';
