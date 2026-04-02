// src/lib/discovery/session-store.ts
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';
import { SESSION_KEY_PREFIX, SESSION_TTL_SECONDS } from './constants';
import { InterviewState } from './interview-engine';

// ---------------------------------------------------------------------------
// Redis client — lazy-initialised so module can be imported in non-Redis envs
// ---------------------------------------------------------------------------

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;

  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for discovery sessions',
    );
  }

  _redis = new Redis({
    url:   env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  return _redis;
}

function sessionKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * getSession
 *
 * Retrieves the interview state for the given session ID.
 * Returns null if the session does not exist or has expired.
 * Resets the sliding TTL on every read.
 */
export async function getSession(sessionId: string): Promise<InterviewState | null> {
  const redis = getRedis();
  const key   = sessionKey(sessionId);
  const raw   = await redis.get<InterviewState>(key);

  if (!raw) return null;

  // Slide the TTL — the session stays alive as long as the user is active
  await redis.expire(key, SESSION_TTL_SECONDS);

  return raw;
}

/**
 * saveSession
 *
 * Persists the interview state to Redis with a sliding TTL.
 * Every write resets the 15-minute expiry window.
 */
export async function saveSession(
  sessionId: string,
  state:     InterviewState,
): Promise<void> {
  const redis = getRedis();
  await redis.set(sessionKey(sessionId), state, { ex: SESSION_TTL_SECONDS });
}

/**
 * deleteSession
 *
 * Removes the session from Redis immediately.
 * Called after synthesis is complete to free memory.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(sessionKey(sessionId));
}
