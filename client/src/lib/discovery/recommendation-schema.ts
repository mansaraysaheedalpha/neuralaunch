// src/lib/discovery/recommendation-schema.ts
import { z } from 'zod';

/**
 * RecommendationSchema
 *
 * The single output of the synthesis engine.
 * Enforces exactly one recommended path — no options, no hedging.
 * Persisted to the Recommendation Prisma model.
 */
export const RecommendationSchema = z.object({
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

  /** The first 3 concrete, actionable steps — sequenced correctly */
  firstThreeSteps: z.array(z.string()).describe(
    'Exactly 3 steps. Each step must be specific and achievable within the user constraints.'
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
  ).describe('1 to 4 risks with mitigations'),

  /**
   * Explicit assumptions the recommendation rests on.
   * If any are wrong, the recommendation may not apply.
   */
  assumptions: z.array(z.string()).describe('1 to 5 assumptions this recommendation depends on'),

  /**
   * What would make this recommendation wrong.
   * Honesty about edge cases prevents blind trust.
   */
  whatWouldMakeThisWrong: z.string().describe('What circumstances would invalidate this recommendation'),

  /**
   * The main alternative considered and why it was rejected for this person.
   * Validates that the system thought through the space — not just pattern-matched.
   */
  alternativeRejected: z.object({
    alternative: z.string(),
    whyNotForThem: z.string(),
  }),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;
