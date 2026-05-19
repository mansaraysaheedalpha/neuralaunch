// src/app/api/ideation/stage-runs/[id]/opportunity-pushback/route.ts
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
  safeParseStage4AuthoringState,
  runVerdictPushbackRound,
  persistOpportunityPushbackRound,
  MAX_OPPORTUNITY_PUSHBACK_ROUNDS,
} from '@/lib/ideation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Two-phase pushback (Opus reasoning → Sonnet emit). p99 ~20-30s.
export const maxDuration = 90;

const RequestSchema = z.object({
  opportunityId: z.string().min(1),
  message:       z.string().min(1).max(2000),
  /** Optimistic lock — founder's last-seen opportunity.pushbackVersion. */
  priorVersion:  z.number().int().nonnegative(),
});

/**
 * POST /api/ideation/stage-runs/[id]/opportunity-pushback
 *
 * One round of multi-round pushback against the agent's verdict on
 * one opportunity. Validates ownership + status + version, runs the
 * two-phase engine (Opus → Sonnet), writes the updated opportunity
 * under the optimistic lock.
 *
 * Capped at MAX_OPPORTUNITY_PUSHBACK_ROUNDS — the engine coerces
 * action='closing' on the cap round (defence-in-depth: route refuses
 * a request that would exceed the cap, AND the engine self-coerces
 * the action).
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-opportunity-pushback', RATE_LIMITS.AI_GENERATION);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 4) throw new HttpError(409, 'Not a Stage 4 run');
    if (run.status !== 'authoring') throw new HttpError(409, 'Stage 4 row is not in authoring state');

    const state  = safeParseStage4AuthoringState(run.output);
    const target = state.opportunities.find(o => o.id === parsed.data.opportunityId);
    if (!target) throw new HttpError(404, 'Opportunity not found on this stage run');

    if (target.pushbackVersion !== parsed.data.priorVersion) {
      throw new HttpError(409, 'Opportunity pushback version mismatch');
    }

    // Defensive cap check (the engine itself coerces to 'closing').
    if (target.pushbackHistory.length >= MAX_OPPORTUNITY_PUSHBACK_ROUNDS) {
      throw new HttpError(409, 'Pushback cap reached for this opportunity');
    }

    if (target.agentVerdict === 'pending') {
      // No verdict to push back on yet. Founder must wait for at
      // least one community response to land + verdict synthesis to
      // fire before pushing back.
      throw new HttpError(409, 'No agent verdict yet on this opportunity. Add a community response or wait for verdict synthesis.');
    }

    const result = await runVerdictPushbackRound({
      opportunity:    target,
      founderMessage: parsed.data.message,
      contextId:      run.sessionId,
    });

    await persistOpportunityPushbackRound(id, userId, result.updated, parsed.data.priorVersion);

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/opportunity-pushback', userId, stageRunId: id })
          .debug('Opportunity pushback round applied', {
            opportunityId: target.id,
            action:        result.action,
            mode:          result.mode,
            round:         result.updated.pushbackHistory.length,
          });

    return NextResponse.json({
      ok:           true,
      action:       result.action,
      mode:         result.mode,
      message:      result.message,
      opportunity:  result.updated,
      version:      result.updated.pushbackVersion,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
