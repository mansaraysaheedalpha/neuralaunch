// src/lib/lifecycle/tier-limits.ts
//
// Enforces the per-tier active-venture limit documented in
// docs/neuralaunch-pricing-spec.md §1.3 and
// docs/neuralaunch-lifecycle-memory.md §2.2.

import 'server-only';
import prisma from '@/lib/prisma';
import { HttpError } from '@/lib/validation/server-helpers';
import { TIER_VENTURE_LIMITS, type Tier } from '@/lib/paddle/tiers';

function resolveLimit(tier: Tier): number {
  return TIER_VENTURE_LIMITS[tier];
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
 * Free-tier users are strictly blocked (limit 0). Execute is capped
 * at 1 active venture. Compound is capped at 3.
 */
export async function assertVentureLimitNotReached(userId: string): Promise<void> {
  const tier = await getUserTier(userId);
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
