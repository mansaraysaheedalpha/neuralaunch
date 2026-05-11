// src/app/api/discovery/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';
import { z } from 'zod';
import {
  createEmptyContext,
  createInterviewState,
  saveSession,
} from '@/lib/discovery';
import type { AudienceType } from '@/lib/discovery';
import {
  assertVentureLimitNotReached,
  assertFreeDiscoverySessionLimit,
} from '@/lib/lifecycle';
import { inngest } from '@/inngest/client';
import { CONVERSATION_TITLE_EVENT } from '@/lib/discovery/constants';
import { isNoIdeaEnabled } from '@/lib/env';
import { createInitialStageRunsForNoIdea } from '@/lib/ideation';

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
  //   'no_idea'            — "I don't have an idea yet" archetype.
  //                          Runs the 6-stage ideation flow instead
  //                          of the Discovery interview. Gated behind
  //                          NEXT_PUBLIC_NO_IDEA_ENABLED in env.ts.
  //
  // Defaults to 'first_interview' for backwards compatibility.
  scenario: z.enum(['first_interview', 'fresh_start', 'fork_continuation', 'no_idea']).optional().default('first_interview'),
  /** Required when scenario is 'fork_continuation'. */
  ventureId: z.string().optional(),
  /** The fork description from the continuation brief. */
  forkContext: z.string().max(2000).optional(),
  /**
   * Audience type pre-seeded from the archetype picker. When set, the
   * turn route's Q4/Q7 audience classification is skipped — the
   * founder's explicit pick wins. Forbidden alongside scenario='no_idea'
   * (that archetype has no audience concept).
   */
  preseededAudienceType: z.enum([
    'LOST_GRADUATE',
    'STUCK_FOUNDER',
    'ESTABLISHED_OWNER',
    'ASPIRING_BUILDER',
    'MID_JOURNEY_PROFESSIONAL',
  ]).optional(),
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
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'session-create', RATE_LIMITS.AI_GENERATION);

    const log = logger.child({ route: 'POST /api/discovery/sessions', userId });

    const body: unknown = req.headers.get('content-type')?.includes('application/json')
      ? await req.json().catch(() => ({}))
      : {};
    const parsed = CreateSessionSchema.safeParse(body);
    if (!parsed.success) {
      log.warn('Invalid create-session body', { issues: parsed.error.issues });
      // Specific message for the common case — firstMessage too long.
      // The generic "Invalid request body" leaves the client with
      // nothing actionable; a user who pasted a detailed opening
      // prompt deserves to know exactly why it was rejected.
      const tooLong = parsed.error.issues.find(
        (i) => i.path[0] === 'firstMessage' && i.code === 'too_big',
      );
      const message = tooLong
        ? `Your opening message is longer than our ${FIRST_MESSAGE_MAX_CHARS.toLocaleString()}-character limit. Please shorten it and try again — the system asks follow-up questions to capture detail across turns.`
        : 'Invalid request body';
      throw new HttpError(400, message);
    }
    const {
      firstMessage,
      acknowledgePendingOutcome,
      scenario,
      ventureId,
      forkContext,
      preseededAudienceType,
    } = parsed.data;
    const title = firstMessage?.trim().slice(0, 80) || 'Discovery Interview';

    // Server-side feature-flag guard. The client picker is gated on
    // the same env value, but a stale or malicious client could still
    // POST scenario='no_idea' — reject those before any DB write so
    // the flag is the only thing standing between dev work and prod.
    if (scenario === 'no_idea' && !isNoIdeaEnabled()) {
      throw new HttpError(400, 'no_idea archetype is not enabled in this environment');
    }

    // Mutual exclusivity: the no_idea archetype has no audience-type
    // concept — its dispatch path doesn't consult the question-generator
    // audience prompts. Preseeding for the other 5 archetypes is fine.
    if (scenario === 'no_idea' && preseededAudienceType) {
      throw new HttpError(400, 'preseededAudienceType is not valid for the no_idea archetype');
    }

    // Free-tier lifetime discovery cap. Free users don't create Ventures,
    // so the venture-count check below never gates them — instead they
    // get up to FREE_DISCOVERY_SESSION_LIMIT (2) lifetime discovery
    // sessions. Runs on every scenario so the cap holds whether the
    // client sends first_interview, fresh_start, fork_continuation,
    // or no_idea.
    await assertFreeDiscoverySessionLimit(userId);

    // Paid-tier active-venture limit. `fresh_start` is the scenario
    // where a founder with an existing FounderProfile is starting a
    // wholly new venture — the exact moment the active-venture count
    // is about to increase. `first_interview` is the founder's first
    // ever discovery so no existing ventures can be in play.
    // `fork_continuation` continues an existing venture and creates a
    // new cycle, not a new venture. `no_idea` eventually produces a
    // Recommendation → roadmap → venture at Stage 5, so it gates here
    // at session creation — a paid founder at the venture cap should
    // never be allowed to walk all the way through Stages 1-4 and hit
    // a wall at the end.
    if (scenario === 'fresh_start' || scenario === 'no_idea') {
      await assertVentureLimitNotReached(userId);
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

    const emptyContext = createEmptyContext();

    // Create Conversation + DiscoverySession atomically. For no_idea
    // sessions, also create the two initial IdeationStageRun rows
    // (stage 0 already committed, stage 1 authoring) so the resumption
    // detection and the turn handler both find a valid stage row on
    // first hit.
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

      if (scenario === 'no_idea') {
        await createInitialStageRunsForNoIdea(tx, session.id);
      }

      return { sessionId: session.id, conversationId: conversation.id };
    });

    log.debug('Created discovery session', { sessionId, conversationId });

    // Fire the AI-summarised-title event when we have a real first
    // message to summarise. The Conversation row is already persisted
    // with the truncated-first-message fallback as title, so the
    // sidebar renders something usable until the worker overwrites
    // it. Skipped when firstMessage is empty (cold-resume flow) —
    // the "Discovery Interview" placeholder stays. Fire-and-forget:
    // a failure leaves the truncated title in place, which is the
    // prior behaviour, not a regression.
    const trimmedFirstMessage = firstMessage?.trim();
    if (trimmedFirstMessage && trimmedFirstMessage.length > 0) {
      try {
        await inngest.send({
          name: CONVERSATION_TITLE_EVENT,
          data: { conversationId, userId, firstMessage: trimmedFirstMessage },
        });
      } catch (err) {
        // Title is cosmetic — never block session creation on the
        // event-dispatch failure. Log and move on; the truncated
        // fallback stays.
        log.warn('Failed to enqueue conversation-title event', {
          conversationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Seed Redis with the interview state (lifecycle scenario persisted
    // so the turn route can load the right context on each turn).
    // For preseeded archetypes (the 5 existing types), pass through the
    // founder's pick and set audienceTypeLocked=true so the turn route
    // skips its silent Q4/Q7 audience classification.
    const interviewState = createInterviewState(sessionId, userId, {
      scenario:    scenario ?? 'first_interview',
      ventureId:   ventureId ?? undefined,
      forkContext: forkContext ?? undefined,
      audienceType:       preseededAudienceType ? (preseededAudienceType as AudienceType) : undefined,
      audienceTypeLocked: preseededAudienceType ? true : undefined,
    });
    await saveSession(sessionId, interviewState);

    const response = NextResponse.json({ ok: true }, { status: 201 });
    response.headers.set('X-Session-Id', sessionId);
    response.headers.set('X-Conversation-Id', conversationId);
    return response;
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
