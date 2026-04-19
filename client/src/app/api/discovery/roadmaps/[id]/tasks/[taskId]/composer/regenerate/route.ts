// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/composer/regenerate/route.ts
//
// Task-level Outreach Composer — regenerate one message variation.
// Enforces MAX_REGENERATIONS_PER_MESSAGE cap, calls runComposerRegeneration,
// and appends the new variation to the message's variations array.

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
import {
  MAX_REGENERATIONS_PER_MESSAGE,
  COMPOSER_CHANNELS,
  runComposerRegeneration,
  safeParseComposerSession,
} from '@/lib/roadmap/composer';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';

export const maxDuration = 30;

const BodySchema = z.object({
  messageId:            z.string().min(1),
  instruction:          z.string().min(1).max(1000),
});

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/composer/regenerate
 *
 * Regenerates one message with a new variation. Rejects with 409 if the
 * message has already reached MAX_REGENERATIONS_PER_MESSAGE. Appends the
 * new variation to message.variations and persists.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await enforceCycleQuota(userId, 'composer');
    await rateLimitByUser(userId, 'composer-task-regenerate', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId, taskId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST composer-task-regenerate', roadmapId, taskId, userId });

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

    const msgIndex = session.output.messages.findIndex(m => m.id === parsed.data.messageId);
    if (msgIndex === -1) throw new HttpError(404, 'Message not found');

    const msg = session.output.messages[msgIndex];
    const variationCount = msg.variations?.length ?? 0;
    if (variationCount >= MAX_REGENERATIONS_PER_MESSAGE) {
      throw new HttpError(409, `Regeneration limit reached (${MAX_REGENERATIONS_PER_MESSAGE} variations maximum).`);
    }

    // Validate channel before passing to engine
    const channelParsed = z.enum(COMPOSER_CHANNELS).safeParse(session.channel);
    if (!channelParsed.success) throw new HttpError(409, 'Session channel is invalid.');

    const variation = await runComposerRegeneration({
      originalMessage:      msg,
      variationInstruction: parsed.data.instruction,
      channel:              channelParsed.data,
      context:              session.context,
    });

    const updatedMessages = session.output.messages.map((m, i) =>
      i !== msgIndex ? m : {
        ...m,
        variations: [
          ...(m.variations ?? []),
          { body: variation.body, subject: variation.subject, variationInstruction: parsed.data.instruction },
        ],
      },
    );

    const updatedSession = {
      ...session,
      output:    { messages: updatedMessages },
      updatedAt: new Date().toISOString(),
    };

    const next = patchTask(phases, taskId, t => ({ ...t, composerSession: updatedSession }));
    if (!next) throw new HttpError(404, 'Task not found post-merge');

    await prisma.roadmap.update({ where: { id: roadmapId }, data: { phases: toJsonValue(next) } });

    log.info('[ComposerTask] Variation persisted', { taskId, messageId: parsed.data.messageId, variationCount: variationCount + 1 });
    return NextResponse.json({ variation });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
