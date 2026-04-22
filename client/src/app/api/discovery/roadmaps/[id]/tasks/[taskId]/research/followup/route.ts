// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/research/followup/route.ts
//
// Step 3+ of the task-level Research Tool: follow-up research round.
// Reads the existing session and report, enforces the FOLLOWUP_MAX_ROUNDS
// cap, runs a targeted Sonnet search, and appends the new findings to
// the session's followUps array.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  StoredPhasesArraySchema,
  readTask,
  patchTask,
  type StoredRoadmapPhase,
} from '@/lib/roadmap/checkin-types';
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import { safeParseResearchLog, appendResearchLog, type ResearchLogEntry } from '@/lib/research';
import {
  FOLLOWUP_MAX_ROUNDS,
  safeParseResearchSession,
  runResearchFollowUp,
} from '@/lib/roadmap/research-tool';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';

// Sonnet + 10 research steps
export const maxDuration = 300;

const BodySchema = z.object({
  query: z.string().min(1).max(3000),
});

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/research/followup
 *
 * Appends a targeted follow-up research round to an existing session.
 * Enforces FOLLOWUP_MAX_ROUNDS (5). Returns { findings, round }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await enforceCycleQuota(userId, 'research');
    await rateLimitByUser(userId, 'research-task-followup', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId, taskId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST research-task-followup', roadmapId, taskId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: {
        id:          true,
        phases:      true,
        researchLog: true,
        recommendation: {
          select: {
            session: { select: { beliefState: true } },
          },
        },
      },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (!phasesParsed.success) throw new HttpError(409, 'Roadmap content is malformed');
    const phases: StoredRoadmapPhase[] = phasesParsed.data;

    const found = readTask(phases, taskId);
    if (!found) throw new HttpError(404, 'Task not found');

    const existingSession = safeParseResearchSession(found.task.researchSession);
    if (!existingSession?.report) {
      throw new HttpError(409, 'Research has not been executed. Run the execute stage first.');
    }

    const currentRounds = existingSession.followUps?.length ?? 0;
    if (currentRounds >= FOLLOWUP_MAX_ROUNDS) {
      throw new HttpError(409, `Follow-up round limit of ${FOLLOWUP_MAX_ROUNDS} reached. Start a new research session.`);
    }

    const bsRaw = roadmap.recommendation?.session?.beliefState;
    const bs    = bsRaw ? safeParseDiscoveryContext(bsRaw) : null;
    const round = currentRounds + 1;
    const accumulator: ResearchLogEntry[] = [];

    const result = await runResearchFollowUp({
      followUpQuery:    parsed.data.query,
      originalQuery:    existingSession.query,
      existingFindings: existingSession.report.findings,
      existingReport:   existingSession.report,
      beliefState: {
        geographicMarket: bs?.geographicMarket?.value ?? null,
        primaryGoal:      bs?.primaryGoal?.value ?? null,
        situation:        bs?.situation?.value ?? null,
      },
      roadmapId,
      researchAccumulator: accumulator,
      followUpRound:    round,
    });

    const newFollowUp = { query: parsed.data.query, findings: result.findings, round };
    const updatedSession = {
      ...existingSession,
      followUps: [...(existingSession.followUps ?? []), newFollowUp],
      updatedAt: new Date().toISOString(),
    };

    const next = patchTask(phases, taskId, t => ({ ...t, researchSession: updatedSession }));
    if (!next) throw new HttpError(404, 'Task not found post-merge');

    const nextLog = accumulator.length > 0
      ? appendResearchLog(safeParseResearchLog(roadmap.researchLog), accumulator)
      : null;

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  {
        phases: toJsonValue(next),
        ...(nextLog ? { researchLog: toJsonValue(nextLog) } : {}),
      },
    });

    log.info('[ResearchTaskFollowUp] Follow-up persisted', {
      taskId,
      round,
      findings: result.findings.length,
    });

    return NextResponse.json({ findings: result.findings, round });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
