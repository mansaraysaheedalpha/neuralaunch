// src/lib/lifecycle/tier-limits.ts
//
// Enforces the per-tier active-venture limit documented in
// docs/neuralaunch-pricing-spec.md §1.3 and
// docs/neuralaunch-lifecycle-memory.md §2.2.

import 'server-only';
import prisma from '@/lib/prisma';
import { HttpError } from '@/lib/validation/server-helpers';
import { TIER_VENTURE_LIMITS, type Tier } from '@/lib/paddle/tiers';

/**
 * Free tier has no Venture slots (TIER_VENTURE_LIMITS.free = 0) and
 * instead caps total discovery interviews. Two attempts lets a founder
 * who dislikes their first recommendation try again with different
 * framing — the cheapest way to prove the product works for them —
 * while preventing Free from becoming a lifetime tier.
 */
export const FREE_DISCOVERY_SESSION_LIMIT = 2;

function resolveLimit(tier: Tier): number {
  return TIER_VENTURE_LIMITS[tier];
}

/**
 * Count all DiscoverySession rows owned by a user. Intentionally
 * counts historical sessions too — the Free limit is on lifetime
 * attempts, not concurrent attempts.
 */
export async function countFreeDiscoverySessions(userId: string): Promise<number> {
  return await prisma.discoverySession.count({ where: { userId } });
}

const TIER_COPY: Record<Tier, { heading: string; upgrade: string }> = {
  free: {
    heading: 'The Free tier only includes your first committed recommendation.',
    upgrade: 'Upgrade to Execute to start an execution cycle, or to Compound for up to three concurrent ventures.',
  },
  execute: {
    heading: 'Execute supports one active venture at a time.',
    upgrade: 'Pause or complete your current venture to start a new one, or upgrade to Compound for up to three concurrent ventures.',
  },
  compound: {
    heading: 'Compound supports up to three active ventures simultaneously.',
    upgrade: 'Pause or complete one of your existing ventures to start a new one.',
  },
};

/**
 * Resolve the user's current tier. Prefers the Subscription row;
 * defaults to 'free' when no row exists. Kept separate from
 * `requireTierOrThrow` because this helper needs the tier value
 * itself, not a boolean gate check.
 */
async function getUserTier(userId: string): Promise<Tier> {
  const sub = await prisma.subscription.findUnique({
    where:  { userId },
    select: { tier: true },
  });
  const tier = sub?.tier ?? 'free';
  if (tier === 'execute' || tier === 'compound' || tier === 'free') return tier;
  return 'free';
}

/**
 * Throw HttpError(403) when the user has reached their tier's
 * maximum active-venture count. Call this before any code path that
 * will create a new Venture row — the POST /api/discovery/sessions
 * route for `fresh_start` scenarios, and any future explicit venture
 * create endpoint.
 *
 * Free-tier users never create Ventures (their cap lives on discovery
 * sessions — see assertFreeDiscoverySessionLimit). This helper is a
 * no-op for Free so a fresh_start call from a Free user doesn't get
 * blocked by a wall they shouldn't be hitting at all. Execute is
 * capped at 1 active venture; Compound at 3.
 */
export async function assertVentureLimitNotReached(userId: string): Promise<void> {
  const tier = await getUserTier(userId);
  if (tier === 'free') return;

  const limit = resolveLimit(tier);
  const activeCount = await prisma.venture.count({
    where: { userId, status: 'active' },
  });

  if (activeCount < limit) return;

  const copy = TIER_COPY[tier];
  throw new HttpError(
    403,
    `${copy.heading} You currently have ${activeCount} active venture${activeCount === 1 ? '' : 's'}. ${copy.upgrade}`,
  );
}

/**
 * Throw HttpError(403) when a Free-tier user has already created
 * FREE_DISCOVERY_SESSION_LIMIT discovery sessions. No-op for paid
 * tiers — Execute and Compound have no lifetime discovery cap.
 *
 * Call this at the top of the POST /api/discovery/sessions handler
 * (before scenario-specific checks) so a Free user hits a legible
 * upgrade prompt on their third attempt rather than the venture wall.
 */
export async function assertFreeDiscoverySessionLimit(userId: string): Promise<void> {
  const tier = await getUserTier(userId);
  if (tier !== 'free') return;

  const sessionCount = await countFreeDiscoverySessions(userId);
  if (sessionCount < FREE_DISCOVERY_SESSION_LIMIT) return;

  throw new HttpError(
    403,
    "You've reached the free-tier limit. Upgrade to Execute to run unlimited discovery interviews.",
  );
}
