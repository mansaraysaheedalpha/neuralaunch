// src/app/(app)/discovery/recommendations/[id]/page.tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { RecommendationReveal } from '@/app/(app)/discovery/recommendation/RecommendationReveal';
import { safeParsePushbackHistory } from '@/lib/discovery/pushback-engine';

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
      alternativeRecommendationId: true,
      roadmap:                     { select: { status: true } },
      session:                     { select: { conversationId: true } },
    },
  });

  if (!recommendation) notFound();

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
  const recForClient = {
    ...recommendation,
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
        {conversationId && (
          <Link
            href={`/chat/${conversationId}`}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            View interview transcript →
          </Link>
        )}
      </div>
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
    </div>
  );
}
