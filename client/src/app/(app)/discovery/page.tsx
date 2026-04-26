// src/app/(app)/discovery/page.tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { DiscoveryChatClient } from './DiscoveryChatClient';
import { SessionResumption } from './SessionResumption';
import { CompoundUpgradeHint } from './CompoundUpgradeHint';
import { UpgradePrompt } from '@/components/billing/UpgradePrompt';
import {
  countFreeDiscoverySessions,
  FREE_DISCOVERY_SESSION_LIMIT,
} from '@/lib/lifecycle';

const INCOMPLETE_MIN_AGE_MS  = 60  * 1000;        //  60 seconds — ignore very recent sessions
const INCOMPLETE_MAX_AGE_MS  = 72  * 60 * 60 * 1000; // 72 hours  — discard abandoned sessions

/**
 * DiscoveryPage
 *
 * Server Component — guards auth, checks for an incomplete session,
 * and renders either the resumption UI, the normal welcome/chat layer,
 * or a cap-reached UpgradePrompt for Free users who have already used
 * their lifetime discovery allowance.
 *
 * The cap-reached branch matters: before this branch existed, a Free
 * user who hit their 3rd attempt would see the chat input, type a
 * long prompt, submit it, and get a blank screen because the server
 * 403'd with no client-side rendering for that shape. Pre-emptively
 * replacing the chat with a clear upgrade CTA means the user never
 * types a message they can't send.
 */
export default async function DiscoveryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');

  const userId    = session.user.id;
  const firstName = session.user.name?.split(' ')[0] ?? '';
  const tier      = session.user.tier ?? 'free';
  // eslint-disable-next-line react-hooks/purity -- async server component, runs once per request
  const now       = Date.now();

  // For Free users we need BOTH the completed count (for the
  // isFirstSession guide-pulse flag) AND the lifetime count (for the
  // cap check — includes ACTIVE and abandoned sessions, not just
  // COMPLETE). Paid users skip the lifetime count since the cap
  // doesn't apply.
  const [incomplete, completedCount, lifetimeCount, nonActiveVentureCount] = await Promise.all([
    prisma.discoverySession.findFirst({
      where: {
        userId,
        status:        'ACTIVE',
        questionCount: { gt: 0 },
        recommendation: null,
        lastTurnAt: {
          not: null,
          lt:  new Date(now - INCOMPLETE_MIN_AGE_MS),
          gt:  new Date(now - INCOMPLETE_MAX_AGE_MS),
        },
      },
      orderBy: { lastTurnAt: 'desc' },
      select:  { id: true, questionCount: true, conversationId: true },
    }),
    prisma.discoverySession.count({
      where: { userId, status: 'COMPLETE' },
    }),
    tier === 'free' ? countFreeDiscoverySessions(userId) : Promise.resolve(0),
    // Compound-upgrade hint signal — only an Execute founder with at
    // least one paused or completed venture has the "starting another
    // direction" pattern that the hint targets. Skipped for Free
    // (no ventures yet) and Compound (already on the upgrade target).
    tier === 'execute'
      ? prisma.venture.count({
          where: { userId, status: { in: ['paused', 'completed'] }, archivedAt: null },
        })
      : Promise.resolve(0),
  ]);

  const isFirstSession = completedCount === 0;
  const freeCapReached =
    tier === 'free' && lifetimeCount >= FREE_DISCOVERY_SESSION_LIMIT;

  // Free-cap branch takes priority even over a resumable in-flight
  // session — if the user is at cap, their in-flight session is
  // already one of the two counted against the cap, and they won't
  // be able to start a new one after finishing it. Show the upgrade
  // prompt so the path forward is obvious. If they DO want to resume
  // the in-flight one, the sidebar link to /discovery/recommendations
  // is still one click away.
  if (freeCapReached) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="max-w-xl w-full">
            <UpgradePrompt
              requiredTier="execute"
              variant="hero"
              heading="You've used both of your free discovery interviews"
              description={`Free accounts include ${FREE_DISCOVERY_SESSION_LIMIT} discovery interviews so you can try the system twice with different framing. Upgrade to Execute to run unlimited interviews, push back on recommendations, generate execution roadmaps, and unlock the four tools.`}
              primaryLabel="Upgrade to Execute"
            />
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Your existing recommendations are always accessible from{' '}
              <Link href="/discovery/recommendations" className="underline underline-offset-2 hover:text-foreground">
                Past recommendations
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show the Compound hint only when the founder is on Execute AND
  // already has a paused/completed venture sitting around — i.e.
  // they're starting *another* direction. Skipped for first-time
  // founders (nothing to compound across yet) and on the resumption
  // path (they're not starting fresh, they're picking up an
  // in-flight session).
  const showCompoundHint = tier === 'execute' && nonActiveVentureCount >= 1 && !incomplete;

  return (
    <div className="flex flex-col h-full bg-background">
      {showCompoundHint && <CompoundUpgradeHint />}
      <Suspense fallback={<DiscoveryChatSkeleton />}>
        {incomplete ? (
          <SessionResumption
            session={{ id: incomplete.id, questionCount: incomplete.questionCount, conversationId: incomplete.conversationId }}
            firstName={firstName}
          />
        ) : (
          <DiscoveryChatClient firstName={firstName} isFirstSession={isFirstSession} />
        )}
      </Suspense>
    </div>
  );
}

function DiscoveryChatSkeleton() {
  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full animate-pulse">
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
        <div className="h-8 w-48 rounded-lg bg-muted" />
        <div className="h-16 w-full max-w-md rounded-xl bg-muted/50" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-8 w-28 rounded-full bg-muted" />
          ))}
        </div>
      </div>
      <div className="border-t border-border px-4 py-3">
        <div className="h-9 rounded-lg bg-muted" />
      </div>
    </div>
  );
}
