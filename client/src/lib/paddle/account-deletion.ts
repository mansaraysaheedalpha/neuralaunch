// src/lib/paddle/account-deletion.ts
import 'server-only';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { paddleClient } from './client';

/**
 * Cancels every active Paddle subscription owned by `userId`, immediately.
 *
 * MUST be invoked before any code path that deletes the User row from
 * our database. The schema cascade on Subscription.userId would
 * otherwise wipe the local row while Paddle continued to renew the
 * customer's card forever — both a financial bug (charging for a
 * service the account no longer exists to consume) and a probable
 * GDPR Article 17 violation. ToS §9.6 explicitly promises:
 *
 *   "Request deletion of your payment data from Paddle"
 *
 * This helper makes that promise true.
 *
 * Behaviour:
 *   - Only acts on Subscriptions whose status is not already 'canceled'.
 *   - Calls Paddle once per active Subscription with
 *     effectiveFrom: 'immediately' so billing stops the same day.
 *   - If ANY Paddle call throws, the helper itself throws — the caller
 *     should treat that as "do not proceed with local deletion." A
 *     half-applied deletion (Paddle still billing, local row gone) is
 *     strictly worse than no deletion at all.
 *   - Idempotent in two senses: (a) re-runs on an already-cancelled
 *     subscription are no-ops because the where clause filters them
 *     out; (b) Paddle's cancel endpoint accepts a second cancellation
 *     of an already-cancelled subscription and returns the existing
 *     state, so a transient retry is safe.
 *
 * Returns the count of subscriptions actually cancelled, for audit.
 */
export async function cancelPaddleSubscriptionsForUser(userId: string): Promise<number> {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      userId,
      status: { not: 'canceled' },
      // Skip legacy backfill rows that never had a real Paddle
      // subscription — they have status='active' tier='free' but the
      // paddleSubscriptionId is the sentinel `legacy_free_<userId>`
      // and Paddle does not know about it. Sending those to
      // subscriptions.cancel returns 404. We filter them out by
      // requiring a real (non-empty) paddleCustomerId, which the
      // legacy backfill writes as ''.
      paddleCustomerId: { not: '' },
    },
    select: {
      paddleSubscriptionId: true,
      tier:                 true,
      status:               true,
    },
  });

  if (subscriptions.length === 0) {
    logger.info('Account deletion — no active Paddle subscriptions to cancel', { userId });
    return 0;
  }

  let cancelled = 0;
  for (const sub of subscriptions) {
    try {
      await paddleClient.subscriptions.cancel(sub.paddleSubscriptionId, {
        effectiveFrom: 'immediately',
      });
      cancelled++;
      logger.info('Account deletion — Paddle subscription cancelled', {
        userId,
        paddleSubscriptionId: sub.paddleSubscriptionId,
        priorTier:            sub.tier,
        priorStatus:          sub.status,
      });
    } catch (err) {
      logger.error(
        'Account deletion — Paddle cancel failed; aborting deletion',
        err instanceof Error ? err : new Error(String(err)),
        {
          userId,
          paddleSubscriptionId: sub.paddleSubscriptionId,
          cancelledSoFar:       cancelled,
        },
      );
      // Re-throw so the caller's deletion saga aborts.
      throw err;
    }
  }

  return cancelled;
}
