// src/app/api/discovery/recommendations/[id]/pushback/route.ts
import { NextResponse } from 'next/server';
import { z }            from 'zod';
import { Prisma }       from '@prisma/client';
import prisma, { toJsonValue }           from '@/lib/prisma';
import { logger }       from '@/lib/logger';
import { inngest }      from '@/inngest/client';

// Vercel: allow up to 60 seconds for the Opus call. Pro plan supports
// up to 300s; 60 is the comfortable margin for the structured output
// call (typically 8-25s) without leaving the founder waiting forever
// on a stuck request.
export const maxDuration = 60;
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  PUSHBACK_CONFIG,
  PUSHBACK_ACTIONS,
  PUSHBACK_ALTERNATIVE_EVENT,
} from '@/lib/discovery/constants';
import {
  runPushbackTurn,
  mergeRecommendationPatch,
  buildClosingMessage,
  safeParsePushbackHistory,
  type PushbackTurnUser,
  type PushbackTurnAgent,
} from '@/lib/discovery/pushback-engine';
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import { RecommendationSchema, type Recommendation } from '@/lib/discovery/recommendation-schema';

const BodySchema = z.object({
  message: z.string().min(1).max(4000),
});

/**
 * POST /api/discovery/recommendations/[id]/pushback
 *
 * One round of the pushback conversation. Hard cap enforced server-side
 * — clients cannot post past PUSHBACK_CONFIG.HARD_CAP_ROUND. The HARD_CAP
 * round itself triggers the closing-move and queues an alternative
 * synthesis via Inngest; no eighth attempt is accepted.
 *
 * If the founder posts after a prior acceptance, this auto-un-accepts:
 * the act of pushing back is an implicit signal that the prior
 * commitment is no longer firm.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    // AI_GENERATION tier (5 req/min) — pushback turns are paid Opus
    // calls. The per-recommendation 7-round cap protects a single
    // recommendation; this protects the user's AI spend across
    // multiple recommendations from a single attacker session.
    await rateLimitByUser(userId, 'rec-pushback', RATE_LIMITS.AI_GENERATION);

    const { id: recommendationId } = await params;
    const log = logger.child({ route: 'POST recommendations/pushback', recommendationId, userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    // Load the recommendation in its CURRENT (possibly already-refined) state.
    // pushback rounds are computed from the user-turn count in pushbackHistory.
    // pushbackVersion is captured for the optimistic concurrency check on write.
    const rec = await prisma.recommendation.findFirst({
      where:  { id: recommendationId, userId },
      select: {
        id:                     true,
        recommendationType:     true,
        summary:                true,
        path:                   true,
        reasoning:              true,
        firstThreeSteps:        true,
        timeToFirstResult:      true,
        risks:                  true,
        assumptions:            true,
        whatWouldMakeThisWrong: true,
        alternativeRejected:    true,
        acceptedAt:             true,
        pushbackHistory:        true,
        pushbackVersion:        true,
        versions:               true,
        alternativeRecommendationId: true,
        roadmap:                { select: { id: true, status: true } },
        session: { select: { beliefState: true } },
      },
    });
    if (!rec) throw new HttpError(404, 'Not found');
    if (!rec.session?.beliefState) {
      throw new HttpError(409, 'Recommendation is missing its belief state');
    }

    const history = safeParsePushbackHistory(rec.pushbackHistory);
    const priorUserTurns = history.filter(t => t.role === 'user').length;
    const currentRound   = priorUserTurns + 1;
    const prevVersion    = rec.pushbackVersion;

    // Hard cap. The HARD_CAP_ROUND turn IS the closing move — the cap is
    // not "no more turns after 7", it's "the 7th is the last and it
    // delivers the closing message + queues the alternative synthesis".
    // Anything past 7 returns 409.
    if (currentRound > PUSHBACK_CONFIG.HARD_CAP_ROUND) {
      throw new HttpError(409, `Pushback cap reached. Take a day, then either accept this recommendation or start a new discovery session.`);
    }

    // If a prior alternative was already generated, the conversation is over —
    // accept it or start a new session.
    if (rec.alternativeRecommendationId) {
      throw new HttpError(409, 'An alternative has already been generated for this recommendation. Compare them and accept one, or start a new discovery session.');
    }

    // The closing move on round 7 queues an alternative-synthesis
    // Inngest worker. If the founder has already accepted this
    // recommendation, generating an alternative makes no sense — they
    // committed already. Refuse the closing-move turn rather than let
    // the worker fire and produce an alternative that links to an
    // accepted parent. (M4 fix: cheaper and more honest than checking
    // acceptedAt inside the worker.)
    if (currentRound === PUSHBACK_CONFIG.HARD_CAP_ROUND && rec.acceptedAt) {
      throw new HttpError(409, 'You have already accepted this recommendation. Reopen the discussion via "Reopen the discussion" first if you want to push back further.');
    }

    const userTurn: PushbackTurnUser = {
      role:      'user',
      content:   parsed.data.message,
      round:     currentRound,
      timestamp: new Date().toISOString(),
    };

    // -----------------------------------------------------------------
    // Round 7 — closing move + alternative synthesis. We do NOT call
    // Opus for this turn; the closing message is templated and the
    // expensive synthesis runs in the background via Inngest.
    // -----------------------------------------------------------------
    if (currentRound === PUSHBACK_CONFIG.HARD_CAP_ROUND) {
      const agentTurn: PushbackTurnAgent = {
        role:       'agent',
        content:    buildClosingMessage(),
        round:      currentRound,
        mode:       'analytical',
        action:     PUSHBACK_ACTIONS.CLOSING,
        converging: false,
        timestamp:  new Date().toISOString(),
      };

      const newHistory = [...history, userTurn, agentTurn];

      // Optimistic concurrency: only succeed if pushbackVersion has not
      // moved since we read. updateMany returns count=0 if another
      // request raced us; we 409 and let the client refetch.
      const updateResult = await prisma.recommendation.updateMany({
        where: { id: recommendationId, pushbackVersion: prevVersion },
        data:  {
          pushbackHistory: toJsonValue(newHistory),
          pushbackVersion: { increment: 1 },
          // Pushing back auto-un-accepts
          ...(rec.acceptedAt ? {
            acceptedAt:      null,
            acceptedAtRound: null,
            unacceptCount:   { increment: 1 },
          } : {}),
        },
      });

      if (updateResult.count === 0) {
        log.warn('[Pushback] Closing-move write lost optimistic-concurrency race');
        throw new HttpError(409, 'Another request modified this recommendation. Please refresh and try again.');
      }

      // Queue the alternative synthesis. The Inngest worker reads the
      // pushback history and produces a constrained recommendation
      // built from the founder's stated alternative direction. We send
      // AFTER the DB write succeeds — if the send fails, the closing
      // turn is still persisted and a manual retry / cron sweep can
      // reissue it. (See follow-up: M6 in the review.)
      await inngest.send({
        name: PUSHBACK_ALTERNATIVE_EVENT,
        data: { recommendationId, userId },
      });

      log.info('[Pushback] Closing move delivered, alternative synthesis queued');
      return NextResponse.json({
        agent:   agentTurn,
        round:   currentRound,
        closing: true,
      });
    }

    // -----------------------------------------------------------------
    // Normal turn — call Opus, persist, optionally merge a patch
    // -----------------------------------------------------------------
    const context = safeParseDiscoveryContext(rec.session.beliefState);
    const currentRec: Recommendation = RecommendationSchema.parse({
      recommendationType:     rec.recommendationType ?? 'other',
      summary:                rec.summary,
      path:                   rec.path,
      reasoning:              rec.reasoning,
      firstThreeSteps:        rec.firstThreeSteps,
      timeToFirstResult:      rec.timeToFirstResult,
      risks:                  rec.risks,
      assumptions:            rec.assumptions,
      whatWouldMakeThisWrong: rec.whatWouldMakeThisWrong,
      alternativeRejected:    rec.alternativeRejected,
    });

    const response = await runPushbackTurn({
      recommendationId,
      recommendation: currentRec,
      context,
      history,
      userMessage: parsed.data.message,
      currentRound,
    });

    const agentTurn: PushbackTurnAgent = {
      role:       'agent',
      content:    response.message,
      round:      currentRound,
      mode:       response.mode,
      action:     response.action,
      converging: response.converging,
      timestamp:  new Date().toISOString(),
    };

    const newHistory = [...history, userTurn, agentTurn];

    // Compute the optional refinement: only when action is refine or replace
    const isCommit = response.action === PUSHBACK_ACTIONS.REFINE
                  || response.action === PUSHBACK_ACTIONS.REPLACE;

    let updatedRec: Recommendation | null = null;
    if (isCommit && response.patch) {
      try {
        updatedRec = mergeRecommendationPatch(currentRec, response.patch);
      } catch (err) {
        log.error(
          'Failed to merge recommendation patch — keeping current state',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }

    // Build the version snapshot if we are about to commit a change.
    const existingVersions = (rec.versions ?? []) as Array<Record<string, unknown>>;
    const newVersions = updatedRec ? [
      ...existingVersions,
      {
        snapshot:   currentRec, // pre-update state
        round:      currentRound,
        action:     response.action,
        timestamp:  new Date().toISOString(),
      },
    ] : existingVersions;

    // Optimistic concurrency check on the same column. If another
    // pushback POST raced us between read and write, the update
    // affects 0 rows; we throw 409 and the client refetches.
    // The Opus call we just paid for is logged in `response` for
    // observability — see the warn below.
    const writeResult = await prisma.recommendation.updateMany({
      where: { id: recommendationId, pushbackVersion: prevVersion },
      data:  {
        pushbackHistory: toJsonValue(newHistory),
        pushbackVersion: { increment: 1 },
        ...(updatedRec ? {
          recommendationType:     updatedRec.recommendationType,
          summary:                updatedRec.summary,
          path:                   updatedRec.path,
          reasoning:              updatedRec.reasoning,
          firstThreeSteps:        toJsonValue(updatedRec.firstThreeSteps),
          timeToFirstResult:      updatedRec.timeToFirstResult,
          risks:                  toJsonValue(updatedRec.risks),
          assumptions:            toJsonValue(updatedRec.assumptions),
          whatWouldMakeThisWrong: updatedRec.whatWouldMakeThisWrong,
          alternativeRejected:    toJsonValue(updatedRec.alternativeRejected),
          versions:               toJsonValue(newVersions),
        } : {}),
        // Pushing back auto-un-accepts
        ...(rec.acceptedAt ? {
          acceptedAt:      null,
          acceptedAtRound: null,
          unacceptCount:   { increment: 1 },
        } : {}),
      },
    });

    if (writeResult.count === 0) {
      log.warn('[Pushback] Turn write lost optimistic-concurrency race', {
        prevVersion,
        round:    currentRound,
        action:   response.action,
      });
      throw new HttpError(409, 'Another request modified this recommendation. Please refresh and try again.');
    }

    // Mark any existing roadmap as STALE when the recommendation was
    // structurally updated. The roadmap content was generated against
    // the old recommendation; the founder needs to know. We do this
    // AFTER the optimistic write succeeds so a stale flag never lands
    // on a recommendation whose update we lost.
    if (updatedRec && rec.roadmap && rec.roadmap.status === 'READY') {
      try {
        await prisma.roadmap.update({
          where: { id: rec.roadmap.id },
          data:  { status: 'STALE' },
        });
        log.info('[Pushback] Roadmap marked stale due to recommendation update', {
          roadmapId: rec.roadmap.id,
        });
      } catch (err) {
        log.error(
          '[Pushback] Failed to mark roadmap stale — recommendation update still committed',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }

    log.info('[Pushback] Turn persisted', {
      round:        currentRound,
      action:       response.action,
      mode:         response.mode,
      converging:   response.converging,
      committed:    !!updatedRec,
    });

    return NextResponse.json({
      agent:           agentTurn,
      round:           currentRound,
      committed:       !!updatedRec,
      updatedRecommendation: updatedRec,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
