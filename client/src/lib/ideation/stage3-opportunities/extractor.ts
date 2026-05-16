// src/lib/ideation/stage3-opportunities/extractor.ts
//
// Combined classify + extract + plan call for one Stage 3 turn.
// Mirrors Stage 1's extractAndPlan / Stage 2's extractAndPlanStage2
// shape:
//   - inputType (5-value taxonomy)
//   - founderPainPoints[] — pain points the founder added in this
//     message (Human Scout layer)
//   - agentMove (probe/ground/recommend/soft_close/shortlist_invite)
//   - recommendedAction (when move=recommend)
//   - readyToCompose (agent's self-check)
//   - driftDetected (heuristic + judgment)
//
// One Sonnet call (Haiku fallback), Output.object via Vercel AI SDK.

import 'server-only';
import { generateText, Output } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { FOUNDER_CONTEXT_TAGS, RECOMMENDED_ACTION_SEVERITIES } from '@neuralaunch/constants';
import { renderUserContent } from '@/lib/validation/server-helpers';
import { withModelFallback } from '@/lib/ai/with-model-fallback';
import { cachedUserMessages } from '@/lib/ai/prompt-cache';
import {
  withAgentSpan,
  ATTR_AGENT_TIER,
  ATTR_AGENT_MODEL,
  ATTR_TOKENS_INPUT,
  ATTR_TOKENS_OUTPUT,
  ATTR_LATENCY_TOTAL_MS,
} from '@/lib/observability';
import { MODELS } from './constants';
import {
  STAGE3_SYSTEM_PROMPT,
  renderStableStage3Context,
  type Stage3AgentMove,
} from './calibration-prompts';
import type { OutcomeDocument } from '../stage1-outcome/schema';
import type { RequirementsDocument } from '../stage2-requirements/schema';
import type { Stage3AuthoringState } from './schema';

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

const FounderPainPointInputSchema = z.object({
  description:    z.string(),
  founderContext: z.enum(FOUNDER_CONTEXT_TAGS),
  founderNotes:   z.string().nullable(),
});

const RecommendedActionPlanSchema = z.object({
  action:   z.string(),
  severity: z.enum(RECOMMENDED_ACTION_SEVERITIES),
});

const ExtractAndPlanStage3Schema = z.object({
  inputType: z.enum(['answer', 'offtopic', 'frustrated', 'clarification', 'synthesis_request']),
  founderPainPoints: z.array(FounderPainPointInputSchema).describe(
    'EVERY pain point the founder mentioned in this turn that they SOURCED THEMSELVES (own life, close circle, industry observation, existing solution gap). Empty array when the message contained no new founder-side pain points.',
  ),
  agentMove: z.enum(['probe', 'ground', 'recommend', 'soft_close', 'shortlist_invite']),
  recommendedAction: RecommendedActionPlanSchema.nullable(),
  readyToCompose: z.boolean(),
  driftDetected: z.boolean(),
});

export type ExtractAndPlanStage3Raw = z.infer<typeof ExtractAndPlanStage3Schema>;

export type ExtractAndPlanStage3Result = {
  inputType:         'answer' | 'offtopic' | 'frustrated' | 'clarification' | 'synthesis_request';
  founderPainPoints: z.infer<typeof FounderPainPointInputSchema>[];
  agentMove:         Stage3AgentMove;
  recommendedAction: { action: string; severity: 'suggested' | 'strongly_advised' } | null;
  readyToCompose:    boolean;
  driftDetected:     boolean;
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function extractAndPlanStage3(args: {
  founderMessage:        string;
  conversationHistory:   string;
  state:                 Stage3AuthoringState;
  outcomeDocument:       OutcomeDocument;
  requirementsDocument:  RequirementsDocument;
}): Promise<ExtractAndPlanStage3Result> {
  const { founderMessage, conversationHistory, state, outcomeDocument, requirementsDocument } = args;

  const stableContext = [
    STAGE3_SYSTEM_PROMPT,
    renderStableStage3Context({ state, outcomeDocument, requirementsDocument }),
    `Conversation so far:\n${renderUserContent(conversationHistory, 4000)}`,
  ].join('\n\n');

  const volatile = [
    `Founder's latest message: ${renderUserContent(founderMessage, 2000)}`,
    'Produce the structured ExtractAndPlanStage3 output. Decide the agentMove using the policy in the system prompt. Use shortlist_invite ONLY when ≥3 rated pain points exist and the conversation is at a natural commit moment.',
  ].join('\n\n');

  const raw = await withAgentSpan(
    {
      name: 'ideation.stage3.extract_and_plan',
      attributes: {
        [ATTR_AGENT_TIER]: 3,
        [ATTR_AGENT_MODEL]: MODELS.INTERVIEW,
      },
    },
    (setAttr) => withModelFallback<ExtractAndPlanStage3Raw>(
      'stage3.extractAndPlan',
      { primary: MODELS.INTERVIEW, fallback: MODELS.INTERVIEW_FALLBACK_1 },
      async (modelId) => {
        const start = Date.now();
        const result = await generateText({
          model:   aiSdkAnthropic(modelId),
          output:  Output.object({ schema: ExtractAndPlanStage3Schema }),
          messages: cachedUserMessages(stableContext, volatile),
        });
        setAttr(ATTR_LATENCY_TOTAL_MS, Date.now() - start);
        const usage = result.usage as { inputTokens?: number; outputTokens?: number } | undefined;
        if (usage?.inputTokens  != null) setAttr(ATTR_TOKENS_INPUT,  usage.inputTokens);
        if (usage?.outputTokens != null) setAttr(ATTR_TOKENS_OUTPUT, usage.outputTokens);
        return result.output;
      },
    ),
  );

  return narrowResult(raw);
}

// ---------------------------------------------------------------------------
// Narrowing — exported for tests
// ---------------------------------------------------------------------------

export function narrowExtractAndPlanStage3Result(raw: ExtractAndPlanStage3Raw): ExtractAndPlanStage3Result {
  let agentMove: Stage3AgentMove = raw.agentMove;
  let recommendedAction = raw.recommendedAction;
  if (agentMove === 'recommend' && recommendedAction === null) agentMove = 'ground';
  if (agentMove !== 'recommend') recommendedAction = null;
  return {
    inputType:         raw.inputType,
    founderPainPoints: raw.founderPainPoints,
    agentMove,
    recommendedAction,
    readyToCompose:    raw.readyToCompose,
    driftDetected:     raw.driftDetected,
  };
}

function narrowResult(raw: ExtractAndPlanStage3Raw): ExtractAndPlanStage3Result {
  return narrowExtractAndPlanStage3Result(raw);
}
