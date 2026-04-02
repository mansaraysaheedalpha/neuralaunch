// src/lib/discovery/assumption-guard.ts
import { DiscoveryContext, DiscoveryContextField } from './context-schema';
import {
  MIN_FIELD_CONFIDENCE,
  SYNTHESIS_READINESS_RATIO,
} from './constants';
import { computeOverallCompleteness } from './question-selector';

// ---------------------------------------------------------------------------
// Required fields — synthesis must not proceed without these
// ---------------------------------------------------------------------------

/**
 * Hard-required fields. If any of these are below MIN_FIELD_CONFIDENCE,
 * synthesis is blocked regardless of the overall completeness score.
 */
const REQUIRED_FIELDS: DiscoveryContextField[] = [
  'situation',
  'primaryGoal',
  'availableTimePerWeek',
  'technicalAbility',
  'commitmentLevel',
];

// ---------------------------------------------------------------------------
// Guard logic
// ---------------------------------------------------------------------------

export interface GuardResult {
  canProceed:     boolean;
  missingRequired: DiscoveryContextField[];
  completenessScore: number;
  reason:         string;
}

/**
 * canSynthesise
 *
 * Returns true when the belief state has enough verified information
 * to produce a reliable, non-assumption-based recommendation.
 *
 * Two conditions must both be true:
 * 1. All hard-required fields exceed MIN_FIELD_CONFIDENCE
 * 2. Overall weighted completeness exceeds SYNTHESIS_READINESS_RATIO
 */
export function canSynthesise(context: DiscoveryContext): boolean {
  return evaluate(context).canProceed;
}

/**
 * evaluate
 *
 * Detailed version of canSynthesise. Returns the full guard result
 * including which fields are missing and why synthesis is blocked.
 * Used by the API route to generate targeted follow-up questions.
 */
export function evaluate(context: DiscoveryContext): GuardResult {
  const missingRequired = REQUIRED_FIELDS.filter(
    (field) => context[field].confidence < MIN_FIELD_CONFIDENCE,
  );

  const completenessScore = computeOverallCompleteness(context);
  const meetsRatioThreshold = completenessScore >= SYNTHESIS_READINESS_RATIO;

  if (missingRequired.length > 0) {
    return {
      canProceed:        false,
      missingRequired,
      completenessScore,
      reason: `Required fields still unknown: ${missingRequired.join(', ')}`,
    };
  }

  if (!meetsRatioThreshold) {
    return {
      canProceed:        false,
      missingRequired:   [],
      completenessScore,
      reason: `Overall context completeness ${(completenessScore * 100).toFixed(0)}% below required ${(SYNTHESIS_READINESS_RATIO * 100).toFixed(0)}%`,
    };
  }

  return {
    canProceed:        true,
    missingRequired:   [],
    completenessScore,
    reason:            'Context is sufficiently complete for synthesis',
  };
}
