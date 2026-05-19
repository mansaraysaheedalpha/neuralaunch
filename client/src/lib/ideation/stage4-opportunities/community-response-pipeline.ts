// src/lib/ideation/stage4-opportunities/community-response-pipeline.ts
//
// Orchestrates the full community-response flow:
//   1. Build + persist the initial CommunityResponse row
//   2. For screenshots: Haiku moderation → Sonnet extraction (fail-closed)
//   3. Recompute the opportunity's aggregate Layer B signal
//   4. Re-fire verdict synthesis with the fresh aggregate
//   5. Persist the new agent verdict
//
// Extracted from the /community-response route so the route stays
// under the 150-line cap. The pipeline is also a candidate for an
// Inngest-backed durable function in a future polish pass — that
// migration would lift this body into a step handler without
// requiring route changes.

import 'server-only';
import { logger } from '@/lib/logger';
import { HttpError } from '@/lib/validation/server-helpers';
import {
  requireOwnedStageRun,
  persistCommunityResponse,
  updateCommunityResponseExtraction,
  recomputeOpportunityAggregateSignal,
  persistAgentVerdict,
} from '../stage-run-store';
import { safeParseStage4AuthoringState, buildCommunityResponse } from './state';
import { runModerationGate, extractSignal } from './vision-extractor';
import { synthesizeVerdict } from './verdict-synthesizer';
import type { OpportunityEvaluation } from './schema';

export type CommunityResponseInput =
  | { opportunityId: string; source: 'text_paste'; pastedText: string }
  | { opportunityId: string; source: 'screenshot'; s3Url: string; s3Key: string };

export interface CommunityResponsePipelineResult {
  responseId:        string;
  moderationPassed:  boolean | undefined;
  agentVerdict:      'pursue' | 'pursue_with_caveats' | 'drop';
  agentReasoning:    string;
}

/**
 * End-to-end community-response pipeline. The caller (route layer)
 * is responsible for CSRF + auth + rate limit + body validation +
 * Stage 4 / authoring gate + opportunity-existence verification.
 * This helper trusts those invariants and focuses on the
 * pipeline's compositional logic.
 */
export async function runCommunityResponsePipeline(args: {
  stageRunId: string;
  userId:     string;
  input:      CommunityResponseInput;
}): Promise<CommunityResponsePipelineResult> {
  const { stageRunId, userId, input } = args;

  // 1. Build + persist the initial row.
  const response = input.source === 'text_paste'
    ? buildCommunityResponse({
        opportunityId: input.opportunityId,
        source:        'text_paste',
        pastedText:    input.pastedText,
      })
    : buildCommunityResponse({
        opportunityId: input.opportunityId,
        source:        'screenshot',
        s3Url:         input.s3Url,
        s3Key:         input.s3Key,
      });
  await persistCommunityResponse(stageRunId, userId, response);

  // 2. Vision pipeline for screenshots — fail-closed on any throw.
  if (response.source === 'screenshot' && response.s3Key) {
    // Re-load the opportunity for the painPointDescription. We could
    // pass it through args, but reloading keeps the pipeline more
    // self-contained.
    const fresh    = await requireOwnedStageRun(stageRunId, userId);
    const refState = safeParseStage4AuthoringState(fresh.output);
    const opp      = refState.opportunities.find((o: OpportunityEvaluation) => o.id === input.opportunityId);
    const painDesc = opp?.painPointSummary ?? '';

    await runVisionPipeline({
      stageRunId,
      userId,
      responseId:           response.id,
      s3Key:                response.s3Key,
      painPointDescription: painDesc,
    });
  }

  // 3. Recompute aggregate signal across all responses for this opp.
  await recomputeOpportunityAggregateSignal(stageRunId, userId, input.opportunityId);

  // 4. Reload + synthesize a fresh verdict.
  const fresh        = await requireOwnedStageRun(stageRunId, userId);
  const newState     = safeParseStage4AuthoringState(fresh.output);
  const refreshedOpp = newState.opportunities.find((o: OpportunityEvaluation) => o.id === input.opportunityId);
  if (!refreshedOpp) throw new HttpError(500, 'Opportunity vanished mid-request');

  const verdict = await synthesizeVerdict({
    painPointSummary: refreshedOpp.painPointSummary,
    layerAResearch:   refreshedOpp.layerAResearch,
    layerBSignal:     refreshedOpp.layerBExtractedSignal,
  });

  // 5. Write the new agent verdict.
  await persistAgentVerdict(stageRunId, userId, refreshedOpp.id, verdict.verdict, verdict.reasoning);

  return {
    responseId:       response.id,
    moderationPassed: response.source === 'text_paste' ? true : undefined,
    agentVerdict:     verdict.verdict,
    agentReasoning:   verdict.reasoning,
  };
}

/**
 * Run the vision pipeline (moderation → extraction) and persist the
 * outcome. Fail-closed: any throw in moderation OR extraction sets
 * moderationPassed=false with a reason and skips downstream
 * extraction; the route still returns a successful response (the
 * founder will see the captured row without extracted detail).
 */
async function runVisionPipeline(args: {
  stageRunId:           string;
  userId:               string;
  responseId:           string;
  s3Key:                string;
  painPointDescription: string;
}): Promise<void> {
  const { stageRunId, userId, responseId, s3Key, painPointDescription } = args;

  let moderationPassed = false;
  let moderationReason: string | null = null;
  let extractedSignal: Awaited<ReturnType<typeof extractSignal>> | null = null;

  try {
    const mod = await runModerationGate({ s3Key });
    if (!mod.safe) {
      moderationReason = mod.reason || 'flagged_by_moderation';
    } else {
      try {
        extractedSignal  = await extractSignal({ s3Key, painPointDescription });
        moderationPassed = true;
      } catch (err) {
        moderationReason = 'extraction_failed';
        logger.warn('Stage 4 vision extraction threw', {
          responseId, err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    moderationReason = 'moderation_call_failed';
    logger.warn('Stage 4 vision moderation threw', {
      responseId, err: err instanceof Error ? err.message : String(err),
    });
  }

  await updateCommunityResponseExtraction(stageRunId, userId, responseId, {
    moderationPassed,
    moderationReason,
    extractedSignal,
  });
}
