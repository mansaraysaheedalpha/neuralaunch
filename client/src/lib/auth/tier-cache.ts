// src/lib/auth/tier-cache.ts
//
// Two-level cache for the (tier, status, lastPaidTier, wasFoundingMember)
// tuple read on every authenticated request via the NextAuth session
// callback.
//
//   L1 — in-process Map. Free, fastest, but bounded to a single
//        Lambda lifetime. On Vercel each cold start hits a different
//        instance, so the L1 hit-rate is structurally limited.
//
//   L2 — Upstash Redis. ~5-10ms, cross-instance. Survives Lambda
//        recycles and means every paying user benefits from cache
//        warmth regardless of which instance handled their previous
//        request. Serialised as JSON blob under `tierCache:${userId}`
//        with a 30s sliding TTL.
//
//   Invalidation — driven by User.tierUpdatedAt on every read AND by
//        explicit invalidateTierCache(userId) called from the Paddle
//        webhook handlers right after their transaction commits.
//        Belt-and-braces: even if the explicit invalidation fails
//        (Redis blip), the next read sees the advanced tierUpdatedAt
//        and refreshes naturally.
//
//   In-flight dedup — a third process-local Map<userId, Promise<...>>
//        coalesces concurrent reads for the same user on a cold L1.
//        50 simultaneous session callbacks for one user share ONE
//        DB round trip; the peers all await the same promise. The
//        entry is deleted in a finally block so a transient failure
//        doesn't poison subsequent reads.

import 'server-only';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getRedisClient } from '@/lib/redis';

export type CachedTier = 'free' | 'execute' | 'compound';
export type PaidTier   = 'execute' | 'compound';

export interface TierCacheResult {
  tier:              CachedTier;
  status:            string;
  lastPaidTier:      PaidTier | null;
  wasFoundingMember: boolean;
}

interface CacheEntry extends TierCacheResult {
  /** Wall-clock when this entry was written to L1. */
  cachedAt: number;
  /**
   * Snapshot of User.tierUpdatedAt at the time the cache was written.
   * If the live DB value advances past this, the entry is stale and
   * we re-derive. The webhook processor bumps tierUpdatedAt in the
   * same transaction as tier / lastPaidTier / wasFoundingMember, so
   * one snapshot key invalidates all three fields together.
   */
  tierUpdatedAt: number | null;
}

// L1: in-process. Trivial, bounded by the periodic-cleanup interval below.
const TIER_CACHE = new Map<string, CacheEntry>();

// In-flight dedup: when a cold-cache read is already running for a
// given userId, every subsequent caller shares the same Promise.
// Cleared in finally so a rejected promise doesn't poison future reads.
const INFLIGHT = new Map<string, Promise<TierCacheResult>>();

const CACHE_TTL_MS      = 30 * 1000;
const REDIS_TTL_SECONDS = 30;

const REDIS_KEY = (userId: string) => `tierCache:${userId}`;

const EMPTY: TierCacheResult = {
  tier:              'free',
  status:            'none',
  lastPaidTier:      null,
  wasFoundingMember: false,
};

/**
 * Periodic L1 cleanup so a long-running process serving many users
 * doesn't grow the Map unboundedly. The webhook-driven invalidations
 * already prune entries on tier change; this is the catch-all for the
 * inactive-but-cached tail.
 */
declare global {
  var __tierCacheCleanupTimer: NodeJS.Timeout | undefined;
}

if (!globalThis.__tierCacheCleanupTimer) {
  globalThis.__tierCacheCleanupTimer = setInterval(() => {
    const cutoff = Date.now() - CACHE_TTL_MS;
    for (const [userId, entry] of TIER_CACHE.entries()) {
      if (entry.cachedAt < cutoff) TIER_CACHE.delete(userId);
    }
  }, 5 * 60 * 1000);
}

// ---------------------------------------------------------------------
// Redis helpers — both fail-soft. Redis being unavailable degrades us
// to "always read from Postgres" which is correct (slower but never
// wrong). Never falls open to 'free' — that would silently downgrade
// paying users on a Redis blip.
// ---------------------------------------------------------------------

interface RedisCacheBlob extends TierCacheResult {
  tierUpdatedAt: number | null;
}

async function readFromRedis(userId: string): Promise<RedisCacheBlob | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const value = await redis.get<RedisCacheBlob>(REDIS_KEY(userId));
    return value ?? null;
  } catch (err) {
    logger.warn('tier cache: Redis read failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function writeToRedis(userId: string, blob: RedisCacheBlob): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(REDIS_KEY(userId), blob, { ex: REDIS_TTL_SECONDS });
  } catch (err) {
    logger.warn('tier cache: Redis write failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function deleteFromRedis(userId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del(REDIS_KEY(userId));
  } catch (err) {
    logger.warn('tier cache: Redis delete failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Read the user's tier + subscription status with L1 + L2 caching and
 * in-flight Promise dedup.
 *
 * Hit shape on the four flow branches:
 *
 *   L1 fresh           → 0 DB queries, 0 Redis ops
 *   L1 stale unchanged → 1 DB query  (tierUpdatedAt projection)
 *   L2 hit             → 1 DB query  (tierUpdatedAt projection) + 1 Redis GET
 *   Full miss          → 2 DB queries (tierUpdatedAt + Subscription/User)
 *                        + 1 Redis GET + 1 Redis SET
 *
 * Resilience: if any DB / Redis op throws, fall back to the most
 * recent good cache entry if available, otherwise EMPTY. Never throws.
 */
export async function readTierCache(userId: string): Promise<TierCacheResult> {
  // L1 fresh path — return immediately.
  const l1 = TIER_CACHE.get(userId);
  const now = Date.now();
  if (l1 && now - l1.cachedAt < CACHE_TTL_MS) {
    return projectResult(l1);
  }

  // In-flight dedup — if a peer is already fetching, share the work.
  const existing = INFLIGHT.get(userId);
  if (existing) return existing;

  const promise = resolveTier(userId, l1).finally(() => {
    INFLIGHT.delete(userId);
  });
  INFLIGHT.set(userId, promise);
  return promise;
}

async function resolveTier(
  userId: string,
  l1: CacheEntry | undefined,
): Promise<TierCacheResult> {
  const now = Date.now();

  // Read live tierUpdatedAt — cheap PK projection. This is the
  // version key both cache layers compare against.
  let tierUpdatedAt: number | null = null;
  try {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { tierUpdatedAt: true },
    });
    tierUpdatedAt = user?.tierUpdatedAt?.getTime() ?? null;
  } catch (err) {
    logger.warn('tier cache: User.tierUpdatedAt read failed; serving cached or EMPTY', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    if (l1) return projectResult(l1);
    return EMPTY;
  }

  // L1 stale-but-unchanged → slide TTL and return.
  if (l1 && l1.tierUpdatedAt === tierUpdatedAt) {
    l1.cachedAt = now;
    return projectResult(l1);
  }

  // L2 (Redis) lookup. Cross-instance hit avoids the Subscription/User
  // round trip entirely on a freshly-warmed Lambda instance.
  const l2 = await readFromRedis(userId);
  if (l2 && l2.tierUpdatedAt === tierUpdatedAt) {
    const entry: CacheEntry = {
      tier:              l2.tier,
      status:            l2.status,
      lastPaidTier:      l2.lastPaidTier,
      wasFoundingMember: l2.wasFoundingMember,
      cachedAt:          now,
      tierUpdatedAt,
    };
    TIER_CACHE.set(userId, entry);
    return projectResult(entry);
  }

  // Full miss — derive from Subscription + User.
  let tier: CachedTier = 'free';
  let status = 'none';
  let lastPaidTier: PaidTier | null = null;
  let wasFoundingMember = false;
  try {
    const [subscription, userRow] = await Promise.all([
      prisma.subscription.findUnique({
        where:  { userId },
        select: { tier: true, status: true },
      }),
      prisma.user.findUnique({
        where:  { id: userId },
        select: { lastPaidTier: true, wasFoundingMember: true },
      }),
    ]);
    tier   = (subscription?.tier ?? 'free') as CachedTier;
    status = subscription?.status ?? 'none';
    const lpt = userRow?.lastPaidTier;
    lastPaidTier      = lpt === 'execute' || lpt === 'compound' ? lpt : null;
    wasFoundingMember = Boolean(userRow?.wasFoundingMember);
  } catch (err) {
    logger.warn('tier cache: Subscription/User read failed; serving cached or EMPTY', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    if (l1) return projectResult(l1);
    return EMPTY;
  }

  const entry: CacheEntry = {
    tier,
    status,
    lastPaidTier,
    wasFoundingMember,
    cachedAt:      now,
    tierUpdatedAt,
  };
  TIER_CACHE.set(userId, entry);
  // Fire-and-forget Redis write — never block the auth callback on
  // the network round trip. The next instance picks up the warmed
  // entry; if the write loses the race nothing breaks (the next read
  // re-derives from Postgres).
  void writeToRedis(userId, {
    tier,
    status,
    lastPaidTier,
    wasFoundingMember,
    tierUpdatedAt,
  });
  return projectResult(entry);
}

function projectResult(entry: CacheEntry): TierCacheResult {
  return {
    tier:              entry.tier,
    status:            entry.status,
    lastPaidTier:      entry.lastPaidTier,
    wasFoundingMember: entry.wasFoundingMember,
  };
}

/**
 * Explicit invalidation — drops both L1 and L2 entries for the user.
 * Called from the Paddle webhook handlers right after their
 * transaction commits so a tier change is reflected on the user's
 * very next request, not after the 30s window.
 *
 * Belt-and-braces with the User.tierUpdatedAt version key — even if
 * this call fails (Redis blip), the next read sees the advanced
 * tierUpdatedAt and refreshes naturally. So this is an optimisation,
 * not a correctness guarantee.
 *
 * Best-effort: never throws. The webhook handler should not be
 * coupled to Redis availability.
 */
export async function invalidateTierCache(userId: string): Promise<void> {
  TIER_CACHE.delete(userId);
  INFLIGHT.delete(userId);
  await deleteFromRedis(userId);
}

/**
 * Test-only — flush all caches. Exported so tests can exercise the
 * cold-cache path without restarting the process.
 */
export function __resetTierCache(): void {
  TIER_CACHE.clear();
  INFLIGHT.clear();
}
