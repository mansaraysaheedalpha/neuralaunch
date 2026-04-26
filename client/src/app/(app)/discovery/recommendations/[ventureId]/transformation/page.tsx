// src/app/(app)/discovery/recommendations/[ventureId]/transformation/page.tsx
//
// Private viewer for the Transformation Report. Server component:
// guards auth, validates ownership, hands off to the client view
// which polls the status endpoint until the report renders.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { TransformationReportView } from './TransformationReportView';

export default async function TransformationReportPage({
  params,
}: {
  params: Promise<{ ventureId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const userId = session.user.id;

  const { ventureId } = await params;

  // Ownership + existence check. A 404 here means either the
  // ventureId is fake / belongs to someone else, or the venture
  // exists but Mark Complete has never been clicked.
  const venture = await prisma.venture.findFirst({
    where:  { id: ventureId, userId },
    select: {
      id:    true,
      name:  true,
      status: true,
      transformationReport: { select: { id: true } },
    },
  });

  if (!venture) redirect('/discovery/recommendations');

  // No report yet — the founder reached this URL before Mark
  // Complete fired (or after a 24h reopen wiped the row). Send
  // them back to the Sessions tab.
  if (!venture.transformationReport) redirect('/discovery/recommendations');

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between px-6 pt-4">
        <Link
          href="/discovery/recommendations"
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          ← Back to your ventures
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto">
        <TransformationReportView ventureId={venture.id} initialVentureName={venture.name} />
      </div>
    </div>
  );
}
