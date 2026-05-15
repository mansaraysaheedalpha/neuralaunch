// src/lib/research/cache.ts
//
// Shared cache wrapper for every external research provider — Tavily,
// Exa, and the nine free-composite community clients. The brief
// motivating this layer: Stage 3's Pain Scout will issue dozens of
// queries per scout-run, and a 5-minute Anthropic-cache miss is
// cheap compared to repeatedly hammering a free public API like
// Hacker News Algolia for the same string.
//
// Backed by the same Upstash Redis instance the discovery session
// store uses, but namespaced under `research:<provider>:<sha256>`
// so the two surfaces cannot collide. Per-provider TTLs reflect
// the freshness expectation of each vendor (community-pulse is
// 10 min because Bluesky / HN move fast; Tavily is 1h because
// general-web search results barely change inside that window).
//
// Operational invariants (these are load-bearing — don't relax):
//
//   1. Cache reads time out after READ_TIMEOUT_MS. Timeout FALLS
//      THROUGH to the live fetch. Never block a user-facing call
//      on a slow Redis hop.
//   2. Cache writes are fire-and-forget. The live fetch result is
//      returned regardless of whether the write succeeds.
//   3. Hit/miss is recorded as a Sentry span ATTRIBUTE on whichever
//      span is currently active (the agent's withAgentSpan, the
//      route's withExaSearchSpan, etc.) — not as a log line. Read
//      it from the Sentry UI, not by grepping logs.
//   4. Redis-unavailable (dev with no UPSTASH_REDIS_REST_URL) falls
//      straight through to the live fetch — never a hard error.

import 'server-only';
import { createHash } from 'crypto';
import { getRedisClient } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { setActiveSpanAttribute } from '@/lib/observability';

// ---------------------------------------------------------------------------
// Provider identifiers — drive both the cache-key prefix and the TTL.
// Adding a new provider means: append the literal here, plus an entry
// in PROVIDER_TTL_SECONDS. Both surfaces are exhaustiveness-checked.
// ---------------------------------------------------------------------------

export type CacheProvider =
  | 'tavily'
  | 'exa'
  | 'community-pulse-hn-algolia'
  | 'community-pulse-hn-firebase'
  | 'community-pulse-bluesky'
  | 'community-pulse-lemmy'
  | 'community-pulse-mastodon-hashtags'
  | 'community-pulse-github-issues'
  | 'community-pulse-devto'
  | 'community-pulse-hashnode'
  | 'community-pulse-lobsters';

/**
 * Per-provider TTL (seconds). Tuning rationale:
 *
 *   - Tavily: 1h. General-web search index updates on hourly cadence
 *     at best; a query for "AI productivity tools" yields ~95% the
 *     same answer for an hour.
 *   - Exa: 30 min. Neural search is more responsive to the index's
 *     freshness; tighter window reflects that.
 *   - community-pulse-*: 10 min. Community signals move fast — a
 *     thread that didn't exist 15 minutes ago is exactly what Pain
 *     Scout is looking for. Cache long enough to dedupe within a
 *     single scout-run, not so long that the agent sees stale
 *     "current" content.
 *
 * Telemetry on hit rates lets us re-tune later — emit
 * `research.cache.result` on every call and re-check after a week.
 */
const PROVIDER_TTL_SECONDS: Record<CacheProvider, number> = {
  'tavily':                            60 * 60,    // 1h
  'exa':                               30 * 60,    // 30 min
  'community-pulse-hn-algolia':        10 * 60,
  'community-pulse-hn-firebase':       10 * 60,
  'community-pulse-bluesky':           10 * 60,
  'community-pulse-lemmy':             10 * 60,
  'community-pulse-mastodon-hashtags': 10 * 60,
  'community-pulse-github-issues':     10 * 60,
  'community-pulse-devto':             10 * 60,
  'community-pulse-hashnode':          10 * 60,
  'community-pulse-lobsters':          10 * 60,
};

/**
 * Cache READS time out after this — a slow Upstash hop must not
 * block the user-facing call. 500ms is well under the user-
 * perceptible threshold and far over Upstash's p99 GET latency,
 * so a timeout means something is actually wrong.
 */
const READ_TIMEOUT_MS = 500;

// Span attribute keys — namespaced so the Sentry UI filters cleanly.
const ATTR_CACHE_PROVIDER = 'research.cache.provider';
const ATTR_CACHE_RESULT   = 'research.cache.result';
const ATTR_CACHE_LATENCY  = 'research.cache.latency_ms';

/**
 * The cache-result attribute values are the surface the Sentry UI
 * filters on. Keep them small and stable; renaming them is a
 * dashboard-breaking change.
 *
 *   hit          — entry present, returned from cache
 *   miss         — entry absent, fell through to live fetch
 *   bypass       — caller passed bypassCache=true
 *   read_timeout — Redis GET took longer than READ_TIMEOUT_MS
 *   read_error   — Redis GET threw a non-timeout error
 *   unavailable  — Redis not configured (dev / fallback path)
 */
type CacheResult =
  | 'hit'
  | 'miss'
  | 'bypass'
  | 'read_timeout'
  | 'read_error'
  | 'unavailable';

/**
 * Stored shape. We never persist raw vendor responses — the caller
 * has already normalised by the time cachedFetch sees the value.
 * `cachedAt` is for debugging only; it never feeds back into TTL
 * (Upstash's `ex` does that for us).
 */
interface StoredEntry<T> {
  data:     T;
  cachedAt: string;
}

export interface CachedFetchArgs<T> {
  /** Drives both the cache-key prefix and the default TTL. */
  provider: CacheProvider;
  /**
   * The string the CALLER has already normalised (lowercased,
   * whitespace collapsed, query params sorted). cache.ts hashes it
   * via sha256 to keep keys bounded; uniqueness + normalisation are
   * the caller's job, not ours. Different inputs to the same
   * provider should produce different queryKeys.
   */
  queryKey: string;
  /**
   * When true: skip the read step, still write the result on
   * success. Used by agents that need fresh-by-definition data
   * (e.g. "what was discussed in the last hour"). Default false.
   */
  bypassCache?: boolean;
  /** TTL override (seconds). Defaults to PROVIDER_TTL_SECONDS[provider]. */
  ttlSeconds?: number;
  /**
   * Live fetch — called on cache miss, bypass, timeout, or error.
   * Errors thrown here propagate to the caller; cachedFetch only
   * adds caching, not retry logic. The vendor clients already own
   * their own retry/timeout/backoff machinery.
   */
  fetch: () => Promise<T>;
}

/**
 * cachedFetch — wrap a live research call in Redis-backed caching.
 *
 * The agent's withAgentSpan / withExaSearchSpan / route span MUST
 * already be active when this is called — span attributes are
 * written to whatever span the AsyncLocalStorage exposes.
 */
export async function cachedFetch<T>(args: CachedFetchArgs<T>): Promise<T> {
  const { provider, queryKey, bypassCache = false, ttlSeconds, fetch } = args;
  const log = logger.child({ module: 'ResearchCache', provider });

  setActiveSpanAttribute(ATTR_CACHE_PROVIDER, provider);

  const redis = getRedisClient();
  if (!redis) {
    setActiveSpanAttribute(ATTR_CACHE_RESULT, 'unavailable' satisfies CacheResult);
    return fetch();
  }

  const key = buildKey(provider, queryKey);
  const ttl = ttlSeconds ?? PROVIDER_TTL_SECONDS[provider];

  if (bypassCache) {
    setActiveSpanAttribute(ATTR_CACHE_RESULT, 'bypass' satisfies CacheResult);
    const data = await fetch();
    writeFireAndForget(redis, key, data, ttl, log);
    return data;
  }

  // ── Read with timeout fallthrough ──────────────────────────────────────
  const readStart = Date.now();
  let cached: StoredEntry<T> | null = null;
  try {
    cached = await Promise.race([
      redis.get<StoredEntry<T>>(key),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('cache read timed out')), READ_TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    const isTimeout = err instanceof Error && /timed out/.test(err.message);
    const result: CacheResult = isTimeout ? 'read_timeout' : 'read_error';
    setActiveSpanAttribute(ATTR_CACHE_RESULT, result);
    log.warn('Cache read fell through to live fetch', {
      reason:   result,
      latencyMs: Date.now() - readStart,
      message:  err instanceof Error ? err.message : String(err),
    });
    const data = await fetch();
    writeFireAndForget(redis, key, data, ttl, log);
    return data;
  }

  setActiveSpanAttribute(ATTR_CACHE_LATENCY, Date.now() - readStart);

  if (cached) {
    setActiveSpanAttribute(ATTR_CACHE_RESULT, 'hit' satisfies CacheResult);
    return cached.data;
  }

  setActiveSpanAttribute(ATTR_CACHE_RESULT, 'miss' satisfies CacheResult);
  const data = await fetch();
  writeFireAndForget(redis, key, data, ttl, log);
  return data;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildKey(provider: CacheProvider, queryKey: string): string {
  // sha256 of the caller-normalised queryKey. 64-char hex + the
  // `research:<provider>:` prefix stays well under Upstash's 1KB
  // key limit even for the longest provider name.
  const hash = createHash('sha256').update(queryKey).digest('hex');
  return `research:${provider}:${hash}`;
}

type RedisClient = NonNullable<ReturnType<typeof getRedisClient>>;

function writeFireAndForget<T>(
  redis: RedisClient,
  key:   string,
  data:  T,
  ttl:   number,
  log:   ReturnType<typeof logger.child>,
): void {
  const entry: StoredEntry<T> = { data, cachedAt: new Date().toISOString() };
  // Intentionally NOT awaited. The user-facing response should not
  // wait on Redis. A write failure is logged (so we can see if the
  // hit-rate metric drops) but is otherwise irrelevant — the live
  // fetch already produced the value.
  //
  // TODO(vercel-waituntil): On Vercel serverless, the function
  // instance can be torn down immediately after the response is sent,
  // killing this in-flight redis.set() before it completes. If we
  // observe lower-than-expected cache hit rates in production, the
  // fix is `waitUntil(redis.set(...))` from '@vercel/functions' to
  // extend the execution context past response-send. Not worth
  // wiring up before we have evidence the symptom exists — Upstash's
  // p99 SET latency is <50ms in the same region as Vercel's compute,
  // so the race window is narrow. Revisit if cache hit rate < ~30%.
  redis.set(key, entry, { ex: ttl }).catch((err: unknown) => {
    log.warn('Cache write failed (non-fatal)', {
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

// ---------------------------------------------------------------------------
// Test-only export
//
// The hash function is deterministic; tests want to assert collision-
// freedom and stability. Don't import this from production code.
// ---------------------------------------------------------------------------

export const __testInternals = {
  buildKey,
  READ_TIMEOUT_MS,
  PROVIDER_TTL_SECONDS,
};
