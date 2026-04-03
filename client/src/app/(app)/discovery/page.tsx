// src/app/(app)/discovery/page.tsx
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { DiscoveryChatClient } from './DiscoveryChatClient';

/**
 * DiscoveryPage
 *
 * Server Component — guards auth, derives firstName, delegates to client.
 * No header rendered here — the welcome layer handles the greeting.
 */
export default async function DiscoveryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');

  const firstName = session.user.name?.split(' ')[0] ?? '';

  return (
    <div className="flex flex-col h-full bg-background">
      <Suspense fallback={<DiscoveryChatSkeleton />}>
        <DiscoveryChatClient firstName={firstName} />
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
