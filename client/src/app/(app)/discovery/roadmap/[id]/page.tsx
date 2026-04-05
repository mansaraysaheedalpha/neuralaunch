// src/app/(app)/discovery/roadmap/[id]/page.tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { RoadmapView } from './RoadmapView';

/**
 * RoadmapPage
 *
 * Server Component — verifies the user owns the recommendation, then hands off
 * to RoadmapView which polls for the generated roadmap asynchronously.
 * The [id] param is the recommendationId.
 */
export default async function RoadmapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');

  const { id: recommendationId } = await params;

  const recommendation = await prisma.recommendation.findUnique({
    where:  { id: recommendationId },
    select: { userId: true },
  });

  if (!recommendation || recommendation.userId !== session.user.id) {
    redirect('/discovery');
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between px-6 pt-4">
        <Link
          href={`/discovery/recommendations/${recommendationId}`}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          ← Back to recommendation
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={
          <div className="flex items-center justify-center py-24">
            <span className="text-sm text-muted-foreground">Loading…</span>
          </div>
        }>
          <RoadmapView recommendationId={recommendationId} />
        </Suspense>
      </div>
    </div>
  );
}
