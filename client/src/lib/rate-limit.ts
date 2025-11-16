// src/lib/rate-limit.ts
/**
 * Rate Limiting Utility
 *
 * Implements a sliding window rate limiter to prevent API abuse
 * Uses Redis in production (serverless-compatible) with in-memory fallback for development
 */

import { getRedisClient } from "./redis";
import { logger } from "./logger";

// ==========================================
// IN-MEMORY FALLBACK (Development Only)
// ==========================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const inMemoryStore = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes (in-memory only)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of inMemoryStore.entries()) {
    if (entry.resetAt < now) {
      inMemoryStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed in the window
   */
  maxRequests: number;

  /**
   * Time window in seconds
   */
  windowSeconds: number;

  /**
   * Unique identifier for the rate limit (e.g., user ID, IP address)
   */
  identifier: string;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

// ==========================================
// REDIS-BASED RATE LIMITING
// ==========================================

/**
 * Check rate limit using Redis
 */
async function checkRateLimitRedis(
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  if (!redis) {
    // Fallback to in-memory if Redis is not available
    return checkRateLimitMemory(config);
  }

  const { maxRequests, windowSeconds, identifier } = config;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const key = `ratelimit:${identifier}`;

  try {
    // Use Redis pipeline for atomic operations
    const pipeline = redis.pipeline();

    // Get current count
    pipeline.get<number>(key);

    // Get TTL
    pipeline.ttl(key);

    const results = await pipeline.exec();
    const count = results[0] as number | null;
    const ttl = results[1] as number;

    // If no entry exists or TTL expired, create a new window
    if (count === null || ttl === -2) {
      await redis.set(key, 1, { ex: windowSeconds });
      return {
        success: true,
        remaining: maxRequests - 1,
        resetAt: now + windowMs,
      };
    }

    // Increment the count
    const newCount = await redis.incr(key);

    // Calculate reset time
    const resetAt = now + (ttl * 1000);

    // Check if limit is exceeded
    if (newCount > maxRequests) {
      return {
        success: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil(ttl),
      };
    }

    return {
      success: true,
      remaining: maxRequests - newCount,
      resetAt,
    };
  } catch (error) {
    logger.error("Redis rate limit check failed, falling back to in-memory", error as Error);
    return checkRateLimitMemory(config);
  }
}

/**
 * Check rate limit using in-memory storage (fallback)
 */
function checkRateLimitMemory(config: RateLimitConfig): RateLimitResult {
  const { maxRequests, windowSeconds, identifier } = config;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const key = identifier;

  let entry = inMemoryStore.get(key);

  // If no entry exists or the window has expired, create a new one
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 1,
      resetAt: now + windowMs,
    };
    inMemoryStore.set(key, entry);

    return {
      success: true,
      remaining: maxRequests - 1,
      resetAt: entry.resetAt,
    };
  }

  // Increment the count
  entry.count++;

  // Check if the limit is exceeded
  if (entry.count > maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  return {
    success: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

// ==========================================
// PUBLIC API
// ==========================================

/**
 * Check if a request is within rate limits
 * Automatically uses Redis in production or in-memory in development
 *
 * @param config Rate limit configuration
 * @returns Rate limit result (always returns a Promise for API consistency)
 */
export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const redis = getRedisClient();

  if (redis) {
    // Use Redis-based rate limiting (async)
    return await checkRateLimitRedis(config);
  } else {
    // Use in-memory rate limiting (wrapped in Promise for consistency)
    return checkRateLimitMemory(config);
  }
}

/**
 * Common rate limit configurations
 */
export const RATE_LIMITS = {
  // Strict limits for expensive AI operations
  AI_GENERATION: {
    maxRequests: 5,
    windowSeconds: 60, // 5 requests per minute
  },

  // Moderate limits for authenticated API calls
  API_AUTHENTICATED: {
    maxRequests: 60,
    windowSeconds: 60, // 60 requests per minute
  },

  // Looser limits for read operations
  API_READ: {
    maxRequests: 120,
    windowSeconds: 60, // 120 requests per minute
  },

  // Strict limits for auth operations
  AUTH: {
    maxRequests: 5,
    windowSeconds: 900, // 5 requests per 15 minutes
  },

  // Public endpoint limits
  PUBLIC: {
    maxRequests: 30,
    windowSeconds: 60, // 30 requests per minute
  },
} as const;

/**
 * Helper to get identifier from request
 * Priority: User ID > IP Address
 */
export function getRequestIdentifier(
  userId?: string | null,
  ipAddress?: string | null
): string {
  if (userId) {
    return `user:${userId}`;
  }
  if (ipAddress) {
    return `ip:${ipAddress}`;
  }
  return "anonymous";
}

/**
 * Get client IP address from request headers
 */
export function getClientIp(headers: Headers): string | null {
  // Check various headers used by proxies/load balancers
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    // x-forwarded-for may contain multiple IPs, take the first one
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback (may not be available in all environments)
  return headers.get("x-client-ip");
}
