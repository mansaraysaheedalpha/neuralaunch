// src/lib/ideation/stage1-outcome/composer.ts
import 'server-only';
import { generateText, Output } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
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
import { MODELS, OUTCOME_COMPOSITION_MAX_TOKENS } from '../constants';
import { renderStableContext, STAGE1_SYSTEM_PROMPT } from './reality-grounding';
import { safeParseOutcomeDocument } from './state';
import type { Stage1AuthoringState, OutcomeDocument } from './schema';

// ---------------------------------------------------------------------------
// LLM-output schema — only the two free-text fields. Dimensions and
// recommendedActions flow through from the authoring state, not from
// the model, because the founder already authored them turn by turn.
// Re-asking the model to round-trip them just adds a place for
// regression. No `.max()` on strings per CLAUDE.md.
// ---------------------------------------------------------------------------

const ComposerOutputSchema = z.object({
  synthesisParagraph: z.string().describe(
    "3-5 sentences connecting the founder's time horizon, financial " +
    "goal, risk tolerance, and lifestyle preference into ONE coherent " +
    "picture. Surface the trade-offs that fall out of these four " +
    "choices — what they are choosing INTO, not just what they said. " +
    "Plain language. No bullet lists, no headers. Aim for 600-800 chars " +
    "(the post-parse clamp truncates anything longer).",
  ),
  rulesOut: z.string().describe(
    "2-3 sentences naming what this outcome explicitly DOES NOT fit. " +
    "Be concrete: name shapes, durations, or commitments the founder " +
    "is choosing AGAINST. Abstract disclaimers ('not for the risk- " +
    "averse') are unhelpful. Aim for 250-400 chars; post-parse clamp " +
    "truncates anything longer.",
  ),
});

const COMPOSER_DIMENSION_LOCK = `STAGE BOUNDARY — load-bearing.

The synthesisParagraph and rulesOut paragraphs MUST be derived ONLY from the four captured dimensions (timeHorizon, financialGoal, riskTolerance, lifestylePreference). Do NOT reference skills, prior experience, professional background, what the founder has tried before, or what they're good at — even if the conversation contains that content. Those are Stage 2 territory and must not contaminate the Outcome Document.`;

// ---------------------------------------------------------------------------
// Public entry point — called from stage1-handler when both the agent
// returns readyToCompose=true AND computeOutcomeReadiness returns true.
// ---------------------------------------------------------------------------

/**
 * Run the composer pass. Produces the final OutcomeDocument by
 * combining the authored dimensions + the running action log with the
 * synthesisParagraph and rulesOut the LLM generates.
 *
 * Throws on schema validation failure — the handler treats that as a
 * 500 surfaced to the founder ("we couldn't draft the document, please
 * retry") rather than persisting half a document.
 */
export async function composeOutcomeDocument(
  state:               Stage1AuthoringState,
  conversationHistory: string,
): Promise<OutcomeDocument> {
  const stable = [
    STAGE1_SYSTEM_PROMPT,
    COMPOSER_DIMENSION_LOCK,
    renderStableContext(state),
    `Conversation so far:\n${renderUserContent(conversationHistory, 4000)}`,
  ].join('\n\n');

  const volatile = `Compose the OutcomeDocument now.

Produce synthesisParagraph (3-5 sentences, plain prose, no bullets) and rulesOut (2-3 sentences, concrete) per the schema. The founder has already authored the four dimensions; do not restate them in bullet form — write prose that connects them. Do not invent constraints the founder didn't state. Surface trade-offs the dimensions imply, but stay grounded in what the founder said. Stage 2 content (skills, prior experience, what they've tried) MUST NOT appear in either paragraph even if it surfaced in the conversation — that's Stage 2 territory and contaminates this artifact.`;

  const composed = await withAgentSpan(
    {
      name: 'ideation.stage1.compose',
      attributes: {
        [ATTR_AGENT_TIER]: 2,
        [ATTR_AGENT_MODEL]: MODELS.INTERVIEW,
      },
    },
    (setAttr) => withModelFallback<z.infer<typeof ComposerOutputSchema>>(
      'stage1.compose',
      { primary: MODELS.INTERVIEW, fallback: MODELS.INTERVIEW_FALLBACK_1 },
      async (modelId) => {
        const start = Date.now();
        const result = await generateText({
          model:           aiSdkAnthropic(modelId),
          output:          Output.object({ schema: ComposerOutputSchema }),
          messages:        cachedUserMessages(stable, volatile),
          maxOutputTokens: OUTCOME_COMPOSITION_MAX_TOKENS,
        });
        setAttr(ATTR_LATENCY_TOTAL_MS, Date.now() - start);
        const usage = result.usage as { inputTokens?: number; outputTokens?: number } | undefined;
        if (usage?.inputTokens  != null) setAttr(ATTR_TOKENS_INPUT,  usage.inputTokens);
        if (usage?.outputTokens != null) setAttr(ATTR_TOKENS_OUTPUT, usage.outputTokens);
        return result.output;
      },
    ),
  );

  // Build the candidate document and run it through safeParse so the
  // post-parse clamps fire (synthesisParagraph / rulesOut length
  // bounds, financial-goal target bound, etc.). If the candidate
  // doesn't validate, fail loudly — the handler converts this to a
  // 500 surfaced to the founder rather than persisting garbage.
  const candidate: OutcomeDocument = {
    dimensions:         state.dimensions,
    synthesisParagraph: composed.synthesisParagraph,
    rulesOut:           composed.rulesOut,
    recommendedActions: state.recommendedActions,
  };
  const parsed = safeParseOutcomeDocument(candidate);
  if (!parsed) {
    throw new Error('Composer produced a document that failed OutcomeDocument validation');
  }
  return parsed;
}
