// src/app/api/ideation/stage-runs/[id]/pain-point-pushback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';
import {
  requireOwnedStageRun,
  safeParseStage3AuthoringState,
  allPainPoints,
  persistPainPointPushbackRound,
  runPainScorePushbackRound,
  MAX_PAIN_SCORE_PUSHBACK_ROUNDS,
} from '@/lib/ideation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Two-phase pushback (Opus reasoning → Sonnet emit). Same wall-clock
// shape as Stage 2's expected-profile-pushback. 90s headroom.
export const maxDuration = 90;

const RequestSchema = z.object({
  painPointId:  z.string().min(1),
  message:      z.string().min(1).max(2000),
  /** Optimistic lock — the founder's last-seen pain point version. */
  priorVersion: z.number().int().nonnegative(),
});

/**
 * POST /api/ideation/stage-runs/[id]/pain-point-pushback
 *
 * One round of per-pain-point score pushback against an agent-
 * suggested score. Validates ownership + status + version, runs the
 * two-phase engine, writes through the updated PainPoint under the
 * optimistic lock.
 *
 * Capped at MAX_PAIN_SCORE_PUSHBACK_ROUNDS — the engine coerces the
 * action to 'closing' on the cap round.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-pain-pushback', RATE_LIMITS.AI_GENERATION);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 3) throw new HttpError(409, 'Not a Stage 3 run');
    if (run.status !== 'authoring') {
      throw new HttpError(409, 'Stage 3 row is not in authoring state');
    }

    const state  = safeParseStage3AuthoringState(run.output);
    const target = allPainPoints(state).find(p => p.id === parsed.data.painPointId);
    if (!target) throw new HttpError(404, 'Pain point not found');

    if (target.scorePushbackVersion !== parsed.data.priorVersion) {
      throw new HttpError(409, 'Pain point pushback version mismatch');
    }

    if (target.agentSuggestedScores === null) {
      // Pushback presumes the agent has scored. Founder-sourced pain
      // points without an agent-suggested score have nothing to argue
      // with — the founder should either rate or remove instead.
      throw new HttpError(409, 'Pain point has no agent-suggested scores to push back on');
    }

    // Defensive cap check (the engine itself coerces to 'closing').
    if (target.scorePushbackHistory.length >= MAX_PAIN_SCORE_PUSHBACK_ROUNDS) {
      throw new HttpError(409, 'Pushback cap reached for this pain point');
    }

    const result = await runPainScorePushbackRound({
      pp:             target,
      founderMessage: parsed.data.message,
      contextId:      run.sessionId,
    });

    await persistPainPointPushbackRound(id, userId, result.updated, parsed.data.priorVersion);

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/pain-point-pushback', userId, stageRunId: id })
          .debug('Pain-point pushback round applied', {
            painPointId: target.id,
            action:      result.action,
            mode:        result.mode,
            round:       result.updated.scorePushbackHistory.length,
          });

    return NextResponse.json({
      ok:        true,
      action:    result.action,
      mode:      result.mode,
      message:   result.message,
      painPoint: result.updated,
      // The new version the client must send on the next round.
      version:   result.updated.scorePushbackVersion,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
