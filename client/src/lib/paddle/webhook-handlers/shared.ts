// src/lib/paddle/webhook-handlers/shared.ts
//
// Shared helpers used by subscription-handlers, transaction-handlers,
// and adjustment-handlers. Keeping them in one place prevents drift
// between handler files and lets the dispatcher in webhook-processor.ts
// stay thin.

import 'server-only';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';

export type Tx = Prisma.TransactionClient;

/**
 * True when a Prisma error is a unique-constraint violation on
 * TierTransition.paddleEventId — i.e. a Paddle webhook redelivery for
 * an event we already recorded. Callers translate this into a 200 ack
 * so Paddle stops retrying.
 */
export function isDuplicatePaddleEventError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;
  const target = err.meta?.target;
  // Prisma reports `target` as either string[] (newer drivers) or a
  // single string. Normalise both shapes to the same check.
  if (Array.isArray(target)) return target.includes('paddleEventId');
  if (typeof target === 'string') return target.includes('paddleEventId');
  return false;
}

/**
 * Extract the internal user id we stamped onto the checkout via
 * customData. Every checkout opened by SubscribeButton carries it. If
 * it is missing, the subscription originated outside our app (manual
 * creation in the Paddle dashboard, for instance) and we cannot
 * reconcile it to a user — so we log and bail, rather than guessing.
 */
export function readInternalUserId(customData: unknown): string | null {
  if (customData && typeof customData === 'object' && 'internalUserId' in customData) {
    const id = (customData as { internalUserId: unknown }).internalUserId;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return null;
}

export function firstPriceId(items: { price: { id: string } | null }[]): string | null {
  const first = items[0];
  if (!first || !first.price) return null;
  return first.price.id ?? null;
}

export function periodEnd(endsAt: string | null | undefined): Date {
  // Paddle always populates current_billing_period.ends_at on an active
  // subscription. Fall back to a sentinel far future only if Paddle
  // ever omits it — the reconciliation webhook on the next cycle will
  // correct it. We never want to write a null into a NOT NULL column.
  if (endsAt) return new Date(endsAt);
  return new Date('2099-12-31T00:00:00Z');
}

/**
 * Tier rank for User.lastPaidTier monotone-increment logic.
 * The field tracks the PEAK paid tier a user ever held — bumps on
 * upgrade, never decreases on downgrade / cancel / refund.
 */
export const TIER_RANK: Record<string, number> = {
  free:     0,
  execute:  1,
  compound: 2,
};

/**
 * Returns the higher of the existing lastPaidTier and the newly-resolved
 * tier, or null if neither is a paid tier. Free is never written to
 * lastPaidTier — the field is only meaningful once a user has paid.
 */
export function nextLastPaidTier(existing: string | null, candidate: string): string | null {
  if (candidate === 'free') return existing;
  const existingRank = existing ? TIER_RANK[existing] ?? 0 : -1;
  const candidateRank = TIER_RANK[candidate] ?? 0;
  return candidateRank > existingRank ? candidate : existing;
}

/**
 * Append a tier-transition row when fromTier !== toTier. Inside the
 * caller's transaction so the audit row commits atomically with the
 * mutation it describes — no orphan audits, no missing audits.
 *
 * Required for chargeback dispute evidence (Paddle expects to see
 * when access was granted / revoked) and for any future churn
 * analysis. Also pairs with the tierUpdatedAt bump so the
 * session-tier cache invalidates the moment the audit row lands.
 *
 * Idempotency on Paddle redeliveries:
 *   TierTransition.paddleEventId is @unique. The findUnique pre-check
 *   handles the common serial-redelivery case (Paddle waits minutes
 *   between retries) cleanly — no row is created, the tx commits,
 *   the route acks 200 and Paddle stops retrying. The rare concurrent
 *   redelivery still races past the pre-check, hits the unique
 *   constraint at commit time, and aborts the tx with P2002 — the
 *   route catches that via isDuplicatePaddleEventError() and acks 200.
 */
export async function recordTierTransition(
  tx: Tx,
  args: {
    userId:          string;
    fromTier:        string | null;
    toTier:          string;
    paddleEventType: string;
    paddleEventId:   string;
  },
): Promise<void> {
  if (args.fromTier === args.toTier) return;

  const existing = await tx.tierTransition.findUnique({
    where:  { paddleEventId: args.paddleEventId },
    select: { id: true },
  });
  if (existing) {
    logger.info('Paddle webhook redelivery — TierTransition already recorded', {
      paddleEventId:   args.paddleEventId,
      paddleEventType: args.paddleEventType,
      userId:          args.userId,
    });
    return;
  }

  await tx.tierTransition.create({
    data: {
      userId:          args.userId,
      fromTier:        args.fromTier,
      toTier:          args.toTier,
      paddleEventType: args.paddleEventType,
      paddleEventId:   args.paddleEventId,
    },
  });
}
