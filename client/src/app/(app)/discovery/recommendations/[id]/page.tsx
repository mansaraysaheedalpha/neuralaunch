// src/app/(app)/discovery/recommendations/[id]/page.tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { RecommendationReveal } from '@/app/(app)/discovery/recommendation/RecommendationReveal';

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

  const recommendation = await prisma.recommendation.findUnique({
    where:  { id, userId },
    select: {
      id:                     true,
      summary:                true,
      path:                   true,
      reasoning:              true,
      firstThreeSteps:        true,
      timeToFirstResult:      true,
      risks:                  true,
      assumptions:            true,
      whatWouldMakeThisWrong: true,
      alternativeRejected:    true,
      createdAt:              true,
      session: { select: { conversationId: true } },
    },
  });

  if (!recommendation) notFound();

  const conversationId = recommendation.session?.conversationId ?? null;

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
        <RecommendationReveal recommendation={recommendation} />
      </Suspense>
    </div>
  );
}
