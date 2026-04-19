// src/lib/paddle/webhook-handlers/adjustment-handlers.ts
//
// Handler for adjustment.created / adjustment.updated events. Paddle
// Billing routes both refunds AND chargebacks through the Adjustment
// entity — there is no dedicated transaction.refunded or
// transaction.chargeback event in this SDK version.

import 'server-only';
import {
  AdjustmentCreatedEvent,
  AdjustmentUpdatedEvent,
} from '@paddle/paddle-node-sdk';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { archiveExcessVenturesOnDowngrade } from '@/lib/lifecycle/tier-limits';
import { recordTierTransition } from './shared';

/**
 * Demotion rules:
 *   - Approved full refund (action='refund', type='full',
 *     status='approved') → demote to Free immediately. Money
 *     returned; paid access ends.
 *   - Approved partial refund → log only; user still has valid
 *     paid access through currentPeriodEnd.
 *   - Approved chargeback (action='chargeback', status='approved')
 *     → demote to Free immediately regardless of `type`. The bank
 *     already pulled funds; continued paid access is unfunded.
 *     Partial chargebacks are vanishingly rare in practice and we
 *     treat them the same as full — disputed money invalidates trust.
 *   - Anything else (pending/rejected/reversed, or
 *     credit/credit_reverse actions) → log at debug, no state change.
 *
 * Idempotency: tier-already-free guard short-circuits duplicate
 * webhooks before touching the database.
 */
export async function handleAdjustment(event: AdjustmentCreatedEvent | AdjustmentUpdatedEvent): Promise<void> {
  const data = event.data;

  const isApprovedRefund     = data.action === 'refund'     && data.status === 'approved';
  const isApprovedChargeback = data.action === 'chargeback' && data.status === 'approved';
  if (!isApprovedRefund && !isApprovedChargeback) {
    logger.debug('Paddle adjustment: ignored (not an approved refund or chargeback)', {
      adjustmentId: data.id,
      action:       data.action,
      status:       data.status,
      type:         data.type,
    });
    return;
  }

  if (!data.subscriptionId) {
    logger.info('Paddle refund adjustment has no subscriptionId — skipping tier demotion', {
      adjustmentId: data.id,
      transactionId: data.transactionId,
    });
    return;
  }

  if (isApprovedRefund && data.type === 'partial') {
    logger.info('Paddle partial refund — logged without tier demotion', {
      adjustmentId:        data.id,
      paddleSubscriptionId: data.subscriptionId,
    });
    return;
  }

  const existing = await prisma.subscription.findUnique({
    where:  { paddleSubscriptionId: data.subscriptionId },
    select: { userId: true, tier: true },
  });
  if (!existing) {
    logger.warn('Paddle full refund for unknown subscription', {
      paddleSubscriptionId: data.subscriptionId,
      adjustmentId:         data.id,
    });
    return;
  }

  if (existing.tier === 'free') {
    logger.info('Paddle full refund/chargeback — tier already free, skipping demotion', {
      paddleSubscriptionId: data.subscriptionId,
      adjustmentId:         data.id,
      action:               data.action,
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { paddleSubscriptionId: data.subscriptionId! },
      data: {
        status:            'canceled',
        tier:              'free',
        cancelAtPeriodEnd: false,
        currentPeriodEnd:  new Date(),
      },
    });
    await tx.user.update({
      where: { id: existing.userId },
      data:  { tierUpdatedAt: new Date() },
    });
    await recordTierTransition(tx, {
      userId:          existing.userId,
      fromTier:        existing.tier,
      toTier:          'free',
      paddleEventType: event.eventType,
      paddleEventId:   event.eventId,
    });
    await archiveExcessVenturesOnDowngrade(existing.userId, 'free', tx);
  });

  logger.info('Paddle adjustment processed — tier demoted to free', {
    userId:               existing.userId,
    paddleSubscriptionId: data.subscriptionId,
    adjustmentId:         data.id,
    action:               data.action,
    priorTier:            existing.tier,
  });
}
