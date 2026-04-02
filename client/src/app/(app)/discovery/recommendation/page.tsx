// src/app/(app)/discovery/recommendation/page.tsx
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { RecommendationReveal } from './RecommendationReveal';

/**
 * RecommendationPage
 *
 * Server Component — loads the most recent Recommendation for the user
 * and passes it to the animated reveal client component.
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
      id:                     true,
      path:                   true,
      reasoning:              true,
      firstThreeSteps:        true,
      timeToFirstResult:      true,
      risks:                  true,
      assumptions:            true,
      whatWouldMakeThisWrong: true,
      alternativeRejected:    true,
      createdAt:              true,
    },
  });

  if (!recommendation) redirect('/discovery');

  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><span className="text-muted-foreground text-sm">Loading…</span></div>}>
      <RecommendationReveal recommendation={recommendation} />
    </Suspense>
  );
}
