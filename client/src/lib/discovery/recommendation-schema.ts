// src/lib/discovery/recommendation-schema.ts
import { z } from 'zod';
import { RECOMMENDATION_TYPES } from './constants';

/**
 * RecommendationSchema
 *
 * The single output of the synthesis engine.
 * Enforces exactly one recommended path — no options, no hedging.
 * Persisted to the Recommendation Prisma model.
 */
export const RecommendationSchema = z.object({
  /**
   * Committed upfront summary — 2-3 plain sentences stating what the recommendation is,
   * why it fits this person specifically, and what the first move is.
   * Full conclusion upfront. A busy reader who reads only this leaves knowing exactly what to do.
   */
  summary: z.string().describe(
    '2-3 plain sentences: what the recommendation is, why it fits this specific person, and what their first move is. Full conclusion upfront — no hedging, no teaser. Someone who reads only this must leave knowing exactly what to do.'
  ),

  /**
   * Action shape of the recommendation. Used by the UI to decide which
   * downstream tools (validation page, MVP builder, etc.) to surface.
   * Set independently of who the founder is — see RECOMMENDATION_TYPES.
   */
  recommendationType: z.enum([
    RECOMMENDATION_TYPES.BUILD_SOFTWARE,
    RECOMMENDATION_TYPES.BUILD_SERVICE,
    RECOMMENDATION_TYPES.SALES_MOTION,
    RECOMMENDATION_TYPES.PROCESS_CHANGE,
    RECOMMENDATION_TYPES.HIRE_OR_OUTSOURCE,
    RECOMMENDATION_TYPES.FURTHER_RESEARCH,
    RECOMMENDATION_TYPES.OTHER,
  ]).describe(
    'Classify the action shape of this recommendation:\n' +
    '- build_software: founder needs to build a software product (the canonical Phase 3/4/5 path)\n' +
    '- build_service: productized service or consulting offer, may not include software\n' +
    '- sales_motion: founder already has a product, the bottleneck is sales/outreach\n' +
    '- process_change: behavioural or operational fix, no software, no new product\n' +
    '- hire_or_outsource: bottleneck is capacity not strategy\n' +
    '- further_research: founder needs more data before any commitment\n' +
    '- other: anything that does not fit the above\n' +
    'Pick the single best fit. Do not pick build_software unless the recommendation actually involves building a new software product the founder has not yet built.'
  ),

  /** The one recommended path — a short, declarative statement */
  // Claude's structured output rejects min/max constraints on numbers and arrays —
  // lengths and ranges are enforced via the prompt descriptions instead.
  path: z.string().describe(
    'The single recommended direction in one or two sentences. Declarative, not hedged.'
  ),

  /** Why this recommendation fits this specific person with their specific constraints */
  reasoning: z.string().describe(
    'Detailed explanation of why this path fits this person. Must reference specific details from their context. At least 2–3 sentences.'
  ),

  /** The first concrete, actionable steps — sequenced correctly */
  firstThreeSteps: z.array(z.string()).describe(
    '2 to 4 steps. Simpler recommendations may need only 2. Complex ones may need 4. Each step must be specific and achievable within the user constraints. Do NOT pad to a fixed number — only include steps that are genuinely distinct and necessary.'
  ),

  /** Honest, realistic timeline to first tangible result */
  timeToFirstResult: z.string().describe(
    'Realistic timeline to something real and visible, given their available time and resources.'
  ),

  /** Key risks the user should know about, with mitigations */
  risks: z.array(
    z.object({
      risk:        z.string().describe('The risk'),
      mitigation:  z.string().describe('How to reduce or manage it'),
    })
  ).describe('2 to 5 risks with mitigations. The number should reflect the actual complexity — a simple service recommendation might have 2 real risks, a build_software recommendation might have 5. Do NOT always produce exactly 4.'),

  /**
   * Explicit assumptions the recommendation rests on.
   * If any are wrong, the recommendation may not apply.
   */
  assumptions: z.array(z.string()).describe('2 to 6 assumptions this recommendation depends on. Include only assumptions that are genuinely load-bearing — things that, if wrong, would change the recommendation. Do NOT pad to a fixed number.'),

  /**
   * What would make this recommendation wrong.
   * Honesty about edge cases prevents blind trust.
   */
  whatWouldMakeThisWrong: z.string().describe('What circumstances would invalidate this recommendation'),

  /**
   * The main alternative considered and why it was rejected for this person.
   * Validates that the system thought through the space — not just pattern-matched.
   */
  /**
   * Alternatives considered and rejected for this specific person.
   * Validates that the system explored the decision space, not just
   * pattern-matched. Must include at least 1, ideally 2. Each
   * alternative should be a genuinely plausible path that was
   * eliminated for specific reasons tied to this founder's context.
   */
  alternativeRejected: z.array(
    z.object({
      alternative:   z.string().describe('The alternative path that was considered'),
      whyNotForThem: z.string().describe('Why it does not fit this specific person'),
    }),
  ).describe('1 to 3 alternatives considered and rejected. At least 1 is required; 2 is preferred. Each must be a genuinely plausible direction that was eliminated for reasons specific to this founder.'),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

/**
 * Normalize the alternativeRejected field from JSONB. Before the
 * schema change it was a single object; after, it's an array.
 * Old rows in the database still have the single-object shape.
 * This helper safely handles both and always returns an array.
 */
export type AlternativeRejected = { alternative: string; whyNotForThem: string };

export function safeParseAlternatives(value: unknown): AlternativeRejected[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter(
      (v): v is AlternativeRejected =>
        typeof v === 'object' && v !== null && 'alternative' in v && 'whyNotForThem' in v,
    );
  }
  // Old single-object shape
  if (typeof value === 'object' && 'alternative' in value && 'whyNotForThem' in value) {
    return [value as AlternativeRejected];
  }
  return [];
}
