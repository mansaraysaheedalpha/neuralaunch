// src/lib/cache.ts
/**
 * Redis Caching Utilities
 *
 * Implements caching strategy to reduce API costs and improve performance
 * Uses Redis in production, in-memory fallback for development
 */

import { getRedisClient } from "./redis";
import { logger } from "./logger";
import crypto from "crypto";

// ==========================================
// IN-MEMORY FALLBACK (Development Only)
// ==========================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const inMemoryCache = new Map<string, CacheEntry<unknown>>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of inMemoryCache.entries()) {
    if (entry.expiresAt < now) {
      inMemoryCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

// ==========================================
// CACHE TTLs (Time To Live in seconds)
// ==========================================

export const CACHE_TTL = {
  // AI responses - expensive to generate
  AI_CHAT_RESPONSE: 3600, // 1 hour
  AI_EMBEDDING: 86400, // 24 hours
  AI_ANALYSIS: 3600, // 1 hour

  // API responses
  GITHUB_API: 300, // 5 minutes
  EXTERNAL_API: 600, // 10 minutes

  // Computed data
  PROJECT_STATS: 300, // 5 minutes
  USER_PREFERENCES: 1800, // 30 minutes
  LANDING_PAGE_ANALYTICS: 300, // 5 minutes

  // Static data
  VALIDATION_RESULTS: 3600, // 1 hour
  DOCUMENTATION: 1800, // 30 minutes

  // Short-lived cache
  RATE_LIMIT: 60, // 1 minute
  SESSION_DATA: 900, // 15 minutes

  // Default
  DEFAULT: 300, // 5 minutes
} as const;

// ==========================================
// TYPES
// ==========================================

export interface CacheOptions {
  /**
   * Time to live in seconds
   */
  ttl?: number;

  /**
   * Cache key prefix (for organization)
   */
  prefix?: string;

  /**
   * Skip cache and always fetch fresh data
   */
  skipCache?: boolean;
}

// ==========================================
// CACHE KEY GENERATION
// ==========================================

/**
 * Generate a consistent cache key from parameters
 */
export function generateCacheKey(
  namespace: string,
  params: Record<string, unknown>
): string {
  // Sort keys for consistency
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {} as Record<string, unknown>);

  // Create hash of parameters
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(sortedParams))
    .digest("hex")
    .substring(0, 16);

  return `${namespace}:${hash}`;
}

// ==========================================
// REDIS CACHING
// ==========================================

/**
 * Get cached value from Redis
 */
async function getCacheRedis<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) {
    return getCacheMemory<T>(key);
  }

  try {
    const value = await redis.get<string>(key);
    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  } catch (error) {
    logger.error("Redis cache get failed", error as Error, { key });
    return getCacheMemory<T>(key);
  }
}

/**
 * Set cached value in Redis
 */
async function setCacheRedis<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    setCacheMemory(key, value, ttlSeconds);
    return;
  }

  try {
    await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
  } catch (error) {
    logger.error("Redis cache set failed", error as Error, { key });
    setCacheMemory(key, value, ttlSeconds);
  }
}

/**
 * Delete cached value from Redis
 */
async function deleteCacheRedis(key: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    deleteCacheMemory(key);
    return;
  }

  try {
    await redis.del(key);
  } catch (error) {
    logger.error("Redis cache delete failed", error as Error, { key });
    deleteCacheMemory(key);
  }
}

// ==========================================
// IN-MEMORY CACHING (Fallback)
// ==========================================

function getCacheMemory<T>(key: string): T | null {
  const entry = inMemoryCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    return null;
  }

  const now = Date.now();
  if (entry.expiresAt < now) {
    inMemoryCache.delete(key);
    return null;
  }

  return entry.value;
}

function setCacheMemory<T>(key: string, value: T, ttlSeconds: number): void {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  inMemoryCache.set(key, { value, expiresAt });
}

function deleteCacheMemory(key: string): void {
  inMemoryCache.delete(key);
}

// ==========================================
// PUBLIC API
// ==========================================

/**
 * Get value from cache
 */
export async function getCache<T>(key: string): Promise<T | null> {
  return getCacheRedis<T>(key);
}

/**
 * Set value in cache
 */
export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds: number = CACHE_TTL.DEFAULT
): Promise<void> {
  return setCacheRedis(key, value, ttlSeconds);
}

/**
 * Delete value from cache
 */
export async function deleteCache(key: string): Promise<void> {
  return deleteCacheRedis(key);
}

/**
 * Get or set cached value (cache-aside pattern)
 *
 * @param key - Cache key
 * @param fn - Function to execute if cache miss
 * @param options - Cache options
 * @returns Cached or freshly computed value
 */
export async function getCachedOrCompute<T>(
  key: string,
  fn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { ttl = CACHE_TTL.DEFAULT, skipCache = false, prefix = "" } = options;
  const fullKey = prefix ? `${prefix}:${key}` : key;

  // Skip cache if requested
  if (skipCache) {
    logger.debug("Cache skipped", { key: fullKey });
    return fn();
  }

  // Try to get from cache
  const cached = await getCache<T>(fullKey);
  if (cached !== null) {
    logger.debug("Cache hit", { key: fullKey });
    return cached;
  }

  // Cache miss - compute value
  logger.debug("Cache miss", { key: fullKey });
  const value = await fn();

  // Store in cache (don't await to avoid blocking)
  void setCache(fullKey, value, ttl).catch((error) => {
    logger.error("Failed to cache value", error as Error, { key: fullKey });
  });

  return value;
}

/**
 * Invalidate all cache entries with a prefix
 */
export async function invalidateCachePrefix(prefix: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    // For in-memory, delete all matching keys
    for (const key of inMemoryCache.keys()) {
      if (key.startsWith(prefix)) {
        inMemoryCache.delete(key);
      }
    }
    return;
  }

  try {
    // Note: SCAN is more efficient than KEYS for large datasets
    // This is a simplified version - consider using SCAN in production
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(`Invalidated ${keys.length} cache entries`, { prefix });
    }
  } catch (error) {
    logger.error("Failed to invalidate cache prefix", error as Error, {
      prefix,
    });
  }
}

/**
 * Cache wrapper for expensive functions
 *
 * @example
 * ```typescript
 * const getCachedAnalysis = cached(
 *   async (projectId: string) => {
 *     return await expensiveAnalysis(projectId);
 *   },
 *   { ttl: CACHE_TTL.AI_ANALYSIS, prefix: 'analysis' }
 * );
 *
 * const result = await getCachedAnalysis('project-123');
 * ```
 */
export function cached<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: CacheOptions = {}
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const key = generateCacheKey(
      options.prefix || "fn",
      args.length === 1 && typeof args[0] === "object"
        ? (args[0] as Record<string, unknown>)
        : { args }
    );

    return getCachedOrCompute(key, () => fn(...args), options);
  };
}
