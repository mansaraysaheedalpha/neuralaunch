import { z } from 'zod';
import { RECOMMENDATION_TYPES } from '@neuralaunch/constants';

/**
 * Per-step shape on RecommendationSchema.firstThreeSteps. The field
 * accepts either a legacy bare string (every Recommendation written
 * before PR 16-data) or a structured object carrying optional
 * time + tool meta. Read via {@link normalizeRecommendationSteps}
 * so every UI / engine consumer reads one canonical shape.
 *
 * estimate / tool are kept .optional() (no .min/.max) so the
 * Anthropic structured-output validator never trips on length
 * constraints — see CLAUDE.md.
 */
export const RecommendationStepObjectSchema = z.object({
  text:     z.string().describe('The concrete action the founder takes for this step. Specific and achievable.'),
  estimate: z.string().optional().describe('Rough time estimate — "30 minutes", "1 hour", "1 weekend". Omit when honestly unknown.'),
  tool:     z.string().optional().describe('A specific tool, doc, or surface the founder will use — "Cal.com", "Notion", "the validation page tool". Omit when the step is tool-agnostic.'),
});

export type RecommendationStepObject = z.infer<typeof RecommendationStepObjectSchema>;

export const RecommendationStepSchema = z.union([
  z.string(),
  RecommendationStepObjectSchema,
]);

export type RecommendationStep = z.infer<typeof RecommendationStepSchema>;

/**
 * Canonical normalised step shape — what every UI / engine consumer
 * should read. Legacy strings become {text}; structured objects pass
 * through.
 */
export interface NormalizedRecommendationStep {
  text:      string;
  estimate?: string;
  tool?:     string;
}

export function normalizeRecommendationSteps(
  steps: readonly RecommendationStep[] | null | undefined,
): NormalizedRecommendationStep[] {
  if (!steps) return [];
  return steps.map((s) => (typeof s === 'string' ? { text: s } : { ...s }));
}

/**
 * Convenience: read a Recommendation's steps as plain strings — what
 * legacy consumers expected. Equivalent to
 * `normalizeRecommendationSteps(r.firstThreeSteps).map(s => s.text)`.
 */
export function recommendationStepTexts(
  steps: readonly RecommendationStep[] | null | undefined,
): string[] {
  return normalizeRecommendationSteps(steps).map((s) => s.text);
}

/**
 * RecommendationSchema — the single output of the discovery synthesis
 * engine. Enforces exactly one recommended path, no options, no
 * hedging. Persisted to the Recommendation Prisma model on the
 * client and rendered by both client and mobile recommendation
 * surfaces.
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

  /**
   * Confidence in this recommendation — how strongly the synthesis
   * stands behind it. high = clear signal from belief state + skill
   * profile + opportunity evidence; medium = decent signal with one
   * or two gaps; low = inferential, the founder should hold it
   * loosely and test it. Reveal renders this as a stamp; absence
   * renders as neutral (legacy rows). Added in PR 16-data.
   */
  confidence: z.enum(['high', 'medium', 'low']).optional().describe(
    'Your confidence in this recommendation, from the synthesis evidence:\n' +
    '- high: belief state, skill profile, and opportunity evidence all converge clearly on this path; the founder has the means and the demand signal is strong.\n' +
    '- medium: the path is the best fit but one or two pieces (skill gap, thin Layer B signal, time constraint) leave room for it to wobble.\n' +
    '- low: the path is inferential — the founder should hold it loosely and test it before committing further.\n' +
    'Pick exactly one. Omit only if you genuinely cannot tell.'
  ),

  /** The first concrete, actionable steps — sequenced correctly */
  firstThreeSteps: z.array(RecommendationStepSchema).describe(
    '2 to 4 steps. Simpler recommendations may need only 2. Complex ones may need 4. ' +
    'Each step is an object: { text, estimate?, tool? }. ' +
    'text is the action (specific, achievable within constraints). ' +
    'estimate is a rough time figure like "30 minutes" or "1 weekend" — include when honestly known, omit when it would be guesswork. ' +
    'tool is the specific surface or doc the founder will use ("Cal.com", "the validation page tool", "Notion") — include when there is a concrete one, omit when the step is tool-agnostic. ' +
    'Do NOT pad to a fixed number — only include steps that are genuinely distinct and necessary. ' +
    'Legacy strings are accepted on read but you MUST emit the object shape.'
  ),

  /** Honest, realistic timeline to first tangible result */
  timeToFirstResult: z.string().describe(
    'Realistic timeline to something real and visible, given their available time and resources.'
  ),

  /** Key risks the user should know about, with mitigations and per-risk severity */
  risks: z.array(
    z.object({
      risk:        z.string().describe('The risk'),
      mitigation:  z.string().describe('How to reduce or manage it'),
      /**
       * Severity of this specific risk. high = could end the venture
       * or burn the founder's runway; medium = costs weeks but
       * survivable; low = manageable annoyance. Reveal renders a
       * colour-coded marker; absence renders neutral (legacy rows).
       * Added in PR 16-data.
       */
      severity:    z.enum(['high', 'medium', 'low']).optional().describe(
        'How serious this risk is if it materialises: high = could end the venture or burn runway; medium = costs weeks but survivable; low = manageable annoyance. Pick one. Omit only if genuinely unsure.'
      ),
    })
  ).describe('2 to 5 risks with mitigations and a severity tag on each. The number should reflect the actual complexity — a simple service recommendation might have 2 real risks, a build_software recommendation might have 5. Do NOT always produce exactly 4. Order from highest severity to lowest where you can.'),

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
