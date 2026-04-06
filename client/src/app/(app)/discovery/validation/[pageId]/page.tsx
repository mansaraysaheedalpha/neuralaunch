// src/app/(app)/discovery/validation/[pageId]/page.tsx
import { notFound, redirect } from 'next/navigation';
import Link                   from 'next/link';
import { auth }               from '@/auth';
import prisma                 from '@/lib/prisma';
import { env }                from '@/lib/env';
import { z }                  from 'zod';
import { ValidationPageControls } from './ValidationPageControls';
import { DistributionTracker }    from './DistributionTracker';
import { BuildBriefPanel }        from './BuildBriefPanel';
import { PreviewFrame }           from './PreviewFrame';
import {
  DistributionBriefSchema,
  ConfirmedFeatureSchema,
  RejectedFeatureSchema,
  type DistributionBrief,
  type ConfirmedFeature,
  type RejectedFeature,
} from '@/lib/validation/schemas';

interface ValidationPreviewPageProps {
  params: Promise<{ pageId: string }>;
}

export default async function ValidationPreviewPage({ params }: ValidationPreviewPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const userId = session.user.id;

  const { pageId } = await params;

  const page = await prisma.validationPage.findFirst({
    where:  { id: pageId, userId },
    select: {
      id:                true,
      slug:              true,
      status:            true,
      recommendationId:  true,
      distributionBrief: true,
      channelsCompleted: true,
      report: {
        select: {
          signalStrength:    true,
          confirmedFeatures: true,
          rejectedFeatures:  true,
          surveyInsights:    true,
          buildBrief:        true,
          nextAction:        true,
          usedForMvp:        true,
          generatedAt:       true,
        },
      },
    },
  });

  if (!page) notFound();

  const siteUrl = env.NEXT_PUBLIC_APP_URL ?? env.NEXT_PUBLIC_SITE_URL ?? '';
  const pageUrl = `${siteUrl}/lp/${page.slug}`;

  // Parse JSON columns safely — malformed rows render as if they had no data
  const briefParsed = DistributionBriefSchema.safeParse(page.distributionBrief);
  const brief: DistributionBrief | null = briefParsed.success ? briefParsed.data : null;

  const confirmedParsed = z.array(ConfirmedFeatureSchema).safeParse(page.report?.confirmedFeatures ?? []);
  const rejectedParsed  = z.array(RejectedFeatureSchema).safeParse(page.report?.rejectedFeatures ?? []);

  const confirmedFeatures: ConfirmedFeature[] = confirmedParsed.success ? confirmedParsed.data : [];
  const rejectedFeatures:  RejectedFeature[]  = rejectedParsed.success  ? rejectedParsed.data  : [];

  return (
    <div className="flex h-full flex-col gap-0">
      <div className="flex items-center justify-between border-b border-border px-6 py-3 shrink-0">
        <Link
          href={`/discovery/recommendations/${page.recommendationId}`}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          ← Back to recommendation
        </Link>
        <span className="text-xs text-muted-foreground">Validation Page Preview</span>
      </div>

      <PreviewFrame slug={page.slug}>
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

        {page.report && (
          <BuildBriefPanel
            pageId={page.id}
            signalStrength={page.report.signalStrength}
            confirmedFeatures={confirmedFeatures}
            rejectedFeatures={rejectedFeatures}
            surveyInsights={page.report.surveyInsights}
            buildBrief={page.report.buildBrief}
            nextAction={page.report.nextAction}
            usedForMvp={page.report.usedForMvp}
            generatedAt={page.report.generatedAt.toISOString()}
          />
        )}
      </PreviewFrame>
    </div>
  );
}
