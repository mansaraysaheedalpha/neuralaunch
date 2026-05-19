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
  CommunityResponse,
  ExtractedSignal,
  OpportunityEvaluation,
} from '../stage4-opportunities/schema';
import {
  safeParseStage4AuthoringState,
  replaceOpportunityById,
  appendCommunityResponse,
  replaceCommunityResponseById,
  applyAgentVerdict,
  applyFounderVerdict,
  computeAggregateSignal,
} from '../stage4-opportunities/state';
import { clampOpportunity } from '../stage4-opportunities/clamps';
import type { OpportunityVerdict } from '@neuralaunch/constants';
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

// ---------------------------------------------------------------------------
// Community response — append to pool + link to opportunity. Status
// transitions awaiting_engagement → engagement_in_progress when the
// first response for that opportunity lands.
// ---------------------------------------------------------------------------

export async function persistCommunityResponse(
  stageRunId: string,
  userId:     string,
  response:   CommunityResponse,
): Promise<void> {
  await transformAuthoring(stageRunId, userId, (state) => {
    const target = state.opportunities.find(o => o.id === response.opportunityId);
    if (!target) {
      throw new HttpError(404, 'Opportunity not found on this stage run');
    }
    const withResponse = appendCommunityResponse(state, response);
    // Link the response id to the opportunity's layerBResponses pool +
    // advance status to engagement_in_progress when this is the first.
    const linkedTarget = withResponse.opportunities.find(o => o.id === response.opportunityId)!;
    const nextStatus = linkedTarget.status === 'awaiting_engagement'
      ? 'engagement_in_progress'
      : linkedTarget.status;
    const nextOpp = clampOpportunity({
      ...linkedTarget,
      layerBResponses: [...linkedTarget.layerBResponses, response.id],
      status:          nextStatus,
    });
    return replaceOpportunityById(withResponse, response.opportunityId, nextOpp);
  });
}

/**
 * Patch a community response after vision extraction completes. The
 * route fires the vision pipeline asynchronously-ish (inside the
 * same /community-response request, under the 90s maxDuration); this
 * helper flips moderationPassed + writes the extracted signal +
 * stamps extractedAt. moderationReason is set when moderation
 * rejected the image OR when the moderation call itself threw
 * (fail-closed path).
 */
export async function updateCommunityResponseExtraction(
  stageRunId:        string,
  userId:            string,
  responseId:        string,
  patch: {
    moderationPassed: boolean;
    moderationReason: string | null;
    extractedSignal:  ExtractedSignal | null;
  },
): Promise<void> {
  await transformAuthoring(stageRunId, userId, (state) => {
    const target = state.founderCommunityResponses.find(r => r.id === responseId);
    if (!target) throw new HttpError(404, 'Community response not found');
    const next: CommunityResponse = {
      ...target,
      moderationPassed: patch.moderationPassed,
      moderationReason: patch.moderationReason,
      extractedSignal:  patch.extractedSignal,
      extractedAt:      new Date().toISOString(),
    };
    return replaceCommunityResponseById(state, responseId, next);
  });
}

/**
 * Recompute one opportunity's layerBExtractedSignal aggregate from
 * every CommunityResponse linked to it. Pure derivation; idempotent.
 * Returns the new aggregate (or null when no responses contribute).
 */
export async function recomputeOpportunityAggregateSignal(
  stageRunId:    string,
  userId:        string,
  opportunityId: string,
): Promise<void> {
  await transformAuthoring(stageRunId, userId, (state) => {
    const target = state.opportunities.find(o => o.id === opportunityId);
    if (!target) throw new HttpError(404, 'Opportunity not found on this stage run');
    const linked = state.founderCommunityResponses.filter(r => r.opportunityId === opportunityId);
    const signal = computeAggregateSignal(linked);
    const nextOpp = clampOpportunity({ ...target, layerBExtractedSignal: signal });
    return replaceOpportunityById(state, opportunityId, nextOpp);
  });
}

/**
 * Write the agent's verdict + reasoning after verdict-synthesizer
 * fires. Transitions status to 'evaluated' (via applyAgentVerdict).
 */
export async function persistAgentVerdict(
  stageRunId:    string,
  userId:        string,
  opportunityId: string,
  verdict:       OpportunityVerdict,
  reasoning:     string,
): Promise<void> {
  await transformAuthoring(stageRunId, userId, (state) => {
    const target = state.opportunities.find(o => o.id === opportunityId);
    if (!target) throw new HttpError(404, 'Opportunity not found on this stage run');
    const nextOpp = applyAgentVerdict(target, verdict, reasoning);
    return replaceOpportunityById(state, opportunityId, nextOpp);
  });
}

/**
 * Write the founder's verdict. `drop` flips status to
 * 'rejected_by_founder'; everything else stays 'evaluated'.
 */
export async function persistFounderVerdict(
  stageRunId:    string,
  userId:        string,
  opportunityId: string,
  verdict:       OpportunityVerdict,
): Promise<void> {
  await transformAuthoring(stageRunId, userId, (state) => {
    const target = state.opportunities.find(o => o.id === opportunityId);
    if (!target) throw new HttpError(404, 'Opportunity not found on this stage run');
    const nextOpp = applyFounderVerdict(target, verdict);
    return replaceOpportunityById(state, opportunityId, nextOpp);
  });
}

/**
 * Optimistic-locked pushback round write-through. Caller has already
 * validated priorVersion === opportunity.pushbackVersion; we re-check
 * here against the freshly-loaded state for safety.
 */
export async function persistOpportunityPushbackRound(
  stageRunId:    string,
  userId:        string,
  updatedOpp:    OpportunityEvaluation,
  priorVersion:  number,
): Promise<void> {
  await transformAuthoring(stageRunId, userId, (state) => {
    const current = state.opportunities.find(o => o.id === updatedOpp.id);
    if (!current) throw new HttpError(404, 'Opportunity not found on this stage run');
    if (current.pushbackVersion !== priorVersion) {
      throw new HttpError(409, 'Opportunity pushback version mismatch');
    }
    return replaceOpportunityById(state, updatedOpp.id, updatedOpp);
  });
}
