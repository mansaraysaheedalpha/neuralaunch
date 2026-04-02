// src/lib/discovery/question-selector.ts
import { DiscoveryContext, DiscoveryContextField } from './context-schema';
import { MIN_FIELD_CONFIDENCE } from './constants';

// ---------------------------------------------------------------------------
// Field importance weights
// Higher = more important to know before synthesis is reliable
// ---------------------------------------------------------------------------

const FIELD_WEIGHTS: Record<DiscoveryContextField, number> = {
  // ORIENTATION
  situation:            1.0, // foundational — everything else interprets through this
  background:           0.7,
  whatTriedBefore:      0.6,

  // GOAL_CLARITY
  primaryGoal:          1.0, // required — no goal, no recommendation
  successDefinition:    0.8,
  timeHorizon:          0.7,

  // CONSTRAINT_MAP
  availableTimePerWeek: 0.9, // critical for plan feasibility
  availableBudget:      0.8,
  teamSize:             0.7,
  technicalAbility:     0.9, // determines which solutions are viable
  geographicMarket:     0.5, // helpful but not blocking

  // CONVICTION
  commitmentLevel:      0.9, // changes what we recommend entirely
  biggestConcern:       0.7,
  whyNow:               0.6,
};

// ---------------------------------------------------------------------------
// Information gain scoring
// ---------------------------------------------------------------------------

/**
 * Scores a single field by how much we would gain from asking about it.
 *
 * Score = weight × (1 - current_confidence)
 * A field with high weight and low confidence gives the most gain.
 * A field we already know well (confidence ≥ threshold) scores 0.
 */
function fieldGainScore(field: DiscoveryContextField, context: DiscoveryContext): number {
  const current = context[field];
  if (current.confidence >= MIN_FIELD_CONFIDENCE) return 0; // already known
  return FIELD_WEIGHTS[field] * (1 - current.confidence);
}

// ---------------------------------------------------------------------------
// Public selector
// ---------------------------------------------------------------------------

/**
 * selectNextField
 *
 * Given the current belief state and a list of candidate fields (usually the
 * fields for the current interview phase), returns the field that maximises
 * expected information gain.
 *
 * Returns null if all candidate fields are already known above the confidence
 * threshold — signalling the phase is complete.
 *
 * This is a simplified implementation of the DEIG (Diagnostic Expected
 * Information Gain) principle from the research document.
 */
export function selectNextField(
  context:    DiscoveryContext,
  candidates: DiscoveryContextField[],
): DiscoveryContextField | null {
  let bestField: DiscoveryContextField | null = null;
  let bestScore = 0;

  for (const field of candidates) {
    const score = fieldGainScore(field, context);
    if (score > bestScore) {
      bestScore = score;
      bestField = field;
    }
  }

  return bestField; // null if all candidates are sufficiently known
}

/**
 * computeOverallCompleteness
 *
 * Returns a 0–1 score indicating how complete the belief state is,
 * weighted by field importance. Used by the assumption guard to decide
 * whether synthesis is premature.
 */
export function computeOverallCompleteness(context: DiscoveryContext): number {
  const fields = Object.keys(context) as DiscoveryContextField[];
  let weightedSum  = 0;
  let totalWeight  = 0;

  for (const field of fields) {
    const weight = FIELD_WEIGHTS[field];
    const confidence = context[field].confidence;
    weightedSum += weight * confidence;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}
