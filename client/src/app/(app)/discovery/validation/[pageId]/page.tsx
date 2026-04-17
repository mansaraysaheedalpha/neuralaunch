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

const PivotOptionSchema = z.object({
  title:     z.string(),
  rationale: z.string(),
});

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
          signalStrength:          true,
          confirmedFeatures:       true,
          rejectedFeatures:        true,
          surveyInsights:          true,
          buildBrief:              true,
          nextAction:              true,
          usedForMvp:              true,
          generatedAt:             true,
          disconfirmedAssumptions: true,
          pivotOptions:            true,
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

  const confirmedParsed     = z.array(ConfirmedFeatureSchema).safeParse(page.report?.confirmedFeatures ?? []);
  const rejectedParsed      = z.array(RejectedFeatureSchema).safeParse(page.report?.rejectedFeatures ?? []);
  const disconfirmedParsed  = z.array(z.string()).safeParse(page.report?.disconfirmedAssumptions ?? []);
  const pivotParsed         = z.array(PivotOptionSchema).safeParse(page.report?.pivotOptions ?? []);

  const confirmedFeatures: ConfirmedFeature[] = confirmedParsed.success ? confirmedParsed.data : [];
  const rejectedFeatures:  RejectedFeature[]  = rejectedParsed.success  ? rejectedParsed.data  : [];
  const disconfirmedAssumptions: string[]     = disconfirmedParsed.success ? disconfirmedParsed.data : [];
  const pivotOptions = pivotParsed.success ? pivotParsed.data : [];

  return (
    <div className="flex h-full flex-col gap-0 overflow-y-auto">
      <div className="flex items-center justify-between border-b border-border px-6 py-3 shrink-0">
        <Link
          href={`/discovery/recommendations/${page.recommendationId}`}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          ← Back to recommendation
        </Link>
        <span className="text-xs text-muted-foreground">Validation Page Preview</span>
      </div>

      {/* Top section: fixed-height preview iframe + slim sidebar with
          the status / URL / publish controls. The distribution brief
          and the build brief panel deliberately do NOT live here —
          they need full width to be readable, and on mobile the
          288px sidebar collapses everything to unreadable noodles. */}
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
      </PreviewFrame>

      {/* Below-the-preview content sections. Each section is full-width
          (constrained to a readable max width) and stacks naturally on
          mobile. Distribution brief is the most actionable post-publish
          content the founder needs to engage with — give it room. */}
      {page.status === 'LIVE' && brief && brief.length > 0 && (
        <section className="border-b border-border px-6 py-8">
          <div className="max-w-3xl mx-auto">
            <DistributionTracker
              pageId={page.id}
              brief={brief}
              channelsCompleted={page.channelsCompleted}
            />
          </div>
        </section>
      )}

      {/* Fallback when the page is LIVE but the distribution brief
          either failed to generate, returned empty, or failed
          safeParse on read. Without this the founder sees no
          distribution affordance at all and has no way to know
          anything went wrong. */}
      {page.status === 'LIVE' && (!brief || brief.length === 0) && (
        <section className="border-b border-border px-6 py-8">
          <div className="max-w-3xl mx-auto rounded-lg border border-gold/30 bg-gold/5 p-4">
            <p className="text-[10px] uppercase tracking-widest text-gold mb-2">
              Distribution brief unavailable
            </p>
            <p className="text-xs text-foreground/80 leading-relaxed">
              The personalised distribution brief is missing for this page.
              The page itself is live and accepting visitors — you can
              still share the URL above directly. We are working on a
              regenerate-brief action; for now, archive and republish
              if you need the brief regenerated.
            </p>
          </div>
        </section>
      )}

      {page.report && (
        <section className="px-6 py-8">
          <div className="max-w-3xl mx-auto">
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
              disconfirmedAssumptions={disconfirmedAssumptions}
              pivotOptions={pivotOptions}
            />
          </div>
        </section>
      )}
    </div>
  );
}
