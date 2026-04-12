// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/coach/setup/route.ts
//
// Stage 1 route: Conversation Coach setup. One exchange per POST.
// The client sends the founder's message, the route calls the setup
// engine, and returns the agent's response. When the agent returns
// status: 'ready', the setup is complete and the client can proceed
// to the preparation stage.

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
import { COACH_TOOL_ID, SETUP_MAX_EXCHANGES } from '@/lib/roadmap/coach';
import { CoachSessionSchema } from '@/lib/roadmap/coach/schemas';
import { runCoachSetup } from '@/lib/roadmap/coach/setup-engine';

export const maxDuration = 30;

const BodySchema = z.object({
  message: z.string().min(1).max(3000),
});

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/coach/setup
 *
 * One setup exchange per call. Returns the agent's response and,
 * when status='ready', the completed ConversationSetup. The client
 * decides when to advance to the preparation stage.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'coach-setup', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId, taskId } = await params;
    const log = logger.child({ route: 'POST coach-setup', roadmapId, taskId, userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: {
        id:     true,
        phases: true,
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

    const context = roadmap.recommendation?.session?.beliefState
      ? safeParseDiscoveryContext(roadmap.recommendation.session.beliefState)
      : null;

    // Read existing coach session setup history if any
    const existingSession = found.task.coachSession as Record<string, unknown> | undefined;
    const setupHistory: Array<{ role: 'founder' | 'agent'; message: string }> =
      (existingSession?.setupHistory as Array<{ role: string; message: string }> ?? [])
        .filter(e => e.role === 'founder' || e.role === 'agent')
        .map(e => ({ role: e.role as 'founder' | 'agent', message: String(e.message) }));

    const exchangeNumber = Math.floor(setupHistory.length / 2) + 1;
    if (exchangeNumber > SETUP_MAX_EXCHANGES) {
      throw new HttpError(409, 'Setup exchange limit reached.');
    }

    const response = await runCoachSetup({
      founderMessage:  parsed.data.message,
      history:         setupHistory,
      taskContext:     found.task.description,
      taskTitle:       found.task.title,
      beliefState: {
        primaryGoal:      context?.primaryGoal?.value ?? null,
        geographicMarket: context?.geographicMarket?.value ?? null,
        situation:        context?.situation?.value ?? null,
      },
      exchangeNumber,
    });

    // Persist the exchange history + completed setup if ready
    const newHistory = [
      ...setupHistory,
      { role: 'founder' as const, message: parsed.data.message },
      { role: 'agent' as const,   message: response.message },
    ];

    const sessionData: Record<string, unknown> = {
      ...(existingSession ?? {}),
      id:           existingSession?.id ?? `cs_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      tool:         COACH_TOOL_ID,
      setupHistory: newHistory,
      channel:      response.setup?.channel ?? existingSession?.channel ?? null,
      createdAt:    existingSession?.createdAt ?? new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    };

    if (response.status === 'ready' && response.setup) {
      sessionData.setup = response.setup;
    }

    const next = patchTask(phases, taskId, t => ({
      ...t,
      coachSession: sessionData,
    }));
    if (!next) throw new HttpError(404, 'Task not found post-merge');

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { phases: toJsonValue(next) },
    });

    log.info('[CoachSetup] Exchange persisted', {
      taskId,
      status: response.status,
      exchange: exchangeNumber,
    });

    return NextResponse.json({
      status:  response.status,
      message: response.message,
      setup:   response.setup ?? null,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
