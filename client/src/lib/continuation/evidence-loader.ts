// src/lib/continuation/evidence-loader.ts
//
// Shared loader + parser for the continuation evidence base. The
// Inngest brief function and the Phase 4 checkpoint / diagnostic
// API routes all need the same shape: a roadmap row, its parsed
// recommendation, the parsed phases, the parsed belief state, the
// parking lot, and the diagnostic history.
//
// Centralising this avoids duplication and guarantees every reader
// uses the same safeParse path on every JSONB column. The brief
// function and routes import from here rather than re-doing the
// joins.

import 'server-only';
import prisma from '@/lib/prisma';
import { safeParseDiscoveryContext, type DiscoveryContext } from '@/lib/discovery/context-schema';
import { RecommendationSchema, type Recommendation } from '@/lib/discovery/recommendation-schema';
import { StoredPhasesArraySchema, type StoredRoadmapPhase } from '@/lib/roadmap/checkin-types';
import { safeParseParkingLot, type ParkingLot } from './parking-lot-schema';
import { safeParseDiagnosticHistory, type DiagnosticHistory } from './diagnostic-schema';

/**
 * The full evidence base for a single roadmap, parsed and validated.
 * Returned by `loadContinuationEvidence` to every continuation
 * consumer.
 */
export interface ContinuationEvidence {
  roadmapId:          string;
  weeklyHours:        number;
  createdAt:          Date;
  continuationStatus: string | null;
  briefAlreadyExists: boolean;
  recommendation:     Recommendation;
  recommendationId:   string;
  context:            DiscoveryContext;
  phases:             StoredRoadmapPhase[];
  parkingLot:         ParkingLot;
  diagnosticHistory:  DiagnosticHistory;
  motivationAnchor:   string | null;
  progress: {
    totalTasks:     number;
    completedTasks: number;
    blockedTasks:   number;
    lastActivityAt: Date | null;
  };
}

/**
 * Failure modes returned as a discriminated union — never as
 * exceptions — so the call site can decide what HTTP code or
 * Inngest skip behaviour to apply.
 */
export type LoadEvidenceResult =
  | { ok: true;  evidence: ContinuationEvidence }
  | { ok: false; reason: 'not_found' | 'no_belief_state' | 'phases_corrupt' };

/**
 * Load and parse every JSON column the continuation flow needs from
 * a single Roadmap row. Performs the ownership check via findFirst
 * (the established pattern) so existence-leak between 404 and 401
 * is impossible.
 *
 * No LLM calls. No mutation. Pure read + parse — safe to call from
 * Inngest steps and from API route handlers alike.
 */
export async function loadContinuationEvidence(input: {
  roadmapId: string;
  userId:    string;
}): Promise<LoadEvidenceResult> {
  const { roadmapId, userId } = input;

  const row = await prisma.roadmap.findFirst({
    where:  { id: roadmapId, userId },
    select: {
      id:                 true,
      phases:             true,
      weeklyHours:        true,
      createdAt:          true,
      parkingLot:         true,
      diagnosticHistory:  true,
      continuationStatus: true,
      continuationBrief:  true,
      recommendationId:   true,
      recommendation: {
        select: {
          recommendationType:     true,
          summary:                true,
          path:                   true,
          reasoning:              true,
          firstThreeSteps:        true,
          timeToFirstResult:      true,
          risks:                  true,
          assumptions:            true,
          whatWouldMakeThisWrong: true,
          alternativeRejected:    true,
          session: { select: { beliefState: true } },
        },
      },
      progress: {
        select: {
          totalTasks:     true,
          completedTasks: true,
          blockedTasks:   true,
          lastActivityAt: true,
        },
      },
    },
  });

  if (!row || !row.recommendation) {
    return { ok: false, reason: 'not_found' };
  }
  if (!row.recommendation.session?.beliefState) {
    return { ok: false, reason: 'no_belief_state' };
  }

  const phasesParsed = StoredPhasesArraySchema.safeParse(row.phases);
  if (!phasesParsed.success) {
    return { ok: false, reason: 'phases_corrupt' };
  }

  const recommendation = RecommendationSchema.parse({
    recommendationType:     row.recommendation.recommendationType ?? 'other',
    summary:                row.recommendation.summary,
    path:                   row.recommendation.path,
    reasoning:              row.recommendation.reasoning,
    firstThreeSteps:        row.recommendation.firstThreeSteps,
    timeToFirstResult:      row.recommendation.timeToFirstResult,
    risks:                  row.recommendation.risks,
    assumptions:            row.recommendation.assumptions,
    whatWouldMakeThisWrong: row.recommendation.whatWouldMakeThisWrong,
    alternativeRejected:    row.recommendation.alternativeRejected,
  });

  const context           = safeParseDiscoveryContext(row.recommendation.session.beliefState);
  const parkingLot        = safeParseParkingLot(row.parkingLot);
  const diagnosticHistory = safeParseDiagnosticHistory(row.diagnosticHistory);
  const motivationAnchor  = context.motivationAnchor?.value ?? null;

  return {
    ok: true,
    evidence: {
      roadmapId:          row.id,
      weeklyHours:        row.weeklyHours ?? 10,
      createdAt:          row.createdAt,
      continuationStatus: row.continuationStatus,
      briefAlreadyExists: row.continuationBrief != null,
      recommendation,
      recommendationId:   row.recommendationId,
      context,
      phases:             phasesParsed.data,
      parkingLot,
      diagnosticHistory,
      motivationAnchor,
      progress: {
        totalTasks:     row.progress?.totalTasks     ?? 0,
        completedTasks: row.progress?.completedTasks ?? 0,
        blockedTasks:   row.progress?.blockedTasks   ?? 0,
        lastActivityAt: row.progress?.lastActivityAt ?? null,
      },
    },
  };
}
