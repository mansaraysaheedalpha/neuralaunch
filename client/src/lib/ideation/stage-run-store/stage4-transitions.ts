// src/lib/ideation/stage-run-store/stage4-transitions.ts
//
// Stage 4 write paths for IdeationStageRun. Same shape conventions
// as stage3-transitions.ts: read-modify-write inside a status-filter
// optimistic lock; idempotent on already-committed rows.
//
// Scope for this commit (#3 of Stage 4 batch):
//   - persistLayerAResearch — derive-opportunity-research route
//   - persistLayerBScript   — generate-engagement-script route
//
// Coming in commit #4: persistCommunityResponse,
// persistOpportunityVerdict (founder), persistOpportunityPushbackRound.
// Coming in commit #5: markStage4OutputReady, markStage4Committed
// (the latter lazily upserts the Stage 5 row, mirroring c1c493e).

import 'server-only';
import prisma, { toJsonValue } from '@/lib/prisma';
import { HttpError } from '@/lib/validation/server-helpers';
import type {
  Stage4AuthoringState,
  LayerAResearch,
  LayerBScript,
} from '../stage4-opportunities/schema';
import {
  safeParseStage4AuthoringState,
  replaceOpportunityById,
} from '../stage4-opportunities/state';
import { clampOpportunity } from '../stage4-opportunities/clamps';
import type { ResearchLogEntry } from '@/lib/research';

// ---------------------------------------------------------------------------
// Read-modify-write — generic Stage 4 transform under the 'authoring'
// optimistic lock. Mirrors stage3-transitions' transformAuthoring.
// ---------------------------------------------------------------------------

async function transformAuthoring(
  stageRunId: string,
  userId:     string,
  transform:  (s: Stage4AuthoringState) => Stage4AuthoringState,
): Promise<void> {
  const row = await prisma.ideationStageRun.findFirst({
    where:  { id: stageRunId, session: { userId }, status: 'authoring' },
    select: { output: true },
  });
  if (!row) throw new HttpError(409, 'Stage 4 run is not in authoring state');

  const current = safeParseStage4AuthoringState(row.output);
  const next    = transform(current);

  const result = await prisma.ideationStageRun.updateMany({
    where: { id: stageRunId, status: 'authoring' },
    data:  { output: toJsonValue(next) },
  });
  if (result.count !== 1) {
    throw new HttpError(409, 'Stage 4 row changed during transform');
  }
}

// ---------------------------------------------------------------------------
// Layer A — write the per-opportunity research bundle + push log entries
// ---------------------------------------------------------------------------

/**
 * Atomically write the LayerAResearch bundle onto one opportunity AND
 * append the research log entries onto the stage-row's researchLog.
 * Transitions the opportunity's status:
 *
 *   - awaiting_research   → awaiting_engagement (research done, no Layer B yet)
 *   - awaiting_engagement → awaiting_engagement (re-derived; status unchanged)
 *   - engagement_in_progress / evaluated → unchanged (founder already
 *     engaged; re-running Layer A doesn't reset the engagement
 *     progress)
 *
 * Throws 404 if the opportunityId is unknown to this row.
 */
export async function persistLayerAResearch(
  stageRunId:    string,
  userId:        string,
  opportunityId: string,
  layerA:        LayerAResearch,
  researchLog:   ReadonlyArray<ResearchLogEntry>,
): Promise<void> {
  await transformAuthoring(stageRunId, userId, (state) => {
    const target = state.opportunities.find(o => o.id === opportunityId);
    if (!target) {
      throw new HttpError(404, 'Opportunity not found on this stage run');
    }
    const nextStatus = target.status === 'awaiting_research'
      ? 'awaiting_engagement'
      : target.status;
    const nextOpp = clampOpportunity({ ...target, layerAResearch: layerA, status: nextStatus });
    const withOpp = replaceOpportunityById(state, opportunityId, nextOpp);
    return { ...withOpp, researchLog: [...withOpp.researchLog, ...researchLog] };
  });
}

// ---------------------------------------------------------------------------
// Layer B — write the per-opportunity test script
// ---------------------------------------------------------------------------

/**
 * Atomically write the LayerBScript onto one opportunity. Status is
 * NOT advanced here — the founder has to bring back actual community
 * responses (commit #4) before the opportunity moves out of
 * 'awaiting_engagement'.
 *
 * Throws 404 if the opportunityId is unknown to this row.
 */
export async function persistLayerBScript(
  stageRunId:    string,
  userId:        string,
  opportunityId: string,
  script:        LayerBScript,
): Promise<void> {
  await transformAuthoring(stageRunId, userId, (state) => {
    const target = state.opportunities.find(o => o.id === opportunityId);
    if (!target) {
      throw new HttpError(404, 'Opportunity not found on this stage run');
    }
    const nextOpp = clampOpportunity({ ...target, layerBScript: script });
    return replaceOpportunityById(state, opportunityId, nextOpp);
  });
}
