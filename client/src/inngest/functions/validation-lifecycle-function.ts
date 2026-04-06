// src/inngest/functions/validation-lifecycle-function.ts
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
  },
  [
    // Run once a day at 03:00 UTC — off-peak for most timezones we serve
    { cron: '0 3 * * *' },
    { event: VALIDATION_LIFECYCLE_EVENT },
  ],
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

    return { draftsArchived, liveArchived };
  },
);
