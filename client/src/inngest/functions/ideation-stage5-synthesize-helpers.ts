// src/inngest/functions/ideation-stage5-synthesize-helpers.ts
//
// Helpers for the Stage 5 synthesis worker. Split out so the worker
// file stays under the 200-line CLAUDE.md cap and so the
// load-inputs + persist-recommendation logic can be unit-tested
// against a mocked Prisma client without spinning the Inngest runtime.

import 'server-only';
import prisma, { toJsonValue } from '@/lib/prisma';
import { buildPhaseContext, PHASES } from '@/lib/phase-context';
import { loadInterviewContext } from '@/lib/lifecycle';
import {
  renderFounderProfileBlock,
  renderCycleSummariesBlock,
  renderCrossVentureBlock,
} from '@/lib/lifecycle/prompt-renderers';
import { getSession } from '@/lib/discovery/session-store';
import {
  safeParseOutcomeDocument,
  safeParseRequirementsDocument,
  safeParsePainInventoryDocument,
  safeParseOpportunityEvaluationsDocument,
  safeParseStage5AuthoringState,
  buildReserveOpportunities,
} from '@/lib/ideation';
import type { OutcomeDocument } from '@/lib/ideation/stage1-outcome/schema';
import type { RequirementsDocument } from '@/lib/ideation/stage2-requirements/schema';
import type { PainInventoryDocument } from '@/lib/ideation/stage3-opportunities/schema';
import type { OpportunityEvaluationsDocument } from '@/lib/ideation/stage4-opportunities/schema';
import type {
  ChosenOpportunitySnapshot,
  ReserveOpportunity,
} from '@/lib/ideation/stage5-handoff/schema';
import type { Recommendation } from '@/lib/discovery/recommendation-schema';

// ---------------------------------------------------------------------------
// Input loading
// ---------------------------------------------------------------------------

export interface Stage5WorkerInputs {
  outcomeDocument:      OutcomeDocument;
  requirementsDocument: RequirementsDocument;
  painInventoryDoc:     PainInventoryDocument;
  opportunitySet:       OpportunityEvaluationsDocument;
  chosen:               ChosenOpportunitySnapshot;
  reserves:             ReserveOpportunity[];
  lifecycleBlock:       string;
}

/**
 * Load + validate the four committed upstream documents (Stage 1-4)
 * plus the Stage 5 authoring snapshot. Throws when any required input
 * is missing or fails schema parse — the worker catches and flips the
 * job to 'failed'.
 *
 * Lifecycle block: derived from the session's ventureId (when present).
 * Identical shape to discovery-session-function.ts so the bridge prompt
 * reads the same render across both code paths.
 */
export async function loadStage5SynthesisInputs(args: {
  sessionId:  string;
  userId:     string;
  stageRunId: string;
}): Promise<Stage5WorkerInputs> {
  const { sessionId, userId, stageRunId } = args;

  // Stage 1-4 committed outputs.
  const upstream = await prisma.ideationStageRun.findMany({
    where:  { sessionId, stageNumber: { in: [1, 2, 3, 4] }, status: 'committed' },
    select: { stageNumber: true, output: true },
  });
  const s1 = upstream.find(r => r.stageNumber === 1);
  const s2 = upstream.find(r => r.stageNumber === 2);
  const s3 = upstream.find(r => r.stageNumber === 3);
  const s4 = upstream.find(r => r.stageNumber === 4);

  const outcomeDocument      = s1 ? safeParseOutcomeDocument(s1.output)                  : null;
  const requirementsDocument = s2 ? safeParseRequirementsDocument(s2.output)             : null;
  const painInventoryDoc     = s3 ? safeParsePainInventoryDocument(s3.output)            : null;
  const opportunitySet       = s4 ? safeParseOpportunityEvaluationsDocument(s4.output)   : null;
  if (!outcomeDocument)      throw new Error('Stage 1 outcome document missing or malformed');
  if (!requirementsDocument) throw new Error('Stage 2 requirements document missing or malformed');
  if (!painInventoryDoc)     throw new Error('Stage 3 pain inventory document missing or malformed');
  if (!opportunitySet)       throw new Error('Stage 4 opportunity evaluations document missing or malformed');

  // Stage 5 authoring state — pulls the chosen snapshot the turn
  // handler's compose path seeded. If empty (chosen=null), derive the
  // snapshot from Stage 4's chosenOpportunityId as defence-in-depth.
  const stage5Row = await prisma.ideationStageRun.findFirst({
    where:  { id: stageRunId, sessionId, stageNumber: 5 },
    select: { output: true },
  });
  if (!stage5Row) throw new Error('Stage 5 row missing for session');
  const stage5State = safeParseStage5AuthoringState(stage5Row.output);

  const chosen = stage5State.chosenOpportunity ?? deriveChosenFromStage4(opportunitySet);
  if (!chosen) throw new Error('Stage 4 has no chosen opportunity to synthesize from');

  // Reserves: prefer the snapshot the Stage 5 seed wrote; rebuild
  // freshly from Stage 4 if the seed didn't run yet. Both shapes are
  // valid runtime states.
  const reserves: ReserveOpportunity[] = stage5State.reserveOpportunities.length > 0
    ? stage5State.reserveOpportunities
    : buildReserveOpportunities(opportunitySet.evaluations, chosen.id);

  // Lifecycle block — ventureId lives in the InterviewState (Redis +
  // Postgres fallback). When no ventureId exists (first-ever interview
  // pre-lifecycle), the block is empty and the bridge runs identically
  // to the pre-lifecycle flow.
  const interviewState = await getSession(sessionId);
  const ventureId = interviewState?.ventureId ?? null;
  const lifecycleBlock = ventureId
    ? await renderLifecycleBlock(userId, ventureId)
    : '';

  return {
    outcomeDocument,
    requirementsDocument,
    painInventoryDoc,
    opportunitySet,
    chosen,
    reserves,
    lifecycleBlock,
  };
}

function deriveChosenFromStage4(
  opportunitySet: OpportunityEvaluationsDocument,
): ChosenOpportunitySnapshot | null {
  const chosenId = opportunitySet.chosenOpportunityId;
  if (!chosenId) return null;
  const row = opportunitySet.evaluations.find(e => e.id === chosenId);
  if (!row || row.founderVerdict === null) return null;
  return {
    id:               row.id,
    painPointSummary: row.painPointSummary,
    agentVerdict:     row.agentVerdict,
    founderVerdict:   row.founderVerdict,
    agentReasoning:   row.agentReasoning,
    layerASummary:    row.layerAResearch && {
      marketReality:  { reasoning: row.layerAResearch.marketReality.reasoning,  confidence: row.layerAResearch.marketReality.confidence },
      customerAccess: { reasoning: row.layerAResearch.customerAccess.reasoning, confidence: row.layerAResearch.customerAccess.confidence },
      willPeoplePay:  { reasoning: row.layerAResearch.willPeoplePay.reasoning,  confidence: row.layerAResearch.willPeoplePay.confidence },
      marketSize:     { reasoning: row.layerAResearch.marketSize.reasoning,     confidence: row.layerAResearch.marketSize.confidence },
    },
    layerBSummary:    row.layerBExtractedSignal,
  };
}

async function renderLifecycleBlock(userId: string, ventureId: string): Promise<string> {
  const ctx = await loadInterviewContext(userId, 'fork_continuation', { ventureId });
  return [
    renderFounderProfileBlock(ctx.profile),
    renderCycleSummariesBlock(ctx.cycleSummaries),
    renderCrossVentureBlock(ctx.crossVentureSummaries),
  ].filter(b => b.length > 0).join('\n');
}

// ---------------------------------------------------------------------------
// Persistence — Recommendation upsert keyed on sessionId
// ---------------------------------------------------------------------------

/**
 * Idempotent Recommendation upsert. Matches discovery-session-function's
 * pattern exactly so a Stage 5 founder lands on the same Recommendation
 * review surface as a legacy first_interview founder. Keyed on the
 * partial unique (sessionId WHERE parentRecommendationId IS NULL) so a
 * worker retry produces the same row, not a duplicate.
 *
 * Also mirrors the reserve list onto Recommendation.ideationReserveOpportunities
 * — the JSONB column added in commit #1 that the continuation brief
 * reads when downstream validation fails.
 */
export async function upsertStage5Recommendation(args: {
  userId:         string;
  sessionId:      string;
  recommendation: Recommendation;
  researchLog:    unknown[];
  reserves:       ReserveOpportunity[];
}): Promise<string> {
  const { userId, sessionId, recommendation, researchLog, reserves } = args;
  const data = {
    userId,
    sessionId,
    recommendationType:     recommendation.recommendationType,
    summary:                recommendation.summary,
    path:                   recommendation.path,
    reasoning:              recommendation.reasoning,
    firstThreeSteps:        recommendation.firstThreeSteps,
    timeToFirstResult:      recommendation.timeToFirstResult,
    risks:                  recommendation.risks,
    assumptions:            recommendation.assumptions,
    whatWouldMakeThisWrong: recommendation.whatWouldMakeThisWrong,
    alternativeRejected:    recommendation.alternativeRejected,
    researchLog:                  toJsonValue(researchLog),
    ideationReserveOpportunities: toJsonValue(reserves),
    phaseContext: toJsonValue(buildPhaseContext(PHASES.RECOMMENDATION, {
      discoverySessionId: sessionId,
    })),
  };

  return prisma.$transaction(async (tx) => {
    const existing = await tx.recommendation.findFirst({
      where:  { sessionId, parentRecommendationId: null },
      select: { id: true },
    });
    if (existing) {
      await tx.recommendation.update({ where: { id: existing.id }, data });
      return existing.id;
    }
    const created = await tx.recommendation.create({ data, select: { id: true } });
    return created.id;
  });
}
