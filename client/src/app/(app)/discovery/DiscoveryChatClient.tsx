// src/app/(app)/discovery/DiscoveryChatClient.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { DiscoveryChat } from '@/components/discovery';
import type { Recommendation } from '@/lib/discovery';

/**
 * DiscoveryChatClient
 *
 * Thin client wrapper that connects DiscoveryChat to Next.js navigation.
 * Navigates to the recommendation page when synthesis completes.
 */
export function DiscoveryChatClient() {
  const router = useRouter();

  const handleComplete = useCallback((_recommendation: Recommendation) => {
    router.push('/discovery/recommendation');
  }, [router]);

  return <DiscoveryChat onComplete={handleComplete} />;
}
