'use server';

import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { paddleClient } from '@/lib/paddle/client';
import { logger } from '@/lib/logger';
import { HttpError, rateLimitByUser } from '@/lib/validation/server-helpers';
import { RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Generate a one-time authenticated link to the Paddle customer portal.
 *
 * The returned URL is ephemeral — it expires on Paddle's side after a
 * short window. Do not cache it, do not store it, do not share it.
 * Regenerate on every click.
 *
 * Flow:
 *   1. Rate-limit the calling user (60/min — one legitimate flow needs
 *      one call; the cap blocks a console-loop attacker from burning
 *      Paddle's API quota for everyone else on the merchant account).
 *   2. Read the signed-in user's paddleCustomerId + paddleSubscriptionId
 *      from our database.
 *   3. Ask Paddle to mint a portal session scoped to that customer +
 *      the subscription(s) they own.
 *   4. Return the overview URL for the caller to redirect to.
 *
 * Users who have never checked out have no paddleCustomerId and get a
 * friendly-error return value instead of a thrown exception; the UI
 * uses the { ok: false } branch to render a disabled state.
 */
export async function generatePortalLink(): Promise<
  | { ok: true;  url: string }
  | { ok: false; reason: 'unauthorised' | 'no-billing-profile' | 'paddle-error' | 'rate-limited' }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, reason: 'unauthorised' };
  }

  try {
    await rateLimitByUser(
      session.user.id,
      'paddle-portal-link',
      RATE_LIMITS.API_AUTHENTICATED,
    );
  } catch (err) {
    if (err instanceof HttpError && err.status === 429) {
      return { ok: false, reason: 'rate-limited' };
    }
    throw err;
  }

  const user = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: {
      paddleCustomerId: true,
      subscription: { select: { paddleSubscriptionId: true } },
    },
  });

  if (!user?.paddleCustomerId) {
    return { ok: false, reason: 'no-billing-profile' };
  }

  const subscriptionIds = user.subscription?.paddleSubscriptionId
    ? [user.subscription.paddleSubscriptionId]
    : [];

  // Retry with exponential backoff so a single Paddle hiccup doesn't
  // prevent dozens of users from canceling during an outage window.
  // 3 attempts total: 0ms (first try), ~250ms, ~1000ms. Total worst-
  // case ~1.3s which sits comfortably under the server-action timeout.
  // Only retries on errors — not on HTTP-level 4xx responses which
  // would indicate a permanent problem (bad customer id, etc).
  const RETRY_DELAYS_MS = [0, 250, 1000];
  let lastErr: unknown = null;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
    try {
      const portal = await paddleClient.customerPortalSessions.create(
        user.paddleCustomerId,
        subscriptionIds,
      );
      return { ok: true, url: portal.urls.general.overview };
    } catch (err) {
      lastErr = err;
      // Continue to next retry attempt. Paddle's SDK typing doesn't
      // expose a clean status-code channel for the "don't retry"
      // cases, so we retry uniformly — the cap of 3 attempts keeps
      // the blast radius bounded even on permanent-failure shapes.
    }
  }

  logger.error(
    'Paddle customer portal session creation failed after retries',
    lastErr instanceof Error ? lastErr : new Error(String(lastErr)),
    { userId: session.user.id, attempts: RETRY_DELAYS_MS.length },
  );
  return { ok: false, reason: 'paddle-error' };
}
