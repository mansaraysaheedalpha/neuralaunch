// src/lib/auth/require-tier.ts
import 'server-only';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { HttpError } from '@/lib/validation/server-helpers';
import type { Tier } from '@/lib/paddle/tiers';

/**
 * Tier hierarchy check — does the user's current tier meet or exceed
 * the tier required for a gated feature?
 *
 * Compound > Execute > Free. Any user on compound automatically
 * passes an execute-required gate. Pure function; no I/O.
 */
export function requireTier(userTier: Tier | (string & {}), requiredTier: 'execute' | 'compound'): boolean {
  if (requiredTier === 'execute') {
    return userTier === 'execute' || userTier === 'compound';
  }
  if (requiredTier === 'compound') {
    return userTier === 'compound';
  }
  return false;
}

const ERROR_MESSAGES: Record<'execute' | 'compound', string> = {
  execute:  'This feature requires an Execute or Compound subscription.',
  compound: 'This feature requires a Compound subscription.',
};

/**
 * Route-level gate: throws HttpError(403) when the caller's tier is
 * below the required tier.
 *
 * Two lookup paths, in priority order:
 *   1. If auth() returns a web session for this user, use the
 *      tier embedded in session.user.tier by the session callback —
 *      no additional DB query.
 *   2. Otherwise (mobile bearer token path, where auth() returns null
 *      but requireUserId() still resolved via resolveUserFromToken),
 *      fall back to a Subscription lookup by userId.
 *
 * The userId argument must be the value returned by requireUserId()
 * on the same request, so caller ownership has already been proven
 * before we decide whether their tier is adequate.
 */
export async function requireTierOrThrow(
  userId: string,
  requiredTier: 'execute' | 'compound',
): Promise<void> {
  let tier: string | undefined;

  const session = await auth();
  if (session?.user?.id === userId) {
    tier = session.user.tier;
  }

  if (!tier) {
    const sub = await prisma.subscription.findUnique({
      where:  { userId },
      select: { tier: true },
    });
    tier = sub?.tier ?? 'free';
  }

  if (!requireTier(tier, requiredTier)) {
    throw new HttpError(403, ERROR_MESSAGES[requiredTier]);
  }
}
