// src/app/api/discovery/roadmaps/[id]/composer/generate/route.ts
//
// Standalone Outreach Composer — generate route.
//
// Two branches (post-Inngest-migration 2026-04-24):
//   { message } → context collection (Sonnet, ~5-10s, stays SYNC because
//                 the founder is actively chatting and needs an
//                 immediate reply for the conversational UX)
//   { context, mode, channel } → full generation (Sonnet + research,
//                 5-45s, runs ASYNC via Inngest. Route returns 202 +
//                 jobId; client polls the ToolJob status endpoint and
//                 renders the progress ladder until completion)

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sendToolJobEvent } from '@/lib/tool-jobs/queue';
import {
  HttpError, httpErrorToResponse, requireUserId,
  enforceSameOrigin, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import {
  COMPOSER_TOOL_ID, COMPOSER_CHANNELS, COMPOSER_MODES,
  runComposerContext, OutreachContextSchema,
} from '@/lib/roadmap/composer';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';
import { createToolJob } from '@/lib/tool-jobs/helpers';

export const maxDuration = 30;

const ContextBodySchema  = z.object({ message: z.string().min(1).max(3000), sessionId: z.string().optional() });
const GenerateBodySchema = z.object({ context: OutreachContextSchema, mode: z.enum(COMPOSER_MODES), channel: z.enum(COMPOSER_CHANNELS), sessionId: z.string().optional() });
const BodySchema         = z.union([ContextBodySchema, GenerateBodySchema]);

/**
 * POST /api/discovery/roadmaps/[id]/composer/generate
 *
 * Pass { message, sessionId? } for context collection (sync 200) or
 * { context, mode, channel, sessionId? } for generation (async 202).
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
    await rateLimitByUser(userId, 'composer-standalone-generate', RATE_LIMITS.AI_GENERATION);
    const { id: roadmapId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST composer-standalone-generate', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, toolSessions: true, recommendation: { select: { path: true, summary: true, session: { select: { beliefState: true } } } } },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const rawSessions: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>) : [];
    const sessionId = parsed.data.sessionId ?? `cmp_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const existing  = rawSessions.find(s => s['id'] === sessionId);
    const now       = new Date().toISOString();

    const bsRaw = roadmap.recommendation?.session?.beliefState;
    const bs    = bsRaw ? safeParseDiscoveryContext(bsRaw) : null;

    // -----------------------------------------------------------------
    // Branch A — context collection (stays sync; chat-like UX)
    // -----------------------------------------------------------------
    if ('message' in parsed.data) {
      const history: Array<{ role: 'founder' | 'agent'; message: string }> =
        ((existing?.contextHistory ?? []) as Array<{ role: string; message: string }>)
          .filter(e => e.role === 'founder' || e.role === 'agent')
          .map(e => ({ role: e.role as 'founder' | 'agent', message: String(e.message) }));
      const response = await runComposerContext({
        founderMessage: parsed.data.message, history,
        taskContext: null, taskTitle: null,
        beliefState: { primaryGoal: bs?.primaryGoal?.value ?? null, geographicMarket: bs?.geographicMarket?.value ?? null, situation: bs?.situation?.value ?? null },
        exchangeNumber: Math.floor(history.length / 2) + 1,
      });
      const newHistory = [...history, { role: 'founder' as const, message: parsed.data.message }, { role: 'agent' as const, message: response.message }];
      const sessionData = {
        ...(existing ?? {}), id: sessionId, tool: COMPOSER_TOOL_ID, contextHistory: newHistory,
        createdAt: existing?.createdAt ?? now, updatedAt: now,
        ...(response.status === 'ready' && response.context ? { pendingContext: response.context, pendingMode: response.mode, pendingChannel: response.channel } : {}),
      };
      const others = rawSessions.filter(s => s['id'] !== sessionId);
      await prisma.roadmap.update({ where: { id: roadmapId }, data: { toolSessions: toJsonValue([...others, sessionData]) } });
      log.info('[StandaloneComposer] Context exchange persisted', { sessionId, status: response.status });
      return NextResponse.json({ status: response.status, message: response.message, context: response.context ?? null, mode: response.mode ?? null, channel: response.channel ?? null, sessionId });
    }

    // -----------------------------------------------------------------
    // Branch B — generation (accept-and-queue; async via Inngest)
    // -----------------------------------------------------------------
    // Persist context + mode + channel onto the session row first so
    // the worker has them even if the founder closes the tab.
    const sessionData = {
      ...(existing ?? {}), id: sessionId, tool: COMPOSER_TOOL_ID,
      context: parsed.data.context, mode: parsed.data.mode, channel: parsed.data.channel,
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    const others = rawSessions.filter(s => s['id'] !== sessionId);
    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  { toolSessions: toJsonValue([...others, sessionData]) },
    });

    const job = await createToolJob({
      userId, roadmapId,
      toolType:  'composer_generate',
      sessionId,
    });

    await sendToolJobEvent(job.id, {
      name: 'tool/composer-generate.requested',
      data: {
        jobId:       job.id,
        userId,
        roadmapId,
        sessionId,
        taskId:      null,
        contextJson: JSON.stringify(parsed.data.context),
        mode:        parsed.data.mode,
        channel:     parsed.data.channel,
      },
    });

    log.info('[StandaloneComposer] Generate job queued', { jobId: job.id, sessionId });
    return NextResponse.json({ jobId: job.id, sessionId }, { status: 202 });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
