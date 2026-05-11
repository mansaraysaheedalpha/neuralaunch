// src/lib/ideation/stage-run-store/cross-stage-cascades.ts
//
// Cascade helpers that span stages. These are inherently cross-stage
// — they're called from Stage 1's /edit, /discard-edit, and /commit
// routes but they affect Stage 2's row.
//
// Cascade contract (locked in plan review):
//
//   Stage 1 action                Stage 2 effect (when output_ready/committed before)
//   ───────────────               ─────────────────────────────────────────────
//   /edit                       → revert to authoring + cascadeSnapshot
//                                 + requiresRederivation flag
//   /discard-edit               → restore from cascadeSnapshot
//   /commit (recommit after edit) → cascadeSnapshot cleared; Stage 2 stays
//                                   in requiresRederivation authoring

import 'server-only';
import prisma, { toJsonValue } from '@/lib/prisma';
import type {
  Stage2AuthoringState,
  Stage2CascadeSnapshot,
} from '../stage2-requirements/schema';
import {
  safeParseStage2AuthoringState,
  safeParseRequirementsDocument,
} from '../stage2-requirements/state';

// ---------------------------------------------------------------------------
// Helper — find the session's Stage 2 row (if any). Owner-scoped.
// ---------------------------------------------------------------------------

async function findOwnedStage2Run(
  sessionId: string,
  userId:    string,
): Promise<{ id: string; status: string; output: unknown } | null> {
  return await prisma.ideationStageRun.findFirst({
    where:  { sessionId, stageNumber: 2, session: { userId } },
    select: { id: true, status: true, output: true },
  });
}

// ---------------------------------------------------------------------------
// cascadeStage1EditToStage2
//
// Called from /api/ideation/stage-runs/[id]/edit AFTER Stage 1's
// revertToEdit succeeds. Idempotent — no-op if Stage 2 doesn't exist
// or is already in 'authoring'.
// ---------------------------------------------------------------------------

export async function cascadeStage1EditToStage2(
  sessionId: string,
  userId:    string,
): Promise<void> {
  const stage2 = await findOwnedStage2Run(sessionId, userId);
  if (!stage2) return;
  if (stage2.status !== 'output_ready' && stage2.status !== 'committed') return;

  const priorDocument = safeParseRequirementsDocument(stage2.output);
  if (!priorDocument) {
    // Output column couldn't parse — drop the cascade silently rather
    // than overwriting a corrupt-but-finalised row. The Stage 2
    // surface will surface the parse failure to the founder on next
    // load.
    return;
  }

  const cascadeSnapshot: Stage2CascadeSnapshot = {
    document:    priorDocument,
    priorStatus: stage2.status as 'output_ready' | 'committed',
  };

  // Build a new authoring state from the prior document — preserve
  // inventory, recommended actions, expected profile (founder may
  // still want it; requiresRederivation tells the UI it's stale),
  // structural blocker, research log. The founder doesn't lose
  // accumulated state.
  const nextAuthoring: Stage2AuthoringState = {
    workingInventory:                priorDocument.skillInventorySnapshot,
    workingExpectedProfile:          priorDocument.expectedProfile,
    recommendedActions:              priorDocument.recommendedActions,
    teamQuestionAsked:               true, // already answered during the prior attempt
    requiresRederivation:            true, // Stage 1 changed; flag the surface
    cascadeSnapshot,
    calibrationTurnsSinceLastUpdate: 0,
    structuralBlocker:               priorDocument.structuralBlocker,
    researchLog:                     priorDocument.researchLog,
  };

  await prisma.ideationStageRun.updateMany({
    where: {
      id:          stage2.id,
      stageNumber: 2,
      status:      { in: ['output_ready', 'committed'] },
    },
    data:  {
      status:      'authoring',
      committedAt: null,
      output:      toJsonValue(nextAuthoring),
    },
  });
}

// ---------------------------------------------------------------------------
// restoreStage2FromCascadeSnapshot
//
// Called from /api/ideation/stage-runs/[id]/discard-edit AFTER
// Stage 1's restoreFromEditSnapshot succeeds. Restores Stage 2 from
// its cascadeSnapshot. Idempotent.
// ---------------------------------------------------------------------------

export async function restoreStage2FromCascadeSnapshot(
  sessionId: string,
  userId:    string,
  now:       Date = new Date(),
): Promise<void> {
  const stage2 = await findOwnedStage2Run(sessionId, userId);
  if (!stage2) return;
  if (stage2.status !== 'authoring') return;

  const authoring = safeParseStage2AuthoringState(stage2.output);
  if (!authoring.cascadeSnapshot) return;

  const snap = authoring.cascadeSnapshot;
  const restoreCommittedAt = snap.priorStatus === 'committed' ? now : null;

  await prisma.ideationStageRun.updateMany({
    where: { id: stage2.id, stageNumber: 2, status: 'authoring' },
    data:  {
      status:      snap.priorStatus,
      output:      toJsonValue(snap.document),
      committedAt: restoreCommittedAt,
    },
  });
}

// ---------------------------------------------------------------------------
// clearStage2CascadeSnapshot
//
// Called from /api/ideation/stage-runs/[id]/commit AFTER Stage 1
// recommits. The snapshot's document was derived against the now-
// stale OutcomeDocument — a later /discard-edit (on a different row
// or via some edge case) must not be able to resurrect inconsistent
// state. Idempotent.
//
// Test invariant: after Stage 1 edit → Stage 1 recommit, the Stage 2
// row's cascadeSnapshot must be null. A subsequent /discard-edit
// cannot restore stale Stage 2 state.
// ---------------------------------------------------------------------------

export async function clearStage2CascadeSnapshot(
  sessionId: string,
  userId:    string,
): Promise<void> {
  const stage2 = await findOwnedStage2Run(sessionId, userId);
  if (!stage2) return;
  if (stage2.status !== 'authoring') return;

  const authoring = safeParseStage2AuthoringState(stage2.output);
  if (!authoring.cascadeSnapshot) return;

  const nextAuthoring: Stage2AuthoringState = { ...authoring, cascadeSnapshot: null };

  await prisma.ideationStageRun.updateMany({
    where: { id: stage2.id, stageNumber: 2, status: 'authoring' },
    data:  { output: toJsonValue(nextAuthoring) },
  });
}
