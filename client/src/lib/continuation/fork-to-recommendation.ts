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

import 'server-only';
import prisma, { toJsonValue } from '@/lib/prisma';
import { buildPhaseContext, PHASES } from '@/lib/phase-context';
import { createNextCycleForVenture } from '@/lib/lifecycle';
import { CONTINUATION_STATUSES } from './constants';
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

/**
 * Persist the fork-derived Recommendation and atomically link it
 * back to the parent roadmap (continuationStatus → FORK_SELECTED,
 * forkRecommendationId → new rec id). Single Prisma transaction so
 * the linkage and the status flip commit together. The unique
 * constraint on Roadmap.forkRecommendationId guards against
 * concurrent double-creates at the database level — a racing
 * second call surfaces as a Prisma unique-constraint error which
 * the route's outer try/catch maps to a 5xx and the founder's
 * client retry hits the idempotent re-fire path on the next call.
 *
 * Extracted from the route handler so the route stays under the
 * 150-line cap and the persistence shape is unit-testable in
 * isolation from the HTTP plumbing.
 */
export async function persistForkRecommendation(input: {
  parentRoadmapId:    string;
  parentRecommendationId: string;
  parentSessionId:        string;
  parentRecommendationType: string | null;
  userId:             string;
  payload:            ForkRecommendationPayload;
}): Promise<{ newRecommendationId: string; newCycleId: string | null }> {
  const result = await prisma.$transaction(async (tx) => {
    // Look up the parent recommendation's cycle so the next cycle
    // lands in the same venture. A parent without a cycleId is a
    // legacy recommendation from before the venture/cycle wiring
    // shipped; we still accept the fork pick and create the new
    // recommendation, but skip cycle creation so legacy data
    // continues to flow without the continuation chain hard-depending
    // on retrofitted columns.
    const parent = await tx.recommendation.findUnique({
      where:  { id: input.parentRecommendationId },
      select: { cycleId: true, cycle: { select: { ventureId: true } } },
    });

    let newCycleId: string | null = null;
    if (parent?.cycle?.ventureId) {
      const next = await createNextCycleForVenture(tx, parent.cycle.ventureId);
      newCycleId = next.cycleId;
    }

    // Clone a fresh DiscoverySession for the fork-derived Recommendation.
    //
    // Recommendation.sessionId is @unique (one Recommendation per
    // DiscoverySession by design — it models the interview-→-result
    // pairing). Reusing the parent's sessionId here would collide with
    // the parent Recommendation's row at insert time and surface as
    // `Unique constraint failed on the fields: (sessionId)`. The fork
    // didn't go through a fresh interview, but downstream consumers
    // (Coach / Composer / Research / Packager / Roadmap engine) all
    // read `recommendation.session.beliefState` as the founder's
    // grounding context, so the cloned session carries the parent's
    // beliefState verbatim. status=COMPLETE because there's no live
    // interview attached. conversationId stays null so it doesn't
    // share a chat thread with the parent (Conversation.id is also
    // @unique on DiscoverySession).
    const parentSession = await tx.discoverySession.findUnique({
      where:  { id: input.parentSessionId },
      select: { beliefState: true, audienceType: true, phase: true },
    });
    if (!parentSession) {
      throw new Error(`Parent DiscoverySession ${input.parentSessionId} not found`);
    }

    const newSession = await tx.discoverySession.create({
      data: {
        userId:       input.userId,
        status:       'COMPLETE',
        beliefState:  parentSession.beliefState ?? toJsonValue({}),
        audienceType: parentSession.audienceType,
        phase:        parentSession.phase,
        completedAt:  new Date(),
      },
      select: { id: true },
    });

    const newRec = await tx.recommendation.create({
      data: {
        userId:                 input.userId,
        sessionId:              newSession.id,
        recommendationType:     input.parentRecommendationType,
        summary:                input.payload.summary,
        path:                   input.payload.path,
        reasoning:              input.payload.reasoning,
        firstThreeSteps:        toJsonValue(input.payload.firstThreeSteps),
        timeToFirstResult:      input.payload.timeToFirstResult,
        risks:                  toJsonValue(input.payload.risks),
        assumptions:            toJsonValue(input.payload.assumptions),
        whatWouldMakeThisWrong: input.payload.whatWouldMakeThisWrong,
        alternativeRejected:    toJsonValue(input.payload.alternativeRejected),
        // Auto-accept — the founder explicitly picked this fork.
        // The acceptance round is 0 because there was no pushback.
        acceptedAt:             new Date(),
        acceptedAtRound:        0,
        ...(newCycleId ? { cycleId: newCycleId } : {}),
        phaseContext: toJsonValue(buildPhaseContext(PHASES.RECOMMENDATION, {
          discoverySessionId: newSession.id,
          recommendationId:   input.parentRecommendationId,
        })),
      },
      select: { id: true },
    });

    await tx.roadmap.update({
      where: { id: input.parentRoadmapId },
      data:  {
        continuationStatus:   CONTINUATION_STATUSES.FORK_SELECTED,
        forkRecommendationId: newRec.id,
      },
    });

    return { id: newRec.id, newCycleId };
  });

  return { newRecommendationId: result.id, newCycleId: result.newCycleId };
}
