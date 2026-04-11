// src/lib/continuation/fork-to-recommendation.ts
//
// Pure helper that converts a picked ContinuationFork into the field
// shape the Recommendation Prisma model expects. No I/O, no LLM
// calls — the brief itself is already grounded in the founder's
// execution evidence, so the fork's own copy is the authoritative
// statement of the new direction.
//
// Used by the continuation/fork POST route to close the cycle by
// creating a new Recommendation row from the founder's pick.

import type { ContinuationBrief, ContinuationFork } from './brief-schema';

/**
 * The structured payload the route hands to prisma.recommendation.create.
 * Each field maps 1:1 to a column on the Recommendation model. Risks,
 * assumptions, and alternativeRejected are returned as TYPED arrays so
 * the route can wrap them in toJsonValue at write time.
 */
export interface ForkRecommendationPayload {
  summary:                string;
  path:                   string;
  reasoning:              string;
  firstThreeSteps:        string[];
  timeToFirstResult:      string;
  risks:                  Array<{ risk: string; mitigation: string }>;
  assumptions:            string[];
  whatWouldMakeThisWrong: string;
  alternativeRejected:    Array<{ alternative: string; whyNotForThem: string }>;
}

/**
 * Build the Recommendation payload from a picked fork plus the parent
 * brief (used to derive the rejected alternatives — the OTHER forks
 * the founder did not pick).
 *
 * The synthesis is intentionally deterministic so the cycle close is
 * fast and the founder lands on the new roadmap immediately. Any
 * judgement calls about the path itself were already made by the
 * Opus brief generator that produced the fork.
 */
export function buildForkRecommendationPayload(input: {
  fork:  ContinuationFork;
  brief: ContinuationBrief;
}): ForkRecommendationPayload {
  const { fork, brief } = input;

  const summary = `${fork.title}. ${fork.rationale} The first move is: ${fork.firstStep}.`;

  const assumptions = [
    'Your continuation brief correctly read the execution evidence from the prior roadmap.',
    `The "${fork.title}" fork is the right next direction for your situation right now.`,
  ];

  const risks = [
    {
      risk:       'The fork builds on the prior roadmap\'s evidence — if that evidence was misleading, this direction inherits the same flaw.',
      mitigation: 'Re-evaluate after the first concrete step of this roadmap. If the early signal contradicts the brief, push back on the new recommendation directly.',
    },
  ];

  const alternativeRejected = brief.forks
    .filter(f => f.id !== fork.id)
    .map(f => ({
      alternative:   f.title,
      whyNotForThem: `${f.rationale} Right if: ${f.rightIfCondition}. You picked a different direction this cycle.`,
    }));

  return {
    summary,
    path:                   fork.title,
    reasoning:              fork.rationale,
    firstThreeSteps:        [fork.firstStep],
    timeToFirstResult:      fork.timeEstimate,
    risks,
    assumptions,
    whatWouldMakeThisWrong: `This recommendation is wrong if: NOT (${fork.rightIfCondition}).`,
    alternativeRejected,
  };
}
