// src/app/api/discovery/roadmaps/[id]/coach/prepare/route.ts
//
// Standalone Conversation Coach — Stage 2: Preparation.
// Single Opus call with research tools. Reads the completed setup from
// roadmap.toolSessions[sessionId], generates the PreparationPackage,
// and persists the result back to the same session entry.

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
import { ConversationSetupSchema, safeParseToolSessions } from '@/lib/roadmap/coach/schemas';
import { runCoachPreparation } from '@/lib/roadmap/coach/preparation-engine';
import { safeParseResearchLog, appendResearchLog, type ResearchLogEntry } from '@/lib/research';
import { loadPerTaskAgentContext } from '@/lib/lifecycle';
import { renderFounderProfileBlock } from '@/lib/lifecycle/prompt-renderers';

// Opus + research tools can take 30-60 s
export const maxDuration = 90;

const BodySchema = z.object({
  sessionId: z.string().min(1),
});

/**
 * POST /api/discovery/roadmaps/[id]/coach/prepare
 *
 * Generates the preparation package from the completed standalone setup.
 * Body: { sessionId }. No other fields required — reads setup from
 * roadmap.toolSessions. Returns { preparation }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'coach-standalone-prepare', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    const log = logger.child({ route: 'POST standalone-coach-prepare', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
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

    const toolSessions = safeParseToolSessions(roadmap.toolSessions);
    const session = toolSessions.find(s => s.id === parsed.data.sessionId);
    if (!session) throw new HttpError(404, 'Session not found');

    if (!session.setup) {
      throw new HttpError(409, 'Coach setup has not been completed. Run the setup stage first.');
    }
    const setupParsed = ConversationSetupSchema.safeParse(session.setup);
    if (!setupParsed.success) throw new HttpError(409, 'Coach setup data is malformed.');

    const context = roadmap.recommendation?.session?.beliefState
      ? safeParseDiscoveryContext(roadmap.recommendation.session.beliefState)
      : null;

    const { profile } = await loadPerTaskAgentContext(userId);
    const founderProfileBlock = renderFounderProfileBlock(profile);

    const accumulator: ResearchLogEntry[] = [];

    const preparation = await runCoachPreparation({
      founderProfileBlock: founderProfileBlock || undefined,
      setup:                setupParsed.data,
      beliefState: {
        primaryGoal:          context?.primaryGoal?.value ?? null,
        geographicMarket:     context?.geographicMarket?.value ?? null,
        situation:            context?.situation?.value ?? null,
        availableBudget:      context?.availableBudget?.value ?? null,
        technicalAbility:     context?.technicalAbility?.value ?? null,
        availableTimePerWeek: context?.availableTimePerWeek?.value ?? null,
      },
      recommendationPath:    roadmap.recommendation?.path ?? null,
      recommendationSummary: roadmap.recommendation?.summary ?? null,
      roadmapId,
      researchAccumulator:   accumulator,
    });

    const updatedSession = {
      ...session,
      preparation,
      updatedAt: new Date().toISOString(),
    };

    const nextToolSessions = toolSessions.map(s =>
      s.id === parsed.data.sessionId ? updatedSession : s,
    );

    const nextResearchLog = accumulator.length > 0
      ? appendResearchLog(safeParseResearchLog(roadmap.researchLog), accumulator)
      : null;

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data: {
        toolSessions: toJsonValue(nextToolSessions),
        ...(nextResearchLog ? { researchLog: toJsonValue(nextResearchLog) } : {}),
      },
    });

    log.info('[StandaloneCoachPrepare] Package persisted', {
      sessionId:     parsed.data.sessionId,
      objections:    preparation.objections.length,
      researchCalls: accumulator.length,
    });

    return NextResponse.json({ preparation });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
