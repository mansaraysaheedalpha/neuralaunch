// src/lib/discovery/assumption-guard.ts
import { DiscoveryContext, DiscoveryContextField } from './context-schema';
import { SYNTHESIS_READINESS_RATIO } from './constants';
import { computeOverallCompleteness, FIELD_WEIGHTS } from './question-selector';

// ---------------------------------------------------------------------------
// Synthesis gate — two-condition check
// ---------------------------------------------------------------------------

/**
 * The minimum field weight that counts as "critical." Fields at or
 * above this weight cannot be at zero confidence when synthesis fires
 * — even if the overall completeness ratio is met.
 *
 * With the current weight map (0.5 to 1.0), this threshold captures:
 *   situation (1.0), primaryGoal (1.0), availableTimePerWeek (0.9),
 *   technicalAbility (0.9), commitmentLevel (0.9),
 *   successDefinition (0.8), availableBudget (0.8)
 *
 * Fields below this threshold (background 0.7, whatTriedBefore 0.6,
 * timeHorizon 0.7, teamSize 0.7, geographicMarket 0.5,
 * biggestConcern 0.7, whyNow 0.6) are "nice to know" — they improve
 * recommendation quality but their absence is not a critical blind
 * spot.
 *
 * EVALUATION FINDING: The original gate only checked 5 hard-required
 * fields and a 0.65 ratio. With multi-field extraction, a rich first
 * message pushes completeness to ~0.5 after one turn, and by question
 * 8-9 the ratio crosses 0.65 — but a critical field like
 * availableBudget could still be at 0. The engine would synthesise
 * with a critical blind spot.
 *
 * The fix: the ratio is necessary but not sufficient. No field with
 * weight >= CRITICAL_WEIGHT_THRESHOLD can be at zero confidence.
 */
const CRITICAL_WEIGHT_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Guard logic
// ---------------------------------------------------------------------------

export interface GuardResult {
  canProceed:         boolean;
  missingCritical:    DiscoveryContextField[];
  completenessScore:  number;
  reason:             string;
}

/**
 * canSynthesise
 *
 * Returns true when the belief state has enough verified information
 * to produce a reliable recommendation.
 *
 * Two conditions must BOTH be true:
 *
 * 1. Overall weighted completeness exceeds SYNTHESIS_READINESS_RATIO
 *    (currently 0.65). This ensures broad coverage — the engine has
 *    gathered enough context across all dimensions.
 *
 * 2. No critical field (weight >= 0.8) has zero confidence. This
 *    ensures no critical blind spot — the engine cannot synthesise
 *    while a high-weight field is completely unknown. A field at
 *    confidence 0.3 (weakly implied) passes; a field at 0 (never
 *    mentioned) does not.
 *
 * The combination means:
 * - A rich first message that covers 6 fields at 0.7+ can push the
 *   ratio to 0.65 by question 7-8 AND will have populated the
 *   critical fields → synthesis fires early (dynamic count DOWN).
 * - A vague first message that covers 1 field means the ratio stays
 *   low AND critical fields are at 0 → synthesis doesn't fire until
 *   question 12-15 (dynamic count UP).
 * - A session where the founder gave everything EXCEPT their budget
 *   will NOT synthesise (budget weight=0.8, confidence=0) even if
 *   the ratio is 0.75 → the engine asks one more question instead
 *   of guessing.
 */
export function canSynthesise(context: DiscoveryContext): boolean {
  return evaluate(context).canProceed;
}

/**
 * evaluate
 *
 * Detailed version of canSynthesise. Returns the full guard result
 * including which fields are missing and why synthesis is blocked.
 */
export function evaluate(context: DiscoveryContext): GuardResult {
  const completenessScore = computeOverallCompleteness(context);
  const meetsRatioThreshold = completenessScore >= SYNTHESIS_READINESS_RATIO;

  // Find critical fields (weight >= 0.8) that are completely unknown
  // (confidence === 0). Fields with even weak confidence (0.3) pass
  // — the engine inferred something from the conversation, it's not
  // a total blind spot.
  const missingCritical: DiscoveryContextField[] = [];
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    if (weight >= CRITICAL_WEIGHT_THRESHOLD) {
      const confidence = context[field as DiscoveryContextField].confidence;
      if (confidence === 0) {
        missingCritical.push(field as DiscoveryContextField);
      }
    }
  }

  if (missingCritical.length > 0) {
    return {
      canProceed:        false,
      missingCritical,
      completenessScore,
      reason: `Critical fields at zero confidence: ${missingCritical.join(', ')}`,
    };
  }

  if (!meetsRatioThreshold) {
    return {
      canProceed:        false,
      missingCritical:   [],
      completenessScore,
      reason: `Overall context completeness ${(completenessScore * 100).toFixed(0)}% below required ${(SYNTHESIS_READINESS_RATIO * 100).toFixed(0)}%`,
    };
  }

  return {
    canProceed:        true,
    missingCritical:   [],
    completenessScore,
    reason:            'Context is sufficiently complete for synthesis',
  };
}
