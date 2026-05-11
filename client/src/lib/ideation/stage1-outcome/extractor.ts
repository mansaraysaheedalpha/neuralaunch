// src/lib/ideation/stage1-outcome/extractor.ts
import 'server-only';
import { generateText, Output } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import {
  TIME_HORIZONS,
  FINANCIAL_GOAL_SHAPES,
  RISK_TOLERANCES,
  LIFESTYLE_PREFERENCES,
  RECOMMENDED_ACTION_SEVERITIES,
} from '@neuralaunch/constants';
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
import { MODELS } from '../constants';
import {
  STAGE1_SYSTEM_PROMPT,
  renderStableContext,
} from './reality-grounding';
import type { Stage1AuthoringState } from './schema';
import type { Stage1Extraction } from './state';
import type { AgentMove } from './reality-grounding';

// ---------------------------------------------------------------------------
// Output schema for the combined extract-and-plan call.
//
// Single LLM call per Stage 1 turn, returning everything the handler
// needs to decide what to do next:
//   - inputType (same taxonomy as Discovery's extractor)
//   - extractions: every dimension the founder touched, not just the
//     one we were asking about
//   - agentMove: probe / ground / recommend / soft_close
//   - recommendedAction: present when move='recommend'
//   - readyToCompose: agent's self-assessment of whether the four
//     dimensions are well-enough understood to compose the document
//   - driftDetected: agent's judgment that the conversation is
//     circling without progress (biased by the handler-side counter)
//
// No `.max()` on string fields, no `.int()` / `.min()` / `.max()` on
// number fields — Anthropic's structured-output validator rejects
// those constraints (see CLAUDE.md "Reliability"). Bounds are applied
// post-parse by the state-machine helpers in state.ts.
// ---------------------------------------------------------------------------

const FinancialGoalExtractionSchema = z.object({
  shape:  z.enum(FINANCIAL_GOAL_SHAPES),
  target: z.string().nullable().describe(
    "Free-text quantified target like '£3k/month' or 'replace my £80k " +
    "salary'. Null when the founder has mentioned the shape but not " +
    "any number. Aim for under 80 characters; post-parse clamp truncates.",
  ),
});

const Stage1ExtractionSchema = z.discriminatedUnion('field', [
  z.object({
    field:      z.literal('timeHorizon'),
    value:      z.enum(TIME_HORIZONS),
    confidence: z.number().describe(
      '0.9-1.0 if the founder explicitly stated a horizon; 0.6-0.8 if ' +
      'inferred from context; 0.3-0.5 if weakly implied. The state ' +
      'machine clamps to [0,1] post-parse so values outside the range ' +
      'will be coerced.',
    ),
  }),
  z.object({
    field:      z.literal('financialGoal'),
    value:      FinancialGoalExtractionSchema,
    confidence: z.number(),
  }),
  z.object({
    field:      z.literal('riskTolerance'),
    value:      z.enum(RISK_TOLERANCES),
    confidence: z.number(),
  }),
  z.object({
    field:      z.literal('lifestylePreference'),
    value:      z.enum(LIFESTYLE_PREFERENCES),
    confidence: z.number(),
  }),
]);

const RecommendedActionPlanSchema = z.object({
  action:   z.string().describe(
    "One concrete real-world action the founder should take. Under " +
    "200 characters; post-parse clamp truncates longer.",
  ),
  severity: z.enum(RECOMMENDED_ACTION_SEVERITIES),
});

const ExtractAndPlanSchema = z.object({
  inputType: z.enum([
    'answer',
    'offtopic',
    'frustrated',
    'clarification',
    'synthesis_request',
  ]).describe(
    "answer: founder responded to the conversation (even vaguely). " +
    "offtopic: meta question (who are you, how does this work). " +
    "frustrated: annoyance or dismissal without asking to stop. " +
    "clarification: founder is asking whether they understood the " +
    "agent's last message correctly. synthesis_request: founder wants " +
    "the outcome document delivered NOW — they are done answering. " +
    "Tiebreak: any signal of 'just give me the document' beats frustrated.",
  ),
  /**
   * EVERY dimension the founder's message touched, not just the one
   * the conversation was anchored on. Empty array is valid (the
   * message was offtopic / pure frustration / a clarification with no
   * captured content).
   */
  extractions: z.array(Stage1ExtractionSchema).describe(
    'Extract ALL Stage 1 dimensions mentioned in this message. If the ' +
    'founder mentions their risk tolerance while answering about ' +
    'lifestyle, capture both. Include the field the conversation was ' +
    'anchored on if they answered it. Confidence reflects how directly ' +
    'they stated each value: 0.9-1.0 explicit, 0.6-0.8 inferred, 0.3-0.5 weak.',
  ),
  /**
   * Which move the agent should make on this turn. See the system
   * prompt for the move taxonomy and selection guidance.
   */
  agentMove: z.enum(['probe', 'ground', 'recommend', 'soft_close']).describe(
    'probe = ask a follow-up that tests the founder\'s reasoning. ' +
    'ground = name a trade-off they appear to be missing, briefly. ' +
    'recommend = name a concrete real-world action they should take. ' +
    'soft_close = surface what you have so far and offer commit/pause/' +
    'keep-going options. Use soft_close ONLY when the conversation is ' +
    'circling without progress; the handler-side drift counter is in ' +
    'the stable prefix as a signal.',
  ),
  recommendedAction: RecommendedActionPlanSchema.nullable().describe(
    'Required when agentMove is "recommend"; null otherwise. The ' +
    'handler appends this to recommendedActions[] before streaming.',
  ),
  readyToCompose: z.boolean().describe(
    'true when all four dimensions are well-enough understood to draft ' +
    'the OutcomeDocument. The handler ANDs this with the mechanical ' +
    'readiness check (all dims above 0.65 AND mean above 0.75) before ' +
    'firing the composer — your assessment is the signal, not the gate.',
  ),
  driftDetected: z.boolean().describe(
    'true when the conversation has been circling and surfacing the ' +
    'partial outcome would serve the founder better than another ' +
    'probe. Consider questionsSinceLastConfidenceGain in the stable ' +
    'prefix when deciding.',
  ),
});

type ExtractAndPlanRaw = z.infer<typeof ExtractAndPlanSchema>;

// ---------------------------------------------------------------------------
// Public result type — narrowed to what the handler actually uses
// ---------------------------------------------------------------------------

export type Stage1InputType =
  | 'answer'
  | 'offtopic'
  | 'frustrated'
  | 'clarification'
  | 'synthesis_request';

export type ExtractAndPlanResult = {
  inputType:        Stage1InputType;
  extractions:      Stage1Extraction[];
  agentMove:        AgentMove;
  recommendedAction: { action: string; severity: 'suggested' | 'strongly_advised' } | null;
  readyToCompose:   boolean;
  driftDetected:    boolean;
};

// ---------------------------------------------------------------------------
// Public entry point — called once per Stage 1 turn from stage1-handler
// ---------------------------------------------------------------------------

/**
 * Combined extract + plan call. Mirrors Discovery's `extractContext`
 * exactly: single Sonnet call, Haiku fallback on overload, structured
 * output validated against ExtractAndPlanSchema.
 *
 * The stable prefix (system prompt + dimension state + recommended-
 * action log + drift counter) is cache-marked so multi-turn
 * conversations pay the cached-input rate.
 */
export async function extractAndPlan(
  founderMessage:      string,
  conversationHistory: string,
  state:               Stage1AuthoringState,
): Promise<ExtractAndPlanResult> {
  const stableContext = [
    STAGE1_SYSTEM_PROMPT,
    renderStableContext(state),
    `Drift signal: questionsSinceLastConfidenceGain = ${state.questionsSinceLastConfidenceGain}.`,
    `Conversation so far:\n${renderUserContent(conversationHistory, 4000)}`,
  ].join('\n\n');

  const volatileTurn = [
    `Founder's latest message: ${renderUserContent(founderMessage, 2000)}`,
    'Produce the structured ExtractAndPlanSchema output. Decide the agentMove using the policy in the system prompt.',
  ].join('\n\n');

  const raw = await withAgentSpan(
    {
      name: 'ideation.stage1.extract_and_plan',
      attributes: {
        [ATTR_AGENT_TIER]: 3,
        [ATTR_AGENT_MODEL]: MODELS.INTERVIEW,
      },
    },
    (setAttr) => withModelFallback<ExtractAndPlanRaw>(
      'stage1.extractAndPlan',
      { primary: MODELS.INTERVIEW, fallback: MODELS.INTERVIEW_FALLBACK_1 },
      async (modelId) => {
        const start = Date.now();
        const result = await generateText({
          model:  aiSdkAnthropic(modelId),
          output: Output.object({ schema: ExtractAndPlanSchema }),
          messages: cachedUserMessages(stableContext, volatileTurn),
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
// Narrowing — discriminate the union and enforce the move/action invariant
// ---------------------------------------------------------------------------

function narrowResult(raw: ExtractAndPlanRaw): ExtractAndPlanResult {
  const extractions: Stage1Extraction[] = raw.extractions.map(ex => {
    // Zod's discriminatedUnion narrowing carries through TS, but the
    // mapped output shape from generateText loses it across the await;
    // re-narrow explicitly so callers get the strict Stage1Extraction.
    switch (ex.field) {
      case 'timeHorizon':
        return { field: 'timeHorizon', value: ex.value, confidence: ex.confidence };
      case 'financialGoal':
        return { field: 'financialGoal', value: ex.value, confidence: ex.confidence };
      case 'riskTolerance':
        return { field: 'riskTolerance', value: ex.value, confidence: ex.confidence };
      case 'lifestylePreference':
        return { field: 'lifestylePreference', value: ex.value, confidence: ex.confidence };
    }
  });

  // Invariant: agentMove='recommend' requires a recommendedAction.
  // If the model produced 'recommend' without an action, downgrade to
  // 'ground' so the handler doesn't try to append a null action.
  let agentMove: AgentMove = raw.agentMove;
  let recommendedAction = raw.recommendedAction;
  if (agentMove === 'recommend' && recommendedAction === null) {
    agentMove = 'ground';
  }
  if (agentMove !== 'recommend') {
    recommendedAction = null;
  }

  return {
    inputType:         raw.inputType,
    extractions,
    agentMove,
    recommendedAction,
    readyToCompose:    raw.readyToCompose,
    driftDetected:     raw.driftDetected,
  };
}
