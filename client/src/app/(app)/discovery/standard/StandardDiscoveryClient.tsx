'use client';
// src/app/(app)/discovery/standard/StandardDiscoveryClient.tsx
//
// Wraps DiscoveryChat with the audience preseed coming from the
// /discovery picker's archetype param. PR 05 will rebuild this
// surface; for now it preserves the legacy chat behaviour inside the
// new app shell.

import { useRouter } from 'next/navigation';
import { DiscoveryChat } from '@/components/discovery';
import type { AudienceType } from '@/lib/discovery';
import type { Recommendation } from '@/lib/discovery/client';

interface StandardDiscoveryClientProps {
  firstName:      string;
  isFirstSession: boolean;
  audienceType:   AudienceType;
  scenario:       'first_interview' | 'fresh_start';
}

export function StandardDiscoveryClient({
  firstName,
  isFirstSession,
  audienceType,
  scenario,
}: StandardDiscoveryClientProps) {
  const router = useRouter();
  return (
    <DiscoveryChat
      firstName={firstName}
      isFirstSession={isFirstSession}
      onComplete={(rec: Recommendation, conversationId: string) => {
        const dest = conversationId
          ? `/discovery/recommendation?from=${conversationId}`
          : '/discovery/recommendation';
        router.push(dest);
      }}
      preseed={{ audienceType, scenario }}
    />
  );
}
