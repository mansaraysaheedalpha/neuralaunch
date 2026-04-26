// src/app/api/discovery/roadmaps/[id]/coach/setup/route.ts
//
// Standalone Conversation Coach — Stage 1: Setup.
// One exchange per POST. On the first call (no sessionId in body) the
// route mints a new session ID, appends a new entry to
// roadmap.toolSessions, and returns the ID so the client can pass it
// back on subsequent calls. When status='ready' the setup is complete
// and the client can advance to the prepare stage.

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
import { COACH_TOOL_ID, SETUP_MAX_EXCHANGES } from '@/lib/roadmap/coach';
import { runCoachSetup } from '@/lib/roadmap/coach/setup-engine';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureWritable } from '@/lib/lifecycle/tier-limits';

export const maxDuration = 300;

const BodySchema = z.object({
  message:   z.string().min(1).max(3000),
  sessionId: z.string().optional(),
});

/**
 * POST /api/discovery/roadmaps/[id]/coach/setup
 *
 * Standalone coach setup — not tied to a task card. On the first call
 * omit sessionId; the route creates a new session and returns its id.
 * Pass the id on every subsequent call. Returns { status, message,
 * setup?, sessionId }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'coach-standalone-setup', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    await assertVentureWritable(userId, roadmapId);
    const log = logger.child({ route: 'POST standalone-coach-setup', roadmapId, userId });

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
        recommendation: {
          select: {
            session: { select: { beliefState: true } },
          },
        },
      },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    // Work with raw JSON — the session entry is a partial object during setup
    // (setupHistory lives here before setup is complete; CoachSessionSchema
    // only applies once setup is populated). Mirror the task-level route pattern.
    const rawSessions: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>)
      : [];

    // Resolve or create the session entry
    const sessionId = parsed.data.sessionId
      ?? `cs_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    const existing = rawSessions.find(s => s['id'] === sessionId);

    const context = roadmap.recommendation?.session?.beliefState
      ? safeParseDiscoveryContext(roadmap.recommendation.session.beliefState)
      : null;

    const setupHistory: Array<{ role: 'founder' | 'agent'; message: string }> =
      (existing?.['setupHistory'] as Array<{ role: string; message: string }> | undefined ?? [])
        .filter(e => e.role === 'founder' || e.role === 'agent')
        .map(e => ({ role: e.role as 'founder' | 'agent', message: String(e.message) }));

    const exchangeNumber = Math.floor(setupHistory.length / 2) + 1;
    if (exchangeNumber > SETUP_MAX_EXCHANGES) {
      throw new HttpError(409, 'Setup exchange limit reached.');
    }

    const response = await runCoachSetup({
      founderMessage: parsed.data.message,
      history:        setupHistory,
      taskContext:    null,
      taskTitle:      null,
      beliefState: {
        primaryGoal:      context?.primaryGoal?.value ?? null,
        geographicMarket: context?.geographicMarket?.value ?? null,
        situation:        context?.situation?.value ?? null,
      },
      exchangeNumber,
    });

    const newHistory = [
      ...setupHistory,
      { role: 'founder' as const, message: parsed.data.message },
      { role: 'agent'   as const, message: response.message },
    ];

    const now = new Date().toISOString();
    const sessionData = {
      ...(existing ?? {}),
      id:           sessionId,
      tool:         COACH_TOOL_ID,
      setupHistory: newHistory,
      channel:      response.setup?.channel ?? existing?.channel ?? null,
      createdAt:    existing?.createdAt ?? now,
      updatedAt:    now,
      ...(response.status === 'ready' && response.setup ? { setup: response.setup } : {}),
    };

    const otherSessions = rawSessions.filter((s: Record<string, unknown>) => s['id'] !== sessionId);
    const nextToolSessions = [...otherSessions, sessionData];

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { toolSessions: toJsonValue(nextToolSessions) },
    });

    log.info('[StandaloneCoachSetup] Exchange persisted', {
      sessionId,
      status:   response.status,
      exchange: exchangeNumber,
    });

    return NextResponse.json({
      status:    response.status,
      message:   response.message,
      setup:     response.setup ?? null,
      sessionId,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
