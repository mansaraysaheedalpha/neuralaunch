// src/inngest/functions/validation-reporting-function.ts
import { inngest }              from '../client';
import prisma                    from '@/lib/prisma';
import { logger }                from '@/lib/logger';
import { collectMetricsForPage }      from '@/lib/validation/metrics-collector';
import { interpretValidationMetrics } from '@/lib/validation/interpreter';
import {
  canGenerateBuildBrief,
  generateBuildBrief,
} from '@/lib/validation/build-brief-generator';
import type {
  ValidationPageContent,
  ValidationInterpretation,
} from '@/lib/validation/schemas';
import {
  VALIDATION_REPORTING_EVENT,
  VALIDATION_SYNTHESIS_THRESHOLDS,
} from '@/lib/validation/constants';

/**
 * validationReportingFunction
 *
 * Scheduled Inngest function — the heartbeat of the Phase 3 validation loop.
 *
 * Trigger:  cron (every N hours, controlled by THRESHOLD_CHECK_INTERVAL_HOURS)
 *           + on-demand via the 'validation/report.requested' event.
 *
 * For each LIVE ValidationPage:
 *   1. Collect raw PostHog metrics for the page's slug
 *   2. Write a ValidationSnapshot with the aggregated numbers
 *   3. (Steps 11-13 will attach interpretation here)
 *
 * Idempotent — running twice in the same cycle just writes two snapshots
 * with the same data, which is acceptable. The interpretation layer dedupes
 * on takenAt.
 *
 * Designed to degrade gracefully: any single page failure is caught and
 * logged, the loop continues with the next page. A broken PostHog API
 * must never stop the entire validation layer.
 */
export const validationReportingFunction = inngest.createFunction(
  {
    id:      'validation-page-reporting',
    name:    'Validation — Periodic Page Reporting',
    retries: 2,
  },
  [
    {
      cron: `0 */${VALIDATION_SYNTHESIS_THRESHOLDS.THRESHOLD_CHECK_INTERVAL_HOURS} * * *`,
    },
    {
      event: VALIDATION_REPORTING_EVENT,
    },
  ],
  async ({ event, step }) => {
    const log = logger.child({
      inngestFunction: 'validationReporting',
      runId:           event.id,
    });

    // Step 1: Fetch every LIVE page. If a specific pageId was supplied on the
    // event (on-demand trigger), scope the cycle to just that one page.
    const pageIds = await step.run('load-live-pages', async () => {
      const requestedPageId = (event.data as { pageId?: string } | undefined)?.pageId;

      const pages = await prisma.validationPage.findMany({
        where: {
          status: 'LIVE',
          ...(requestedPageId ? { id: requestedPageId } : {}),
        },
        select: {
          id:                true,
          slug:              true,
          content:           true,
          publishedAt:       true,
          distributionBrief: true,
          channelsCompleted: true,
          recommendation:    { select: { path: true, summary: true } },
          report:            { select: { id: true } },
        },
      });

      log.info('Reporting cycle starting', { pageCount: pages.length });
      return pages;
    });

    if (pageIds.length === 0) {
      log.info('No live pages to report on — exiting');
      return { processed: 0 };
    }

    // Step 2: Process each page in its own durable step so a single failure
    // does not lose the work already completed for prior pages.
    let processed = 0;
    for (const page of pageIds) {
      try {
        // --- Step 2a: snapshot + interpretation ---
        const snapshotResult = await step.run(`snapshot-${page.id}`, async () => {
          const metrics = await collectMetricsForPage(page.slug);
          const content = page.content as ValidationPageContent;
          const brief   = (page.distributionBrief ?? []) as Array<{ channel: string }>;

          // Skip interpretation entirely when there is no data at all.
          const hasAnyData = metrics.visitorCount > 0
            || metrics.featureClicks.length > 0
            || metrics.surveyResponses.length > 0;

          let interpretation: ValidationInterpretation | null = null;
          if (hasAnyData) {
            try {
              interpretation = await interpretValidationMetrics({
                slug:              page.slug,
                pageId:            page.id,
                metrics,
                features:          content.features,
                publishedAt:       page.publishedAt ?? new Date(),
                briefChannels:     brief.length,
                completedChannels: page.channelsCompleted.length,
              });
            } catch (err) {
              log.error('Interpretation failed — writing snapshot without it', {
                pageId: page.id,
                error:  String(err),
              });
            }
          }

          const snapshot = await prisma.validationSnapshot.create({
            data: {
              validationPageId:   page.id,
              visitorCount:       metrics.visitorCount,
              uniqueVisitorCount: metrics.uniqueVisitorCount,
              ctaConversionRate:  metrics.ctaConversionRate,
              featureClicks:      metrics.featureClicks as object[],
              surveyResponses:    metrics.surveyResponses as object[],
              trafficSources:     metrics.trafficSources as object[],
              scrollDepthData:    metrics.scrollDepthData as object[],
              interpretation,
            },
            select: { id: true },
          });

          log.debug('Snapshot written', {
            pageId:      page.id,
            snapshotId:  snapshot.id,
            interpreted: interpretation !== null,
          });

          return { snapshotId: snapshot.id, metrics, interpretation };
        });

        // --- Step 2b: gated build brief (Opus) ---
        if (snapshotResult.interpretation && page.recommendation) {
          const gate = canGenerateBuildBrief({ metrics: snapshotResult.metrics });

          if (!gate.passes) {
            log.info('Build brief gate rejected', {
              pageId:  page.id,
              reasons: gate.reasons,
            });
          } else {
            await step.run(`build-brief-${page.id}`, async () => {
              const content = page.content as ValidationPageContent;
              const report  = await generateBuildBrief({
                pageId:         page.id,
                slug:           page.slug,
                metrics:        snapshotResult.metrics,
                interpretation: snapshotResult.interpretation!,
                features:       content.features,
                recommendation: page.recommendation!,
              });

              // Upsert — newest report replaces previous (history kept in snapshots)
              if (page.report) {
                await prisma.validationReport.update({
                  where: { id: page.report.id },
                  data:  {
                    snapshotId:        snapshotResult.snapshotId,
                    generatedAt:       new Date(),
                    signalStrength:    report.signalStrength,
                    confirmedFeatures: report.confirmedFeatures as object[],
                    rejectedFeatures:  report.rejectedFeatures as object[],
                    surveyInsights:    report.surveyInsights,
                    buildBrief:        report.buildBrief,
                    nextAction:        report.nextAction,
                  },
                });
              } else {
                await prisma.validationReport.create({
                  data: {
                    validationPageId:  page.id,
                    snapshotId:        snapshotResult.snapshotId,
                    signalStrength:    report.signalStrength,
                    confirmedFeatures: report.confirmedFeatures as object[],
                    rejectedFeatures:  report.rejectedFeatures as object[],
                    surveyInsights:    report.surveyInsights,
                    buildBrief:        report.buildBrief,
                    nextAction:        report.nextAction,
                  },
                });
              }

              log.info('Build brief persisted', {
                pageId:         page.id,
                signalStrength: report.signalStrength,
              });
            });
          }
        }
        processed++;
      } catch (error) {
        log.error('Page reporting failed — continuing with next page', {
          pageId: page.id,
          error:  String(error),
        });
      }
    }

    log.info('Reporting cycle complete', { processed, total: pageIds.length });
    return { processed };
  },
);
