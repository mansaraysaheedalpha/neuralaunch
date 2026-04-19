// src/lib/paddle/webhook-handlers/transaction-handlers.ts
//
// Handlers for transaction.completed (renewal success / past_due
// recovery) and transaction.payment_failed (dunning demotion +
// email + push).

import 'server-only';
import {
  TransactionCompletedEvent,
  TransactionPaymentFailedEvent,
} from '@paddle/paddle-node-sdk';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { resolveTier, type Tier } from '../tiers';
import {
  archiveExcessVenturesOnDowngrade,
  restoreArchivedVenturesOnUpgrade,
} from '@/lib/lifecycle/tier-limits';
import { sendPaymentFailedEmail } from '@/lib/email/templates/payment-failed';
import { sendPushToUser } from '@/lib/push/send-push';
import { recordTierTransition } from './shared';

// ---------------------------------------------------------------------------
// transaction.completed — renewal confirmed
// ---------------------------------------------------------------------------

export async function handleTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
  const data = event.data;
  if (!data.subscriptionId) return;

  // Scope the activation update to non-canceled rows so a late
  // transaction.completed event arriving after subscription.canceled
  // (rare event reordering during Paddle outages) cannot resurrect a
  // terminated subscription. Also re-resolves and restores the tier
  // from the row's existing priceId — this is the recovery path out
  // of past_due, where handlePaymentFailed demoted tier='free' to
  // suspend paid access during dunning. Once a renewal payment
  // succeeds, the user's paid tier snaps back here.
  const existing = await prisma.subscription.findFirst({
    where:  { paddleSubscriptionId: data.subscriptionId, status: { not: 'canceled' } },
    select: { userId: true, tier: true, priceId: true },
  });
  if (!existing) return;

  const { tier: restoredTier } = resolveTier(existing.priceId);

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { paddleSubscriptionId: data.subscriptionId! },
      data:  { status: 'active', tier: restoredTier },
    });
    if (existing.tier !== restoredTier) {
      await tx.user.update({
        where: { id: existing.userId },
        data:  { tierUpdatedAt: new Date() },
      });
      await recordTierTransition(tx, {
        userId:          existing.userId,
        fromTier:        existing.tier,
        toTier:          restoredTier,
        paddleEventType: event.eventType,
        paddleEventId:   event.eventId,
      });
      // Recovery from past_due: restore ventures archived during dunning.
      await restoreArchivedVenturesOnUpgrade(existing.userId, restoredTier as Tier, tx);
    }
  });
}

// ---------------------------------------------------------------------------
// transaction.payment_failed — triggers dunning UI + suspends access
// ---------------------------------------------------------------------------

export async function handlePaymentFailed(event: TransactionPaymentFailedEvent): Promise<void> {
  const data = event.data;
  if (!data.subscriptionId) return;

  // Demote tier to 'free' alongside status='past_due'. Paddle runs
  // ~14 days of retry attempts; without the demotion the user keeps
  // full paid access throughout, contradicting ToS §6.4 and burning
  // AI spend on a card that may never recover. The Subscription row
  // KEEPS its priceId, so handleTransactionCompleted can re-derive
  // and restore the paid tier the moment a retry succeeds.
  const existing = await prisma.subscription.findUnique({
    where:  { paddleSubscriptionId: data.subscriptionId },
    select: {
      userId: true,
      tier:   true,
      user:   { select: { email: true, name: true } },
    },
  });
  if (!existing) {
    logger.warn('Paddle payment_failed for unknown subscription', {
      paddleSubscriptionId: data.subscriptionId,
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { paddleSubscriptionId: data.subscriptionId! },
      data:  { status: 'past_due', tier: 'free' },
    });
    if (existing.tier !== 'free') {
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
    }
  });

  // Dunning notifications — fired AFTER the transaction commits so a
  // failed notification never rolls back the tier demotion. Both
  // channels are try/catch-wrapped so transport failures never bubble
  // up and 500 the webhook.
  if (existing.tier !== 'free' && existing.user?.email) {
    try {
      await sendPaymentFailedEmail({
        userId:    existing.userId,
        email:     existing.user.email,
        name:      existing.user.name,
        priorTier: existing.tier,
      });
    } catch (err) {
      logger.error(
        'Dunning email dispatch failed — continuing webhook OK',
        err instanceof Error ? err : new Error(String(err)),
        { userId: existing.userId },
      );
    }
  }

  if (existing.tier !== 'free') {
    try {
      await sendPushToUser(
        existing.userId,
        'Payment failed',
        'Update your card to restore NeuraLaunch access.',
        { screen: 'settings', reason: 'payment_failed' },
      );
    } catch (err) {
      logger.warn('Dunning push dispatch failed — continuing webhook OK', {
        userId: existing.userId,
        error:  err instanceof Error ? err.message : String(err),
      });
    }
  }
}
