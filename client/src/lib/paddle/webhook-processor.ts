// src/lib/paddle/webhook-processor.ts
import 'server-only';
import {
  EventEntity,
  EventName,
  SubscriptionCreatedEvent,
  SubscriptionUpdatedEvent,
  SubscriptionCanceledEvent,
  SubscriptionPausedEvent,
  TransactionCompletedEvent,
  TransactionPaymentFailedEvent,
} from '@paddle/paddle-node-sdk';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { resolveTier } from './tiers';

/**
 * Webhook event dispatcher.
 *
 * Called from app/api/webhooks/paddle/route.ts after the SDK has already
 * verified the HMAC signature and parsed the payload into a typed
 * EventEntity union. Every handler is idempotent — Paddle retries
 * deliveries it believes timed out, and the upsert/update patterns
 * tolerate duplicate events without double-writing.
 */
export async function handleWebhookEvent(event: EventEntity): Promise<void> {
  switch (event.eventType) {
    case EventName.SubscriptionCreated:
      return handleSubscriptionCreated(event);
    case EventName.SubscriptionUpdated:
      return handleSubscriptionUpdated(event);
    case EventName.SubscriptionCanceled:
      return handleSubscriptionCanceled(event);
    case EventName.SubscriptionPaused:
      return handleSubscriptionPaused(event);
    case EventName.TransactionCompleted:
      return handleTransactionCompleted(event);
    case EventName.TransactionPaymentFailed:
      return handlePaymentFailed(event);
    default:
      // Every other Paddle event is ignored. Logging at debug level so
      // production noise is contained but the full trail is available
      // when investigating a specific subscription.
      logger.debug('Paddle webhook: ignored event type', { eventType: event.eventType });
      return;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the internal user id we stamped onto the checkout via
 * customData. Every checkout opened by SubscribeButton carries it. If
 * it is missing, the subscription originated outside our app (manual
 * creation in the Paddle dashboard, for instance) and we cannot
 * reconcile it to a user — so we log and bail, rather than guessing.
 */
function readInternalUserId(customData: unknown): string | null {
  if (customData && typeof customData === 'object' && 'internalUserId' in customData) {
    const id = (customData as { internalUserId: unknown }).internalUserId;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return null;
}

function firstPriceId(items: { price: { id: string } | null }[]): string | null {
  const first = items[0];
  if (!first || !first.price) return null;
  return first.price.id ?? null;
}

function periodEnd(endsAt: string | null | undefined): Date {
  // Paddle always populates current_billing_period.ends_at on an active
  // subscription. Fall back to a sentinel far future only if Paddle
  // ever omits it — the reconciliation webhook on the next cycle will
  // correct it. We never want to write a null into a NOT NULL column.
  if (endsAt) return new Date(endsAt);
  return new Date('2099-12-31T00:00:00Z');
}

// ---------------------------------------------------------------------------
// subscription.created
// ---------------------------------------------------------------------------

async function handleSubscriptionCreated(event: SubscriptionCreatedEvent): Promise<void> {
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
      },
    });
  });

  logger.info('Paddle subscription.created processed', {
    userId: internalUserId,
    tier,
    isFounder,
  });
}

// ---------------------------------------------------------------------------
// subscription.updated
// ---------------------------------------------------------------------------

async function handleSubscriptionUpdated(event: SubscriptionUpdatedEvent): Promise<void> {
  const data = event.data;
  const priceId = firstPriceId(data.items);
  const { tier, isFounder } = resolveTier(priceId);
  const scheduledCancel = data.scheduledChange?.action === 'cancel';

  const existing = await prisma.subscription.findUnique({
    where:  { paddleSubscriptionId: data.id },
    select: { userId: true, tier: true },
  });

  if (!existing) {
    // Update before create is possible if events arrive out of order.
    // Rather than silently dropping, log so operations can replay the
    // created event from the Paddle dashboard if needed.
    logger.warn('Paddle subscription.updated for unknown subscription', {
      paddleSubscriptionId: data.id,
    });
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

    if (existing.tier !== tier) {
      await tx.user.update({
        where: { id: existing.userId },
        data:  { tierUpdatedAt: new Date() },
      });
    }
  });
}

// ---------------------------------------------------------------------------
// subscription.canceled — terminal
// ---------------------------------------------------------------------------

async function handleSubscriptionCanceled(event: SubscriptionCanceledEvent): Promise<void> {
  const data = event.data;
  const existing = await prisma.subscription.findUnique({
    where:  { paddleSubscriptionId: data.id },
    select: { userId: true },
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
  });
}

// ---------------------------------------------------------------------------
// subscription.paused
// ---------------------------------------------------------------------------

async function handleSubscriptionPaused(event: SubscriptionPausedEvent): Promise<void> {
  const data = event.data;
  await prisma.subscription.updateMany({
    where: { paddleSubscriptionId: data.id },
    data:  { status: 'paused' },
  });
}

// ---------------------------------------------------------------------------
// transaction.completed — renewal confirmed
// ---------------------------------------------------------------------------

async function handleTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
  const data = event.data;
  if (!data.subscriptionId) return;
  await prisma.subscription.updateMany({
    where: { paddleSubscriptionId: data.subscriptionId },
    data:  { status: 'active' },
  });
}

// ---------------------------------------------------------------------------
// transaction.payment_failed — triggers dunning UI
// ---------------------------------------------------------------------------

async function handlePaymentFailed(event: TransactionPaymentFailedEvent): Promise<void> {
  const data = event.data;
  if (!data.subscriptionId) return;
  await prisma.subscription.updateMany({
    where: { paddleSubscriptionId: data.subscriptionId },
    data:  { status: 'past_due' },
  });
}
