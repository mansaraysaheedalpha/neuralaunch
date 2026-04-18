// src/app/api/discovery/roadmaps/[id]/research/execute/route.ts
//
// Step 2 of the standalone Research Tool: deep research execution.
// Reads the session from roadmap.toolSessions via sessionId, runs the
// full Opus research execution, and persists the report back.

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
import { safeParseResearchSession, runResearchExecution } from '@/lib/roadmap/research-tool';
import { loadPerTaskAgentContext } from '@/lib/lifecycle';
import { renderFounderProfileBlock } from '@/lib/lifecycle/prompt-renderers';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';

// Opus + 25 research steps — can take 3-6 minutes
export const maxDuration = 300;

const BodySchema = z.object({
  sessionId: z.string().min(1),
  plan:      z.string().min(1).max(5000),
});

/**
 * POST /api/discovery/roadmaps/[id]/research/execute
 *
 * Reads the session from roadmap.toolSessions, runs the full research
 * execution with the approved plan, and persists the ResearchReport.
 * Returns { report }.
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
    await rateLimitByUser(userId, 'research-standalone-execute', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    const log = logger.child({ route: 'POST research-standalone-execute', roadmapId, userId });

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
            path:    true,
            summary: true,
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
    if (!existingSession) throw new HttpError(409, 'Session data is malformed. Re-run the plan stage.');

    const bsRaw = roadmap.recommendation?.session?.beliefState;
    const bs    = bsRaw ? safeParseDiscoveryContext(bsRaw) : null;

    const { profile } = await loadPerTaskAgentContext(userId);
    const founderProfileBlock = renderFounderProfileBlock(profile);

    const accumulator: ResearchLogEntry[] = [];

    const report = await runResearchExecution({
      founderProfileBlock: founderProfileBlock || undefined,
      query:                 existingSession.query,
      plan:                  parsed.data.plan,
      beliefState: {
        geographicMarket:    bs?.geographicMarket?.value ?? null,
        primaryGoal:         bs?.primaryGoal?.value ?? null,
        situation:           bs?.situation?.value ?? null,
      },
      recommendationPath:    roadmap.recommendation?.path ?? null,
      recommendationSummary: roadmap.recommendation?.summary ?? null,
      roadmapId,
      researchAccumulator:   accumulator,
    });

    const updatedSession = { ...rawSession, plan: parsed.data.plan, report, updatedAt: new Date().toISOString() };
    const otherSessions  = rawSessions.filter(s => s['id'] !== parsed.data.sessionId);
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

    log.info('[ResearchStandaloneExecute] Report persisted', {
      sessionId:     parsed.data.sessionId,
      findings:      report.findings.length,
      researchCalls: accumulator.length,
    });

    return NextResponse.json({ report });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
