// src/lib/ideation/stage-run-store.ts
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import prisma, { toJsonValue } from '@/lib/prisma';
import { HttpError } from '@/lib/validation/server-helpers';
import {
  type Stage1AuthoringState,
  type OutcomeDocument,
  type PriorCommittedSnapshot,
} from './stage1-outcome/schema';
import {
  createEmptyStage1AuthoringState,
} from './stage1-outcome/state';

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

type StageRunRow = Prisma.IdeationStageRunGetPayload<{ select: typeof STAGE_RUN_SELECT }>;

// ---------------------------------------------------------------------------
// Transactional creation — called inside the session-create transaction
// ---------------------------------------------------------------------------

type TxClient = Prisma.TransactionClient | PrismaClient;

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
 * second case applies once Stages 2..5 exist; today it just means "Stage
 * 1 already committed" which routes the founder to the Stage 2
 * placeholder.
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
// Stage 1 write paths
// ---------------------------------------------------------------------------

/**
 * Persist the latest authoring state during a Stage 1 turn. Pure
 * overwrite — the caller has already merged extractions and any newly
 * appended recommendedActions into the in-memory state. Asserts the
 * row is currently 'authoring' so a race with an /edit or /commit
 * surfaces as a 409 rather than silently winning.
 */
export async function persistAuthoringState(
  stageRunId: string,
  state: Stage1AuthoringState,
): Promise<void> {
  const result = await prisma.ideationStageRun.updateMany({
    where: { id: stageRunId, status: 'authoring' },
    data:  { output: toJsonValue(state) },
  });
  if (result.count !== 1) {
    throw new HttpError(409, 'Stage run is no longer in authoring state');
  }
}

/**
 * Composer completion — flips status from 'authoring' to 'output_ready'
 * with the composed OutcomeDocument in the output column. Idempotent in
 * the sense that a duplicate call against an already-output-ready row
 * will fail the where filter; the caller decides whether that's a 409
 * or a benign re-render.
 */
export async function markStage1OutputReady(
  stageRunId: string,
  doc: OutcomeDocument,
): Promise<void> {
  const result = await prisma.ideationStageRun.updateMany({
    where: { id: stageRunId, status: 'authoring' },
    data:  { output: toJsonValue(doc), status: 'output_ready' },
  });
  if (result.count !== 1) {
    throw new HttpError(409, 'Stage run is not in authoring state');
  }
}

/**
 * Commit — flips 'output_ready' to 'committed' and stamps committedAt.
 * Idempotent: an already-committed row passes through silently so the
 * client's commit button is safe to double-tap.
 *
 * TODO: when stages 2+ exist, editing a previously committed prior
 * stage must cascade-invalidate downstream stages. Moot today; revisit
 * when Stage 2 lands.
 */
export async function markStage1Committed(
  stageRunId: string,
  now: Date = new Date(),
): Promise<void> {
  await prisma.ideationStageRun.updateMany({
    where: { id: stageRunId, status: 'output_ready' },
    data:  { status: 'committed', committedAt: now },
  });
}

/**
 * Edit flow — revert 'committed' or 'output_ready' to 'authoring',
 * snapshot the prior document, and record which dimension the founder
 * is editing.
 *
 * The snapshot lives on the new authoring payload so a "discard edit"
 * can restore it; the snapshot itself preserves the prior status so
 * discard knows whether to restore to 'committed' (clear committedAt
 * NO — keep it) or 'output_ready' (clear committedAt).
 *
 * TODO: cascade-invalidation of downstream stages once they exist.
 */
export async function revertToEdit(
  stageRunId: string,
  userId: string,
  editTarget: 'timeHorizon' | 'financialGoal' | 'riskTolerance' | 'lifestylePreference',
  priorDocument: OutcomeDocument,
  priorStatus: 'output_ready' | 'committed',
): Promise<void> {
  // Build the new authoring state from the prior document so the
  // founder doesn't lose accumulated dimension state — only the
  // dimension being edited will be reprobed.
  const snapshot: PriorCommittedSnapshot = { document: priorDocument, priorStatus };
  const nextAuthoring: Stage1AuthoringState = {
    dimensions:                       priorDocument.dimensions,
    recommendedActions:               priorDocument.recommendedActions,
    questionsSinceLastConfidenceGain: 0,
    editTargetDimension:              editTarget,
    priorCommittedSnapshot:           snapshot,
  };

  const result = await prisma.ideationStageRun.updateMany({
    where: {
      id:        stageRunId,
      status:    { in: ['output_ready', 'committed'] },
      session:   { userId },
    },
    data:  {
      status:      'authoring',
      committedAt: null,
      output:      toJsonValue(nextAuthoring),
    },
  });
  if (result.count !== 1) {
    throw new HttpError(409, 'Stage run is not in a finalised state and cannot be edited');
  }
}

/**
 * Discard-edit — restore the snapshot taken at edit start. Flips
 * status back to whatever it was before the edit (output_ready or
 * committed), rewrites the output column with the snapshot document,
 * and re-stamps committedAt only if the prior status was 'committed'.
 */
export async function restoreFromEditSnapshot(
  stageRunId: string,
  userId: string,
  snapshot: PriorCommittedSnapshot,
  now: Date = new Date(),
): Promise<void> {
  const restoreCommittedAt = snapshot.priorStatus === 'committed' ? now : null;
  const result = await prisma.ideationStageRun.updateMany({
    where: {
      id:      stageRunId,
      status:  'authoring',
      session: { userId },
    },
    data:  {
      status:      snapshot.priorStatus,
      output:      toJsonValue(snapshot.document),
      committedAt: restoreCommittedAt,
    },
  });
  if (result.count !== 1) {
    throw new HttpError(409, 'Stage run is not in editing state');
  }
}
