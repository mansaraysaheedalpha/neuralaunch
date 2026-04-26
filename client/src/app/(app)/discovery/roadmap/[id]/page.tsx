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
  const userId = session.user.id;

  const { id: recommendationId } = await params;

  // findFirst with composite ownership check (the established pattern).
  // Pulls the founder's primary goal from the linked discovery session
  // so the completion-acknowledgment moment in the task card can quote
  // the founder's own stated goal back to them.
  const recommendation = await prisma.recommendation.findFirst({
    where:  { id: recommendationId, userId },
    select: {
      id:         true,
      acceptedAt: true,
      session: {
        select: { beliefState: true },
      },
      // Pull the venture state so the client tree can preflight-
      // disable every write surface (status picker, tool launchers,
      // check-in form, parking lot, What's Next) when the venture is
      // paused, completed, or archived. Without this, the founder
      // could click write actions that only fail at the API layer.
      cycle: {
        select: {
          venture: { select: { status: true, archivedAt: true } },
        },
      },
    },
  });

  if (!recommendation) {
    redirect('/discovery');
  }

  // Acceptance gate — the speculative roadmap warm-up fires as soon as
  // synthesis completes, so a pre-warmed roadmap always exists in the
  // database by the time the founder opens the recommendation. Without
  // this gate, direct-navigating to /discovery/roadmap/[id] (or clicking
  // any accidentally-rendered link) exposes the warmed-up roadmap before
  // the founder has explicitly committed via the "This is my path —
  // build my roadmap" button. Redirect them back to the recommendation
  // so the commit moment still means something.
  if (!recommendation.acceptedAt) {
    redirect(`/discovery/recommendations/${recommendationId}`);
  }

  // Best-effort extraction of the founder's primary goal for the
  // completion moment. Falls back to undefined; the task card has
  // a generic fallback when this is missing.
  const belief = (recommendation.session?.beliefState ?? {}) as {
    primaryGoal?: { value?: unknown };
  };
  const goalValue = belief.primaryGoal?.value;
  const founderGoal = typeof goalValue === 'string' && goalValue.trim().length > 0
    ? goalValue.trim().slice(0, 300)
    : null;

  // Derive the writability flag once per request. Three blocking
  // states map to read-only reasons; archived is checked first
  // because a venture can be both archived and (status=paused), and
  // archived takes precedence in the UI copy. Legacy roadmaps with
  // no venture link are writable by default — same as the API gate.
  const venture     = recommendation.cycle?.venture ?? null;
  const archived    = venture?.archivedAt != null;
  const isPaused    = venture?.status === 'paused';
  const isCompleted = venture?.status === 'completed';
  const writable    = !venture || (!archived && !isPaused && !isCompleted);
  const readOnlyReason: 'archived' | 'paused' | 'completed' | null =
      archived    ? 'archived'
    : isCompleted ? 'completed'
    : isPaused    ? 'paused'
    :               null;

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
          <RoadmapView
            recommendationId={recommendationId}
            founderGoal={founderGoal}
            writable={writable}
            readOnlyReason={readOnlyReason}
          />
        </Suspense>
      </div>
    </div>
  );
}
