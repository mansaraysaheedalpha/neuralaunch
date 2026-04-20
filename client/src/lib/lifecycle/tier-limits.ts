// src/lib/lifecycle/tier-limits.ts
//
// Enforces the per-tier active-venture limit documented in
// docs/neuralaunch-pricing-spec.md §1.3 and
// docs/neuralaunch-lifecycle-memory.md §2.2.

import 'server-only';
import type { Prisma } from '@prisma/client';
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
    // Copy names the surface that actually lets the user act on the
    // instruction — "Your ventures" in the sidebar → expand the active
    // venture → Pause / Mark complete buttons. Previously this
    // promised pause/complete actions that did not exist in the UI.
    upgrade: 'Open Your ventures in the sidebar and pause or complete your current venture, or upgrade to Compound for up to three concurrent ventures.',
  },
  compound: {
    heading: 'Compound supports up to three active ventures simultaneously.',
    upgrade: 'Open Your ventures in the sidebar and pause or complete one of your existing ventures to start a new one.',
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
  // Count only non-archived active ventures. Ventures auto-archived
  // by a prior tier downgrade (see archiveExcessVenturesOnDowngrade)
  // don't consume a slot — they'll be auto-restored if the user
  // upgrades back.
  const activeCount = await prisma.venture.count({
    where: { userId, status: 'active', archivedAt: null },
  });

  if (activeCount < limit) return;

  const copy = TIER_COPY[tier];
  throw new HttpError(
    403,
    `${copy.heading} You currently have ${activeCount} active venture${activeCount === 1 ? '' : 's'}. ${copy.upgrade}`,
  );
}

/**
 * Auto-archive excess active ventures when a user's tier drops below
 * their active count. Called from tier-transition webhook paths
 * whenever the new tier's cap is strictly lower than the current
 * count of active non-archived ventures.
 *
 * Policy: keep the N most-recently-updated ventures active; archive
 * the rest by setting `archivedAt = now()`. Ventures remain
 * queryable — only new actions are blocked (see tool route gates).
 *
 * Returns the number of ventures that got archived by this call.
 */
export async function archiveExcessVenturesOnDowngrade(
  userId: string,
  newTier: Tier,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const client = (tx ?? prisma) as typeof prisma;
  const newCap = resolveLimit(newTier);

  const activeVentures = await client.venture.findMany({
    where:   { userId, status: 'active', archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    select:  { id: true },
  });

  if (activeVentures.length <= newCap) return 0;

  const toArchiveIds = activeVentures.slice(newCap).map(v => v.id);
  if (toArchiveIds.length === 0) return 0;

  const now = new Date();
  await client.venture.updateMany({
    where: { id: { in: toArchiveIds } },
    data:  { archivedAt: now },
  });
  return toArchiveIds.length;
}

/**
 * Auto-restore archived ventures on tier upgrade or re-subscription.
 * Called from tier-transition webhook paths whenever the new tier's
 * cap is strictly higher than the current count of active
 * non-archived ventures.
 *
 * Policy: unarchive up to (newCap - currentActiveCount) ventures,
 * most-recently-archived first. If the user has exactly N archived
 * ventures and upgrades to a cap of N+, all restore at once with no
 * manual selection required.
 *
 * Returns the number of ventures that got restored by this call.
 */
export async function restoreArchivedVenturesOnUpgrade(
  userId: string,
  newTier: Tier,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const client = (tx ?? prisma) as typeof prisma;
  const newCap = resolveLimit(newTier);

  const activeCount = await client.venture.count({
    where: { userId, status: 'active', archivedAt: null },
  });
  const slotsToFill = newCap - activeCount;
  if (slotsToFill <= 0) return 0;

  const archived = await client.venture.findMany({
    where:   { userId, status: 'active', archivedAt: { not: null } },
    orderBy: { archivedAt: 'desc' },
    take:    slotsToFill,
    select:  { id: true },
  });
  if (archived.length === 0) return 0;

  await client.venture.updateMany({
    where: { id: { in: archived.map(v => v.id) } },
    data:  { archivedAt: null },
  });
  return archived.length;
}

/**
 * Assert that a venture is not archived — throws HttpError(403) when
 * it is. Called by the tool routes (coach/composer/research/packager/
 * check-in) as a secondary gate alongside requireTierOrThrow, so a
 * user whose tier cap dropped below their active-venture count is
 * blocked from running new AI-heavy actions on the overflow ventures
 * until they upgrade back (or manually archive a different one once
 * the reactivation UI ships).
 *
 * The caller supplies the roadmapId (tools are addressed by roadmap,
 * not venture). We walk roadmap → ventureId → Venture.archivedAt in
 * one join.
 */
export async function assertVentureNotArchivedByRoadmap(
  userId: string,
  roadmapId: string,
): Promise<void> {
  const row = await prisma.roadmap.findFirst({
    where:  { id: roadmapId, userId },
    select: { venture: { select: { archivedAt: true } } },
  });
  // Nothing to assert — the caller's own ownership check will 404 if
  // roadmap doesn't exist. A roadmap without a ventureId is a
  // pre-lifecycle-memory legacy roadmap; treat as unarchived.
  if (!row || !row.venture) return;
  if (row.venture.archivedAt) {
    throw new HttpError(
      403,
      'This venture is archived. Upgrade your subscription to reactivate it.',
    );
  }
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
