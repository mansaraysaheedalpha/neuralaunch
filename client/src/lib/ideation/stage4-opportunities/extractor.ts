// src/lib/ideation/stage4-opportunities/extractor.ts
//
// Combined classify + plan call for one Stage 4 turn. The Stage 4
// chat is supplementary (the canvas is the truth surface), so the
// extractor is simpler than Stage 3's — no founder-pain-point
// extraction; verdicts flow through dedicated routes, not chat.
//
// One Sonnet call (Haiku fallback), Output.object via Vercel AI SDK.

import 'server-only';
import { generateText, Output } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { RECOMMENDED_ACTION_SEVERITIES } from '@neuralaunch/constants';
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
  STAGE4_SYSTEM_PROMPT,
  renderStableStage4Context,
  type Stage4AgentMove,
} from './calibration-prompts';
import type { OutcomeDocument } from '../stage1-outcome/schema';
import type { RequirementsDocument } from '../stage2-requirements/schema';
import type { PainInventoryDocument } from '../stage3-opportunities/schema';
import type { Stage4AuthoringState } from './schema';

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

const RecommendedActionPlanSchema = z.object({
  action:   z.string(),
  severity: z.enum(RECOMMENDED_ACTION_SEVERITIES),
});

const ExtractAndPlanStage4Schema = z.object({
  inputType: z.enum(['answer', 'offtopic', 'frustrated', 'clarification', 'synthesis_request']),
  agentMove: z.enum(['probe', 'ground', 'recommend', 'soft_close', 'compose_invite']),
  recommendedAction: RecommendedActionPlanSchema.nullable(),
  readyToCompose:    z.boolean(),
  driftDetected:     z.boolean(),
});

export type ExtractAndPlanStage4Raw = z.infer<typeof ExtractAndPlanStage4Schema>;

export type ExtractAndPlanStage4Result = {
  inputType:         'answer' | 'offtopic' | 'frustrated' | 'clarification' | 'synthesis_request';
  agentMove:         Stage4AgentMove;
  recommendedAction: { action: string; severity: 'suggested' | 'strongly_advised' } | null;
  readyToCompose:    boolean;
  driftDetected:     boolean;
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function extractAndPlanStage4(args: {
  founderMessage:       string;
  conversationHistory:  string;
  state:                Stage4AuthoringState;
  outcomeDocument:      OutcomeDocument;
  requirementsDocument: RequirementsDocument;
  painInventoryDoc:     PainInventoryDocument;
}): Promise<ExtractAndPlanStage4Result> {
  const { founderMessage, conversationHistory, state, outcomeDocument, requirementsDocument, painInventoryDoc } = args;

  const stable = [
    STAGE4_SYSTEM_PROMPT,
    renderStableStage4Context({ state, outcomeDocument, requirementsDocument, painInventoryDoc }),
    `Conversation so far:\n${renderUserContent(conversationHistory, 4000)}`,
  ].join('\n\n');

  const volatile = [
    `Founder's latest message: ${renderUserContent(founderMessage, 2000)}`,
    'Produce the structured ExtractAndPlanStage4 output. Decide the agentMove using the policy in the system prompt. Use compose_invite ONLY when ≥1 opportunity has a non-drop founder verdict.',
  ].join('\n\n');

  const raw = await withAgentSpan(
    {
      name: 'ideation.stage4.extract_and_plan',
      attributes: {
        [ATTR_AGENT_TIER]:  3,
        [ATTR_AGENT_MODEL]: MODELS.INTERVIEW,
      },
    },
    (setAttr) => withModelFallback<ExtractAndPlanStage4Raw>(
      'stage4.extractAndPlan',
      { primary: MODELS.INTERVIEW, fallback: MODELS.INTERVIEW_FALLBACK_1 },
      async (modelId) => {
        const start = Date.now();
        const result = await generateText({
          model:   aiSdkAnthropic(modelId),
          output:  Output.object({ schema: ExtractAndPlanStage4Schema }),
          messages: cachedUserMessages(stable, volatile),
        });
        setAttr(ATTR_LATENCY_TOTAL_MS, Date.now() - start);
        const usage = result.usage as { inputTokens?: number; outputTokens?: number } | undefined;
        if (usage?.inputTokens  != null) setAttr(ATTR_TOKENS_INPUT,  usage.inputTokens);
        if (usage?.outputTokens != null) setAttr(ATTR_TOKENS_OUTPUT, usage.outputTokens);
        return result.output;
      },
    ),
  );

  return narrowExtractAndPlanStage4Result(raw);
}

// ---------------------------------------------------------------------------
// Narrowing — invariant coercion
// ---------------------------------------------------------------------------

export function narrowExtractAndPlanStage4Result(raw: ExtractAndPlanStage4Raw): ExtractAndPlanStage4Result {
  // Invariants:
  //   - agentMove='recommend' requires a recommendedAction; otherwise
  //     downgrade to 'ground'
  //   - non-recommend moves null the action
  let agentMove = raw.agentMove;
  let recommendedAction = raw.recommendedAction;
  if (agentMove === 'recommend' && recommendedAction === null) agentMove = 'ground';
  if (agentMove !== 'recommend') recommendedAction = null;
  return {
    inputType:         raw.inputType,
    agentMove,
    recommendedAction,
    readyToCompose:    raw.readyToCompose,
    driftDetected:     raw.driftDetected,
  };
}
