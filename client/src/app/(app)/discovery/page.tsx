// src/app/(app)/discovery/page.tsx
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { DiscoveryChatClient } from './DiscoveryChatClient';

/**
 * DiscoveryPage
 *
 * Server Component entry point for the Phase 1 discovery interview.
 * Guards authentication and delegates the interactive chat to a Client Component.
 */
export default async function DiscoveryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="px-6 py-4 border-b border-border">
        <h1 className="text-base font-semibold text-foreground">Discovery Interview</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Answer honestly — the quality of your recommendation depends on it.
        </p>
      </header>

      <Suspense fallback={<DiscoveryChatSkeleton />}>
        <DiscoveryChatClient />
      </Suspense>
    </div>
  );
}

function DiscoveryChatSkeleton() {
  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full animate-pulse">
      <div className="flex flex-col gap-3 py-4 border-b border-border px-4">
        <div className="flex items-center gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-1 h-1 rounded-full bg-muted" />
          ))}
        </div>
        <div className="h-1 rounded-full bg-muted/50" />
      </div>
      <div className="flex-1 flex flex-col gap-4 p-6">
        <div className="h-12 w-3/4 rounded-2xl bg-muted" />
        <div className="h-10 w-1/2 ml-auto rounded-2xl bg-muted" />
        <div className="h-14 w-4/5 rounded-2xl bg-muted" />
      </div>
      <div className="border-t border-border px-4 py-3">
        <div className="h-9 rounded-lg bg-muted" />
      </div>
    </div>
  );
}
