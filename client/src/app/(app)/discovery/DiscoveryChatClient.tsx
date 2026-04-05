// src/app/(app)/discovery/DiscoveryChatClient.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { DiscoveryChat } from '@/components/discovery';
import type { Recommendation } from '@/lib/discovery/client';

interface DiscoveryChatClientProps {
  firstName:       string;
  isFirstSession?: boolean;
}

/**
 * DiscoveryChatClient
 *
 * Thin client wrapper that connects DiscoveryChat to Next.js navigation.
 * Navigates to the recommendation page when synthesis completes.
 */
export function DiscoveryChatClient({ firstName, isFirstSession }: DiscoveryChatClientProps) {
  const router = useRouter();

  const handleComplete = useCallback((_recommendation: Recommendation, conversationId: string) => {
    const dest = conversationId
      ? `/discovery/recommendation?from=${conversationId}`
      : '/discovery/recommendation';
    router.push(dest);
  }, [router]);

  return <DiscoveryChat firstName={firstName} onComplete={handleComplete} isFirstSession={isFirstSession} />;
}
