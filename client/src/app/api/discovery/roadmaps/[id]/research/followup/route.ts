// src/app/api/discovery/roadmaps/[id]/research/followup/route.ts
//
// Step 3+ of the standalone Research Tool: follow-up research round.
// Reads the session from roadmap.toolSessions, enforces the
// FOLLOWUP_MAX_ROUNDS cap, and appends new findings to followUps.

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
export const maxDuration = 120;

const BodySchema = z.object({
  sessionId: z.string().min(1),
  query:     z.string().min(1).max(3000),
});

/**
 * POST /api/discovery/roadmaps/[id]/research/followup
 *
 * Appends a targeted follow-up research round to an existing standalone
 * session. Enforces FOLLOWUP_MAX_ROUNDS (5). Returns { findings, round }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await enforceCycleQuota(userId, 'research');
    await rateLimitByUser(userId, 'research-standalone-followup', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST research-standalone-followup', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: {
        id:           true,
        toolSessions: true,
        researchLog:  true,
        recommendation: {
          select: {
            session: { select: { beliefState: true } },
          },
        },
      },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const rawSessions: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>)
      : [];

    const rawSession = rawSessions.find(s => s['id'] === parsed.data.sessionId);
    if (!rawSession) throw new HttpError(404, 'Session not found');

    const existingSession = safeParseResearchSession(rawSession);
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

    const newFollowUp    = { query: parsed.data.query, findings: result.findings, round };
    const updatedSession = {
      ...rawSession,
      followUps: [...(existingSession.followUps ?? []), newFollowUp],
      updatedAt: new Date().toISOString(),
    };
    const otherSessions = rawSessions.filter(s => s['id'] !== parsed.data.sessionId);
    const nextLog = accumulator.length > 0
      ? appendResearchLog(safeParseResearchLog(roadmap.researchLog), accumulator)
      : null;

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  {
        toolSessions: toJsonValue([...otherSessions, updatedSession]),
        ...(nextLog ? { researchLog: toJsonValue(nextLog) } : {}),
      },
    });

    log.info('[ResearchStandaloneFollowUp] Follow-up persisted', {
      sessionId: parsed.data.sessionId,
      round,
      findings:  result.findings.length,
    });

    return NextResponse.json({ findings: result.findings, round });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
