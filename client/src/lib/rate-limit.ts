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

// ==========================================
// PER-BILLING-CYCLE LIMITS
// ==========================================

/**
 * Per-billing-cycle caps on AI-heavy tools that cost real money per
 * call. The tier names below are concatenations of {tool}_{tier}; the
 * route resolves which key to use by reading the user's tier.
 *
 * Calibration rationale:
 *
 *   - Real-world usage data is not yet available; numbers below are
 *     conservative defaults.
 *   - Typical engaged user: 3-10 calls per tool per cycle (one tool
 *     per active task on the roadmap, plus a handful of standalone
 *     uses).
 *   - Caps target ~3-5x typical engaged usage so 99% of legitimate
 *     users never hit them.
 *   - Compound tier always gets ~3x the Execute tier cap to make the
 *     upgrade path feel meaningful for power users.
 *
 * Per-call cost reference (approximate, with prompt caching):
 *
 *   - Research Tool: $0.20-0.80 per query (Opus + Exa). Tightest cap.
 *   - Service Packager: $0.10-0.30 per generation. Tight cap.
 *   - Conversation Coach: $0.05-0.15 per session. Looser cap.
 *   - Outreach Composer: $0.02-0.08 per draft. Loosest cap.
 *
 * At Compound caps, worst-case cycle COGS per user:
 *   100 * $0.80 + 150 * $0.15 + 300 * $0.08 + 60 * $0.30 = $144.50
 * vs $46.05 net revenue per Compound user — extreme but rare. The
 * anomaly detection function flags this for human review, it does not
 * auto-suspend.
 */
export const CYCLE_LIMITS = {
  RESEARCH_TOOL_EXECUTE:  { limit: 30,  toolLabel: 'Research Tool',       tier: 'execute'  as const },
  RESEARCH_TOOL_COMPOUND: { limit: 100, toolLabel: 'Research Tool',       tier: 'compound' as const },
  COACH_EXECUTE:          { limit: 50,  toolLabel: 'Conversation Coach',  tier: 'execute'  as const },
  COACH_COMPOUND:         { limit: 150, toolLabel: 'Conversation Coach',  tier: 'compound' as const },
  COMPOSER_EXECUTE:       { limit: 100, toolLabel: 'Outreach Composer',   tier: 'execute'  as const },
  COMPOSER_COMPOUND:      { limit: 300, toolLabel: 'Outreach Composer',   tier: 'compound' as const },
  PACKAGER_EXECUTE:       { limit: 20,  toolLabel: 'Service Packager',    tier: 'execute'  as const },
  PACKAGER_COMPOUND:      { limit: 60,  toolLabel: 'Service Packager',    tier: 'compound' as const },
} as const;

export type CycleLimitKey = keyof typeof CYCLE_LIMITS;

/**
 * Tool family identifier. Used by the UsageMeter and the anomaly
 * detection function to query usage by tool regardless of tier.
 */
export type CycleTool = 'research' | 'coach' | 'composer' | 'packager';

const TOOL_TO_KEYS: Record<CycleTool, { execute: CycleLimitKey; compound: CycleLimitKey }> = {
  research: { execute: 'RESEARCH_TOOL_EXECUTE', compound: 'RESEARCH_TOOL_COMPOUND' },
  coach:    { execute: 'COACH_EXECUTE',         compound: 'COACH_COMPOUND' },
  composer: { execute: 'COMPOSER_EXECUTE',      compound: 'COMPOSER_COMPOUND' },
  packager: { execute: 'PACKAGER_EXECUTE',      compound: 'PACKAGER_COMPOUND' },
};

export function cycleKeyFor(tool: CycleTool, tier: 'execute' | 'compound'): CycleLimitKey {
  return TOOL_TO_KEYS[tool][tier];
}

const CYCLE_TTL_BUFFER_SECONDS = 7 * 24 * 60 * 60; // 7 days past cycle end

/**
 * Build the Redis key for a per-cycle usage counter. Includes the
 * cycle end timestamp so a renewal naturally rolls the user onto a
 * fresh key — no explicit reset logic required, no race during
 * rollover. Old keys auto-expire via TTL.
 */
function cycleKey(key: CycleLimitKey, userId: string, cycleEndsAt: Date): string {
  // Normalise to seconds since epoch — stable identifier regardless
  // of millisecond drift between Paddle's webhook payload and our
  // serialised representation.
  const cycleStamp = Math.floor(cycleEndsAt.getTime() / 1000);
  return `cycle:${key}:user:${userId}:end:${cycleStamp}`;
}

export interface CycleRateLimitResult {
  /** True when the request is allowed; false when the cap is hit. */
  success: boolean;
  /** Per-tier maximum for this tool. */
  limit: number;
  /** Calls already made this cycle (after the increment if `success`). */
  used: number;
  /** Calls remaining this cycle. Zero when `success` is false. */
  remaining: number;
  /** ISO 8601 timestamp when the user's quota resets. */
  resetsAt: string;
  /** Human-readable tool name for the UI. */
  toolLabel: string;
}

/**
 * Atomic per-cycle rate-limit check. Increments the counter and
 * returns success / failure.
 *
 * Why Redis-only (no in-memory fallback like checkRateLimit):
 *   In-memory counters reset every serverless invocation, which would
 *   give every user infinite cycle quota. Refusing the request when
 *   Redis is unavailable would block legitimate users; allowing it
 *   would defeat the whole point of cycle caps. We pick the lesser
 *   evil — log a warning and allow the request — so a Redis outage
 *   degrades cap enforcement but never blocks a paying customer.
 */
export async function checkCycleRateLimit(args: {
  key:         CycleLimitKey;
  userId:      string;
  cycleEndsAt: Date;
}): Promise<CycleRateLimitResult> {
  const { key, userId, cycleEndsAt } = args;
  const cfg = CYCLE_LIMITS[key];
  const redis = getRedisClient();

  if (!redis) {
    logger.warn('Cycle rate-limit check skipped — Redis unavailable', { key, userId });
    return {
      success:   true,
      limit:     cfg.limit,
      used:      0,
      remaining: cfg.limit,
      resetsAt:  cycleEndsAt.toISOString(),
      toolLabel: cfg.toolLabel,
    };
  }

  const redisKey = cycleKey(key, userId, cycleEndsAt);
  const ttlSeconds = Math.max(
    Math.floor((cycleEndsAt.getTime() - Date.now()) / 1000) + CYCLE_TTL_BUFFER_SECONDS,
    CYCLE_TTL_BUFFER_SECONDS,
  );

  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      // First write of the cycle — set TTL so the key cleans up on
      // its own once the cycle has rolled over plus the grace buffer.
      await redis.expire(redisKey, ttlSeconds);
    }

    if (count > cfg.limit) {
      return {
        success:   false,
        limit:     cfg.limit,
        used:      count,
        remaining: 0,
        resetsAt:  cycleEndsAt.toISOString(),
        toolLabel: cfg.toolLabel,
      };
    }

    return {
      success:   true,
      limit:     cfg.limit,
      used:      count,
      remaining: cfg.limit - count,
      resetsAt:  cycleEndsAt.toISOString(),
      toolLabel: cfg.toolLabel,
    };
  } catch (err) {
    logger.error(
      'Cycle rate-limit Redis check failed — allowing request',
      err instanceof Error ? err : new Error(String(err)),
      { key, userId },
    );
    return {
      success:   true,
      limit:     cfg.limit,
      used:      0,
      remaining: cfg.limit,
      resetsAt:  cycleEndsAt.toISOString(),
      toolLabel: cfg.toolLabel,
    };
  }
}

/**
 * Read-only counterpart to `checkCycleRateLimit` — returns the
 * current cycle usage without incrementing. Used by the UsageMeter
 * component (via /api/usage) and the anomaly detection sweep.
 */
export async function getCycleUsage(args: {
  key:         CycleLimitKey;
  userId:      string;
  cycleEndsAt: Date;
}): Promise<{ used: number; limit: number; toolLabel: string; resetsAt: string }> {
  const { key, userId, cycleEndsAt } = args;
  const cfg = CYCLE_LIMITS[key];
  const redis = getRedisClient();

  const base = {
    limit:     cfg.limit,
    toolLabel: cfg.toolLabel,
    resetsAt:  cycleEndsAt.toISOString(),
  };

  if (!redis) return { used: 0, ...base };

  try {
    const count = (await redis.get<number>(cycleKey(key, userId, cycleEndsAt))) ?? 0;
    return { used: count, ...base };
  } catch (err) {
    logger.error(
      'Cycle usage read failed',
      err instanceof Error ? err : new Error(String(err)),
      { key, userId },
    );
    return { used: 0, ...base };
  }
}

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
