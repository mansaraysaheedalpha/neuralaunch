// src/lib/ideation/stage-run-store/stage1-transitions.ts
//
// Stage-1-specific write paths for IdeationStageRun. Each helper
// matches a single status transition or revert. Shared utilities
// (read paths, the authoring writer, the no_idea bootstrap helper)
// live in the folder's index.ts.

import 'server-only';
import prisma, { toJsonValue } from '@/lib/prisma';
import { HttpError } from '@/lib/validation/server-helpers';
import type {
  Stage1AuthoringState,
  OutcomeDocument,
  PriorCommittedSnapshot,
} from '../stage1-outcome/schema';

/**
 * Composer completion — flips status from 'authoring' to 'output_ready'
 * with the composed OutcomeDocument in the output column. Idempotent
 * in the sense that a duplicate call against an already-output-ready
 * row will fail the where filter; the caller decides whether that's
 * a 409 or a benign re-render.
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
 * Cross-stage cascade: when a previously-committed Stage 1 is RE-
 * committed (i.e. founder edited then recommitted), any Stage 2 row
 * that holds a cascade snapshot must have that snapshot cleared —
 * the snapshot was derived against the now-stale outcome and a later
 * /discard-edit on a separate row could otherwise resurrect inconsistent
 * state. That clearing happens in the /commit route, not here, so this
 * helper stays focused on the row-level transition.
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
 * discard knows whether to restore to 'committed' or 'output_ready'.
 *
 * Cross-stage cascade: when Stage 1 reverts via this helper, any
 * committed-or-output-ready Stage 2 row for the same session also
 * cascades to 'authoring'. That cascade fires in the /edit route
 * (not here), so this helper stays focused on the row-level transition.
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
 *
 * Cross-stage cascade: when Stage 1 restores via this helper, any
 * Stage 2 row that was cascade-reverted by the matching /edit can
 * restore its own snapshot. That fires in the /discard-edit route
 * (not here).
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
