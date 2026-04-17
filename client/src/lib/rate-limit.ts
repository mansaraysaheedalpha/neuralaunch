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
    const count = await redis.get<number>(key);
    const ttl   = await redis.ttl(key);

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
    logger.error(
      "Redis rate limit check failed, falling back to in-memory",
      error instanceof Error ? error : new Error(String(error)),
    );
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
  // Strict limits for expensive AI operations (project generation etc)
  AI_GENERATION: {
    maxRequests: 5,
    windowSeconds: 60, // 5 requests per minute
  },

  // Discovery interview turns — looser limit to allow full interview sessions
  // A full session is ~15 turns; allow up to 30/5min to cover retries
  DISCOVERY_TURN: {
    maxRequests: 30,
    windowSeconds: 300,
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

  // Voice mode transcription — 30 transcriptions per hour per user.
  // Generous enough for voice on every interview response plus check-ins,
  // but caps runaway client loops that could otherwise churn Deepgram /
  // Whisper spend.
  VOICE_TRANSCRIPTION: {
    maxRequests: 30,
    windowSeconds: 3600,
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
 * Resolve the client IP from request headers, defending against spoofing.
 *
 * The previous implementation blindly took the first hop in
 * x-forwarded-for, which is forgeable: any visitor can set their own
 * X-Forwarded-For header and the route would happily believe it. That
 * defeats both per-IP rate limiting (set a fresh fake IP per request)
 * AND the salted visitor-ID hash in /api/lp/analytics (fabricate as
 * many "unique visitors" as you want by rotating the spoofed IP).
 *
 * Trust order on Vercel:
 *   1. x-vercel-forwarded-for — set ONLY by Vercel's edge, never by
 *      the client. Most trustworthy signal.
 *   2. x-forwarded-for — only trusted when it contains exactly ONE IP
 *      (Vercel's edge always sets a single hop). If there are multiple
 *      IPs, the client appended their own — cannot trust the "first"
 *      one because we do not know how many client-supplied entries
 *      precede the real edge entry.
 *   3. x-real-ip — set by some proxies, not Vercel. Fall back if
 *      x-forwarded-for is missing entirely.
 *
 * If none of the above can be trusted, returns null. Callers should
 * treat null as "unknown IP" and either degrade rate-limiting to an
 * anonymous bucket OR refuse the request, depending on the route's
 * threat model.
 */
export function getClientIp(headers: Headers): string | null {
  // Tier 1: Vercel edge-only header. Cannot be set by the client
  // because Vercel's edge strips any incoming x-vercel-* headers
  // before forwarding. If this is present, trust it.
  const vercelForwarded = headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) {
    return vercelForwarded.split(",")[0].trim();
  }

  // Tier 2: standard x-forwarded-for, but only when there is exactly
  // one IP. Multiple IPs means the chain has been tampered with by
  // the client and we cannot identify the trusted hop without
  // hard-coded knowledge of the proxy chain length.
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map(s => s.trim()).filter(Boolean);
    if (ips.length === 1) {
      return ips[0];
    }
    // Tampered chain — refuse to guess
    return null;
  }

  // Tier 3: x-real-ip from non-Vercel proxies. Only relevant in
  // local dev or self-hosted deployments behind nginx/etc.
  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return null;
}
