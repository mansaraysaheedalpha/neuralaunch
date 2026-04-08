// src/lib/discovery/session-store.ts
import 'server-only';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';
import prisma from '@/lib/prisma';
import { SESSION_KEY_PREFIX, SESSION_TTL_SECONDS } from './constants';
import { InterviewState } from './interview-engine';
import { DiscoveryContextSchema, createEmptyContext } from './context-schema';
import type { InterviewPhase } from './constants';
import type { DiscoveryContextField } from './context-schema';

// ---------------------------------------------------------------------------
// Stream tee — pipes AI textStream to client AND persists to Conversation
// ---------------------------------------------------------------------------

/**
 * teeDiscoveryStream
 *
 * Pipes a Vercel AI SDK textStream to the client while persisting the
 * accumulated response as an assistant Message in the linked Conversation.
 * Returns a ReadableStream<Uint8Array> suitable for a NextResponse body.
 * The Message write is best-effort — failures are swallowed.
 *
 * When `modelUsed` is supplied (a Promise that resolves with the
 * provider id chosen by the question-stream-fallback orchestrator),
 * the resolved value is persisted on the Message row for observability.
 * When the promise rejects (every provider failed) we still persist
 * the partial content with modelUsed = null.
 */
export function teeDiscoveryStream(
  textStream:     ReadableStream<string>,
  conversationId: string | null,
  modelUsed?:     Promise<string>,
): ReadableStream<Uint8Array> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer  = writable.getWriter();
  const encoder = new TextEncoder();
  const chunks: string[] = [];

  void textStream.pipeTo(
    new WritableStream({
      write(chunk) {
        chunks.push(chunk);
        void writer.write(encoder.encode(chunk));
      },
      async close() {
        try {
          await writer.close();
        } catch { /* ignore double-close */ }
        const fullText = chunks.join('');
        if (!fullText || !conversationId) return;

        // Resolve modelUsed if available — never block on it longer
        // than the stream itself ran. The orchestrator resolves on
        // first chunk, so by close() it should already be settled.
        let resolvedModel: string | null = null;
        if (modelUsed) {
          try {
            resolvedModel = await modelUsed;
          } catch {
            resolvedModel = null;
          }
        }

        await prisma.message.create({
          data: {
            conversationId,
            role:      'assistant',
            content:   fullText,
            modelUsed: resolvedModel,
          },
        }).catch(() => { /* non-fatal */ });
      },
      async abort() {
        // Stream errored before completion — persist whatever we got
        // so the founder's view of the transcript reflects what they
        // saw. The retry UI in Phase 2 of this fix uses this row to
        // render the cut-stream indicator.
        const fullText = chunks.join('');
        if (!fullText || !conversationId) return;
        let resolvedModel: string | null = null;
        if (modelUsed) {
          try { resolvedModel = await modelUsed; } catch { resolvedModel = null; }
        }
        await prisma.message.create({
          data: {
            conversationId,
            role:      'assistant',
            content:   fullText,
            modelUsed: resolvedModel,
          },
        }).catch(() => { /* non-fatal */ });
      },
    }),
  );

  return readable;
}

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
    url:                  env.UPSTASH_REDIS_REST_URL,
    token:                env.UPSTASH_REDIS_REST_TOKEN,
    enableAutoPipelining: false,
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
 * Retrieves the interview state for the given session ID. Reads from
 * Redis first (the hot cache) and falls back to Postgres on EITHER a
 * Redis exception OR a Redis miss. The Postgres fallback also re-warms
 * Redis so subsequent reads in the same session hit the cache again.
 *
 * Contract: Redis is a cache, Postgres is the source of truth. A
 * session that exists in Postgres but has fallen out of Redis (TTL
 * expired during 15+ minutes of inactivity) MUST be rehydratable —
 * the founder cannot lose their interview state because of a cache
 * miss. Production hit exactly that on 2026-04-08: a founder paused
 * for >15 minutes, came back to type their next answer, and the turn
 * route 404'd because the original code path returned null on Redis
 * miss without checking Postgres.
 *
 * Returns null only when the session is genuinely not in Postgres.
 */
export async function getSession(sessionId: string): Promise<InterviewState | null> {
  // Step 1: try Redis first (the hot path).
  let cacheRaw: InterviewState | null = null;
  try {
    const redis = getRedis();
    const key   = sessionKey(sessionId);
    cacheRaw = await redis.get<InterviewState>(key);
    if (cacheRaw) {
      // Slide the TTL — the session stays alive as long as the user is active
      await redis.expire(key, SESSION_TTL_SECONDS);
      // Guard against sessions written before new fields were added
      return {
        ...cacheRaw,
        consecutiveMisses:     cacheRaw.consecutiveMisses     ?? 0,
        audienceType:          cacheRaw.audienceType          ?? null,
        psychConstraintProbed: cacheRaw.psychConstraintProbed ?? false,
        pricingProbed:         cacheRaw.pricingProbed         ?? false,
        askedFields:           cacheRaw.askedFields           ?? [],
      };
    }
    // Cache miss — fall through to Postgres rehydration below.
  } catch {
    // Redis exception — fall through to Postgres rehydration below.
  }

  // Step 2: rehydrate from Postgres. Reached on cache miss OR exception.
  const record = await prisma.discoverySession.findUnique({
    where:  { id: sessionId },
    select: {
      id:                    true,
      userId:                true,
      phase:                 true,
      questionCount:         true,
      questionsInPhase:      true,
      activeField:           true,
      audienceType:          true,
      beliefState:           true,
      askedFields:           true,
      pricingProbed:         true,
      psychConstraintProbed: true,
      status:                true,
      createdAt:             true,
      updatedAt:             true,
    },
  });

  if (!record) return null;

  const parsed  = DiscoveryContextSchema.safeParse(record.beliefState);
  const context = parsed.success ? parsed.data : createEmptyContext();

  const rehydrated: InterviewState = {
    sessionId:         record.id,
    userId:            record.userId,
    phase:             record.phase as InterviewPhase,
    context,
    questionCount:     record.questionCount,
    questionsInPhase:  record.questionsInPhase,
    isComplete:        record.status === 'COMPLETE',
    activeField:           (record.activeField ?? null) as DiscoveryContextField | 'psych_probe' | null,
    audienceType:          (record.audienceType ?? null) as import('./constants').AudienceType | null,
    consecutiveMisses:     0,
    psychConstraintProbed: record.psychConstraintProbed ?? false,
    pricingProbed:         record.pricingProbed         ?? false,
    askedFields:           (Array.isArray(record.askedFields) ? record.askedFields : []) as DiscoveryContextField[],
    createdAt:         record.createdAt.toISOString(),
    updatedAt:         record.updatedAt.toISOString(),
  };

  // Re-warm Redis so the next turn hits the cache. Best-effort —
  // never block the founder on a cache write failure.
  try {
    const redis = getRedis();
    await redis.set(sessionKey(sessionId), rehydrated, { ex: SESSION_TTL_SECONDS });
  } catch { /* non-fatal */ }

  return rehydrated;
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
