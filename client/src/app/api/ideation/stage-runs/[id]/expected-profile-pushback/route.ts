// src/app/api/ideation/stage-runs/[id]/expected-profile-pushback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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
  safeParseStage2AuthoringState,
  writeExpectedProfileEntry,
  runExpectedProfilePushbackRound,
  EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND,
} from '@/lib/ideation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Two-phase pushback (Opus reasoning → Sonnet emit). Wall-clock
// p99 is comparable to derivation. 90s margin for the same reason.
export const maxDuration = 90;

const RequestSchema = z.object({
  entryIndex: z.number().int().nonnegative(),
  message:    z.string().min(1).max(2000),
  /** Optimistic lock — the founder's last-seen version. */
  priorVersion: z.number().int().nonnegative(),
});

/**
 * POST /api/ideation/stage-runs/[id]/expected-profile-pushback
 *
 * Run one round of the per-entry Expected Profile pushback engine.
 * Validates ownership + status + version, runs the engine, persists
 * the updated entry + state under the optimistic lock.
 *
 * Capped at EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND rounds — the
 * engine itself coerces the action to 'closing' on the cap turn.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-pushback', RATE_LIMITS.AI_GENERATION);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 2) throw new HttpError(409, 'Not a Stage 2 run');
    if (run.status !== 'authoring') {
      throw new HttpError(409, 'Stage 2 row is not in authoring state');
    }

    const state = safeParseStage2AuthoringState(run.output);
    const entries = state.workingExpectedProfile;
    if (!entries) {
      throw new HttpError(409, 'Expected Profile has not been derived yet');
    }
    if (parsed.data.entryIndex >= entries.length) {
      throw new HttpError(404, 'Entry not found');
    }
    const entry = entries[parsed.data.entryIndex];

    // Reject pushback on a closed entry — founder must use the UI's
    // override / remove / accept affordances instead.
    if (entry.pushback?.status === 'closed') {
      throw new HttpError(409, 'Pushback on this entry is closed');
    }

    // Cap check (defensive — the engine also coerces to 'closing').
    const currentRounds = entry.pushback?.history.length ?? 0;
    if (currentRounds >= EXPECTED_PROFILE_PUSHBACK_HARD_CAP_ROUND) {
      throw new HttpError(409, 'Pushback cap reached for this entry');
    }

    // Load the committed Stage 1 outcome for the engine's context.
    const stage1 = await prisma.ideationStageRun.findFirst({
      where:  { sessionId: run.sessionId, stageNumber: 1, status: 'committed' },
      select: { output: true },
    });
    if (!stage1) throw new HttpError(409, 'Stage 1 outcome is not committed');
    const outcomeDocument = safeParseOutcomeDocument(stage1.output);
    if (!outcomeDocument) throw new HttpError(500, 'Stage 1 outcome failed to parse');

    const result = await runExpectedProfilePushbackRound({
      outcomeDocument,
      entry,
      state:          entry.pushback,
      founderMessage: parsed.data.message,
      contextId:      run.sessionId,
    });

    // Write through with optimistic lock.
    const newEntry = { ...result.updatedEntry, pushback: result.updatedState };
    await writeExpectedProfileEntry(id, userId, parsed.data.entryIndex, newEntry, parsed.data.priorVersion);

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/expected-profile-pushback', userId, stageRunId: id })
          .debug('Expected Profile pushback round applied', {
            entryIndex: parsed.data.entryIndex,
            action:     result.action,
            mode:       result.mode,
            round:      result.updatedState.history.length,
            status:     result.updatedState.status,
          });

    return NextResponse.json({
      ok:       true,
      action:   result.action,
      mode:     result.mode,
      message:  result.message,
      entry:    newEntry,
      // New version is what the client uses for the next round's
      // optimistic-lock check.
      version:  result.updatedState.version,
      status:   result.updatedState.status,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
