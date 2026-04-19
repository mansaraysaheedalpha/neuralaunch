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
  AdjustmentCreatedEvent,
  AdjustmentUpdatedEvent,
} from '@paddle/paddle-node-sdk';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { resolveTier } from './tiers';
import { checkFoundingOverflow } from './founding-members';

type Tx = Prisma.TransactionClient;

/**
 * Append a tier-transition row when fromTier !== toTier. Inside the
 * caller's transaction so the audit row commits atomically with the
 * mutation it describes — no orphan audits, no missing audits.
 *
 * Required for chargeback dispute evidence (Paddle expects to see
 * when access was granted / revoked) and for any future churn
 * analysis. Also pairs with the tierUpdatedAt bump so the
 * session-tier cache invalidates the moment the audit row lands.
 */
async function recordTierTransition(
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
    case EventName.AdjustmentCreated:
    case EventName.AdjustmentUpdated:
      return handleAdjustment(event);
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
  //
  // Capture the prior tier for the audit log (legacy backfill = 'free',
  // no row at all = null). Read inside the transaction so concurrent
  // webhooks see consistent prior-state.
  await prisma.$transaction(async (tx) => {
    const prior = await tx.subscription.findUnique({
      where:  { userId: internalUserId },
      select: { tier: true },
    });

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

    await recordTierTransition(tx, {
      userId:          internalUserId,
      fromTier:        prior?.tier ?? null,
      toTier:          tier,
      paddleEventType: event.eventType,
      paddleEventId:   event.eventId,
    });
  });

  logger.info('Paddle subscription.created processed', {
    userId: internalUserId,
    tier,
    isFounder,
  });

  if (isFounder) {
    // Soft-cap observability for the accepted TOCTOU race in
    // founding-members.ts. Logs an error if we've over-allocated
    // past the alert threshold (default 55).
    await checkFoundingOverflow();
  }
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
    // Event-reordering recovery: if subscription.updated arrives before
    // subscription.created (rare but real during Paddle outages), OR if
    // the created event was permanently lost, we can synthesise the
    // row from the update payload itself — SubscriptionUpdatedNotification
    // carries the same customData shape that created uses. Gives us a
    // single escape hatch for the "permanently lost created event" case
    // rather than leaving the subscription orphan forever.
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
    if (isFounder) await checkFoundingOverflow();
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
      await recordTierTransition(tx, {
        userId:          existing.userId,
        fromTier:        existing.tier,
        toTier:          tier,
        paddleEventType: event.eventType,
        paddleEventId:   event.eventId,
      });
    }
  });

  if (isFounder) {
    // Defensive: an updated event that flips a row into founding
    // state (rare — typically only created sets this) still goes
    // through the soft-cap check.
    await checkFoundingOverflow();
  }
}

// ---------------------------------------------------------------------------
// subscription.canceled — terminal
// ---------------------------------------------------------------------------

async function handleSubscriptionCanceled(event: SubscriptionCanceledEvent): Promise<void> {
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
  });
}

// ---------------------------------------------------------------------------
// subscription.paused
// ---------------------------------------------------------------------------

async function handleSubscriptionPaused(event: SubscriptionPausedEvent): Promise<void> {
  const data = event.data;

  // Demote tier alongside the paused status. A paused subscription
  // has stopped billing, so the user is not paying for paid features;
  // leaving tier at 'compound' would let a paused subscriber keep
  // unlimited access until Paddle eventually cancels.
  //
  // Resume recovery depends on Paddle re-emitting subscription.updated
  // with a recognised paid priceId on resume — current Paddle Billing
  // behaviour does this, but it is not a contract we control. If
  // resume ever arrives with a null or unrecognised priceId,
  // resolveTier() falls back to 'free' and the user stays demoted
  // until a subsequent event lands with valid data. Support would
  // then need to investigate and manually restore tier.
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
    }
  });
}

// ---------------------------------------------------------------------------
// transaction.completed — renewal confirmed
// ---------------------------------------------------------------------------

async function handleTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
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
    }
  });
}

// ---------------------------------------------------------------------------
// transaction.payment_failed — triggers dunning UI + suspends access
// ---------------------------------------------------------------------------

async function handlePaymentFailed(event: TransactionPaymentFailedEvent): Promise<void> {
  const data = event.data;
  if (!data.subscriptionId) return;

  // Demote tier to 'free' alongside status='past_due'. Paddle runs
  // ~14 days of retry attempts; without the demotion the user keeps
  // full paid access throughout, contradicting ToS §6.4 ("access to
  // paid features may be temporarily suspended") and burning AI
  // spend on a card that may never recover. The Subscription row
  // KEEPS its priceId, so handleTransactionCompleted can re-derive
  // and restore the paid tier the moment a retry succeeds.
  const existing = await prisma.subscription.findUnique({
    where:  { paddleSubscriptionId: data.subscriptionId },
    select: { userId: true, tier: true },
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
    }
  });
}

// ---------------------------------------------------------------------------
// adjustment.created / adjustment.updated — refund handling
// ---------------------------------------------------------------------------

/**
 * Paddle Billing routes refunds AND chargebacks through the Adjustment
 * entity — there is no dedicated `transaction.refunded` or
 * `transaction.chargeback` event.
 *
 * Demotion rules:
 *   - Approved full refund (action='refund', type='full',
 *     status='approved') → demote to Free immediately. Money returned;
 *     paid access ends.
 *   - Approved partial refund → log only; user still has valid paid
 *     access through currentPeriodEnd.
 *   - Approved chargeback (action='chargeback', status='approved') →
 *     demote to Free immediately regardless of `type`. The bank already
 *     pulled funds; continued paid access is unfunded. Partial
 *     chargebacks are vanishingly rare in practice and we treat them
 *     the same as full — disputed money invalidates trust.
 *   - Anything else (pending / rejected / reversed, or
 *     credit / credit_reverse actions) → log at debug, no state change.
 *
 * Idempotency is natural: if tier is already 'free' and status is
 * already 'canceled' the update is a no-op on semantics. The
 * tier-already-free guard short-circuits duplicate webhooks before
 * touching the database.
 */
async function handleAdjustment(event: AdjustmentCreatedEvent | AdjustmentUpdatedEvent): Promise<void> {
  const data = event.data;

  // Acceptable demoting actions: refund (we issued one) and chargeback
  // (the bank pulled the money back). A chargeback is a STRONGER signal
  // than a refund — if the bank already clawed the funds, the user's
  // continued paid access is unfunded. Status must be 'approved' for
  // either to take effect; pending/rejected/reversed never demote.
  // Other actions (credit, credit_reverse) and unhandled statuses fall
  // through to the no-op log path.
  const isApprovedRefund    = data.action === 'refund'    && data.status === 'approved';
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

  // Partial refunds: the user still has valid paid access through
  // currentPeriodEnd. We log for audit but do not demote tier.
  // Chargebacks (any type) always demote — if the bank pulled funds
  // we shouldn't be honouring continued paid access on disputed money,
  // and partial chargebacks are vanishingly rare in practice.
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

  // Idempotency: if the subscription is already free + canceled, a
  // duplicate webhook is a no-op. We still bump tierUpdatedAt only
  // when tier actually transitions, so the session callback only
  // invalidates once.
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
  });

  logger.info('Paddle adjustment processed — tier demoted to free', {
    userId:               existing.userId,
    paddleSubscriptionId: data.subscriptionId,
    adjustmentId:         data.id,
    action:               data.action,
    priorTier:            existing.tier,
  });
}
