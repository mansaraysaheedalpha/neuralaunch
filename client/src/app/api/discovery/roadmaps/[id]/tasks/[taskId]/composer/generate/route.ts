// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/composer/generate/route.ts
//
// Task-level Outreach Composer — generate route.
// Pass `message` for context-collection exchanges; pass `context + mode +
// channel` to trigger full message generation. Persists to task.composerSession.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  HttpError, httpErrorToResponse, requireUserId,
  enforceSameOrigin, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { StoredPhasesArraySchema, readTask, patchTask, type StoredRoadmapPhase } from '@/lib/roadmap/checkin-types';
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import {
  COMPOSER_TOOL_ID, COMPOSER_CHANNELS, COMPOSER_MODES,
  runComposerContext, runComposerGeneration, OutreachContextSchema,
} from '@/lib/roadmap/composer';
import { safeParseResearchLog, appendResearchLog, type ResearchLogEntry } from '@/lib/research';
import { loadPerTaskAgentContext } from '@/lib/lifecycle';
import { renderFounderProfileBlock } from '@/lib/lifecycle/prompt-renderers';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';

export const maxDuration = 60;

const ContextBodySchema  = z.object({ message: z.string().min(1).max(3000) });
const GenerateBodySchema = z.object({ context: OutreachContextSchema, mode: z.enum(COMPOSER_MODES), channel: z.enum(COMPOSER_CHANNELS) });
const BodySchema         = z.union([ContextBodySchema, GenerateBodySchema]);

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/composer/generate
 *
 * Pass { message } for context-collection exchanges, or { context, mode,
 * channel } for full message generation. Persists to task.composerSession.
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
    await rateLimitByUser(userId, 'composer-task-generate', RATE_LIMITS.AI_GENERATION);
    const { id: roadmapId, taskId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST composer-task-generate', roadmapId, taskId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, phases: true, researchLog: true, recommendation: { select: { path: true, summary: true, session: { select: { beliefState: true } } } } },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
    if (!phasesParsed.success) throw new HttpError(409, 'Roadmap content is malformed');
    const phases: StoredRoadmapPhase[] = phasesParsed.data;
    const found = readTask(phases, taskId);
    if (!found) throw new HttpError(404, 'Task not found');

    const bsRaw = roadmap.recommendation?.session?.beliefState;
    const bs    = bsRaw ? safeParseDiscoveryContext(bsRaw) : null;
    const existing = found.task.composerSession as Record<string, unknown> | undefined;
    const now      = new Date().toISOString();
    const sid      = (existing?.id as string | undefined) ?? `cmp_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    if ('message' in parsed.data) {
      const history: Array<{ role: 'founder' | 'agent'; message: string }> =
        ((existing?.contextHistory ?? []) as Array<{ role: string; message: string }>)
          .filter(e => e.role === 'founder' || e.role === 'agent')
          .map(e => ({ role: e.role as 'founder' | 'agent', message: String(e.message) }));
      const response = await runComposerContext({
        founderMessage: parsed.data.message, history,
        taskContext: found.task.description ?? null, taskTitle: found.task.title ?? null,
        beliefState: { primaryGoal: bs?.primaryGoal?.value ?? null, geographicMarket: bs?.geographicMarket?.value ?? null, situation: bs?.situation?.value ?? null },
        exchangeNumber: Math.floor(history.length / 2) + 1,
      });
      const newHistory = [...history, { role: 'founder' as const, message: parsed.data.message }, { role: 'agent' as const, message: response.message }];
      const sessionData: Record<string, unknown> = {
        ...(existing ?? {}), id: sid, tool: COMPOSER_TOOL_ID, contextHistory: newHistory,
        createdAt: existing?.createdAt ?? now, updatedAt: now,
        ...(response.status === 'ready' && response.context ? { pendingContext: response.context, pendingMode: response.mode, pendingChannel: response.channel } : {}),
      };
      const next = patchTask(phases, taskId, t => ({ ...t, composerSession: sessionData }));
      if (!next) throw new HttpError(404, 'Task not found post-merge');
      await prisma.roadmap.update({ where: { id: roadmapId }, data: { phases: toJsonValue(next) } });
      log.info('[ComposerTask] Context exchange persisted', { taskId, status: response.status });
      return NextResponse.json({ status: response.status, message: response.message, context: response.context ?? null, mode: response.mode ?? null, channel: response.channel ?? null });
    }

    const { profile } = await loadPerTaskAgentContext(userId);
    const founderProfileBlock = renderFounderProfileBlock(profile);

    const accumulator: ResearchLogEntry[] = [];
    const output = await runComposerGeneration({
      founderProfileBlock: founderProfileBlock || undefined,
      context: parsed.data.context, mode: parsed.data.mode, channel: parsed.data.channel,
      beliefState: { primaryGoal: bs?.primaryGoal?.value ?? null, geographicMarket: bs?.geographicMarket?.value ?? null, situation: bs?.situation?.value ?? null, availableBudget: bs?.availableBudget?.value ?? null, technicalAbility: bs?.technicalAbility?.value ?? null, availableTimePerWeek: bs?.availableTimePerWeek?.value ?? null },
      recommendationPath: roadmap.recommendation?.path ?? null, recommendationSummary: roadmap.recommendation?.summary ?? null,
      roadmapId, researchAccumulator: accumulator,
    });
    const sessionData: Record<string, unknown> = {
      ...(existing ?? {}), id: sid, tool: COMPOSER_TOOL_ID,
      context: parsed.data.context, mode: parsed.data.mode, channel: parsed.data.channel, output,
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    const next = patchTask(phases, taskId, t => ({ ...t, composerSession: sessionData }));
    if (!next) throw new HttpError(404, 'Task not found post-merge');
    const nextLog = accumulator.length > 0 ? appendResearchLog(safeParseResearchLog(roadmap.researchLog), accumulator) : null;
    await prisma.roadmap.update({ where: { id: roadmapId }, data: { phases: toJsonValue(next), ...(nextLog ? { researchLog: toJsonValue(nextLog) } : {}) } });
    log.info('[ComposerTask] Generation persisted', { taskId, messageCount: output.messages.length, researchCalls: accumulator.length });
    return NextResponse.json({ output });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
