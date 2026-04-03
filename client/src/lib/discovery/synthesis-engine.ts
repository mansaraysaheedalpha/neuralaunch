// src/lib/discovery/synthesis-engine.ts
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { generateObject } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { DiscoveryContext } from './context-schema';
import { RecommendationSchema, Recommendation } from './recommendation-schema';
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

async function synthesiseRecommendation(
  summary:   string,
  analysis:  string,
): Promise<Recommendation> {
  const { object } = await generateObject({
    model:  aiSdkAnthropic(MODELS.SYNTHESIS),
    schema: RecommendationSchema,
    messages: [{
      role:    'user',
      content: `You are producing the final strategic recommendation for a person who has shared their full context.

PERSON SUMMARY:
${summary}

STRATEGIC ANALYSIS:
${analysis}

RULES — you must follow these precisely:
1. Recommend EXACTLY ONE path. Not two. Not "it depends." ONE.
2. Every claim must reference specific details from the summary above.
3. Do not hedge with words like "might", "could consider", "perhaps". Be definitive.
4. The risks and assumptions must be honest, not reassuring.
5. whatWouldMakeThisWrong must genuinely challenge your recommendation.

Produce the recommendation now.`,
    }],
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', effort: 'high' },
      },
    },
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
  context:   DiscoveryContext,
  sessionId: string,
): Promise<Recommendation> {
  const log = logger.child({ module: 'SynthesisEngine', sessionId });

  log.debug('Starting synthesis step 1: summarise context');
  const summary  = await summariseContext(context);

  log.debug('Starting synthesis step 2: eliminate alternatives');
  const analysis = await eliminateAlternatives(summary);

  log.debug('Starting synthesis step 3: generate structured recommendation');
  const recommendation = await synthesiseRecommendation(summary, analysis);

  log.debug('Synthesis complete');
  return recommendation;
}
