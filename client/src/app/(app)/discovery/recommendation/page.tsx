// src/app/(app)/discovery/recommendation/page.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { RecommendationView } from './RecommendationView';
import { safeParsePushbackHistory } from '@/lib/discovery/pushback-engine';
import { loadNoIdeaContext } from '@/app/(app)/discovery/recommendations/[id]/NoIdeaAugmentations';
import { NoIdeaCascadeBanner } from '@/app/(app)/discovery/recommendations/[id]/NoIdeaCascadeBanner';
import { NoIdeaAlternativesSection } from '@/app/(app)/discovery/recommendations/[id]/NoIdeaAlternativesSection';

/**
 * RecommendationPage
 *
 * Server Component — loads the most recent Recommendation for the user
 * and passes it to the animated reveal client component.
 * Accepts ?from=[conversationId] to surface a link back to the interview transcript.
 * Redirects back to the interview if synthesis is not yet complete.
 */
export default async function RecommendationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const userId = session.user.id;

  const recommendation = await prisma.recommendation.findFirst({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
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
    },
  });

  if (!recommendation) redirect('/discovery');

  // No Idea archetype augmentations — same isolation guard as the
  // /[id] surface. loadNoIdeaContext is ownership-scoped internally.
  const noIdea = await loadNoIdeaContext(recommendation.id, userId);

  // STALE counts as "ready" for navigation purposes — the founder
  // should still be able to view the roadmap, the STALE banner inside
  // RoadmapView prompts them to regenerate.
  const roadmapReady = recommendation.roadmap?.status === 'READY'
                    || recommendation.roadmap?.status === 'STALE';

  // Serialize Date and JSON fields for the client component. The
  // versions column is a raw JSONB array of pre-update snapshots —
  // the VersionHistoryPanel safely narrows each entry's shape, so we
  // pass the parsed array through without a strict schema here
  // (a single bad row should not hide the rest of the history).
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
  // See sibling /recommendations/[id]/page.tsx for context — schema
  // flipped the alternative FK to alt → parent, client component still
  // expects the legacy `alternativeRecommendationId` column shape.
  const { alternativeRecommendation, ...recRest } = recommendation;
  const recForClient = {
    ...recRest,
    alternativeRecommendationId: alternativeRecommendation?.id ?? null,
    acceptedAt:      recommendation.acceptedAt ? recommendation.acceptedAt.toISOString() : null,
    pushbackHistory: safeParsePushbackHistory(recommendation.pushbackHistory),
    versions,
  };

  // No-Idea augmentations render inside the content column as header /
  // footer slots so they sit within the Institute two-column layout.
  // (They still use the legacy palette — flagged for a later pass.)
  const headerSlot =
    noIdea.isNoIdea && noIdea.sessionId && noIdea.requiresRederivation ? (
      <div className="mb-8">
        <NoIdeaCascadeBanner sessionId={noIdea.sessionId} />
      </div>
    ) : undefined;

  const footerSlot =
    noIdea.isNoIdea && noIdea.sessionId ? (
      <div className="mt-12">
        <NoIdeaAlternativesSection
          reserves={noIdea.reserves}
          sessionId={noIdea.sessionId}
          stage4StageRunId={noIdea.stage4StageRunId}
        />
      </div>
    ) : undefined;

  const shortId = recommendation.id.slice(0, 6);

  return (
    <RecommendationView
      recommendation={recForClient}
      roadmapReady={roadmapReady}
      shortId={shortId}
      headerSlot={headerSlot}
      footerSlot={footerSlot}
    />
  );
}
