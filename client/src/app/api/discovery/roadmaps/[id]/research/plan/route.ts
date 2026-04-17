// src/app/api/discovery/roadmaps/[id]/research/plan/route.ts
//
// Step 1 of the standalone Research Tool: generate an editable research plan.
// Creates a new session entry in roadmap.toolSessions and returns its id so
// the client can reference it on the execute and followup calls.

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
import { RESEARCH_TOOL_ID, runResearchPlan } from '@/lib/roadmap/research-tool';
import { requireTierOrThrow } from '@/lib/auth/require-tier';

export const maxDuration = 30;

const BodySchema = z.object({
  query: z.string().min(1).max(3000),
});

/**
 * POST /api/discovery/roadmaps/[id]/research/plan
 *
 * Standalone research plan generation (no task context). Creates a new
 * session in roadmap.toolSessions. Returns { plan, estimatedTime, sessionId }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'research-standalone-plan', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    const log = logger.child({ route: 'POST research-standalone-plan', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: {
        id:           true,
        toolSessions: true,
        recommendation: {
          select: {
            path:    true,
            session: { select: { beliefState: true } },
          },
        },
      },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const bsRaw = roadmap.recommendation?.session?.beliefState;
    const bs    = bsRaw ? safeParseDiscoveryContext(bsRaw) : null;

    const result = await runResearchPlan({
      query: parsed.data.query,
      beliefState: {
        geographicMarket: bs?.geographicMarket?.value ?? null,
        primaryGoal:      bs?.primaryGoal?.value ?? null,
        situation:        bs?.situation?.value ?? null,
      },
      recommendationPath: roadmap.recommendation?.path ?? null,
    });

    const now       = new Date().toISOString();
    const sessionId = `rs_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const sessionData = {
      id:        sessionId,
      tool:      RESEARCH_TOOL_ID,
      query:     parsed.data.query,
      plan:      result.plan,
      createdAt: now,
      updatedAt: now,
    };

    const rawSessions: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>)
      : [];

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { toolSessions: toJsonValue([...rawSessions, sessionData]) },
    });

    log.info('[ResearchStandalonePlan] Plan persisted', { sessionId });

    return NextResponse.json({ plan: result.plan, estimatedTime: result.estimatedTime, sessionId });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
