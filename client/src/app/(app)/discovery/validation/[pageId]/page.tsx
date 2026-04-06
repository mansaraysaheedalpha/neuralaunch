// src/app/(app)/discovery/validation/[pageId]/page.tsx
import { notFound, redirect } from 'next/navigation';
import Link                   from 'next/link';
import { auth }               from '@/auth';
import prisma                 from '@/lib/prisma';
import { env }                from '@/lib/env';
import { ValidationPageControls } from './ValidationPageControls';
import { DistributionTracker }    from './DistributionTracker';
import type { DistributionBrief } from '@/lib/validation/schemas';

interface ValidationPreviewPageProps {
  params: Promise<{ pageId: string }>;
}

/**
 * ValidationPreviewPage
 *
 * Server Component — in-app preview of the founder's validation landing page.
 * Shows the live /lp/[slug] route inside an iframe alongside:
 *   - Status badge (DRAFT / LIVE)
 *   - Publish button (DRAFT only)
 *   - Copy link button (LIVE only)
 *   - Regenerate button (DRAFT only)
 */
export default async function ValidationPreviewPage({ params }: ValidationPreviewPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const userId = session.user.id;

  const { pageId } = await params;

  const page = await prisma.validationPage.findUnique({
    where:  { id: pageId, userId },
    select: {
      id:                true,
      slug:              true,
      status:            true,
      recommendationId:  true,
      distributionBrief: true,
      channelsCompleted: true,
    },
  });

  if (!page) notFound();

  const siteUrl = env.NEXT_PUBLIC_APP_URL ?? env.NEXT_PUBLIC_SITE_URL ?? '';
  const pageUrl = `${siteUrl}/lp/${page.slug}`;
  const brief   = (page.distributionBrief ?? null) as DistributionBrief | null;

  return (
    <div className="flex h-full flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3 shrink-0">
        <Link
          href={`/discovery/recommendations/${page.recommendationId}`}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          ← Back to recommendation
        </Link>
        <span className="text-xs text-muted-foreground">Validation Page Preview</span>
      </div>

      {/* Split layout: iframe + controls */}
      <div className="flex flex-1 overflow-hidden">
        {/* iframe — takes up available space */}
        <div className="flex-1 overflow-hidden border-r border-border">
          <iframe
            src={`/lp/${page.slug}`}
            className="h-full w-full"
            title="Validation page preview"
          />
        </div>

        {/* Controls panel */}
        <div className="w-72 shrink-0 overflow-y-auto p-6 flex flex-col gap-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-1">Your validation page</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Preview how your page looks to visitors. Publish when you're happy — then share it.
            </p>
          </div>

          <ValidationPageControls
            pageId={page.id}
            recommendationId={page.recommendationId}
            slug={page.slug}
            status={page.status as 'DRAFT' | 'LIVE' | 'ARCHIVED'}
            pageUrl={pageUrl}
          />

          {page.status === 'LIVE' && brief && brief.length > 0 && (
            <div className="pt-6 border-t border-border">
              <DistributionTracker
                pageId={page.id}
                brief={brief}
                channelsCompleted={page.channelsCompleted}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
