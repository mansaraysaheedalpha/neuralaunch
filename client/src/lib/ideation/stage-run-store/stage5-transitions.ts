// src/lib/ideation/stage-run-store/stage5-transitions.ts
//
// Stage 5 write paths for IdeationStageRun. Symmetrical with the
// stage1-4 transition files but the surface is smaller — Stage 5 only
// has an output_ready flip (the synthesis worker writes the handoff
// document) and the per-state authoring writes for the chosen +
// reserve snapshots / recommendedActions, which already flow through
// the generic `persistAuthoringState` helper in `index.ts`.
//
// No `markStage5Committed` here — Stage 5 is the LAST stage in the No
// Idea ladder, so there's no Stage 6 to lazy-create. When the founder
// accepts the synthesized Recommendation via the legacy /accept
// surface, that's the commit; the IdeationStageRun row stays at
// 'output_ready' by design (the Recommendation row itself is the
// commit substrate downstream).

import 'server-only';
import { Prisma } from '@prisma/client';
import prisma, { toJsonValue } from '@/lib/prisma';
import { HttpError } from '@/lib/validation/server-helpers';
import type {
  Stage5AuthoringState,
  Stage5HandoffDocument,
} from '../stage5-handoff/schema';
import {
  safeParseStage5AuthoringState,
  applySynthesisResult,
  applySynthesisFailure,
  seedStage5Authoring,
} from '../stage5-handoff/state';
import type {
  ChosenOpportunitySnapshot,
  ReserveOpportunity,
} from '../stage5-handoff/schema';

// ---------------------------------------------------------------------------
// Status transition — composer completion
// ---------------------------------------------------------------------------

/**
 * Composer completion — Stage 5 'authoring' → 'output_ready' with the
 * composed Stage5HandoffDocument in the output column. Idempotent at
 * the database level: a duplicate call against an already-output-ready
 * row fails the where filter and surfaces as a 409, which the caller
 * decides whether to treat as a no-op or surface to the founder.
 */
export async function markStage5OutputReady(
  stageRunId: string,
  doc:        Stage5HandoffDocument,
): Promise<void> {
  const result = await prisma.ideationStageRun.updateMany({
    where: { id: stageRunId, status: 'authoring', stageNumber: 5 },
    data:  { output: toJsonValue(doc), status: 'output_ready' },
  });
  if (result.count !== 1) {
    throw new HttpError(409, 'Stage 5 run is not in authoring state');
  }
}

// ---------------------------------------------------------------------------
// Synthesis result writers — used by the synthesis worker to record
// the Recommendation row id (or a synthesis failure) onto Stage 5
// authoring state. Wrapped in Serializable so concurrent writes from
// the worker (synthesizing) and the founder's canvas (typing a message
// during synthesis) surface as P2034 rather than silently overwriting.
// ---------------------------------------------------------------------------

async function transformAuthoring(
  stageRunId: string,
  transform:  (s: Stage5AuthoringState) => Stage5AuthoringState,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.ideationStageRun.findFirst({
        where:  { id: stageRunId, status: 'authoring', stageNumber: 5 },
        select: { output: true },
      });
      if (!row) throw new HttpError(409, 'Stage 5 run is not in authoring state');

      const current = safeParseStage5AuthoringState(row.output);
      const next    = transform(current);

      const result = await tx.ideationStageRun.updateMany({
        where: { id: stageRunId, status: 'authoring', stageNumber: 5 },
        data:  { output: toJsonValue(next) },
      });
      if (result.count !== 1) {
        throw new HttpError(409, 'Stage 5 row changed during transform');
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      throw new HttpError(409, 'Concurrent write detected — please retry.');
    }
    throw err;
  }
}

/**
 * Seed the chosen + reserve snapshots onto Stage 5 authoring. Called
 * by the synthesis worker's `loading_inputs` phase if the founder
 * triggered synthesis without having seeded yet (defensive — the
 * Stage 5 turn handler's compose path normally seeds first). Idempotent
 * — calling twice with the same chosen overwrites identically.
 */
export async function seedStage5Inputs(
  stageRunId: string,
  chosen:     ChosenOpportunitySnapshot,
  reserves:   ReserveOpportunity[],
): Promise<void> {
  await transformAuthoring(stageRunId, (s) => seedStage5Authoring(s, chosen, reserves));
}

/**
 * Worker write: synthesis succeeded, Recommendation row id is recorded
 * on authoring state. Subsequent compose call lifts the state into a
 * Stage5HandoffDocument.
 */
export async function persistStage5SynthesisResult(
  stageRunId:       string,
  recommendationId: string,
): Promise<void> {
  await transformAuthoring(stageRunId, (s) => applySynthesisResult(s, recommendationId));
}

/**
 * Worker write: synthesis failed. Caller supplies a short reason
 * string the founder UI surfaces; the canvas's "Retry synthesis" CTA
 * re-fires the route.
 */
export async function persistStage5SynthesisFailure(
  stageRunId: string,
  reason:     string,
): Promise<void> {
  await transformAuthoring(stageRunId, (s) => applySynthesisFailure(s, reason));
}
