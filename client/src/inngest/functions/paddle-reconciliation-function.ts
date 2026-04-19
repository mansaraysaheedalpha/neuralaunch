// src/inngest/functions/paddle-reconciliation-function.ts
//
// Nightly reconciliation sweep comparing local Subscription state
// against Paddle's authoritative state. Detects three failure modes:
//
//   1. Webhooks dropped during outages (safety net for the rare case
//      that slips past the inline-await retry pattern in the webhook
//      route).
//   2. Subscriptions cancelled manually in the Paddle dashboard with
//      no webhook fired (Paddle's dashboard sometimes allows this).
//   3. Tier mismatches between Paddle's authoritative state and our
//      cache (e.g. a priceId change made via Paddle dashboard that
//      never surfaced a subscription.updated event).
//
// Current scope: DETECT AND LOG ONLY. Discrepancies emit
// logger.error so Sentry captures them (via the console-logging
// integration already wired). Humans review the alerts and fix
// manually via webhook replay from the Paddle dashboard or a
// direct database update. Silent auto-reconciliation is too risky
// for billing data — a bug in the reconciler could overwrite correct
// state with a mis-read Paddle payload and we'd have no audit trail.

import 'server-only';
import { inngest } from '../client';
import prisma from '@/lib/prisma';
import { paddleClient } from '@/lib/paddle/client';
import { resolveTier } from '@/lib/paddle/tiers';
import { logger } from '@/lib/logger';

/**
 * Cap on the number of subscriptions checked per run. Keeps a single
 * cron invocation bounded so we don't hammer Paddle's API if the
 * subscriber count grows large. Cursor-paginate when this is
 * consistently hit — the warn log surfaces the moment we cross.
 */
const RECONCILIATION_CANDIDATE_CAP = 1000;

interface Discrepancy {
  userId:               string;
  paddleSubscriptionId: string;
  field:                'status' | 'tier' | 'currentPeriodEnd';
  local:                string;
  remote:               string;
}

export const paddleReconciliationFunction = inngest.createFunction(
  {
    id:      'paddle-reconciliation',
    name:    'Paddle — Daily subscription reconciliation',
    retries: 1,
    triggers: [
      // 3am UTC — low-traffic window globally.
      { cron: '0 3 * * *' },
    ],
  },
  async ({ event, step }) => {
    const log = logger.child({ inngestFunction: 'paddleReconciliation', runId: event.id });

    // Step 1: load every local subscription that should exist on
    // Paddle's side. Skip legacy backfill rows (`legacy_free_*`
    // sentinel) — Paddle doesn't know about them.
    const localSubs = await step.run('load-local-subs', async () => {
      const rows = await prisma.subscription.findMany({
        where: {
          status:               { in: ['active', 'past_due', 'paused'] },
          paddleSubscriptionId: { not: { startsWith: 'legacy_' } },
        },
        select: {
          userId:               true,
          paddleSubscriptionId: true,
          tier:                 true,
          status:               true,
          currentPeriodEnd:     true,
          priceId:              true,
        },
        take: RECONCILIATION_CANDIDATE_CAP,
        orderBy: { updatedAt: 'asc' },
      });
      if (rows.length === RECONCILIATION_CANDIDATE_CAP) {
        log.warn('[PaddleReconciliation] Hit candidate cap — some subscriptions skipped', {
          cap: RECONCILIATION_CANDIDATE_CAP,
        });
      }
      return rows;
    });

    if (localSubs.length === 0) {
      log.info('No active subscriptions to reconcile');
      return { checked: 0, discrepancies: 0, fetchErrors: 0 };
    }

    // Step 2: fetch each one from Paddle and compare. We don't wrap
    // the whole loop in step.run because each fetch is independently
    // retryable-at-the-request level; failing one shouldn't rewind
    // the others. Paddle's rate limits are generous for read API;
    // sequential calls at ~5 rps are well inside bounds.
    const discrepancies: Discrepancy[] = [];
    let fetchErrors = 0;

    for (const local of localSubs) {
      try {
        const remote = await paddleClient.subscriptions.get(local.paddleSubscriptionId);

        if (remote.status !== local.status) {
          discrepancies.push({
            userId:               local.userId,
            paddleSubscriptionId: local.paddleSubscriptionId,
            field:                'status',
            local:                local.status,
            remote:               remote.status,
          });
        }

        // Tier is derived from the first item's priceId — compare
        // against the tier we have cached.
        const remotePriceId = remote.items?.[0]?.price?.id ?? null;
        const { tier: remoteTier } = resolveTier(remotePriceId);
        if (remoteTier !== local.tier) {
          discrepancies.push({
            userId:               local.userId,
            paddleSubscriptionId: local.paddleSubscriptionId,
            field:                'tier',
            local:                local.tier,
            remote:               remoteTier,
          });
        }

        const remoteEnd = remote.currentBillingPeriod?.endsAt
          ? new Date(remote.currentBillingPeriod.endsAt).getTime()
          : null;
        // Inngest step.run serialises return values through JSON, so
        // `local.currentPeriodEnd` comes back as a string. Coerce
        // once per row here rather than annotating the type further up.
        const localEndDate = new Date(local.currentPeriodEnd);
        const localEnd = localEndDate.getTime();
        // Allow up to 60s of drift — Paddle and our Postgres clock
        // aren't perfectly aligned and we only want to flag real
        // divergence.
        if (remoteEnd !== null && Math.abs(remoteEnd - localEnd) > 60_000) {
          discrepancies.push({
            userId:               local.userId,
            paddleSubscriptionId: local.paddleSubscriptionId,
            field:                'currentPeriodEnd',
            local:                localEndDate.toISOString(),
            remote:               new Date(remoteEnd).toISOString(),
          });
        }
      } catch (err) {
        fetchErrors++;
        logger.error(
          'Paddle reconciliation fetch failed',
          err instanceof Error ? err : new Error(String(err)),
          {
            subscriptionId: local.paddleSubscriptionId,
            userId:         local.userId,
          },
        );
      }
    }

    if (discrepancies.length > 0) {
      // Log each discrepancy individually so Sentry can group by
      // field+local+remote pattern. A single mass-error with the
      // entire list would bucket everything into one issue.
      for (const d of discrepancies) {
        logger.error(
          '[PaddleReconciliation] discrepancy detected',
          new Error('paddle-reconciliation-discrepancy'),
          {
            userId:               d.userId,
            paddleSubscriptionId: d.paddleSubscriptionId,
            field:                d.field,
            local:                d.local,
            remote:               d.remote,
          },
        );
      }
    }

    log.warn('[PaddleReconciliation] Sweep complete', {
      checked:       localSubs.length,
      discrepancies: discrepancies.length,
      fetchErrors,
    });

    return {
      checked:       localSubs.length,
      discrepancies: discrepancies.length,
      fetchErrors,
    };
  },
);
