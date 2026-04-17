// src/app/api/webhooks/paddle/route.ts
import { NextResponse, after } from 'next/server';
import { paddleClient } from '@/lib/paddle/client';
import { handleWebhookEvent } from '@/lib/paddle/webhook-processor';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

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
 *   3. Schedule processing via after() — this decouples the database
 *      work from the HTTP response, ack'ing within Paddle's 5s budget
 *      even on cold starts. Idempotency in the processor covers the
 *      case where Paddle retries a delivery it believes timed out.
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

  // Hand the work to the platform's post-response scheduler so we can
  // return 200 immediately. Any processor failure is logged but never
  // fails the response — Paddle retries on non-2xx, but re-delivery of
  // a successfully-acked-but-partially-processed event is the
  // processor's job to handle idempotently.
  after(async () => {
    try {
      await handleWebhookEvent(event);
    } catch (err) {
      logger.error(
        'Paddle webhook processing failed',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  });

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
