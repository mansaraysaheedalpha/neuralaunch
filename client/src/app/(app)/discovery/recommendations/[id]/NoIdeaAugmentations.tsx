// src/app/(app)/discovery/recommendations/[id]/NoIdeaAugmentations.tsx
//
// Server-side loader + Client-renderable wrapper for the augmentations
// shown on the legacy Recommendation review surface when the
// recommendation came from the No Idea archetype. Three additions per
// docs/stage5-copy-review.md §§ E, F, G:
//
//   - Cascade-stale banner with "Re-synthesize" CTA (E)
//   - "Alternatives considered" collapsible section (F)
//   - "Revisit Stage 4" link in the header (G)
//
// Detection: a Recommendation belongs to the No Idea archetype when
// its DiscoverySession has IdeationStageRun rows (the only place those
// rows live is the No Idea ladder). The check + state load happen in
// `loadNoIdeaContext` below; the renderable surface is rendered by
// `NoIdeaCascadeBanner`, `NoIdeaAlternativesSection`, and
// `NoIdeaRevisitStage4Link`.

import 'server-only';
import prisma from '@/lib/prisma';
import {
  safeParseStage5AuthoringState,
  safeParseStage5HandoffDocument,
} from '@/lib/ideation';
import type {
  ReserveOpportunity,
} from '@/lib/ideation/stage5-handoff/schema';

export interface NoIdeaRecommendationContext {
  /** True when this Recommendation was synthesised via the No Idea Stage 5 worker. */
  isNoIdea:             boolean;
  /** Session id that owns this Recommendation — used by Revisit Stage 4. */
  sessionId:            string | null;
  /** True when an upstream Stage 1-4 edit has invalidated the synthesis. */
  requiresRederivation: boolean;
  /** Reserve opportunities surfaced as "Alternatives considered" (F). */
  reserves:             ReadonlyArray<ReserveOpportunity>;
  /** Stage 4 stage-run id — used to deep-link "View in Stage 4" with a URL hash. */
  stage4StageRunId:     string | null;
}

/**
 * Load the No Idea-specific context for a Recommendation, scoped by
 * userId for ownership. Returns isNoIdea=false when the recommendation
 * is a legacy / fresh-start / fork-continuation row so the caller can
 * render nothing without leaking the no-idea panels.
 */
export async function loadNoIdeaContext(
  recommendationId: string,
  userId:           string,
): Promise<NoIdeaRecommendationContext> {
  // Single ownership-scoped query — joins the Recommendation to its
  // DiscoverySession, then to the Stage 4 + Stage 5 IdeationStageRun
  // rows in one round-trip.
  const rec = await prisma.recommendation.findFirst({
    where:  { id: recommendationId, userId },
    select: {
      sessionId: true,
      session: {
        select: {
          ideationRuns: {
            where:  { stageNumber: { in: [4, 5] } },
            select: { id: true, stageNumber: true, status: true, output: true },
          },
        },
      },
    },
  });

  if (!rec || !rec.session || rec.session.ideationRuns.length === 0) {
    return {
      isNoIdea:             false,
      sessionId:            rec?.sessionId ?? null,
      requiresRederivation: false,
      reserves:             [],
      stage4StageRunId:     null,
    };
  }

  const stage4 = rec.session.ideationRuns.find(r => r.stageNumber === 4) ?? null;
  const stage5 = rec.session.ideationRuns.find(r => r.stageNumber === 5) ?? null;

  // Prefer the committed Stage 5 handoff document when the run is in
  // output_ready (the typical state post-synthesis); fall back to the
  // authoring state otherwise.
  let reserves: ReadonlyArray<ReserveOpportunity> = [];
  let requiresRederivation = false;
  if (stage5) {
    if (stage5.status === 'output_ready' || stage5.status === 'committed') {
      const doc = safeParseStage5HandoffDocument(stage5.output);
      if (doc) reserves = doc.reserveOpportunities;
    }
    if (reserves.length === 0) {
      const state = safeParseStage5AuthoringState(stage5.output);
      reserves = state.reserveOpportunities;
      requiresRederivation = state.requiresRederivation;
    } else {
      // Even when reading the document, cascade staleness is still
      // tracked on the authoring slice when an edit lands post-success.
      const state = safeParseStage5AuthoringState(stage5.output);
      requiresRederivation = state.requiresRederivation;
    }
  }

  return {
    isNoIdea:             true,
    sessionId:            rec.sessionId,
    requiresRederivation,
    reserves,
    stage4StageRunId:     stage4?.id ?? null,
  };
}
