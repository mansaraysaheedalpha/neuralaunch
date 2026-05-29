// src/app/(app)/discovery/roadmap/[id]/continuation/page.tsx
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { requireTier } from '@/lib/auth/require-tier';
import { UpgradePrompt } from '@/components/billing/UpgradePrompt';
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
 *
 * Tier gate: Execute+. Free is shown an upgrade prompt; Execute and
 * Compound both reach the brief view. Cross-venture memory inside the
 * brief stays Compound-only via the gate inside loadCrossVentureSummaries
 * — Execute users get a brief built from their venture's signals only.
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
    select: {
      id:               true,
      recommendationId: true,
      recommendation: {
        select: { cycle: { select: { venture: { select: { name: true } } } } },
      },
    },
  });
  if (!roadmap) redirect('/discovery');

  const isPaid = requireTier(session.user.tier ?? 'free', 'execute');
  const ventureName = roadmap.recommendation?.cycle?.venture?.name ?? null;

  if (!isPaid) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <UpgradePrompt
          variant="hero"
          requiredTier="execute"
          heading="Continuation brief is for Execute and Compound"
          description="Close the cycle with a personalised continuation brief built from your check-ins, blockers, and parking lot — plus fork selection into your next venture. Upgrade to Execute or Compound to unlock it."
        />
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center py-24">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Loading…</span>
      </div>
    }>
      <ContinuationView
        roadmapId={roadmapId}
        recommendationId={roadmap.recommendationId}
        ventureName={ventureName}
      />
    </Suspense>
  );
}
