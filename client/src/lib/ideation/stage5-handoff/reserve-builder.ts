// src/lib/ideation/stage5-handoff/reserve-builder.ts
//
// Pure function: builds the bounded reserve-opportunity array from
// Stage 4's non-chosen opportunities. Output lands on both
// Stage5HandoffDocument.reserveOpportunities AND
// Recommendation.ideationReserveOpportunities (mirror columns — the
// JSONB on Recommendation is what the continuation brief reads).
//
// Ranking is INDEPENDENT of pickChosenOpportunity (Stage 4's ranker)
// because the concerns differ:
//   - pickChosenOpportunity picks the #1 to ADVANCE to Stage 5
//   - this picks the order to SURFACE as forks if downstream
//     validation fails
//
// Heuristic: prefer reserves with positive signal the founder
// hasn't explicitly rejected — those are the freshest pivot
// candidates. Founder-rejected reserves are still included (they
// document the founder's decision history; the continuation brief
// frames them appropriately) but they rank lowest.

import 'server-only';
import type { OpportunityEvaluation } from '../stage4-opportunities/schema';
import type { ReserveOpportunity } from './schema';
import { MAX_RESERVE_OPPORTUNITIES } from './constants';

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Rank a Stage 4 OpportunityEvaluation as a reserve fork candidate.
 * Higher rank = surface earlier in the continuation brief.
 *
 *   founderVerdict='pursue'              → +1000
 *   founderVerdict='pursue_with_caveats' → +500
 *   founderVerdict=null                  → +200  (no founder signal; treat as neutral)
 *   founderVerdict='drop'                → -500  (founder explicitly rejected)
 *   agentVerdict='pursue' agreement      → +100
 *   layerB strong                        → +50
 *   layerB mixed                         → +20
 *   layerB weak                          → +5
 *   layerB contradictory                 → -30
 */
function rankReserveCandidate(o: OpportunityEvaluation): number {
  let r = 0;
  if      (o.founderVerdict === 'pursue')              r += 1000;
  else if (o.founderVerdict === 'pursue_with_caveats') r += 500;
  else if (o.founderVerdict === null)                  r += 200;
  else if (o.founderVerdict === 'drop')                r -= 500;
  if (o.agentVerdict === 'pursue' && o.founderVerdict === 'pursue') r += 100;
  const strength = o.layerBExtractedSignal?.validationStrength;
  if      (strength === 'strong')        r += 50;
  else if (strength === 'mixed')         r += 20;
  else if (strength === 'weak')          r += 5;
  else if (strength === 'contradictory') r -= 30;
  return r;
}

// ---------------------------------------------------------------------------
// Reserve-snapshot construction
// ---------------------------------------------------------------------------

/**
 * Compress a Stage 4 OpportunityEvaluation into the denormalised
 * ReserveOpportunity shape persisted on the artifact. The continuation
 * brief reads this without re-loading Stage 4 — keep the fields
 * decision-relevant + bounded.
 */
function snapshotOpportunityAsReserve(
  o:    OpportunityEvaluation,
  rank: number,
): ReserveOpportunity {
  return {
    id:               o.id,
    painPointSummary: o.painPointSummary,
    agentVerdict:     o.agentVerdict,
    founderVerdict:   o.founderVerdict,
    agentReasoning:   o.agentReasoning,
    layerASummary:    o.layerAResearch && {
      marketReality:  { reasoning: o.layerAResearch.marketReality.reasoning,  confidence: o.layerAResearch.marketReality.confidence },
      customerAccess: { reasoning: o.layerAResearch.customerAccess.reasoning, confidence: o.layerAResearch.customerAccess.confidence },
      willPeoplePay:  { reasoning: o.layerAResearch.willPeoplePay.reasoning,  confidence: o.layerAResearch.willPeoplePay.confidence },
      marketSize:     { reasoning: o.layerAResearch.marketSize.reasoning,     confidence: o.layerAResearch.marketSize.confidence },
    },
    layerBSummary:    o.layerBExtractedSignal,
    rank,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Build the bounded reserve-opportunity array from the Stage 4
 * opportunities. Output is at most MAX_RESERVE_OPPORTUNITIES entries,
 * ranked by the reserve-fork heuristic (NOT the chosen-#1 ranker).
 *
 *   - filters out the chosen opportunity
 *   - ranks the remainder
 *   - assigns positional rank (1 = top reserve)
 *   - caps at MAX_RESERVE_OPPORTUNITIES (4)
 *
 * Empty input → empty output. Single-opportunity input (chosen only)
 * → empty output. Both are valid runtime states.
 */
export function buildReserveOpportunities(
  allOpportunities:    ReadonlyArray<OpportunityEvaluation>,
  chosenOpportunityId: string,
): ReserveOpportunity[] {
  const nonChosen = allOpportunities.filter(o => o.id !== chosenOpportunityId);
  if (nonChosen.length === 0) return [];

  // Sort by reserve-fork rank descending; tie-break on Stage 4's
  // original first-seen order (preserved by the filter above).
  const ranked = [...nonChosen]
    .map((o, idx) => ({ opp: o, score: rankReserveCandidate(o), seen: idx }))
    .sort((a, b) => (b.score - a.score) || (a.seen - b.seen))
    .slice(0, MAX_RESERVE_OPPORTUNITIES);

  return ranked.map(({ opp }, i) => snapshotOpportunityAsReserve(opp, i + 1));
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------

export const __testInternals = {
  rankReserveCandidate,
  snapshotOpportunityAsReserve,
};
