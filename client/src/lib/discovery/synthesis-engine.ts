// src/lib/discovery/synthesis-engine.ts
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { generateObject } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { DiscoveryContext } from './context-schema';
import { RecommendationSchema, Recommendation } from './recommendation-schema';
import type { AudienceType } from './constants';
import { MODELS } from './constants';
import { logger } from '@/lib/logger';

const anthropicClient = new Anthropic();

// ---------------------------------------------------------------------------
// Step 1 — Summarise gathered context into verified facts
// ---------------------------------------------------------------------------

async function summariseContext(context: DiscoveryContext): Promise<string> {
  const fields = Object.entries(context)
    .filter(([, field]) => field.value !== null && field.confidence > 0.3)
    .map(([key, field]) => `${key}: ${JSON.stringify(field.value)} (confidence: ${field.confidence.toFixed(2)})`)
    .join('\n');

  const response = await anthropicClient.messages.create({
    model:      MODELS.INTERVIEW,
    max_tokens: 1024,
    messages: [{
      role:    'user',
      content: `You are distilling a person's situation into a clear factual summary for a strategic recommendation engine.

GATHERED CONTEXT:
${fields}

Write a concise factual summary (3–5 sentences) covering:
- Who this person is and where they are right now
- What they are trying to achieve and by when
- What resources they have (time, money, team, skills)
- How committed they are

Be direct. Do not give advice. Only state what the data confirms.`,
    }],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type from summarise step');
  return content.text;
}

// ---------------------------------------------------------------------------
// Step 2 — Map context against recommendation space, eliminate alternatives
// ---------------------------------------------------------------------------

async function eliminateAlternatives(summary: string): Promise<string> {
  const response = await anthropicClient.messages.create({
    model:      MODELS.INTERVIEW,
    max_tokens: 1024,
    messages: [{
      role:    'user',
      content: `You are a strategic analyst eliminating poor-fit options before a definitive recommendation.

PERSON SUMMARY:
${summary}

Identify the top 3 possible directions for this person.
For each direction, state clearly WHY it does or does not fit given the specific constraints above.
End with a single sentence: "The strongest fit is: [direction] because [reason]."

Be ruthless. This person needs ONE clear answer, not a menu.`,
    }],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type from eliminate step');
  return content.text;
}

// ---------------------------------------------------------------------------
// Step 3 — Synthesise the final recommendation as structured output
// ---------------------------------------------------------------------------

const AUDIENCE_SYNTHESIS_CONTEXT: Record<AudienceType, string> = {
  LOST_GRADUATE:
    'This person is a recent graduate without clear direction. Frame the recommendation in terms of building momentum and discovering fit through action — not optimising for scale. The first steps must be achievable without prior business experience.',
  STUCK_FOUNDER:
    'This person has tried building before and stalled. The recommendation must acknowledge their experience and directly address why this path is different from what they attempted before. Do not recommend something that requires the same conditions that caused them to stop.',
  ESTABLISHED_OWNER:
    'This person already runs a business. Frame the recommendation at a strategic level — leverage, bottlenecks, and compounding advantage. Do not recommend basics they have already mastered. The first steps should move something that already exists, not build from zero.',
  ASPIRING_BUILDER:
    'This person is a motivated first-time builder with a clear idea. The recommendation must sharpen their path to their first paying customer and challenge any untested assumptions about who will pay and why. Keep it concrete and executable.',
  MID_JOURNEY_PROFESSIONAL:
    'This person is currently employed and managing a transition. Every recommendation must account for limited available time and the real risk of income disruption. The first steps must be achievable evenings and weekends, or the recommendation is not realistic for them.',
};

async function synthesiseRecommendation(
  summary:      string,
  analysis:     string,
  audienceType: AudienceType | null,
): Promise<Recommendation> {
  const audienceBlock = audienceType
    ? `\nAUDIENCE CONTEXT:\n${AUDIENCE_SYNTHESIS_CONTEXT[audienceType]}\n`
    : '';

  const { object } = await generateObject({
    model:  aiSdkAnthropic(MODELS.SYNTHESIS),
    schema: RecommendationSchema,
    messages: [{
      role:    'user',
      content: `You are producing the final strategic recommendation for a person who has shared their full context.

PERSON SUMMARY:
${summary}

STRATEGIC ANALYSIS:
${analysis}${audienceBlock}

RULES — you must follow these precisely:
1. Recommend EXACTLY ONE path. Not two. Not "it depends." ONE.
2. Every claim must reference specific details from the summary above.
3. Do not hedge with words like "might", "could consider", "perhaps". Be definitive.
4. The risks and assumptions must be honest, not reassuring.
5. whatWouldMakeThisWrong must genuinely challenge your recommendation.
6. summary must be 2-3 plain sentences: what the recommendation is, why it fits this person specifically, and what the first move is. It is the complete conclusion — a reader who reads only this must leave knowing exactly what to do.

Produce the recommendation now.`,
    }],
    // Note: extended thinking is intentionally omitted from generateObject —
    // it uses tool_use internally, which requires an Anthropic beta header
    // not supported by the AI SDK. Strategic reasoning is done in steps 1 & 2.
  });

  return object;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * runSynthesis
 *
 * Executes the 3-step prompt chain and returns a single validated Recommendation.
 * Uses claude-opus-4-6 with extended thinking for the final step only.
 * Steps 1 and 2 use claude-sonnet-4-6 for cost control.
 */
export async function runSynthesis(
  context:      DiscoveryContext,
  sessionId:    string,
  audienceType: AudienceType | null = null,
): Promise<Recommendation> {
  const log = logger.child({ module: 'SynthesisEngine', sessionId });

  log.debug('Starting synthesis step 1: summarise context');
  const summary  = await summariseContext(context);

  log.debug('Starting synthesis step 2: eliminate alternatives');
  const analysis = await eliminateAlternatives(summary);

  log.debug('Starting synthesis step 3: generate structured recommendation');
  const recommendation = await synthesiseRecommendation(summary, analysis, audienceType);

  log.debug('Synthesis complete');
  return recommendation;
}
