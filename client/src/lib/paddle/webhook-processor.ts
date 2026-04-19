// src/lib/paddle/webhook-processor.ts
//
// Thin dispatcher for Paddle webhook events. Each handler lives in
// src/lib/paddle/webhook-handlers/<family>.ts and this file exists
// only to switch on event.eventType and route to the right one.
//
// See webhook-handlers/shared.ts for the common helpers every handler
// depends on (readInternalUserId, recordTierTransition, etc.).

import 'server-only';
import { EventEntity, EventName } from '@paddle/paddle-node-sdk';
import { logger } from '@/lib/logger';
import {
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionCanceled,
  handleSubscriptionPaused,
  handleTransactionCompleted,
  handlePaymentFailed,
  handleAdjustment,
} from './webhook-handlers';

/**
 * Webhook event dispatcher.
 *
 * Called from app/api/webhooks/paddle/route.ts after the SDK has
 * already verified the HMAC signature and parsed the payload into a
 * typed EventEntity union. Every handler is idempotent — Paddle
 * retries deliveries it believes timed out, and the upsert/update
 * patterns tolerate duplicate events without double-writing.
 */
export async function handleWebhookEvent(event: EventEntity): Promise<void> {
  switch (event.eventType) {
    case EventName.SubscriptionCreated:
      return handleSubscriptionCreated(event);
    // subscription.activated and subscription.resumed share the same
    // notification shape as subscription.updated. Route them through
    // the same handler — the behaviour (re-derive tier from priceId,
    // refresh the row) is identical. Defensive against Paddle ordering
    // edge cases where a resume may not be accompanied by a paired
    // updated event.
    case EventName.SubscriptionUpdated:
    case EventName.SubscriptionActivated:
    case EventName.SubscriptionResumed:
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
      logger.debug('Paddle webhook: ignored event type', { eventType: event.eventType });
      return;
  }
}
