// src/lib/ideation/stage2-requirements/extractor.ts
import 'server-only';
import { generateText, Output } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import {
  SKILL_KEYS,
  SKILL_TIERS,
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
import type { OutcomeDocument } from '../stage1-outcome/schema';
import { MODELS } from './constants';
import {
  STAGE2_SYSTEM_PROMPT,
  renderStage2StableContext,
} from './calibration-prompts';
import type { Stage2AuthoringState } from './schema';

// ---------------------------------------------------------------------------
// LLM output schema — combined extract + plan
//
// No `.max()` on string fields, no `.int()/.min()/.max()` on numbers
// (CLAUDE.md). Bounds applied post-parse in state.ts where relevant.
// ---------------------------------------------------------------------------

const SkillUpdateExtractionSchema = z.object({
  /**
   * 'founder' OR a teammate's name. The handler resolves teammate
   * names to indices; an unrecognised name is dropped (extractor can
   * also surface the new teammate via teamMentions to add them first).
   */
  person:     z.string().describe(
    "Who this tier applies to. Use 'founder' for the founder themselves. " +
    "Use a teammate's name (matching one already in the inventory, " +
    "or one you surfaced via teamMentions in the SAME extraction) " +
    "for a team member.",
  ),
  skill:      z.enum(SKILL_KEYS),
  tier:       z.enum(SKILL_TIERS).describe(
    "Tier the founder's message implies. Use 'unknown' ONLY when the " +
    "founder explicitly disclaims knowing their level ('I don't know', " +
    "'haven't really tried this', 'never had to'). Default to 'bad' for " +
    "weak self-assessment, 'acceptable' for middling, 'good' for explicit " +
    "claimed strength. Do not infer 'unknown' from absence of mention.",
  ),
  confidence: z.number().describe(
    "0.9-1.0 explicit claim; 0.6-0.8 inferred from context; 0.3-0.5 " +
    "weakly implied. Post-parsed and clamped to [0,1].",
  ),
});

const TeamMentionSchema = z.object({
  /**
   * The name the founder used. Empty / single-char names are filtered
   * at the handler layer; the schema is permissive so the model isn't
   * pushed to invent names.
   */
  name: z.string().describe(
    "Name of a teammate the founder mentioned in this message who is " +
    "NOT yet in the inventory. Use the exact form the founder used " +
    "('my co-founder Maya', 'business partner Tom'). The handler " +
    "normalises; you do not need to.",
  ),
});

const RecommendedActionPlanSchema = z.object({
  action:   z.string().describe(
    "One concrete real-world action the founder should take to fill " +
    "a skill gap or test a self-assessment. Under 200 chars; post-parse " +
    "clamp truncates.",
  ),
  severity: z.enum(RECOMMENDED_ACTION_SEVERITIES),
});

export const ExtractAndPlanStage2Schema = z.object({
  inputType: z.enum([
    'answer',
    'offtopic',
    'frustrated',
    'clarification',
    'synthesis_request',
  ]).describe(
    "Same taxonomy as Stage 1. answer: founder responded (even vaguely). " +
    "offtopic: meta question. frustrated: annoyance without asking to " +
    "stop. clarification: founder asking what you meant. " +
    "synthesis_request: founder wants the RequirementsDocument delivered " +
    "NOW — they are done answering. Tiebreak: any signal of 'just give " +
    "me the document' beats frustrated.",
  ),
  skillUpdates: z.array(SkillUpdateExtractionSchema).describe(
    "EVERY skill mention in this message, not just the most recent. " +
    "If the founder says 'I'm good at sales and bad at marketing', " +
    "extract two updates. Empty array is valid (offtopic / pure " +
    "frustration / no skill content).",
  ),
  teamMentions: z.array(TeamMentionSchema).describe(
    "Teammates the founder mentioned in this message who are NOT yet " +
    "in the inventory. The handler adds them BEFORE applying skill " +
    "updates that reference them. Empty array is the common case.",
  ),
  agentMove: z.enum(['probe', 'ground', 'recommend', 'soft_close']).describe(
    "probe = ask a follow-up that tests a self-assessment ('you said " +
    "you're good at sales — when did you last close a deal?'). " +
    "ground = name a mismatch between claimed skill and the founder's " +
    "stated outcome, briefly. recommend = name a concrete real-world " +
    "action to verify a skill or fill a gap. soft_close = surface the " +
    "current inventory and offer commit/pause/keep-going options.",
  ),
  recommendedAction: RecommendedActionPlanSchema.nullable(),
  readyToCompose: z.boolean().describe(
    "true when the inventory is rich enough and the calibration chat " +
    "has surfaced the founder's real shape. The handler ANDs this with " +
    "the mechanical readiness check (turn count + expected profile " +
    "derived) before firing the composer.",
  ),
  driftDetected: z.boolean().describe(
    "true when the conversation is circling without surfacing new " +
    "tier information. Consider calibrationTurnsSinceLastUpdate in " +
    "the stable prefix as a signal.",
  ),
});

export type ExtractAndPlanStage2Raw = z.infer<typeof ExtractAndPlanStage2Schema>;

// ---------------------------------------------------------------------------
// Public result type (narrowed)
// ---------------------------------------------------------------------------

export type Stage2InputType =
  | 'answer'
  | 'offtopic'
  | 'frustrated'
  | 'clarification'
  | 'synthesis_request';

export type Stage2AgentMove = 'probe' | 'ground' | 'recommend' | 'soft_close';

export type Stage2ExtractedSkillUpdate = {
  person:     string;     // 'founder' or a teammate name
  skill:      typeof SKILL_KEYS[number];
  tier:       typeof SKILL_TIERS[number];
  confidence: number;
};

export type Stage2ExtractedTeamMention = { name: string };

export type ExtractAndPlanStage2Result = {
  inputType:         Stage2InputType;
  skillUpdates:      Stage2ExtractedSkillUpdate[];
  teamMentions:      Stage2ExtractedTeamMention[];
  agentMove:         Stage2AgentMove;
  recommendedAction: { action: string; severity: 'suggested' | 'strongly_advised' } | null;
  readyToCompose:    boolean;
  driftDetected:     boolean;
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * One Sonnet call per Stage 2 turn (Haiku fallback on overload).
 * Returns the narrowed result; the handler dispatches on
 * inputType / agentMove and applies the deltas.
 *
 * The stable prefix (system prompt + outcome doc + current inventory
 * + drift counter) is cache-marked so multi-turn calibration pays the
 * cached-input rate.
 */
export async function extractAndPlanStage2(args: {
  founderMessage:      string;
  conversationHistory: string;
  state:               Stage2AuthoringState;
  outcomeDocument:     OutcomeDocument;
}): Promise<ExtractAndPlanStage2Result> {
  const { founderMessage, conversationHistory, state, outcomeDocument } = args;

  const stableContext = [
    STAGE2_SYSTEM_PROMPT,
    renderStage2StableContext(state, outcomeDocument),
    `Drift signal: calibrationTurnsSinceLastUpdate = ${state.calibrationTurnsSinceLastUpdate}.`,
    `Conversation so far:\n${renderUserContent(conversationHistory, 4000)}`,
  ].join('\n\n');

  const volatileTurn = [
    `Founder's latest message: ${renderUserContent(founderMessage, 2000)}`,
    'Produce the structured ExtractAndPlanStage2 output. Decide agentMove using the policy in the system prompt.',
  ].join('\n\n');

  const raw = await withAgentSpan(
    {
      name: 'ideation.stage2.extract_and_plan',
      attributes: {
        [ATTR_AGENT_TIER]: 3,
        [ATTR_AGENT_MODEL]: MODELS.INTERVIEW,
      },
    },
    (setAttr) => withModelFallback<ExtractAndPlanStage2Raw>(
      'stage2.extractAndPlan',
      { primary: MODELS.INTERVIEW, fallback: MODELS.INTERVIEW_FALLBACK_1 },
      async (modelId) => {
        const start = Date.now();
        const result = await generateText({
          model:  aiSdkAnthropic(modelId),
          output: Output.object({ schema: ExtractAndPlanStage2Schema }),
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
// Narrowing — enforce the move/action invariant + clamp confidence
// ---------------------------------------------------------------------------

function clampConfidence(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Exported for unit-test access. Enforces the action↔payload invariant
 * (move='recommend' must carry a recommendedAction; other moves must
 * not) and clamps confidence values to [0, 1].
 */
export function narrowExtractAndPlanResult(raw: ExtractAndPlanStage2Raw): ExtractAndPlanStage2Result {
  return narrowResult(raw);
}

function narrowResult(raw: ExtractAndPlanStage2Raw): ExtractAndPlanStage2Result {
  // Same invariant as Stage 1: move='recommend' requires an action.
  let agentMove: Stage2AgentMove = raw.agentMove;
  let recommendedAction = raw.recommendedAction;
  if (agentMove === 'recommend' && recommendedAction === null) {
    agentMove = 'ground';
  }
  if (agentMove !== 'recommend') {
    recommendedAction = null;
  }

  return {
    inputType:         raw.inputType,
    skillUpdates: raw.skillUpdates.map(u => ({
      person:     u.person,
      skill:      u.skill,
      tier:       u.tier,
      confidence: clampConfidence(u.confidence),
    })),
    teamMentions:      raw.teamMentions.map(t => ({ name: t.name })),
    agentMove,
    recommendedAction,
    readyToCompose:    raw.readyToCompose,
    driftDetected:     raw.driftDetected,
  };
}
