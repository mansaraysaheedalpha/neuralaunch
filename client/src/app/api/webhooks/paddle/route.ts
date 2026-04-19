// src/app/api/webhooks/paddle/route.ts
import { NextResponse } from 'next/server';
import { paddleClient } from '@/lib/paddle/client';
import { handleWebhookEvent } from '@/lib/paddle/webhook-processor';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

// Processor runs inline (see below) and the slowest handler is
// handleSubscriptionCreated's single transaction — comfortably inside
// Paddle's 5s delivery budget even on a cold start. maxDuration of 30s
// gives generous headroom without letting a hung query sit forever.
export const maxDuration = 30;

/**
 * Paddle webhook receiver.
 *
 * Flow:
 *   1. Read the raw body as text — NEVER req.json(). The Paddle SDK
 *      verifies the HMAC signature against the exact bytes Paddle sent;
 *      re-serialising via JSON breaks the signature.
 *   2. unmarshal() performs signature verification + typed parsing in
 *      one step. If it throws, the payload is unauthenticated and we
 *      reject with 400.
 *   3. Run handleWebhookEvent INLINE and only 200 after it returns
 *      successfully. If the handler throws (DB outage, constraint
 *      violation, transient Prisma issue), we respond 500 so Paddle
 *      enters its retry schedule. The prior after()-based fire-and-
 *      forget path silently lost state on DB errors because Paddle
 *      never saw a non-2xx to retry against. Handlers are already
 *      idempotent so Paddle-retry-after-partial-success is safe.
 */
export async function POST(req: Request) {
  const signature = req.headers.get('paddle-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }

  // CRITICAL: req.text() — re-serialising via req.json() breaks the HMAC.
  const rawBody = await req.text();

  let event;
  try {
    event = await paddleClient.webhooks.unmarshal(
      rawBody,
      env.PADDLE_WEBHOOK_SECRET,
      signature,
    );
  } catch (err) {
    logger.warn('Paddle webhook signature verification failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Signature mismatch' }, { status: 400 });
  }

  if (!event) {
    return NextResponse.json({ error: 'Empty event' }, { status: 400 });
  }

  try {
    await handleWebhookEvent(event);
  } catch (err) {
    logger.error(
      'Paddle webhook processing failed',
      err instanceof Error ? err : new Error(String(err)),
      { eventType: event.eventType },
    );
    // 500 so Paddle retries. Handlers are idempotent — a retry after
    // a partially-applied transaction is safe.
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
