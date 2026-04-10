// src/lib/discovery/question-selector.ts
import { DiscoveryContext, DiscoveryContextField } from './context-schema';
import { AudienceType, MIN_FIELD_CONFIDENCE } from './constants';

// ---------------------------------------------------------------------------
// Field importance weights
// Higher = more important to know before synthesis is reliable
// ---------------------------------------------------------------------------

export const FIELD_WEIGHTS: Record<DiscoveryContextField, number> = {
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

// Per-audience-type field importance multipliers.
// Boosts fields that are most diagnostic for each audience type.
const AUDIENCE_FIELD_BOOST: Partial<Record<AudienceType, Partial<Record<DiscoveryContextField, number>>>> = {
  LOST_GRADUATE: {
    background:      1.4,
    primaryGoal:     1.3,
    commitmentLevel: 1.2,
  },
  STUCK_FOUNDER: {
    whatTriedBefore: 1.5,
    commitmentLevel: 1.4,
    whyNow:          1.3,
    biggestConcern:  1.2,
  },
  ESTABLISHED_OWNER: {
    availableBudget:  1.4,
    teamSize:         1.3,
    geographicMarket: 1.2,
  },
  ASPIRING_BUILDER: {
    technicalAbility:     1.3,
    availableTimePerWeek: 1.2,
  },
  MID_JOURNEY_PROFESSIONAL: {
    availableTimePerWeek: 1.5,
    commitmentLevel:      1.4,
    availableBudget:      1.2,
  },
};

// ---------------------------------------------------------------------------
// Information gain scoring
// ---------------------------------------------------------------------------

/**
 * Scores a single field by how much we would gain from asking about it.
 *
 * Score = weight × audience_boost × (1 - current_confidence)
 * A field with high weight and low confidence gives the most gain.
 * A field we already know well (confidence ≥ threshold) scores 0.
 */
function fieldGainScore(
  field:        DiscoveryContextField,
  context:      DiscoveryContext,
  audienceType?: AudienceType,
): number {
  const current = context[field];
  if (current.confidence >= MIN_FIELD_CONFIDENCE) return 0; // already known
  const boost = audienceType ? (AUDIENCE_FIELD_BOOST[audienceType]?.[field] ?? 1.0) : 1.0;
  return FIELD_WEIGHTS[field] * boost * (1 - current.confidence);
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
  context:       DiscoveryContext,
  candidates:    DiscoveryContextField[],
  audienceType?: AudienceType,
): DiscoveryContextField | null {
  let bestField: DiscoveryContextField | null = null;
  let bestScore = 0;

  for (const field of candidates) {
    const score = fieldGainScore(field, context, audienceType);
    if (score > bestScore) {
      bestScore = score;
      bestField = field;
    }
  }

  return bestField; // null if all candidates are sufficiently known
}

// ---------------------------------------------------------------------------
// Pricing change detection
// ---------------------------------------------------------------------------

const PRICING_CHANGE_PATTERNS = [
  // Price level changes: "I lowered/raised/dropped/reduced/increased my prices/rates/fees"
  /\b(lowered|raised|dropped|cut|reduced|increased|halved)\b.{0,40}\b(price|prices|rate|rates|fee|fees|charge|charges)\b/i,
  // "I changed / adjusted what I charge"
  /\b(changed|adjusted|tweaked)\b.{0,30}\b(pric|rate|fee|what.{0,10}charg)/i,
  // Experimented with pricing
  /\btried.{0,30}\b(different.{0,15}price|pric|charg|rate)/i,
  // Promotion / discount experiments (time-bound)
  /\b(ran|offered|did|tried)\b.{0,20}\b(discount|promotion|promo|sale|deal)\b/i,
  // Model switch: "switched from hourly to fixed", "moved to a retainer"
  /\bswitched?.{0,30}\b(hourly|monthly|fixed|per.session|retainer|subscription|flat.rate)\b/i,
  // "started charging" — implies a shift from prior state
  /\b(started|began)\b.{0,20}\bcharging\b/i,
];

/**
 * detectsPricingChange
 *
 * Returns true when a user message signals a historical pricing experiment:
 * a past price change, model switch, promotion, or discount trial.
 * Does NOT trigger on simple statements of current price ("I charge $30/month").
 */
export function detectsPricingChange(message: string): boolean {
  return PRICING_CHANGE_PATTERNS.some(p => p.test(message));
}

// ---------------------------------------------------------------------------
// Psychological blocker detection
// ---------------------------------------------------------------------------

const PSYCH_BLOCKER_PATTERNS = [
  /\babandon/i,    /\bgave up\b/i,   /\bgive up\b/i, /\bnever finish/i,
  /\bdisciplin/i,  /\bprocrastinat/i, /\bdistract/i,
  /\bafraid\b/i,   /\bscared\b/i,    /\bimposter/i,
  /\bdon.t know if i can\b/i,         /\bnot sure (if )?(i.m|i am)\b/i,
  /\bkeep (starting|stopping|quitting)\b/i,
  /\bwon.t (sell|talk to|reach out)\b/i,
];

/**
 * detectsPsychBlocker
 *
 * Returns true when extracted context signals a motivational or psychological
 * barrier — not just a practical one. Triggers injection of one psych probe
 * question into the interview flow.
 */
export function detectsPsychBlocker(context: DiscoveryContext): boolean {
  const probeFields: DiscoveryContextField[] = [
    'situation', 'whatTriedBefore', 'biggestConcern', 'commitmentLevel', 'whyNow',
  ];
  const combined = probeFields
    .map(f => {
      const v = context[f].value;
      return typeof v === 'string' ? v : Array.isArray(v) ? v.join(' ') : '';
    })
    .join(' ');
  return PSYCH_BLOCKER_PATTERNS.some(p => p.test(combined));
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
