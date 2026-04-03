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
 */
export function teeDiscoveryStream(
  textStream:     ReadableStream<string>,
  conversationId: string | null,
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
      close() {
        void writer.close().then(async () => {
          const fullText = chunks.join('');
          if (fullText && conversationId) {
            await prisma.message.create({
              data: { conversationId, role: 'assistant', content: fullText },
            }).catch(() => { /* non-fatal */ });
          }
        });
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
 * Retrieves the interview state for the given session ID from Redis.
 * Falls back to Prisma if Redis is unavailable — reconstructs InterviewState
 * from the beliefState JSON column that is synced on every turn.
 * Returns null if the session does not exist or has expired.
 * Resets the sliding TTL on every successful Redis read.
 */
export async function getSession(sessionId: string): Promise<InterviewState | null> {
  try {
    const redis = getRedis();
    const key   = sessionKey(sessionId);
    const raw   = await redis.get<InterviewState>(key);

    if (!raw) return null;

    // Slide the TTL — the session stays alive as long as the user is active
    await redis.expire(key, SESSION_TTL_SECONDS);

    // Guard against sessions written before new fields were added
    return {
      ...raw,
      consecutiveMisses:     raw.consecutiveMisses     ?? 0,
      audienceType:          raw.audienceType          ?? null,
      psychConstraintProbed: raw.psychConstraintProbed ?? false,
    };
  } catch {
    // Redis unavailable — reconstruct state from Prisma as fallback
    const record = await prisma.discoverySession.findUnique({
      where:  { id: sessionId },
      select: {
        id:               true,
        userId:           true,
        phase:            true,
        questionCount:    true,
        questionsInPhase: true,
        activeField:      true,
        beliefState:      true,
        status:           true,
        createdAt:        true,
        updatedAt:        true,
      },
    });

    if (!record) return null;

    const parsed  = DiscoveryContextSchema.safeParse(record.beliefState);
    const context = parsed.success ? parsed.data : createEmptyContext();

    return {
      sessionId:         record.id,
      userId:            record.userId,
      phase:             record.phase as InterviewPhase,
      context,
      questionCount:     record.questionCount,
      questionsInPhase:  record.questionsInPhase,
      isComplete:        record.status === 'COMPLETE',
      activeField:           (record.activeField ?? null) as DiscoveryContextField | 'psych_probe' | null,
      audienceType:          null,
      consecutiveMisses:     0, // transient — always 0 when reconstructing from Prisma
      psychConstraintProbed: false,
      createdAt:         record.createdAt.toISOString(),
      updatedAt:         record.updatedAt.toISOString(),
    };
  }
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
