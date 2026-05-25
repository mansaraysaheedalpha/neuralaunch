// src/app/(app)/discovery/recommendations/[id]/page.tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { RecommendationReveal } from '@/app/(app)/discovery/recommendation/RecommendationReveal';
import { safeParsePushbackHistory } from '@/lib/discovery/pushback-engine';
import { isRegenerateAllowed } from '@/lib/discovery/regenerate-allowlist';
import { RegenerateButton } from './RegenerateButton';
import { loadNoIdeaContext } from './NoIdeaAugmentations';
import { NoIdeaCascadeBanner } from './NoIdeaCascadeBanner';
import { NoIdeaAlternativesSection } from './NoIdeaAlternativesSection';

/**
 * RecommendationDetailPage
 *
 * Server Component — loads a single Recommendation by ID, verifies ownership,
 * and renders it using the shared RecommendationReveal component.
 */
export default async function RecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const userId = session.user.id;

  const { id } = await params;

  const recommendation = await prisma.recommendation.findFirst({
    where:  { id, userId },
    select: {
      id:                          true,
      recommendationType:          true,
      summary:                     true,
      path:                        true,
      reasoning:                   true,
      firstThreeSteps:             true,
      timeToFirstResult:           true,
      risks:                       true,
      assumptions:                 true,
      whatWouldMakeThisWrong:      true,
      alternativeRejected:         true,
      createdAt:                   true,
      acceptedAt:                  true,
      pushbackHistory:             true,
      versions:                    true,
      alternativeRecommendation:   { select: { id: true } },
      roadmap:                     { select: { status: true } },
      session:                     { select: { conversationId: true } },
    },
  });

  if (!recommendation) notFound();

  // Render the self-service regenerate button only when:
  //   - the founder's email is in ADMIN_REGENERATE_EMAILS, AND
  //   - the recommendation has not been accepted (regenerate would
  //     orphan a downstream roadmap), AND
  //   - there are no user-side pushback turns (regenerate would
  //     leave history orphaned against a fresh row).
  // The route enforces the same invariants — this is purely a UX
  // affordance so the button doesn't render when it'd be rejected.
  const pushbackHistoryForGate = safeParsePushbackHistory(recommendation.pushbackHistory);
  const hasUserPushbackTurns   = pushbackHistoryForGate.some(t => t.role === 'user');
  const canRegenerate          = isRegenerateAllowed(session.user.email)
                                && !recommendation.acceptedAt
                                && !hasUserPushbackTurns;

  // No Idea archetype augmentations — gated on whether the recommendation
  // came through the Stage 5 synthesis worker (i.e., the session has
  // IdeationStageRun rows). All augmentation rendering is suppressed
  // when this returns isNoIdea=false so non-no_idea recommendations are
  // never polluted with the cascade banner / alternatives panel.
  const noIdea = await loadNoIdeaContext(recommendation.id, userId);

  const conversationId           = recommendation.session?.conversationId ?? null;
  // STALE counts as "ready" for navigation purposes — see comment in
  // /discovery/recommendation/page.tsx for context.
  const roadmapReady             = recommendation.roadmap?.status === 'READY'
                                || recommendation.roadmap?.status === 'STALE';

  // Same versions-array normalisation as the live recommendation page —
  // keep the two shapes identical so RecommendationReveal doesn't care
  // which route fed it.
  const versionsRaw = Array.isArray(recommendation.versions)
    ? (recommendation.versions as unknown[])
    : [];
  const versions = versionsRaw.filter(
    (v): v is { snapshot: Record<string, unknown>; round: number; action: 'refine' | 'replace'; timestamp: string } =>
      typeof v === 'object'
      && v !== null
      && 'snapshot' in v
      && 'round'    in v
      && 'action'   in v
      && 'timestamp' in v
      && ((v as { action: unknown }).action === 'refine' || (v as { action: unknown }).action === 'replace'),
  );
  // Project the alt-relation back to the column-shape the client
  // component already understands. Schema flipped the FK to alt → parent
  // (alt.parentRecommendationId) but RecommendationReveal still consumes
  // the legacy `alternativeRecommendationId` shape; translate here so
  // the client surface stays stable.
  const { alternativeRecommendation, ...recRest } = recommendation;
  const recForClient = {
    ...recRest,
    alternativeRecommendationId: alternativeRecommendation?.id ?? null,
    acceptedAt:      recommendation.acceptedAt ? recommendation.acceptedAt.toISOString() : null,
    pushbackHistory: safeParsePushbackHistory(recommendation.pushbackHistory),
    versions,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between px-6 pt-4">
        <Link
          href="/discovery/recommendations"
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          ← All recommendations
        </Link>
        <div className="flex items-center gap-4">
          {noIdea.isNoIdea && noIdea.sessionId && (
            <Link
              href={`/discovery/no-idea/${noIdea.sessionId}`}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Revisit Stage 4
            </Link>
          )}
          {canRegenerate && <RegenerateButton recommendationId={recommendation.id} />}
          {conversationId && (
            <Link
              href={`/chat/${conversationId}`}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              View interview transcript →
            </Link>
          )}
        </div>
      </div>
      {noIdea.isNoIdea && noIdea.sessionId && noIdea.requiresRederivation && (
        <NoIdeaCascadeBanner sessionId={noIdea.sessionId} />
      )}
      <Suspense fallback={
        <div className="flex-1 flex items-center justify-center">
          <span className="text-muted-foreground text-sm">Loading…</span>
        </div>
      }>
        <RecommendationReveal
          recommendation={recForClient}
          roadmapReady={roadmapReady}
        />
      </Suspense>
      {noIdea.isNoIdea && noIdea.sessionId && (
        <div className="px-6 pb-8 max-w-3xl mx-auto w-full">
          <NoIdeaAlternativesSection
            reserves={noIdea.reserves}
            sessionId={noIdea.sessionId}
            stage4StageRunId={noIdea.stage4StageRunId}
          />
        </div>
      )}
    </div>
  );
}
