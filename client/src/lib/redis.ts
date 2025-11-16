// src/lib/redis.ts
/**
 * Redis Client Configuration
 *
 * Uses Upstash Redis for serverless-compatible rate limiting and caching
 */

import { Redis } from "@upstash/redis";
import { env } from "./env";
import { logger } from "./logger";

let redis: Redis | null = null;

/**
 * Get Redis client instance
 * Returns null if Redis is not configured (for development)
 */
export function getRedisClient(): Redis | null {
  // Return existing instance if available
  if (redis) {
    return redis;
  }

  // Check if Redis is configured
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    logger.warn(
      "Redis not configured. Using in-memory rate limiting (not suitable for production)"
    );
    return null;
  }

  try {
    // Create Redis client
    redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });

    logger.info("Redis client initialized successfully");
    return redis;
  } catch (error) {
    logger.error("Failed to initialize Redis client", error as Error);
    return null;
  }
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return getRedisClient() !== null;
}
