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
import type {
  Stage3AuthoringState,
  Stage3CascadeSnapshot,
} from '../stage3-opportunities/schema';
import {
  safeParseStage3AuthoringState,
  safeParsePainInventoryDocument,
} from '../stage3-opportunities/state';
import type {
  Stage4AuthoringState,
  Stage4CascadeSnapshot,
} from '../stage4-opportunities/schema';
import {
  safeParseStage4AuthoringState,
  safeParseOpportunityEvaluationsDocument,
} from '../stage4-opportunities/state';
import type {
  Stage5AuthoringState,
  Stage5CascadeSnapshot,
} from '../stage5-handoff/schema';
import {
  safeParseStage5AuthoringState,
  safeParseStage5HandoffDocument,
} from '../stage5-handoff/state';

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

  // Branch C — Stage 2 in normal authoring (no committed doc to
  // snapshot). Founder hasn't finalised Stage 2 yet, but their
  // in-flight inventory + expected profile (if any) were derived
  // against the now-stale Stage 1 outcome. Flip requiresRederivation
  // so the UI nudges them to re-run derivation when ready. Snapshot
  // is left alone (none exists; nothing to revert to).
  if (stage2.status === 'authoring') {
    const authoring = safeParseStage2AuthoringState(stage2.output);
    if (authoring.requiresRederivation) return; // already flagged — no-op
    await prisma.ideationStageRun.updateMany({
      where: { id: stage2.id, stageNumber: 2, status: 'authoring' },
      data:  { output: toJsonValue({ ...authoring, requiresRederivation: true }) },
    });
    return;
  }

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

// ===========================================================================
// Stage 3 cross-stage cascade — TWO upstream sources (Stage 1 + Stage 2)
//
// Three-rule state machine (see docs/stage3-handoff.md § 2.1):
//
//   /edit from Stage X (X ∈ {stage1, stage2})
//     If Stage 3 has no snapshot:
//       revert Stage 3 to authoring, snapshot prior document,
//       triggeringStages = [X], requiresRederivation = true
//     If Stage 3 already has a snapshot (cascade already in flight):
//       add X to triggeringStages, snapshot + status unchanged
//
//   /discard-edit from Stage X:
//     Remove X from triggeringStages
//     If list empties AND snapshot still exists → restore from
//       snapshot
//     If list empties AND snapshot is null (cleared by prior
//       commit) → no-op
//
//   /commit (recommit) from Stage X:
//     If Stage 3 snapshot exists and triggeringStages contains X:
//       NULL the entire snapshot AND clear triggeringStages.
//       requiresRederivation stays true — founder must re-derive.
//
// Test invariants pinned in cascade-stage3.test.ts.
// ===========================================================================

type TriggeringStage = 'stage1' | 'stage2';

async function findOwnedStage3Run(
  sessionId: string,
  userId:    string,
): Promise<{ id: string; status: string; output: unknown } | null> {
  return await prisma.ideationStageRun.findFirst({
    where:  { sessionId, stageNumber: 3, session: { userId } },
    select: { id: true, status: true, output: true },
  });
}

export async function cascadeStage1OrStage2EditToStage3(
  sessionId:        string,
  userId:           string,
  triggeringStage:  TriggeringStage,
): Promise<void> {
  const stage3 = await findOwnedStage3Run(sessionId, userId);
  if (!stage3) return;

  // Branch A — Stage 3 was committed/output_ready → revert + snapshot.
  if (stage3.status === 'output_ready' || stage3.status === 'committed') {
    const priorDocument = safeParsePainInventoryDocument(stage3.output);
    if (!priorDocument) return;

    const cascadeSnapshot: Stage3CascadeSnapshot = {
      document:         priorDocument,
      triggeringStages: [triggeringStage],
      snapshottedAt:    new Date().toISOString(),
    };

    const nextAuthoring: Stage3AuthoringState = {
      agentPainPoints:      [],
      founderPainPoints:    [],
      recommendedActions:   priorDocument.recommendedActions,
      researchLog:          priorDocument.researchLog,
      scoutRunCount:        0,
      cascadeSnapshot,
      requiresRederivation: true,
    };

    await prisma.ideationStageRun.updateMany({
      where: { id: stage3.id, stageNumber: 3, status: { in: ['output_ready', 'committed'] } },
      data:  {
        status:      'authoring',
        committedAt: null,
        output:      toJsonValue(nextAuthoring),
      },
    });
    return;
  }

  // Stage 3 in authoring. Two sub-branches:
  //   B — has a cascade snapshot (the other upstream already fired):
  //       append this stage to triggeringStages.
  //   C — normal authoring, no snapshot (founder is mid-Stage-3 after
  //       a fresh Stage 2 commit; pain scout work is in flight). Flag
  //       requiresRederivation=true so the UI surfaces the stale
  //       dependency — the founder's pain points + scoring were done
  //       against the now-stale upstream context.
  if (stage3.status === 'authoring') {
    const authoring = safeParseStage3AuthoringState(stage3.output);

    if (authoring.cascadeSnapshot) {
      // Branch B
      if (authoring.cascadeSnapshot.triggeringStages.includes(triggeringStage)) return;
      const nextAuthoring: Stage3AuthoringState = {
        ...authoring,
        cascadeSnapshot: {
          ...authoring.cascadeSnapshot,
          triggeringStages: [...authoring.cascadeSnapshot.triggeringStages, triggeringStage],
        },
        requiresRederivation: true,
      };
      await prisma.ideationStageRun.updateMany({
        where: { id: stage3.id, stageNumber: 3, status: 'authoring' },
        data:  { output: toJsonValue(nextAuthoring) },
      });
      return;
    }

    // Branch C
    if (authoring.requiresRederivation) return; // already flagged
    await prisma.ideationStageRun.updateMany({
      where: { id: stage3.id, stageNumber: 3, status: 'authoring' },
      data:  { output: toJsonValue({ ...authoring, requiresRederivation: true }) },
    });
  }
}

export async function restoreStage3FromCascadeSnapshot(
  sessionId:           string,
  userId:              string,
  dischargingStage:    TriggeringStage,
  now:                 Date = new Date(),
): Promise<void> {
  const stage3 = await findOwnedStage3Run(sessionId, userId);
  if (!stage3) return;
  if (stage3.status !== 'authoring') return;

  const authoring = safeParseStage3AuthoringState(stage3.output);
  if (!authoring.cascadeSnapshot) return;
  if (!authoring.cascadeSnapshot.triggeringStages.includes(dischargingStage)) return;

  const remaining = authoring.cascadeSnapshot.triggeringStages.filter(
    s => s !== dischargingStage,
  );

  if (remaining.length > 0) {
    // Other upstream stage still has its edit open — keep the snapshot
    // but remove this stage from the trigger list.
    const nextAuthoring: Stage3AuthoringState = {
      ...authoring,
      cascadeSnapshot: { ...authoring.cascadeSnapshot, triggeringStages: remaining },
    };
    await prisma.ideationStageRun.updateMany({
      where: { id: stage3.id, stageNumber: 3, status: 'authoring' },
      data:  { output: toJsonValue(nextAuthoring) },
    });
    return;
  }

  // All upstream stages have discharged → restore from snapshot.
  await prisma.ideationStageRun.updateMany({
    where: { id: stage3.id, stageNumber: 3, status: 'authoring' },
    data:  {
      status:      'output_ready',
      // committedAt was null on the snapshotted Stage 3 unless it
      // had been committed before the cascade. The snapshot itself
      // doesn't track whether it was 'output_ready' or 'committed'
      // before the cascade (Stage 3 doesn't surface that
      // distinction the way Stage 1's discard-edit does — Stage 3's
      // commit just records committedAt). On restore we always go
      // back to 'output_ready' and the founder re-clicks commit.
      // Acceptable simplification documented in handoff brief.
      committedAt: null,
      output:      toJsonValue(authoring.cascadeSnapshot.document),
    },
  });
  // The snapshot is now cleared as part of the status transition —
  // the row's output is the document, no more authoring envelope.
  void now;
}

export async function clearStage3CascadeSnapshot(
  sessionId:        string,
  userId:           string,
  triggeringStage:  TriggeringStage,
): Promise<void> {
  const stage3 = await findOwnedStage3Run(sessionId, userId);
  if (!stage3) return;
  if (stage3.status !== 'authoring') return;

  const authoring = safeParseStage3AuthoringState(stage3.output);
  if (!authoring.cascadeSnapshot) return;
  if (!authoring.cascadeSnapshot.triggeringStages.includes(triggeringStage)) return;

  // Per the locked three-rule design: ANY upstream /commit (recommit)
  // NULLs the entire snapshot and clears triggeringStages — the
  // founder must re-derive against the new upstream context. We do
  // NOT preserve the snapshot for the other upstream's eventual
  // discharge because the underlying document was derived against
  // stale upstream state.
  const nextAuthoring: Stage3AuthoringState = {
    ...authoring,
    cascadeSnapshot:      null,
    requiresRederivation: true,
  };

  await prisma.ideationStageRun.updateMany({
    where: { id: stage3.id, stageNumber: 3, status: 'authoring' },
    data:  { output: toJsonValue(nextAuthoring) },
  });
}

// ===========================================================================
// Stage 4 cascade — Stage 1, 2, OR 3 edit invalidates Stage 4
//
// Same three-rule state machine as Stage 3's cascade, scaled to three
// upstream triggers. Stage 4's cascade snapshot's triggeringStages[]
// can contain any subset of {stage1, stage2, stage3}; the restore
// only fires when all open triggers discharge.
//
// /commit on ANY upstream (recommit) NULLs the entire snapshot
// (regardless of which upstream is recommitting) and flips
// requiresRederivation=true — the downstream document was derived
// against now-stale upstream context, so the founder must re-derive
// Layer A research per-opportunity and re-collect Layer B engagement
// against the new frame.
// ===========================================================================

type Stage4TriggeringStage = 'stage1' | 'stage2' | 'stage3';

async function findOwnedStage4Run(
  sessionId: string,
  userId:    string,
): Promise<{ id: string; status: string; output: unknown } | null> {
  return await prisma.ideationStageRun.findFirst({
    where:  { sessionId, stageNumber: 4, session: { userId } },
    select: { id: true, status: true, output: true },
  });
}

export async function cascadeStage1Or2Or3EditToStage4(
  sessionId:        string,
  userId:           string,
  triggeringStage:  Stage4TriggeringStage,
): Promise<void> {
  const stage4 = await findOwnedStage4Run(sessionId, userId);
  if (!stage4) return;

  // Branch A — Stage 4 was committed/output_ready → revert + snapshot.
  if (stage4.status === 'output_ready' || stage4.status === 'committed') {
    const priorDocument = safeParseOpportunityEvaluationsDocument(stage4.output);
    if (!priorDocument) return;

    const cascadeSnapshot: Stage4CascadeSnapshot = {
      document:         priorDocument,
      triggeringStages: [triggeringStage],
      snapshottedAt:    new Date().toISOString(),
    };

    const nextAuthoring: Stage4AuthoringState = {
      opportunities:             priorDocument.evaluations,
      founderCommunityResponses: priorDocument.responsesSnapshot,
      recommendedActions:        priorDocument.recommendedActions,
      researchLog:               priorDocument.researchLog,
      cascadeSnapshot,
      requiresRederivation:      true,
    };

    await prisma.ideationStageRun.updateMany({
      where: { id: stage4.id, stageNumber: 4, status: { in: ['output_ready', 'committed'] } },
      data:  {
        status:      'authoring',
        committedAt: null,
        output:      toJsonValue(nextAuthoring),
      },
    });
    return;
  }

  // Stage 4 in authoring. Two sub-branches:
  //   B — has a cascade snapshot: append this stage to triggeringStages.
  //   C — normal authoring, no snapshot (founder is mid-Stage-4 after
  //       a fresh Stage 3 commit; Layer A research / Layer B
  //       engagement is in flight). Flag requiresRederivation=true so
  //       the UI surfaces the stale dependency — per-opportunity Layer
  //       A research was derived against the now-stale upstream
  //       context.
  if (stage4.status === 'authoring') {
    const authoring = safeParseStage4AuthoringState(stage4.output);

    if (authoring.cascadeSnapshot) {
      // Branch B
      if (authoring.cascadeSnapshot.triggeringStages.includes(triggeringStage)) return;
      const nextAuthoring: Stage4AuthoringState = {
        ...authoring,
        cascadeSnapshot: {
          ...authoring.cascadeSnapshot,
          triggeringStages: [...authoring.cascadeSnapshot.triggeringStages, triggeringStage],
        },
        requiresRederivation: true,
      };
      await prisma.ideationStageRun.updateMany({
        where: { id: stage4.id, stageNumber: 4, status: 'authoring' },
        data:  { output: toJsonValue(nextAuthoring) },
      });
      return;
    }

    // Branch C
    if (authoring.requiresRederivation) return; // already flagged
    await prisma.ideationStageRun.updateMany({
      where: { id: stage4.id, stageNumber: 4, status: 'authoring' },
      data:  { output: toJsonValue({ ...authoring, requiresRederivation: true }) },
    });
  }
}

export async function restoreStage4FromCascadeSnapshot(
  sessionId:        string,
  userId:           string,
  dischargingStage: Stage4TriggeringStage,
): Promise<void> {
  const stage4 = await findOwnedStage4Run(sessionId, userId);
  if (!stage4) return;
  if (stage4.status !== 'authoring') return;

  const authoring = safeParseStage4AuthoringState(stage4.output);
  if (!authoring.cascadeSnapshot) return;
  if (!authoring.cascadeSnapshot.triggeringStages.includes(dischargingStage)) return;

  const remaining = authoring.cascadeSnapshot.triggeringStages.filter(s => s !== dischargingStage);

  if (remaining.length > 0) {
    // Other upstream(s) still have edits open — keep the snapshot,
    // remove this stage from the trigger list.
    const nextAuthoring: Stage4AuthoringState = {
      ...authoring,
      cascadeSnapshot: { ...authoring.cascadeSnapshot, triggeringStages: remaining },
    };
    await prisma.ideationStageRun.updateMany({
      where: { id: stage4.id, stageNumber: 4, status: 'authoring' },
      data:  { output: toJsonValue(nextAuthoring) },
    });
    return;
  }

  // All upstreams discharged — restore the snapshot document.
  await prisma.ideationStageRun.updateMany({
    where: { id: stage4.id, stageNumber: 4, status: 'authoring' },
    data:  {
      status:      'output_ready',
      committedAt: null,
      output:      toJsonValue(authoring.cascadeSnapshot.document),
    },
  });
}

export async function clearStage4CascadeSnapshot(
  sessionId:        string,
  userId:           string,
  triggeringStage:  Stage4TriggeringStage,
): Promise<void> {
  const stage4 = await findOwnedStage4Run(sessionId, userId);
  if (!stage4) return;
  if (stage4.status !== 'authoring') return;

  const authoring = safeParseStage4AuthoringState(stage4.output);
  if (!authoring.cascadeSnapshot) return;
  if (!authoring.cascadeSnapshot.triggeringStages.includes(triggeringStage)) return;

  // Per the locked three-rule design — ANY upstream /commit NULLs the
  // entire snapshot. The downstream document was derived against
  // stale upstream context; the founder must re-derive.
  const nextAuthoring: Stage4AuthoringState = {
    ...authoring,
    cascadeSnapshot:      null,
    requiresRederivation: true,
  };

  await prisma.ideationStageRun.updateMany({
    where: { id: stage4.id, stageNumber: 4, status: 'authoring' },
    data:  { output: toJsonValue(nextAuthoring) },
  });
}

// ===========================================================================
// Stage 5 cascade — Stage 1, 2, 3, OR 4 edit invalidates Stage 5
//
// Same three-rule state machine as Stage 4's cascade, scaled to four
// upstream triggers. Stage 5 is unusual because:
//   - status='output_ready' carries a Stage5HandoffDocument (the
//     finalised handoff with a synthesizedRecommendationId)
//   - status='authoring' carries a Stage5AuthoringState (synthesis lifecycle:
//     awaiting_synthesis | synthesizing | synthesized | synthesis_failed)
//   - there is NO 'committed' status — Stage 5 lifts to 'output_ready'
//     and the legacy /accept route on the Recommendation row owns the
//     real commit. So the cascade only ever reverts 'output_ready' →
//     'authoring' (Branch A), or flips authoring-state requiresRederivation
//     (Branches B/C).
//
// The Recommendation row itself is NOT mutated by the cascade. Re-firing
// /stage5/synthesize after a cascade upserts the existing
// (sessionId, parentRecommendationId IS NULL) row in place; the founder
// can never end up with two competing rows for the same session. The
// stale Recommendation stays in the DB but the Stage 5 row's
// status='authoring' gates the review UI from surfacing it.
// ===========================================================================

type Stage5TriggeringStage = 'stage1' | 'stage2' | 'stage3' | 'stage4';

async function findOwnedStage5Run(
  sessionId: string,
  userId:    string,
): Promise<{ id: string; status: string; output: unknown } | null> {
  return await prisma.ideationStageRun.findFirst({
    where:  { sessionId, stageNumber: 5, session: { userId } },
    select: { id: true, status: true, output: true },
  });
}

export async function cascadeStage1Or2Or3Or4EditToStage5(
  sessionId:        string,
  userId:           string,
  triggeringStage:  Stage5TriggeringStage,
): Promise<void> {
  const stage5 = await findOwnedStage5Run(sessionId, userId);
  if (!stage5) return;

  // Branch A — Stage 5 was output_ready → revert + snapshot. Stage 5
  // doesn't have a 'committed' status, so this branch is output_ready-only.
  if (stage5.status === 'output_ready') {
    const priorDocument = safeParseStage5HandoffDocument(stage5.output);
    if (!priorDocument) return;

    const cascadeSnapshot: Stage5CascadeSnapshot = {
      document:         priorDocument,
      triggeringStages: [triggeringStage],
      snapshottedAt:    new Date().toISOString(),
    };

    // Preserve the synthesizedRecommendationId on the authoring state
    // so the canvas can surface "previously synthesized" context. The
    // status is reset to 'awaiting_synthesis' so the founder must
    // re-fire /stage5/synthesize before the review surface unlocks.
    const nextAuthoring: Stage5AuthoringState = {
      chosenOpportunity:           priorDocument.chosenOpportunity,
      reserveOpportunities:        priorDocument.reserveOpportunities,
      synthesizedRecommendationId: priorDocument.synthesizedRecommendationId,
      synthesisStatus:             'awaiting_synthesis',
      synthesisError:              null,
      recommendedActions:          priorDocument.recommendedActions,
      cascadeSnapshot,
      requiresRederivation:        true,
    };

    await prisma.ideationStageRun.updateMany({
      where: { id: stage5.id, stageNumber: 5, status: 'output_ready' },
      data:  {
        status: 'authoring',
        output: toJsonValue(nextAuthoring),
      },
    });
    return;
  }

  // Stage 5 in authoring. Two sub-branches:
  //   B — has a cascade snapshot: append this stage to triggeringStages.
  //   C — normal authoring, no snapshot (founder is mid-Stage-5 or
  //       has not yet fired synthesis). Flag requiresRederivation=true
  //       so the canvas surfaces the stale upstream dependency.
  if (stage5.status === 'authoring') {
    const authoring = safeParseStage5AuthoringState(stage5.output);

    if (authoring.cascadeSnapshot) {
      // Branch B
      if (authoring.cascadeSnapshot.triggeringStages.includes(triggeringStage)) return;
      const nextAuthoring: Stage5AuthoringState = {
        ...authoring,
        cascadeSnapshot: {
          ...authoring.cascadeSnapshot,
          triggeringStages: [...authoring.cascadeSnapshot.triggeringStages, triggeringStage],
        },
        requiresRederivation: true,
      };
      await prisma.ideationStageRun.updateMany({
        where: { id: stage5.id, stageNumber: 5, status: 'authoring' },
        data:  { output: toJsonValue(nextAuthoring) },
      });
      return;
    }

    // Branch C
    if (authoring.requiresRederivation) return; // already flagged
    await prisma.ideationStageRun.updateMany({
      where: { id: stage5.id, stageNumber: 5, status: 'authoring' },
      data:  { output: toJsonValue({ ...authoring, requiresRederivation: true }) },
    });
  }
}

export async function restoreStage5FromCascadeSnapshot(
  sessionId:        string,
  userId:           string,
  dischargingStage: Stage5TriggeringStage,
): Promise<void> {
  const stage5 = await findOwnedStage5Run(sessionId, userId);
  if (!stage5) return;
  if (stage5.status !== 'authoring') return;

  const authoring = safeParseStage5AuthoringState(stage5.output);
  if (!authoring.cascadeSnapshot) return;
  if (!authoring.cascadeSnapshot.triggeringStages.includes(dischargingStage)) return;

  const remaining = authoring.cascadeSnapshot.triggeringStages.filter(s => s !== dischargingStage);

  if (remaining.length > 0) {
    // Other upstream(s) still have edits open — keep the snapshot,
    // remove this stage from the trigger list.
    const nextAuthoring: Stage5AuthoringState = {
      ...authoring,
      cascadeSnapshot: { ...authoring.cascadeSnapshot, triggeringStages: remaining },
    };
    await prisma.ideationStageRun.updateMany({
      where: { id: stage5.id, stageNumber: 5, status: 'authoring' },
      data:  { output: toJsonValue(nextAuthoring) },
    });
    return;
  }

  // All upstreams discharged — restore the snapshot document. Stage 5
  // has no 'committed' status; the restore always lands on 'output_ready'.
  await prisma.ideationStageRun.updateMany({
    where: { id: stage5.id, stageNumber: 5, status: 'authoring' },
    data:  {
      status: 'output_ready',
      output: toJsonValue(authoring.cascadeSnapshot.document),
    },
  });
}

export async function clearStage5CascadeSnapshot(
  sessionId:        string,
  userId:           string,
  triggeringStage:  Stage5TriggeringStage,
): Promise<void> {
  const stage5 = await findOwnedStage5Run(sessionId, userId);
  if (!stage5) return;
  if (stage5.status !== 'authoring') return;

  const authoring = safeParseStage5AuthoringState(stage5.output);
  if (!authoring.cascadeSnapshot) return;
  if (!authoring.cascadeSnapshot.triggeringStages.includes(triggeringStage)) return;

  // Per the locked three-rule design — ANY upstream /commit NULLs the
  // entire snapshot. The synthesized Recommendation was produced from
  // now-stale upstream context; the founder must re-synthesise.
  const nextAuthoring: Stage5AuthoringState = {
    ...authoring,
    cascadeSnapshot:      null,
    requiresRederivation: true,
  };

  await prisma.ideationStageRun.updateMany({
    where: { id: stage5.id, stageNumber: 5, status: 'authoring' },
    data:  { output: toJsonValue(nextAuthoring) },
  });
}
