// src/app/api/discovery/roadmaps/[id]/composer/regenerate/route.ts
//
// Standalone Outreach Composer — regenerate one message variation.
// Reads the session from roadmap.toolSessions by sessionId, enforces
// the MAX_REGENERATIONS_PER_MESSAGE cap, calls runComposerRegeneration,
// and writes the variation back.

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
  sessionId:   z.string().min(1),
  messageId:   z.string().min(1),
  instruction: z.string().min(1).max(1000),
});

/**
 * POST /api/discovery/roadmaps/[id]/composer/regenerate
 *
 * Regenerates one message with a new angle. Requires sessionId.
 * Rejects with 409 if the message has MAX_REGENERATIONS_PER_MESSAGE
 * variations. Appends to message.variations and writes back to toolSessions.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await enforceCycleQuota(userId, 'composer');
    await rateLimitByUser(userId, 'composer-standalone-regenerate', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST composer-standalone-regenerate', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, toolSessions: true },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const rawSessions: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>)
      : [];

    const rawSession = rawSessions.find(s => s['id'] === parsed.data.sessionId);
    if (!rawSession) throw new HttpError(404, 'Session not found');

    const session = safeParseComposerSession(rawSession);
    if (!session?.output) throw new HttpError(409, 'No generated output found. Run generate first.');

    const msgIndex = session.output.messages.findIndex(m => m.id === parsed.data.messageId);
    if (msgIndex === -1) throw new HttpError(404, 'Message not found');

    const msg = session.output.messages[msgIndex];
    const variationCount = msg.variations?.length ?? 0;
    if (variationCount >= MAX_REGENERATIONS_PER_MESSAGE) {
      throw new HttpError(409, `Regeneration limit reached (${MAX_REGENERATIONS_PER_MESSAGE} variations maximum).`);
    }

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

    const otherSessions = rawSessions.filter(s => s['id'] !== parsed.data.sessionId);
    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { toolSessions: toJsonValue([...otherSessions, updatedSession]) },
    });

    log.info('[StandaloneComposer] Variation persisted', { sessionId: parsed.data.sessionId, messageId: parsed.data.messageId, variationCount: variationCount + 1 });
    return NextResponse.json({ variation });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
