// src/app/(app)/discovery/standard/page.tsx
//
// Server entry for the standard 4-phase discovery interview (picker
// rows III–VI). Reads the archetype slug from ?archetype=, resolves
// the AudienceType preseed + short crumb label, and mounts the
// Institute <StandardChat> shell via StandardDiscoveryClient. Auth +
// archetype guards live here; all chat behaviour lives in the client.

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

  // Short crumb label per archetype — the full headline is too long for
  // the top-bar breadcrumb.
  const CRUMB_LABEL: Record<string, string> = {
    builder:        'Builder',
    owner:          'Owner',
    'early-career': 'Early career',
    'mid-career':   'Mid-career',
  };
  const archetypeLabel = CRUMB_LABEL[arc.id] ?? 'Standard';

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
      archetypeLabel={archetypeLabel}
    />
  );
}
