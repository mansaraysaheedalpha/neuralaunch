// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/composer/mark-sent/route.ts
//
// Task-level Outreach Composer — mark a message as sent.
// Pure data write. No LLM call. Appends to composerSession.sentMessages
// with an ISO timestamp so the check-in agent knows which messages
// were actually used.

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
import { safeParseComposerSession } from '@/lib/roadmap/composer';

export const maxDuration = 10;

const BodySchema = z.object({
  messageId: z.string().min(1),
});

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/composer/mark-sent
 *
 * Marks a generated message as sent by appending an entry to
 * composerSession.sentMessages. Idempotent on duplicate messageId —
 * a second call for the same ID updates the sentAt timestamp.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'composer-task-mark-sent', RATE_LIMITS.API_AUTHENTICATED);

    const { id: roadmapId, taskId } = await params;
    const log = logger.child({ route: 'POST composer-task-mark-sent', roadmapId, taskId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, phases: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (!phasesParsed.success) throw new HttpError(409, 'Roadmap content is malformed');
    const phases: StoredRoadmapPhase[] = phasesParsed.data;

    const found = readTask(phases, taskId);
    if (!found) throw new HttpError(404, 'Task not found');

    const session = safeParseComposerSession(found.task.composerSession);
    if (!session?.output) throw new HttpError(409, 'No generated output found. Run generate first.');

    const messageExists = session.output.messages.some(m => m.id === parsed.data.messageId);
    if (!messageExists) throw new HttpError(404, 'Message not found');

    const sentAt = new Date().toISOString();
    const existingSent = session.sentMessages ?? [];
    const filtered = existingSent.filter(s => s.messageId !== parsed.data.messageId);
    const updatedSent = [...filtered, { messageId: parsed.data.messageId, sentAt }];

    const updatedSession = { ...session, sentMessages: updatedSent, updatedAt: sentAt };

    const next = patchTask(phases, taskId, t => ({ ...t, composerSession: updatedSession }));
    if (!next) throw new HttpError(404, 'Task not found post-merge');

    await prisma.roadmap.update({ where: { id: roadmapId }, data: { phases: toJsonValue(next) } });

    log.info('[ComposerTask] Message marked sent', { taskId, messageId: parsed.data.messageId });
    return NextResponse.json({ ok: true, sentAt });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
