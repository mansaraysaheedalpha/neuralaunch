// src/app/(app)/discovery/roadmap/[id]/continuation/page.tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { ContinuationView } from './ContinuationView';

/**
 * ContinuationPage
 *
 * Server Component — verifies the user owns the roadmap and hands
 * the [id] off to the client view, which polls for the brief +
 * renders the five sections + the fork picker.
 *
 * Auth + ownership check ONLY happens here. The client view fetches
 * the brief data via the polling endpoint so it can show progress
 * states (GENERATING_BRIEF, BRIEF_READY, FORK_SELECTED) without a
 * full page reload.
 */
export default async function ContinuationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');

  const { id: roadmapId } = await params;

  const roadmap = await prisma.roadmap.findFirst({
    where:  { id: roadmapId, userId: session.user.id },
    select: { id: true, recommendationId: true },
  });
  if (!roadmap) redirect('/discovery');

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between px-6 pt-4">
        <Link
          href={`/discovery/roadmap/${roadmapId}`}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          ← Back to roadmap
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={
          <div className="flex items-center justify-center py-24">
            <span className="text-sm text-muted-foreground">Loading…</span>
          </div>
        }>
          <ContinuationView roadmapId={roadmapId} />
        </Suspense>
      </div>
    </div>
  );
}
