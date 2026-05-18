// src/lib/ideation/stage4-opportunities/aggregate.ts
//
// Deterministic Layer B aggregate-signal computation + chosen-#1
// ranker. Pure functions over CommunityResponse[] / OpportunityEvaluation[].
// No LLM calls; lives in state-machine territory.

import 'server-only';
import type {
  CommunityResponse,
  LayerBExtractedSignal,
  OpportunityEvaluation,
} from './schema';
import type { ValidationStrength } from '@neuralaunch/constants';

// ---------------------------------------------------------------------------
// validationStrength ladder constants (named to match the rule in the
// docstring; centralising lets the test pin them)
// ---------------------------------------------------------------------------

const STRONG_MIN_POSITIVE         = 3;
const STRONG_POSITIVE_OVER_NEG_X  = 2;
const WEAK_TOTAL_THRESHOLD        = 3;
const MAX_KEY_QUOTES_AGGREGATE    = 12;
const MAX_CONTRADICTIONS_AGGREGATE = 8;

// ---------------------------------------------------------------------------
// Aggregate signal computation
// ---------------------------------------------------------------------------

/**
 * Compute the aggregate Layer B signal for one opportunity from its
 * linked CommunityResponses. Returns null when no responses produce
 * usable signal.
 *
 * validationStrength rule (deterministic ladder, walked top-down):
 *   - contradictory: negative > positive AND contradictions exist
 *   - strong:        positive >= STRONG_MIN_POSITIVE (3) AND
 *                    positive >= STRONG_POSITIVE_OVER_NEG_X (2)× negative
 *   - weak:          total signal count < WEAK_TOTAL_THRESHOLD (3)
 *   - mixed:         everything else
 *
 * Text-paste responses count as one neutral signal each — the founder
 * bothered to capture it, but it doesn't carry per-comment sentiment.
 */
export function computeAggregateSignal(
  responsesForOpp: ReadonlyArray<CommunityResponse>,
): LayerBExtractedSignal | null {
  let positive = 0, neutral = 0, negative = 0;
  const keyQuotes:            string[] = [];
  const contradictionsRaised: string[] = [];

  for (const r of responsesForOpp) {
    if (r.source === 'screenshot' && r.extractedSignal) {
      for (const c of r.extractedSignal.comments) {
        if (c.sentiment === 'positive')      positive++;
        else if (c.sentiment === 'negative') negative++;
        else                                  neutral++;
      }
      keyQuotes.push(...r.extractedSignal.keyQuotes);
      contradictionsRaised.push(...r.extractedSignal.contradictionsToPain);
    } else if (r.source === 'text_paste' && r.pastedText) {
      neutral++;
    }
  }

  const total = positive + neutral + negative;
  if (total === 0) return null;

  let validationStrength: ValidationStrength;
  if (negative > positive && contradictionsRaised.length > 0) {
    validationStrength = 'contradictory';
  } else if (positive >= STRONG_MIN_POSITIVE && positive >= STRONG_POSITIVE_OVER_NEG_X * negative) {
    validationStrength = 'strong';
  } else if (total < WEAK_TOTAL_THRESHOLD) {
    validationStrength = 'weak';
  } else {
    validationStrength = 'mixed';
  }

  return {
    validationStrength,
    keyQuotes:           keyQuotes.slice(0, MAX_KEY_QUOTES_AGGREGATE),
    sentimentBreakdown:  { positive, neutral, negative },
    contradictionsRaised: contradictionsRaised.slice(0, MAX_CONTRADICTIONS_AGGREGATE),
  };
}

// ---------------------------------------------------------------------------
// Chosen-#1 selection
// ---------------------------------------------------------------------------

/**
 * Opportunities the chosen-#1 ranker considers — evaluated AND not
 * founder-rejected.
 */
export function evaluatedNotRejected(opps: ReadonlyArray<OpportunityEvaluation>): OpportunityEvaluation[] {
  return opps.filter(
    o => o.status === 'evaluated' && o.founderVerdict !== null && o.founderVerdict !== 'drop',
  );
}

/**
 * Deterministic chosen-#1 ranker. Higher rank wins.
 *
 *   founderVerdict='pursue'              → +1000
 *   founderVerdict='pursue_with_caveats' → +500
 *   agentVerdict matches founderVerdict  → +100   (alignment signal)
 *   validationStrength='strong'          → +50
 *   validationStrength='mixed'           → +20
 *   validationStrength='weak'            → +5
 *   validationStrength='contradictory'   → -30
 *
 * First-seen order is the final tiebreaker (stable sort).
 */
export function pickChosenOpportunity(opps: ReadonlyArray<OpportunityEvaluation>): OpportunityEvaluation | null {
  const candidates = evaluatedNotRejected(opps);
  if (candidates.length === 0) return null;

  const rank = (o: OpportunityEvaluation): number => {
    let r = 0;
    if (o.founderVerdict === 'pursue')                  r += 1000;
    else if (o.founderVerdict === 'pursue_with_caveats') r += 500;
    if (o.agentVerdict === o.founderVerdict)             r += 100;
    const strength = o.layerBExtractedSignal?.validationStrength;
    if      (strength === 'strong')         r += 50;
    else if (strength === 'mixed')          r += 20;
    else if (strength === 'weak')           r += 5;
    else if (strength === 'contradictory')  r -= 30;
    return r;
  };

  return [...candidates].sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------

export const __testInternals = {
  STRONG_MIN_POSITIVE,
  STRONG_POSITIVE_OVER_NEG_X,
  WEAK_TOTAL_THRESHOLD,
};
