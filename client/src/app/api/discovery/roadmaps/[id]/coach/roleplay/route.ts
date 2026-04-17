// src/app/api/discovery/roadmaps/[id]/coach/roleplay/route.ts
//
// Standalone Conversation Coach — Stage 3: Role-play.
// One turn per POST. Appends both the founder turn and the other
// party's response to toolSessions[sessionId].rolePlayHistory.
// Returns { capped: true } at the hard cap without calling the engine.

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
  ConversationSetupSchema,
  PreparationPackageSchema,
  RolePlayTurnSchema,
  safeParseToolSessions,
  type RolePlayTurn,
} from '@/lib/roadmap/coach/schemas';
import { ROLEPLAY_HARD_CAP_TURNS } from '@/lib/roadmap/coach';
import { runRolePlayTurn } from '@/lib/roadmap/coach/roleplay-engine';
import { requireTierOrThrow } from '@/lib/auth/require-tier';

export const maxDuration = 30;

const BodySchema = z.object({
  message:   z.string().min(1).max(3000),
  sessionId: z.string().min(1),
});

/**
 * POST /api/discovery/roadmaps/[id]/coach/roleplay
 *
 * One role-play turn per call for a standalone coach session.
 * Body: { message, sessionId }. Returns { message, turn, capped }
 * or { capped: true } when the hard cap is reached.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'coach-standalone-roleplay', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    const log = logger.child({ route: 'POST standalone-coach-roleplay', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, toolSessions: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const toolSessions = safeParseToolSessions(roadmap.toolSessions);
    const session = toolSessions.find(s => s.id === parsed.data.sessionId);
    if (!session) throw new HttpError(404, 'Session not found');

    if (!session.setup) {
      throw new HttpError(409, 'Coach setup has not been completed. Run the setup stage first.');
    }
    if (!session.preparation) {
      throw new HttpError(409, 'Coach preparation has not been completed. Run the preparation stage first.');
    }

    const setupParsed = ConversationSetupSchema.safeParse(session.setup);
    if (!setupParsed.success) throw new HttpError(409, 'Coach setup data is malformed.');

    const preparationParsed = PreparationPackageSchema.safeParse(session.preparation);
    if (!preparationParsed.success) throw new HttpError(409, 'Coach preparation data is malformed.');

    const existingHistory: RolePlayTurn[] = z.array(RolePlayTurnSchema)
      .catch([])
      .parse(session.rolePlayHistory ?? []);

    const founderTurnsSoFar = existingHistory.filter(t => t.role === 'founder').length;
    const nextTurnNumber = founderTurnsSoFar + 1;

    if (founderTurnsSoFar >= ROLEPLAY_HARD_CAP_TURNS) {
      log.info('[StandaloneCoachRolePlay] Hard cap reached', {
        sessionId: parsed.data.sessionId,
        founderTurnsSoFar,
      });
      return NextResponse.json({ capped: true });
    }

    const { message, turn } = await runRolePlayTurn({
      founderMessage: parsed.data.message,
      history:        existingHistory,
      preparation:    preparationParsed.data,
      setup:          setupParsed.data,
      turn:           nextTurnNumber,
    });

    const founderTurn: RolePlayTurn = { role: 'founder',      message: parsed.data.message, turn: nextTurnNumber };
    const otherTurn:   RolePlayTurn = { role: 'other_party',  message,                      turn: nextTurnNumber };
    const updatedHistory: RolePlayTurn[] = [...existingHistory, founderTurn, otherTurn];

    const updatedSession = {
      ...session,
      rolePlayHistory: updatedHistory,
      updatedAt: new Date().toISOString(),
    };

    const nextToolSessions = toolSessions.map(s =>
      s.id === parsed.data.sessionId ? updatedSession : s,
    );

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { toolSessions: toJsonValue(nextToolSessions) },
    });

    log.info('[StandaloneCoachRolePlay] Turn persisted', {
      sessionId: parsed.data.sessionId,
      turn,
    });

    return NextResponse.json({ message, turn, capped: false });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
