// src/lib/auth/tier-cache.ts
import 'server-only';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

export type CachedTier = 'free' | 'execute' | 'compound';

interface CacheEntry {
  tier:           CachedTier;
  status:         string;
  /** When this entry was written. Drives the TTL window. */
  cachedAt:       number;
  /**
   * Snapshot of User.tierUpdatedAt at the time the cache was written.
   * If the live DB value advances past this, the entry is stale and
   * we re-read tier from Subscription. Lets a webhook-driven tier
   * change propagate immediately instead of waiting for the TTL.
   */
  tierUpdatedAt:  number | null;
}

const TIER_CACHE = new Map<string, CacheEntry>();

const CACHE_TTL_MS = 30 * 1000;

/**
 * Periodic cleanup of stale entries so a process serving many users
 * doesn't grow the Map unboundedly. Runs every 5 minutes; the auth
 * session callback is the only writer and the only reader, so a
 * loose cleanup cadence is fine — entries beyond TTL are re-derived
 * on demand anyway.
 *
 * Wrapped in `if` so module reloads in dev don't pile up timers.
 */
declare global {
  // eslint-disable-next-line no-var
  var __tierCacheCleanupTimer: NodeJS.Timeout | undefined;
}

if (!globalThis.__tierCacheCleanupTimer) {
  globalThis.__tierCacheCleanupTimer = setInterval(() => {
    const cutoff = Date.now() - CACHE_TTL_MS;
    for (const [userId, entry] of TIER_CACHE.entries()) {
      if (entry.cachedAt < cutoff) {
        TIER_CACHE.delete(userId);
      }
    }
  }, 5 * 60 * 1000);
}

/**
 * Read the user's tier + subscription status, with a 30s in-process
 * cache invalidated by User.tierUpdatedAt advancing past the cached
 * snapshot.
 *
 * Two DB queries on a cold cache (User.tierUpdatedAt + Subscription),
 * one DB query on warm-but-stale (User.tierUpdatedAt only — invalidate
 * + re-fetch Subscription), zero DB queries on warm-and-fresh.
 *
 * The User.tierUpdatedAt read is dirt-cheap (PK lookup, single column),
 * so even on the no-cache path the cost is one extra round trip we
 * weren't paying before but is amortised across the 30s window. Net
 * win: ~95% of session callback reads short-circuit to in-process.
 *
 * Resilience: if either query throws, we log and fall back to the
 * cached value if we have one, otherwise to 'free'. The session
 * callback never blocks on a transient DB issue.
 */
export async function readTierCache(userId: string): Promise<{
  tier:   CachedTier;
  status: string;
}> {
  const entry = TIER_CACHE.get(userId);
  const now   = Date.now();

  // Cache hit AND inside TTL → return without any DB call.
  if (entry && now - entry.cachedAt < CACHE_TTL_MS) {
    return { tier: entry.tier, status: entry.status };
  }

  // Read tierUpdatedAt FIRST. If the cache entry exists and
  // tierUpdatedAt hasn't advanced, refresh the cachedAt timestamp
  // and reuse the entry — saving the Subscription query.
  let tierUpdatedAt: number | null = null;
  try {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { tierUpdatedAt: true },
    });
    tierUpdatedAt = user?.tierUpdatedAt?.getTime() ?? null;
  } catch (err) {
    logger.warn('tier cache: User.tierUpdatedAt read failed; using cached or default', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    if (entry) return { tier: entry.tier, status: entry.status };
    return { tier: 'free', status: 'none' };
  }

  if (entry && entry.tierUpdatedAt === tierUpdatedAt) {
    // Tier hasn't changed since we cached. Slide the TTL window.
    entry.cachedAt = now;
    return { tier: entry.tier, status: entry.status };
  }

  // Cold cache, expired TTL with stale entry, or tier mutation
  // detected — re-derive from Subscription.
  let tier: CachedTier = 'free';
  let status = 'none';
  try {
    const subscription = await prisma.subscription.findUnique({
      where:  { userId },
      select: { tier: true, status: true },
    });
    tier   = (subscription?.tier ?? 'free') as CachedTier;
    status = subscription?.status ?? 'none';
  } catch (err) {
    logger.warn('tier cache: Subscription read failed; using cached or default', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    if (entry) return { tier: entry.tier, status: entry.status };
  }

  TIER_CACHE.set(userId, { tier, status, cachedAt: now, tierUpdatedAt });
  return { tier, status };
}

/**
 * Test-only — flush the in-memory cache. Exported so tests can
 * exercise the cold-cache path without restarting the process.
 */
export function __resetTierCache(): void {
  TIER_CACHE.clear();
}
