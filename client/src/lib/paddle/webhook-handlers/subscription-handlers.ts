// src/lib/paddle/webhook-handlers/subscription-handlers.ts
//
// All subscription.* event handlers: created, updated (+ activated,
// resumed routed through the same handler), canceled, paused.

import 'server-only';
import {
  SubscriptionCreatedEvent,
  SubscriptionUpdatedEvent,
  SubscriptionActivatedEvent,
  SubscriptionResumedEvent,
  SubscriptionCanceledEvent,
  SubscriptionPausedEvent,
} from '@paddle/paddle-node-sdk';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { resolveTier, type Tier } from '../tiers';
import { checkFoundingOverflow, invalidateFoundingCountCache } from '../founding-members';
import {
  archiveExcessVenturesOnDowngrade,
  restoreArchivedVenturesOnUpgrade,
} from '@/lib/lifecycle/tier-limits';
import {
  readInternalUserId,
  firstPriceId,
  periodEnd,
  nextLastPaidTier,
  recordTierTransition,
} from './shared';

// ---------------------------------------------------------------------------
// subscription.created
// ---------------------------------------------------------------------------

export async function handleSubscriptionCreated(event: SubscriptionCreatedEvent): Promise<void> {
  const data = event.data;
  const internalUserId = readInternalUserId(data.customData);

  if (!internalUserId) {
    logger.error(
      'Paddle subscription.created missing customData.internalUserId',
      new Error('no-internal-user-id'),
      { paddleSubscriptionId: data.id, paddleCustomerId: data.customerId },
    );
    return;
  }

  const priceId = firstPriceId(data.items);
  const { tier, isFounder } = resolveTier(priceId);
  const interval = data.billingCycle?.interval ?? 'month';
  const endDate = periodEnd(data.currentBillingPeriod?.endsAt);

  // Upsert on userId (the natural unique key — Subscription.userId is
  // @unique, one Subscription per user) rather than paddleSubscriptionId.
  // The legacy backfill script writes sentinel rows with
  // paddleSubscriptionId='legacy_free_<userId>' and tier='free'; keying
  // the upsert on paddleSubscriptionId silently triggered the create
  // branch when a real Paddle sub arrived, which then collided on the
  // userId @unique constraint and bubbled a 500 into the webhook
  // route's after() — the user was charged, Paddle saw a 200, and the
  // Subscription row stayed stuck as 'free'. Keying on userId overwrites
  // any prior row (legacy or real) with authoritative Paddle state.
  await prisma.$transaction(async (tx) => {
    const prior = await tx.subscription.findUnique({
      where:  { userId: internalUserId },
      select: { tier: true },
    });
    const priorUser = await tx.user.findUnique({
      where:  { id: internalUserId },
      select: { lastPaidTier: true, wasFoundingMember: true, firstSubscribedAt: true },
    });
    const nextPeak = nextLastPaidTier(priorUser?.lastPaidTier ?? null, tier);

    await tx.subscription.upsert({
      where: { userId: internalUserId },
      update: {
        paddleSubscriptionId: data.id,
        paddleCustomerId:     data.customerId,
        status:               data.status,
        tier,
        priceId:              priceId ?? undefined,
        billingInterval:      interval,
        isFoundingMember:     isFounder,
        cancelAtPeriodEnd:    false,
        currentPeriodEnd:     endDate,
      },
      create: {
        userId:               internalUserId,
        paddleSubscriptionId: data.id,
        paddleCustomerId:     data.customerId,
        status:               data.status,
        tier,
        priceId:              priceId ?? undefined,
        billingInterval:      interval,
        isFoundingMember:     isFounder,
        currentPeriodEnd:     endDate,
      },
    });

    await tx.user.update({
      where: { id: internalUserId },
      data: {
        paddleCustomerId: data.customerId,
        tierUpdatedAt:    new Date(),
        lastPaidTier:       nextPeak ?? undefined,
        wasFoundingMember:  isFounder || priorUser?.wasFoundingMember ? true : undefined,
        firstSubscribedAt:  priorUser?.firstSubscribedAt ?? (tier !== 'free' ? new Date() : undefined),
      },
    });

    await recordTierTransition(tx, {
      userId:          internalUserId,
      fromTier:        prior?.tier ?? null,
      toTier:          tier,
      paddleEventType: event.eventType,
      paddleEventId:   event.eventId,
    });
    await restoreArchivedVenturesOnUpgrade(internalUserId, tier as Tier, tx);
  });

  logger.info('Paddle subscription.created processed', {
    userId: internalUserId,
    tier,
    isFounder,
  });

  if (isFounder) {
    await checkFoundingOverflow();
    await invalidateFoundingCountCache();
  }
}

// ---------------------------------------------------------------------------
// subscription.updated (also handles activated + resumed)
// ---------------------------------------------------------------------------

export async function handleSubscriptionUpdated(
  event: SubscriptionUpdatedEvent | SubscriptionActivatedEvent | SubscriptionResumedEvent,
): Promise<void> {
  const data = event.data;
  const priceId = firstPriceId(data.items);
  const { tier, isFounder } = resolveTier(priceId);
  const scheduledCancel = data.scheduledChange?.action === 'cancel';

  const existing = await prisma.subscription.findUnique({
    where:  { paddleSubscriptionId: data.id },
    select: { userId: true, tier: true },
  });

  if (!existing) {
    // Event-reordering recovery: synthesise a row from the update
    // payload itself when customData.internalUserId is present.
    const internalUserId = readInternalUserId(data.customData);
    if (!internalUserId) {
      logger.warn('Paddle subscription.updated for unknown subscription, no customData.internalUserId — cannot synthesise', {
        paddleSubscriptionId: data.id,
      });
      return;
    }
    logger.warn('Paddle subscription.updated for unknown subscription — synthesising created-equivalent row', {
      paddleSubscriptionId: data.id,
      userId:               internalUserId,
    });

    const interval = data.billingCycle?.interval ?? 'month';
    const endDate  = periodEnd(data.currentBillingPeriod?.endsAt);
    await prisma.$transaction(async (tx) => {
      const prior = await tx.subscription.findUnique({
        where:  { userId: internalUserId },
        select: { tier: true },
      });
      const priorUser = await tx.user.findUnique({
        where:  { id: internalUserId },
        select: { lastPaidTier: true, wasFoundingMember: true, firstSubscribedAt: true },
      });
      const nextPeak = nextLastPaidTier(priorUser?.lastPaidTier ?? null, tier);
      await tx.subscription.upsert({
        where: { userId: internalUserId },
        update: {
          paddleSubscriptionId: data.id,
          paddleCustomerId:     data.customerId,
          status:               data.status,
          tier,
          priceId:              priceId ?? undefined,
          billingInterval:      interval,
          isFoundingMember:     isFounder,
          cancelAtPeriodEnd:    scheduledCancel,
          currentPeriodEnd:     endDate,
        },
        create: {
          userId:               internalUserId,
          paddleSubscriptionId: data.id,
          paddleCustomerId:     data.customerId,
          status:               data.status,
          tier,
          priceId:              priceId ?? undefined,
          billingInterval:      interval,
          isFoundingMember:     isFounder,
          cancelAtPeriodEnd:    scheduledCancel,
          currentPeriodEnd:     endDate,
        },
      });
      await tx.user.update({
        where: { id: internalUserId },
        data: {
          paddleCustomerId: data.customerId,
          tierUpdatedAt:    new Date(),
          lastPaidTier:       nextPeak ?? undefined,
          wasFoundingMember:  isFounder || priorUser?.wasFoundingMember ? true : undefined,
          firstSubscribedAt:  priorUser?.firstSubscribedAt ?? (tier !== 'free' ? new Date() : undefined),
        },
      });
      await recordTierTransition(tx, {
        userId:          internalUserId,
        fromTier:        prior?.tier ?? null,
        toTier:          tier,
        paddleEventType: event.eventType,
        paddleEventId:   event.eventId,
      });
    });
    if (isFounder) {
      await checkFoundingOverflow();
      await invalidateFoundingCountCache();
    }
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { paddleSubscriptionId: data.id },
      data: {
        status:            data.status,
        tier,
        priceId:           priceId ?? undefined,
        isFoundingMember:  isFounder,
        cancelAtPeriodEnd: scheduledCancel,
        currentPeriodEnd:  periodEnd(data.currentBillingPeriod?.endsAt),
      },
    });

    const priorUser = await tx.user.findUnique({
      where:  { id: existing.userId },
      select: { lastPaidTier: true, wasFoundingMember: true, firstSubscribedAt: true },
    });
    const nextPeak = nextLastPaidTier(priorUser?.lastPaidTier ?? null, tier);
    const historyPatch: {
      lastPaidTier?: string;
      wasFoundingMember?: boolean;
      firstSubscribedAt?: Date;
    } = {};
    if (nextPeak && nextPeak !== priorUser?.lastPaidTier) historyPatch.lastPaidTier = nextPeak;
    if (isFounder && !priorUser?.wasFoundingMember) historyPatch.wasFoundingMember = true;
    if (!priorUser?.firstSubscribedAt && tier !== 'free') historyPatch.firstSubscribedAt = new Date();

    if (existing.tier !== tier) {
      await tx.user.update({
        where: { id: existing.userId },
        data:  { tierUpdatedAt: new Date(), ...historyPatch },
      });
      await recordTierTransition(tx, {
        userId:          existing.userId,
        fromTier:        existing.tier,
        toTier:          tier,
        paddleEventType: event.eventType,
        paddleEventId:   event.eventId,
      });
      // Venture preservation across tier transitions — both helpers
      // are no-ops when inapplicable.
      await archiveExcessVenturesOnDowngrade(existing.userId, tier as Tier, tx);
      await restoreArchivedVenturesOnUpgrade(existing.userId, tier as Tier, tx);
    } else if (Object.keys(historyPatch).length > 0) {
      await tx.user.update({
        where: { id: existing.userId },
        data:  historyPatch,
      });
    }
  });

  if (isFounder) {
    await checkFoundingOverflow();
    await invalidateFoundingCountCache();
  }
}

// ---------------------------------------------------------------------------
// subscription.canceled — terminal
// ---------------------------------------------------------------------------

export async function handleSubscriptionCanceled(event: SubscriptionCanceledEvent): Promise<void> {
  const data = event.data;
  const existing = await prisma.subscription.findUnique({
    where:  { paddleSubscriptionId: data.id },
    select: { userId: true, tier: true },
  });

  if (!existing) {
    logger.warn('Paddle subscription.canceled for unknown subscription', {
      paddleSubscriptionId: data.id,
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { paddleSubscriptionId: data.id },
      data: {
        status:            'canceled',
        tier:              'free',
        cancelAtPeriodEnd: false,
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
}

// ---------------------------------------------------------------------------
// subscription.paused
// ---------------------------------------------------------------------------

export async function handleSubscriptionPaused(event: SubscriptionPausedEvent): Promise<void> {
  const data = event.data;

  // Demote tier alongside the paused status. A paused subscription
  // has stopped billing, so the user is not paying for paid features;
  // leaving tier at 'compound' would let a paused subscriber keep
  // unlimited access until Paddle eventually cancels.
  //
  // Resume recovery depends on Paddle re-emitting subscription.updated
  // with a recognised paid priceId on resume — current Paddle Billing
  // behaviour does this, but it is not a contract we control.
  const existing = await prisma.subscription.findUnique({
    where:  { paddleSubscriptionId: data.id },
    select: { userId: true, tier: true },
  });
  if (!existing) {
    logger.warn('Paddle subscription.paused for unknown subscription', {
      paddleSubscriptionId: data.id,
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { paddleSubscriptionId: data.id },
      data:  { status: 'paused', tier: 'free' },
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
}
