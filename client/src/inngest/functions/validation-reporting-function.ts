// src/inngest/functions/validation-reporting-function.ts
import { Prisma }                     from '@prisma/client';
import { inngest }                    from '../client';
import prisma                         from '@/lib/prisma';
import { logger }                     from '@/lib/logger';
import { collectMetricsForPage }      from '@/lib/validation/metrics-collector';
import { interpretValidationMetrics } from '@/lib/validation/interpreter';
import {
  canGenerateBuildBrief,
  generateBuildBrief,
  shouldRegenerateBrief,
} from '@/lib/validation/build-brief-generator';
import { ValidationPageContentSchema, type ValidationInterpretation } from '@/lib/validation/schemas';
import {
  VALIDATION_REPORTING_EVENT,
  VALIDATION_SYNTHESIS_THRESHOLDS,
} from '@/lib/validation/constants';

// ---------------------------------------------------------------------------
// Fan-out scheduler — the cron job's only responsibility
// ---------------------------------------------------------------------------

/**
 * validationReportingSchedulerFunction
 *
 * Cron-triggered every N hours. Fetches the list of LIVE pages and emits
 * one validation/report.requested event per page. The per-page worker
 * function does the actual analytics + LLM work, so a single bad page
 * cannot starve the others.
 */
export const validationReportingSchedulerFunction = inngest.createFunction(
  {
    id:      'validation-reporting-scheduler',
    name:    'Validation — Reporting Scheduler (fan-out)',
    retries: 2,
    triggers: [
      { cron: `0 */${VALIDATION_SYNTHESIS_THRESHOLDS.THRESHOLD_CHECK_INTERVAL_HOURS} * * *` },
    ],
  },
  async ({ event, step }) => {
    const log = logger.child({ inngestFunction: 'validationReportingScheduler', runId: event.id });

    const pages = await step.run('load-live-pages', async () => {
      return prisma.validationPage.findMany({
        where:  { status: 'LIVE' },
        select: { id: true },
      });
    });

    if (pages.length === 0) {
      log.info('No live pages — scheduler exiting');
      return { enqueued: 0 };
    }

    await step.sendEvent('enqueue-reports', pages.map(p => ({
      name: VALIDATION_REPORTING_EVENT,
      data: { pageId: p.id },
    })));

    log.info('Reporting events enqueued', { enqueued: pages.length });
    return { enqueued: pages.length };
  },
);

// ---------------------------------------------------------------------------
// Per-page worker — one Inngest run per page, isolated failure domain
// ---------------------------------------------------------------------------

/**
 * validationReportingFunction
 *
 * Processes a single validation page's reporting cycle:
 *   1. Collect aggregated metrics from ValidationEvent
 *   2. Interpret with Sonnet (Step 1) — if any data exists
 *   3. Gate the build brief on thresholds AND material change
 *   4. Run Opus build brief (Step 2) and upsert ValidationReport
 *
 * Triggered by the scheduler via fan-out, or directly for on-demand runs.
 * Each run is one page — failures are isolated and retried independently.
 */
export const validationReportingFunction = inngest.createFunction(
  {
    id:      'validation-page-reporting',
    name:    'Validation — Per-Page Reporting',
    retries: 2,
    concurrency: { limit: 5 },
    triggers: [{ event: VALIDATION_REPORTING_EVENT }],
  },
  async ({ event, step }) => {
    const { pageId } = event.data as { pageId: string };
    const log = logger.child({ inngestFunction: 'validationReporting', pageId, runId: event.id });

    // --- Step 1: load page + previous report + parse content ---
    const pageData = await step.run('load-page', async () => {
      const page = await prisma.validationPage.findUnique({
        where:  { id: pageId },
        select: {
          id:                true,
          slug:              true,
          status:            true,
          content:           true,
          publishedAt:       true,
          distributionBrief: true,
          channelsCompleted: true,
          recommendation: {
            select: {
              path:    true,
              summary: true,
              session: {
                select: { beliefState: true },
              },
            },
          },
          report: {
            select: {
              id:          true,
              generatedAt: true,
              snapshotId:  true,
            },
          },
        },
      });

      if (!page || page.status !== 'LIVE') {
        log.info('Page not live — skipping');
        return null;
      }

      const parsed = ValidationPageContentSchema.safeParse(page.content);
      if (!parsed.success) {
        log.warn('Page content failed to parse — skipping reporting', { pageId });
        return null;
      }

      // Extract geographic market from the belief state — stored per
      // snapshot so future calibration work can aggregate by market
      // without touching the live DiscoverySession table.
      const belief = (page.recommendation?.session?.beliefState ?? {}) as {
        geographicMarket?: { value?: unknown };
      };
      const marketRaw = belief.geographicMarket?.value;
      const market = typeof marketRaw === 'string'
        ? marketRaw.slice(0, 200)
        : Array.isArray(marketRaw)
          ? marketRaw.filter((v): v is string => typeof v === 'string').join(', ').slice(0, 200)
          : null;

      return { page, content: parsed.data, market };
    });

    if (!pageData) return { skipped: true };
    const { page, content, market } = pageData;

    // --- Step 2: collect metrics ---
    const metrics = await step.run('collect-metrics', async () => {
      return collectMetricsForPage(page.id);
    });

    const hasAnyData = metrics.visitorCount > 0
      || metrics.featureClicks.length > 0
      || metrics.surveyResponses.length > 0;

    // --- Step 3: Sonnet interpretation ---
    let interpretation: ValidationInterpretation | null = null;
    if (hasAnyData) {
      interpretation = await step.run('interpret', async () => {
        try {
          const brief = (page.distributionBrief ?? []) as Array<{ channel: string }>;
          return await interpretValidationMetrics({
            slug:              page.slug,
            pageId:            page.id,
            metrics,
            features:          content.features,
            publishedAt:       page.publishedAt ? new Date(page.publishedAt) : new Date(),
            briefChannels:     brief.length,
            completedChannels: page.channelsCompleted.length,
          });
        } catch (err) {
          log.error(
            'Interpretation failed',
            err instanceof Error ? err : new Error(String(err)),
          );
          return null;
        }
      });
    }

    // --- Step 4: persist snapshot ---
    const snapshotId = await step.run('save-snapshot', async () => {
      const snapshot = await prisma.validationSnapshot.create({
        data: {
          validationPageId:   page.id,
          market,
          visitorCount:       metrics.visitorCount,
          uniqueVisitorCount: metrics.uniqueVisitorCount,
          ctaConversionRate:  metrics.ctaConversionRate,
          featureClicks:      metrics.featureClicks as object[],
          surveyResponses:    metrics.surveyResponses as object[],
          trafficSources:     metrics.trafficSources as object[],
          scrollDepthData:    metrics.scrollDepthData as object[],
          interpretation:     interpretation ?? Prisma.DbNull,
        },
        select: { id: true },
      });
      return snapshot.id;
    });

    // --- Step 5: gated build brief (Opus) ---
    if (!interpretation || !page.recommendation) {
      return { snapshotId, interpreted: interpretation !== null, briefGenerated: false };
    }

    const gate = canGenerateBuildBrief({ metrics });
    if (!gate.passes) {
      log.info('Build brief gate rejected', { reasons: gate.reasons });
      return { snapshotId, interpreted: true, briefGenerated: false, gateReasons: gate.reasons };
    }

    // Material-change gate — avoid regenerating on every cycle
    if (page.report) {
      const previousSnapshot = await prisma.validationSnapshot.findUnique({
        where:  { id: page.report.snapshotId },
        select: {
          visitorCount:    true,
          featureClicks:   true,
          surveyResponses: true,
        },
      });

      if (previousSnapshot) {
        const prevClicks = (previousSnapshot.featureClicks as Array<{ clicks?: number }>)
          .reduce((s, c) => s + (c.clicks ?? 0), 0);
        const prevSurveys = (previousSnapshot.surveyResponses as unknown[]).length;
        const daysSince = Math.floor(
          (Date.now() - new Date(page.report.generatedAt).getTime()) / (1000 * 60 * 60 * 24),
        );

        if (!shouldRegenerateBrief({
          previousVisitorCount: previousSnapshot.visitorCount,
          previousClickCount:   prevClicks,
          previousSurveyCount:  prevSurveys,
          currentMetrics:       metrics,
          daysSinceLastBrief:   daysSince,
        })) {
          log.info('No material change — skipping brief regeneration');
          return { snapshotId, interpreted: true, briefGenerated: false, reason: 'no-material-change' };
        }
      }
    }

    await step.run('generate-build-brief', async () => {
      const report = await generateBuildBrief({
        pageId:         page.id,
        slug:           page.slug,
        metrics,
        interpretation: interpretation!,
        features:       content.features,
        recommendation: {
          path:    page.recommendation!.path,
          summary: page.recommendation!.summary,
        },
      });

      if (page.report) {
        await prisma.validationReport.update({
          where: { id: page.report.id },
          data:  {
            snapshotId,
            generatedAt:             new Date(),
            signalStrength:          report.signalStrength,
            confirmedFeatures:       report.confirmedFeatures as object[],
            rejectedFeatures:        report.rejectedFeatures as object[],
            surveyInsights:          report.surveyInsights,
            buildBrief:              report.buildBrief,
            nextAction:              report.nextAction,
            disconfirmedAssumptions: report.disconfirmedAssumptions as unknown as Prisma.InputJsonValue,
            pivotOptions:            report.pivotOptions as unknown as Prisma.InputJsonValue,
            // A negative report overrides any prior MVP handoff flag — the
            // founder cannot unintentionally carry a discredited brief into
            // Phase 5 just because they marked an older positive version.
            ...(report.signalStrength === 'negative' ? { usedForMvp: false } : {}),
          },
        });
      } else {
        await prisma.validationReport.create({
          data: {
            validationPageId:        page.id,
            snapshotId,
            signalStrength:          report.signalStrength,
            confirmedFeatures:       report.confirmedFeatures as object[],
            rejectedFeatures:        report.rejectedFeatures as object[],
            surveyInsights:          report.surveyInsights,
            buildBrief:              report.buildBrief,
            nextAction:              report.nextAction,
            disconfirmedAssumptions: report.disconfirmedAssumptions as unknown as Prisma.InputJsonValue,
            pivotOptions:            report.pivotOptions as unknown as Prisma.InputJsonValue,
          },
        });
      }

      log.info('Build brief persisted', { signalStrength: report.signalStrength });
    });

    return { snapshotId, interpreted: true, briefGenerated: true };
  },
);
