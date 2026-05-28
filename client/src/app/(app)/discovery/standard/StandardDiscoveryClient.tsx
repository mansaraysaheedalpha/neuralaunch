'use client';
// src/app/(app)/discovery/standard/StandardDiscoveryClient.tsx
//
// Mounts the Institute standard-discovery shell with the audience
// preseed + archetype label resolved server-side from the ?archetype=
// param. Owns only the onComplete routing; all chat behaviour lives in
// StandardChat + useDiscoverySession.

import { useRouter } from 'next/navigation';
import { StandardChat } from '@/components/discovery/standard/StandardChat';
import type { AudienceType } from '@/lib/discovery';
import type { Recommendation } from '@/lib/discovery/client';

interface StandardDiscoveryClientProps {
  firstName:      string;
  isFirstSession: boolean;
  audienceType:   AudienceType;
  scenario:       'first_interview' | 'fresh_start';
  archetypeLabel: string;
}

export function StandardDiscoveryClient({
  firstName,
  isFirstSession,
  audienceType,
  scenario,
  archetypeLabel,
}: StandardDiscoveryClientProps) {
  const router = useRouter();
  return (
    <StandardChat
      firstName={firstName}
      isFirstSession={isFirstSession}
      audienceType={audienceType}
      scenario={scenario}
      archetypeLabel={archetypeLabel}
      onComplete={(_rec: Recommendation, conversationId: string) => {
        // Preserve the working recommendation route (?from=conversationId).
        // PR 06 redesigns + may re-parameterise /discovery/recommendation;
        // routing here stays on the live shape so synthesis completion
        // never lands on a 404.
        const dest = conversationId
          ? `/discovery/recommendation?from=${conversationId}`
          : '/discovery/recommendation';
        router.push(dest);
      }}
    />
  );
}
