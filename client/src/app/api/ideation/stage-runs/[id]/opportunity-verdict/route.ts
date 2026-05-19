// src/app/api/ideation/stage-runs/[id]/opportunity-verdict/route.ts
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
  persistFounderVerdict,
} from '@/lib/ideation';
import { OPPORTUNITY_VERDICTS } from '@neuralaunch/constants';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const RequestSchema = z.object({
  opportunityId: z.string().min(1),
  verdict:       z.enum(OPPORTUNITY_VERDICTS),
});

/**
 * POST /api/ideation/stage-runs/[id]/opportunity-verdict
 *
 * Founder commits their final verdict for one opportunity. Mutates
 * `founderVerdict` (NOT `agentVerdict`); a `drop` flips status to
 * 'rejected_by_founder', anything else stays 'evaluated'. Founder
 * can change their verdict freely (re-submitting overwrites) until
 * the stage commits.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-opportunity-verdict', RATE_LIMITS.API_AUTHENTICATED);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 4) throw new HttpError(409, 'Not a Stage 4 run');
    if (run.status !== 'authoring') throw new HttpError(409, 'Stage 4 row is not in authoring state');

    const state = safeParseStage4AuthoringState(run.output);
    if (!state.opportunities.some(o => o.id === parsed.data.opportunityId)) {
      throw new HttpError(404, 'Opportunity not found on this stage run');
    }

    await persistFounderVerdict(id, userId, parsed.data.opportunityId, parsed.data.verdict);

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/opportunity-verdict', userId, stageRunId: id })
          .debug('Founder verdict applied', { opportunityId: parsed.data.opportunityId, verdict: parsed.data.verdict });

    return NextResponse.json({
      ok:             true,
      opportunityId:  parsed.data.opportunityId,
      verdict:        parsed.data.verdict,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
