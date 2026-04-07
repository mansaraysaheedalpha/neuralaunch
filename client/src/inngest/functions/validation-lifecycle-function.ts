// src/inngest/functions/validation-lifecycle-function.ts
import { Prisma }     from '@prisma/client';
import { inngest }    from '../client';
import prisma         from '@/lib/prisma';
import { logger }     from '@/lib/logger';
import {
  VALIDATION_LIFECYCLE_EVENT,
  VALIDATION_PAGE_CONFIG,
} from '@/lib/validation/constants';

/**
 * validationLifecycleFunction
 *
 * Daily cron function that archives stale validation pages.
 *
 * Rules:
 *   1. DRAFT pages that have sat unpublished for > DRAFT_EXPIRY_HOURS are
 *      archived. These are abandoned drafts — keeping them around pollutes
 *      the dashboard and wastes reporting cycles.
 *   2. LIVE pages older than MAX_ACTIVE_DAYS are archived. This prevents
 *      indefinitely active pages with no meaningful data from consuming
 *      scheduled reporting runs forever.
 *
 * Archived pages are never deleted — they remain viewable in the dashboard
 * (just labelled "archived") and all their snapshots/reports stay intact.
 * The public /lp/[slug] route returns 404 for archived pages.
 *
 * Idempotent — running twice in the same day is a no-op on the second pass.
 */
export const validationLifecycleFunction = inngest.createFunction(
  {
    id:      'validation-page-lifecycle',
    name:    'Validation — Page Lifecycle Sweep',
    retries: 2,
    triggers: [
      // Run once a day at 03:00 UTC — off-peak for most timezones we serve
      { cron: '0 3 * * *' },
      { event: VALIDATION_LIFECYCLE_EVENT },
    ],
  },
  async ({ event, step }) => {
    const log = logger.child({
      inngestFunction: 'validationLifecycle',
      runId:           event.id,
    });

    const now = new Date();

    // --- Archive abandoned drafts ---
    const draftCutoff = new Date(
      now.getTime() - VALIDATION_PAGE_CONFIG.DRAFT_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    const draftsArchived = await step.run('archive-stale-drafts', async () => {
      const result = await prisma.validationPage.updateMany({
        where: {
          status:    'DRAFT',
          updatedAt: { lt: draftCutoff },
        },
        data: {
          status:     'ARCHIVED',
          archivedAt: now,
        },
      });
      log.info('Stale drafts archived', { count: result.count, cutoff: draftCutoff.toISOString() });
      return result.count;
    });

    // --- Archive expired live pages ---
    const liveCutoff = new Date(
      now.getTime() - VALIDATION_PAGE_CONFIG.MAX_ACTIVE_DAYS * 24 * 60 * 60 * 1000,
    );

    const liveArchived = await step.run('archive-expired-live-pages', async () => {
      const result = await prisma.validationPage.updateMany({
        where: {
          status:      'LIVE',
          publishedAt: { lt: liveCutoff },
        },
        data: {
          status:     'ARCHIVED',
          archivedAt: now,
        },
      });
      log.info('Expired live pages archived', { count: result.count, cutoff: liveCutoff.toISOString() });
      return result.count;
    });

    // --- Purge raw events for pages archived more than 90 days ago ---
    // Archived pages remain viewable, but their raw event streams are no
    // longer needed for reporting. Keeping them forever would bloat
    // ValidationEvent unboundedly.
    const eventPurgeCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const eventsPurged = await step.run('purge-old-archived-events', async () => {
      const result = await prisma.validationEvent.deleteMany({
        where: {
          validationPage: {
            status:     'ARCHIVED',
            archivedAt: { lt: eventPurgeCutoff },
          },
        },
      });
      log.info('Old archived events purged', { count: result.count });
      return result.count;
    });

    // --- Concern 5: 24-month TTL on outcome anonymised payloads ---
    // Hard horizon for the training corpus. NeuraLaunch's standard
    // is meaningfully higher than the lab industry-norm of "forever
    // until you ask for deletion." 24 months caps the worst-case
    // exposure window even if the company is ever acquired. The
    // historical full record stays for the founder's personal view;
    // only the anonymisedRecord JSON column is nulled here.
    const trainingTtlCutoff = new Date(now.getTime() - 24 * 30 * 24 * 60 * 60 * 1000);

    const trainingPurged = await step.run('purge-expired-training-records', async () => {
      const result = await prisma.recommendationOutcome.updateMany({
        where: {
          submittedAt: { lt: trainingTtlCutoff },
          NOT: { anonymisedRecord: { equals: Prisma.JsonNull } },
        },
        data: { anonymisedRecord: Prisma.JsonNull },
      });
      log.info('Expired training records purged', { count: result.count });
      return result.count;
    });

    return { draftsArchived, liveArchived, eventsPurged, trainingPurged };
  },
);
