// src/app/api/discovery/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  checkRateLimit, RATE_LIMITS, getRequestIdentifier, getClientIp,
} from '@/lib/rate-limit';
import { enforceSameOrigin, HttpError, httpErrorToResponse } from '@/lib/validation/server-helpers';
import { z } from 'zod';
import {
  createEmptyContext,
  createInterviewState,
  saveSession,
} from '@/lib/discovery';
import {
  assertVentureLimitNotReached,
  assertFreeDiscoverySessionLimit,
} from '@/lib/lifecycle';

// Keep in sync with the per-turn cap in /sessions/[sessionId]/turn/route.ts.
// 12k characters ≈ 3k tokens — ample for a detailed opening prompt
// (situation + goal + context + constraints) while still bounding the
// request so a runaway paste doesn't drop a novel-sized payload into
// the LLM pipeline.
const FIRST_MESSAGE_MAX_CHARS = 12_000;

const CreateSessionSchema = z.object({
  firstMessage: z.string().max(FIRST_MESSAGE_MAX_CHARS).optional(),
  /**
   * Concern 5 trigger #3: when set to true, bypass the
   * pending-outcome check and create the session unconditionally.
   * The client sends this on the second POST after the founder has
   * either submitted or explicitly skipped the outcome modal that
   * the first POST returned. Default false.
   */
  acknowledgePendingOutcome: z.boolean().optional().default(false),

  // ----- Lifecycle memory scenario -----
  //
  // Determines which interview path to run and what context to load.
  //   'first_interview'    — no prior profile, full belief state
  //                          generation from scratch (today's default)
  //   'fresh_start'        — has a FounderProfile, starting a new
  //                          venture. Skips stable-context questions.
  //   'fork_continuation'  — continuing an existing venture after
  //                          picking a fork from a continuation brief.
  //                          Loads full venture history.
  //
  // Defaults to 'first_interview' for backwards compatibility.
  scenario: z.enum(['first_interview', 'fresh_start', 'fork_continuation']).optional().default('first_interview'),
  /** Required when scenario is 'fork_continuation'. */
  ventureId: z.string().optional(),
  /** The fork description from the continuation brief. */
  forkContext: z.string().max(2000).optional(),
});

/**
 * POST /api/discovery/sessions
 *
 * Creates a new discovery session for the authenticated user.
 * Also creates a linked Conversation so messages appear in the sidebar.
 * Does NOT stream an opening question — the interview begins when the
 * user sends their first message to the turn endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    enforceSameOrigin(req);
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    throw err;
  }

  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const userId = authSession.user.id;

  const clientIp = getClientIp(req.headers);
  const rateLimitResult = await checkRateLimit({
    ...RATE_LIMITS.AI_GENERATION,
    identifier: getRequestIdentifier(userId, clientIp),
  });
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } },
    );
  }

  const log = logger.child({ route: 'POST /api/discovery/sessions', userId });

  const body: unknown = req.headers.get('content-type')?.includes('application/json')
    ? await req.json().catch(() => ({}))
    : {};
  const parsed = CreateSessionSchema.safeParse(body);
  if (!parsed.success) {
    log.warn('Invalid create-session body', { issues: parsed.error.issues });
    // Return a specific message for the common case — firstMessage too
    // long. The generic "Invalid request body" leaves the client with
    // nothing actionable to show; a user who pasted a detailed opening
    // prompt deserves to know exactly why it was rejected.
    const tooLong = parsed.error.issues.find(
      (i) => i.path[0] === 'firstMessage' && i.code === 'too_big',
    );
    const message = tooLong
      ? `Your opening message is longer than our ${FIRST_MESSAGE_MAX_CHARS.toLocaleString()}-character limit. Please shorten it and try again — the system asks follow-up questions to capture detail across turns.`
      : 'Invalid request body';
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const { firstMessage, acknowledgePendingOutcome, scenario, ventureId, forkContext } = parsed.data;
  const title = firstMessage?.trim().slice(0, 80) || 'Discovery Interview';

  // Free-tier lifetime discovery cap. Free users don't create Ventures,
  // so the venture-count check below never gates them — instead they
  // get up to FREE_DISCOVERY_SESSION_LIMIT (2) lifetime discovery
  // sessions. Runs on every scenario so the cap holds whether the
  // client sends first_interview, fresh_start, or fork_continuation.
  try {
    await assertFreeDiscoverySessionLimit(userId);
  } catch (err) {
    if (err instanceof HttpError) return httpErrorToResponse(err);
    throw err;
  }

  // Paid-tier active-venture limit. `fresh_start` is the scenario
  // where a founder with an existing FounderProfile is starting a
  // wholly new venture — the exact moment the active-venture count
  // is about to increase. `first_interview` is the founder's first
  // ever discovery so no existing ventures can be in play. `fork_continuation`
  // continues an existing venture and creates a new cycle, not a new venture.
  if (scenario === 'fresh_start') {
    try {
      await assertVentureLimitNotReached(userId);
    } catch (err) {
      if (err instanceof HttpError) return httpErrorToResponse(err);
      throw err;
    }
  }

  // Concern 5 trigger #3 — pending outcome check.
  // If the founder has any prior recommendation with a roadmap that
  // is partially complete (>0 tasks done, < total) AND has not yet
  // received an outcome attestation, return a 200 with the
  // pendingOutcomeRecommendationId instead of creating the new
  // session. The client renders the outcome modal, the founder
  // either submits or skips, and re-POSTs with
  // acknowledgePendingOutcome=true to actually create the session.
  if (!acknowledgePendingOutcome) {
    const partialRoadmap = await prisma.roadmap.findFirst({
      where: {
        userId,
        recommendation: { outcome: null },
        progress: {
          completedTasks: { gt: 0 },
          // The "skipped or submitted" cases are caught by clearing
          // outcomePromptSkippedAt and the outcome relation above
          outcomePromptSkippedAt: null,
        },
      },
      select: {
        recommendationId: true,
        progress: { select: { completedTasks: true, totalTasks: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (
      partialRoadmap
      && partialRoadmap.progress
      && partialRoadmap.progress.completedTasks < partialRoadmap.progress.totalTasks
    ) {
      log.info('Pending outcome — blocking session creation', {
        recommendationId: partialRoadmap.recommendationId,
      });
      return NextResponse.json({
        pendingOutcomeRecommendationId: partialRoadmap.recommendationId,
      }, { status: 200 });
    }
  }

  try {
    const emptyContext = createEmptyContext();

    // Create Conversation + DiscoverySession atomically
    const { sessionId, conversationId } = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: { userId, title },
        select: { id: true },
      });

      const session = await tx.discoverySession.create({
        data: {
          userId,
          conversationId: conversation.id,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          beliefState: JSON.parse(JSON.stringify(emptyContext)),
        },
        select: { id: true },
      });

      return { sessionId: session.id, conversationId: conversation.id };
    });

    log.debug('Created discovery session', { sessionId, conversationId });

    // Seed Redis with the interview state (lifecycle scenario persisted
    // so the turn route can load the right context on each turn).
    const interviewState = createInterviewState(sessionId, userId, {
      scenario: scenario ?? 'first_interview',
      ventureId: ventureId ?? undefined,
      forkContext: forkContext ?? undefined,
    });
    await saveSession(sessionId, interviewState);

    const response = NextResponse.json({ ok: true }, { status: 201 });
    response.headers.set('X-Session-Id', sessionId);
    response.headers.set('X-Conversation-Id', conversationId);
    return response;
  } catch (error) {
    log.error('Failed to create discovery session', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
