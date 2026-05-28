// src/app/(app)/discovery/standard/page.tsx
//
// Thin stub host for the standard discovery pipeline. Reads the
// archetype slug from ?archetype= and renders DiscoveryChat with the
// matching AudienceType preseed. PR 05 will redesign this surface to
// the Institute treatment; for now we route picker rows III–VI here
// without changing the underlying chat behaviour.

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { findArchetype } from '@/lib/archetype-status';
import { StandardDiscoveryClient } from './StandardDiscoveryClient';

interface StandardPageProps {
  searchParams: Promise<{ archetype?: string }>;
}

export default async function StandardDiscoveryPage({ searchParams }: StandardPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');

  const userId    = session.user.id;
  const firstName = session.user.name?.split(' ')[0] ?? '';

  const { archetype } = await searchParams;
  const arc = archetype ? findArchetype(archetype) : null;
  // Guard: when the slug doesn't resolve to a standard-path archetype
  // (no slug, unknown slug, or someone hand-pasted ?archetype=no_idea),
  // bounce back to the picker rather than mounting the chat with a
  // null preseed.
  if (!arc || arc.status !== 'legacy' || !arc.audienceType) {
    redirect('/discovery');
  }

  // Same FounderProfile lookup the legacy picker used to decide the
  // scenario preseed. With a profile we treat this as a "fresh_start"
  // (subsequent venture); without, it's the founder's "first_interview".
  const founderProfile = await prisma.founderProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  const hasFounderProfile = founderProfile !== null;

  const completedCount = await prisma.discoverySession.count({
    where: { userId, status: 'COMPLETE' },
  });
  const isFirstSession = completedCount === 0;

  return (
    <StandardDiscoveryClient
      firstName={firstName}
      isFirstSession={isFirstSession}
      audienceType={arc.audienceType}
      scenario={hasFounderProfile ? 'fresh_start' : 'first_interview'}
    />
  );
}
