// src/app/(app)/discovery/page.tsx
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { DiscoveryChatClient } from './DiscoveryChatClient';
import { SessionResumption } from './SessionResumption';

const INCOMPLETE_MIN_AGE_MS  = 60  * 1000;        //  60 seconds — ignore very recent sessions
const INCOMPLETE_MAX_AGE_MS  = 72  * 60 * 60 * 1000; // 72 hours  — discard abandoned sessions

/**
 * DiscoveryPage
 *
 * Server Component — guards auth, checks for an incomplete session,
 * and renders either the resumption UI or the normal welcome/chat layer.
 */
export default async function DiscoveryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');

  const userId    = session.user.id;
  const firstName = session.user.name?.split(' ')[0] ?? '';
  // eslint-disable-next-line react-hooks/purity -- async server component, runs once per request
  const now       = Date.now();

  const [incomplete, completedCount] = await Promise.all([
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
  ]);

  const isFirstSession = completedCount === 0;

  return (
    <div className="flex flex-col h-full bg-background">
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
