// src/app/api/ideation/stage-runs/[id]/derive-expected-profile/route.ts
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
import {
  requireOwnedStageRun,
  safeParseOutcomeDocument,
  writeWorkingExpectedProfile,
  deriveExpectedProfile,
} from '@/lib/ideation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Derivation calls one Sonnet (Haiku fallback) call with up to 3
// research steps. Worst-case latency is well under Vercel's 300s
// ceiling but exceeds the 10s default. 90s gives Gemini's first
// chunk a comfortable margin even when both Anthropic providers
// overload simultaneously.
export const maxDuration = 90;

/**
 * POST /api/ideation/stage-runs/[id]/derive-expected-profile
 *
 * Run (or re-run) Expected Profile derivation against the session's
 * committed Stage 1 OutcomeDocument. Used by:
 *   1. The "derive" button on the Stage 2 chat surface (first run)
 *   2. The "re-derive" CTA the UI surfaces when requiresRederivation
 *      is true (after a Stage 1 cascade)
 *
 * Writes the entries + research log onto the working authoring state
 * and clears requiresRederivation.
 *
 * Synchronous — returns when derivation completes. The client UI
 * shows a progress card during the wait (~15s p99).
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-derive-expected-profile', RATE_LIMITS.AI_GENERATION);

    const { id } = await params;

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 2) throw new HttpError(409, 'Not a Stage 2 run');
    if (run.status !== 'authoring') {
      throw new HttpError(409, 'Stage 2 row is not in authoring state');
    }

    // Load the committed Stage 1 outcome.
    const stage1 = await prisma.ideationStageRun.findFirst({
      where:  { sessionId: run.sessionId, stageNumber: 1, status: 'committed' },
      select: { output: true },
    });
    if (!stage1) throw new HttpError(409, 'Stage 1 outcome is not committed');
    const outcomeDocument = safeParseOutcomeDocument(stage1.output);
    if (!outcomeDocument) throw new HttpError(500, 'Stage 1 outcome failed to parse');

    const derived = await deriveExpectedProfile({
      outcomeDocument,
      contextId: run.sessionId,
    });

    await writeWorkingExpectedProfile(id, userId, derived.entries, derived.researchLog);

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/derive-expected-profile', userId, stageRunId: id })
          .debug('Expected Profile derived', {
            entries:       derived.entries.length,
            researchSteps: derived.researchLog.length,
          });

    return NextResponse.json({
      ok:            true,
      entries:       derived.entries,
      researchSteps: derived.researchLog.length,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
