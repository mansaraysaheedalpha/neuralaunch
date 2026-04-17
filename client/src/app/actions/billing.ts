'use server';

import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { paddleClient } from '@/lib/paddle/client';
import { logger } from '@/lib/logger';

/**
 * Generate a one-time authenticated link to the Paddle customer portal.
 *
 * The returned URL is ephemeral — it expires on Paddle's side after a
 * short window. Do not cache it, do not store it, do not share it.
 * Regenerate on every click.
 *
 * Flow:
 *   1. Read the signed-in user's paddleCustomerId + paddleSubscriptionId
 *      from our database.
 *   2. Ask Paddle to mint a portal session scoped to that customer +
 *      the subscription(s) they own.
 *   3. Return the overview URL for the caller to redirect to.
 *
 * Users who have never checked out have no paddleCustomerId and get a
 * friendly-error return value instead of a thrown exception; the UI
 * uses the { ok: false } branch to render a disabled state.
 */
export async function generatePortalLink(): Promise<
  | { ok: true;  url: string }
  | { ok: false; reason: 'unauthorised' | 'no-billing-profile' | 'paddle-error' }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, reason: 'unauthorised' };
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

  try {
    const portal = await paddleClient.customerPortalSessions.create(
      user.paddleCustomerId,
      subscriptionIds,
    );
    return { ok: true, url: portal.urls.general.overview };
  } catch (err) {
    logger.error(
      'Paddle customer portal session creation failed',
      err instanceof Error ? err : new Error(String(err)),
      { userId: session.user.id },
    );
    return { ok: false, reason: 'paddle-error' };
  }
}
