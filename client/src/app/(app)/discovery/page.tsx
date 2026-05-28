// src/app/(app)/discovery/page.tsx
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { SessionResumption } from './SessionResumption';
import { CompoundUpgradeHint } from './CompoundUpgradeHint';
import { ArchetypePicker } from './ArchetypePicker';
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

  // Pull only what the new picker page needs:
  //   - incomplete: redirect target if the founder has an in-flight session
  //   - lifetimeCount: Free-tier cap check
  //   - nonActiveVentureCount: Compound upgrade hint trigger
  //
  // The incomplete query also pulls `ideationRuns` so we can detect
  // no_idea sessions and redirect them to /discovery/no-idea/[id]
  // instead of showing the resumption card. The legacy isFirstSession
  // flag was dropped along with the legacy welcome layer — the new
  // picker is identical for first-time and returning founders.
  const [
    incomplete,
    lifetimeCount,
    nonActiveVentureCount,
  ] = await Promise.all([
    prisma.discoverySession.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        // Either signal of "founder made progress" is enough. The legacy
        // Discovery interview increments questionCount on every turn;
        // the no_idea archetype writes its progress into IdeationStageRun
        // rows instead and never touches questionCount, so we also accept
        // "any IdeationStageRun past stage 0 exists" as the resumable
        // signal. Without this OR, the sidebar's link-to-/discovery for
        // ACTIVE no_idea sessions would never trigger the redirect and
        // the founder would land on the archetype picker, effectively
        // starting their session over with their real conversation
        // orphaned behind a different session id.
        OR: [
          { questionCount: { gt: 0 } },
          { ideationRuns: { some: { stageNumber: { gte: 1 } } } },
        ],
        // A "primary" recommendation is one whose parentRecommendationId
        // is null. The session is considered incomplete when no primary
        // exists yet — the relation flip moved this from a 1-to-1
        // existence check to a "none-of-many" filter.
        recommendations: { none: { parentRecommendationId: null } },
        lastTurnAt: {
          not: null,
          lt:  new Date(now - INCOMPLETE_MIN_AGE_MS),
          gt:  new Date(now - INCOMPLETE_MAX_AGE_MS),
        },
      },
      orderBy: { lastTurnAt: 'desc' },
      select:  {
        id:             true,
        questionCount:  true,
        conversationId: true,
        ideationRuns:   { select: { stageNumber: true, status: true } },
      },
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
      <div className="flex h-full w-full flex-col">
        <div className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="w-full max-w-xl">
            <UpgradePrompt
              requiredTier="execute"
              variant="hero"
              heading="You've used both of your free discovery interviews"
              description={`Free accounts include ${FREE_DISCOVERY_SESSION_LIMIT} discovery interviews so you can try the system twice with different framing. Upgrade to Execute to run unlimited interviews, push back on recommendations, generate execution roadmaps, and unlock the four tools.`}
              primaryLabel="Upgrade to Execute"
            />
            <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              Past recommendations available at{' '}
              <Link href="/discovery/recommendations" className="text-fg underline underline-offset-2 transition-colors hover:text-accent">
                /discovery/recommendations
              </Link>
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

  // Resumption: when the incomplete session is a no_idea archetype
  // (has at least one IdeationStageRun), route the founder to the
  // dedicated no-idea surface so they land on the right stage page,
  // not on the Discovery chat.
  if (incomplete && incomplete.ideationRuns.length > 0) {
    redirect(`/discovery/no-idea/${incomplete.id}`);
  }

  return (
    <div className="flex h-full w-full flex-col">
      {showCompoundHint && <CompoundUpgradeHint />}
      <Suspense fallback={null}>
        {incomplete ? (
          <SessionResumption
            session={{ id: incomplete.id, questionCount: incomplete.questionCount, conversationId: incomplete.conversationId }}
            firstName={firstName}
          />
        ) : (
          <ArchetypePicker firstName={firstName} />
        )}
      </Suspense>
    </div>
  );
}
