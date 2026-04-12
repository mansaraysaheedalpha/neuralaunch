// src/app/api/discovery/roadmaps/[id]/coach/debrief/route.ts
//
// Standalone Conversation Coach — Stage 4: Debrief.
// Lightweight Haiku synthesis. Reads rolePlayHistory, preparation, and
// setup from roadmap.toolSessions[sessionId]. Requires at least 2
// role-play turns. Persists the debrief back to the session entry.

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
import { runDebrief } from '@/lib/roadmap/coach/debrief-engine';

// Haiku is fast but allow headroom for a longer transcript
export const maxDuration = 30;

const BodySchema = z.object({
  sessionId: z.string().min(1),
});

/**
 * POST /api/discovery/roadmaps/[id]/coach/debrief
 *
 * Generates and persists the debrief for a completed standalone
 * role-play session. Body: { sessionId }. Requires at least 2
 * role-play turns. Returns { debrief }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'coach-standalone-debrief', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    const log = logger.child({ route: 'POST standalone-coach-debrief', roadmapId, userId });

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

    const rolePlayHistory: RolePlayTurn[] = z.array(RolePlayTurnSchema)
      .catch([])
      .parse(session.rolePlayHistory ?? []);

    if (rolePlayHistory.length < 2) {
      throw new HttpError(409, 'Role-play must have at least 2 turns before a debrief can be generated.');
    }

    const debrief = await runDebrief({
      rolePlayHistory,
      preparation: preparationParsed.data,
      setup:       setupParsed.data,
    });

    const updatedSession = {
      ...session,
      debrief,
      updatedAt: new Date().toISOString(),
    };

    const nextToolSessions = toolSessions.map(s =>
      s.id === parsed.data.sessionId ? updatedSession : s,
    );

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { toolSessions: toJsonValue(nextToolSessions) },
    });

    log.info('[StandaloneCoachDebrief] Debrief persisted', {
      sessionId:  parsed.data.sessionId,
      wellCount:  debrief.whatWentWell.length,
      watchCount: debrief.whatToWatchFor.length,
    });

    return NextResponse.json({ debrief });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
