// src/app/(app)/discovery/recommendation/page.tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { RecommendationReveal } from './RecommendationReveal';
import { safeParsePushbackHistory } from '@/lib/discovery/pushback-engine';

/**
 * RecommendationPage
 *
 * Server Component — loads the most recent Recommendation for the user
 * and passes it to the animated reveal client component.
 * Accepts ?from=[conversationId] to surface a link back to the interview transcript.
 * Redirects back to the interview if synthesis is not yet complete.
 */
export default async function RecommendationPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const userId = session.user.id;

  const { from: conversationId } = await searchParams;

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
      alternativeRecommendationId: true,
      roadmap:                     { select: { status: true } },
      validationPage: {
        select: {
          id:     true,
          report: { select: { signalStrength: true } },
        },
      },
    },
  });

  if (!recommendation) redirect('/discovery');

  // STALE counts as "ready" for navigation purposes — the founder
  // should still be able to view the roadmap, the STALE banner inside
  // RoadmapView prompts them to regenerate.
  const roadmapReady = recommendation.roadmap?.status === 'READY'
                    || recommendation.roadmap?.status === 'STALE';
  const validationPageId = recommendation.validationPage?.id ?? null;
  const validationSignalStrength = recommendation.validationPage?.report?.signalStrength ?? null;

  // Serialize Date and JSON fields for the client component
  const recForClient = {
    ...recommendation,
    acceptedAt:      recommendation.acceptedAt ? recommendation.acceptedAt.toISOString() : null,
    pushbackHistory: safeParsePushbackHistory(recommendation.pushbackHistory),
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between px-6 pt-4">
        <Link
          href="/discovery/recommendations"
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Past recommendations
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
      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><span className="text-muted-foreground text-sm">Loading…</span></div>}>
        <RecommendationReveal
          recommendation={recForClient}
          roadmapReady={roadmapReady}
          validationPageId={validationPageId}
          validationSignalStrength={validationSignalStrength}
        />
      </Suspense>
    </div>
  );
}
