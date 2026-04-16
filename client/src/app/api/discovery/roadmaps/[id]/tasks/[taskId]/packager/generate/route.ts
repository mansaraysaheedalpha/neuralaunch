// src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/packager/generate/route.ts
//
// Task-level Service Packager — generate route.
// Pass `message` for context-confirmation exchanges; pass `context` to
// trigger full package generation. Persists to task.packagerSession.

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
  PACKAGER_TOOL_ID, ServiceContextSchema,
  runPackagerContext, runPackagerGeneration,
  buildPrePopulatedContextFromTask,
} from '@/lib/roadmap/service-packager';
import { safeParseResearchLog, appendResearchLog, type ResearchLogEntry } from '@/lib/research';

export const maxDuration = 90;

const ContextBodySchema  = z.object({ message: z.string().min(1).max(3000) });
const GenerateBodySchema = z.object({ context: ServiceContextSchema });
const BodySchema         = z.union([ContextBodySchema, GenerateBodySchema]);

/**
 * POST /api/discovery/roadmaps/[id]/tasks/[taskId]/packager/generate
 *
 * Pass { message } for context-confirmation exchanges, or { context }
 * for full package generation. Persists to task.packagerSession.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'packager-task-generate', RATE_LIMITS.AI_GENERATION);
    const { id: roadmapId, taskId } = await params;
    const log = logger.child({ route: 'POST packager-task-generate', roadmapId, taskId, userId });

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
    const existing = found.task.packagerSession as Record<string, unknown> | undefined;
    const now      = new Date().toISOString();
    const sid      = (existing?.id as string | undefined) ?? `pkg_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    if ('message' in parsed.data) {
      const history: Array<{ role: 'founder' | 'agent'; message: string }> =
        ((existing?.contextHistory ?? []) as Array<{ role: string; message: string }>)
          .filter(e => e.role === 'founder' || e.role === 'agent')
          .map(e => ({ role: e.role as 'founder' | 'agent', message: String(e.message) }));
      const prePopulated = (existing?.pendingContext as ReturnType<typeof buildPrePopulatedContextFromTask> | undefined)
        ?? buildPrePopulatedContextFromTask({
          taskTitle:             found.task.title,
          taskDescription:       found.task.description,
          beliefState:           { geographicMarket: bs?.geographicMarket?.value as string | null ?? null, availableTimePerWeek: bs?.availableTimePerWeek?.value as string | null ?? null, availableBudget: bs?.availableBudget?.value as string | null ?? null },
          recommendationSummary: roadmap.recommendation?.summary ?? null,
          researchSession:       found.task.researchSession,
        });
      const response = await runPackagerContext({
        founderMessage: parsed.data.message, history,
        prePopulatedContext: prePopulated,
        beliefState: { primaryGoal: bs?.primaryGoal?.value as string | null ?? null, geographicMarket: bs?.geographicMarket?.value as string | null ?? null, situation: bs?.situation?.value as string | null ?? null },
        exchangeNumber: Math.floor(history.length / 2) + 1,
        launchedFromTask: true,
      });
      const newHistory = [...history, { role: 'founder' as const, message: parsed.data.message }, { role: 'agent' as const, message: response.message }];
      const sessionData: Record<string, unknown> = {
        ...(existing ?? {}), id: sid, tool: PACKAGER_TOOL_ID, contextHistory: newHistory,
        createdAt: existing?.createdAt ?? now, updatedAt: now,
        ...(response.status === 'ready' && response.context ? { pendingContext: response.context } : { pendingContext: prePopulated }),
      };
      const next = patchTask(phases, taskId, t => ({ ...t, packagerSession: sessionData }));
      if (!next) throw new HttpError(404, 'Task not found post-merge');
      await prisma.roadmap.update({ where: { id: roadmapId }, data: { phases: toJsonValue(next) } });
      log.info('[PackagerTask] Context exchange persisted', { taskId, status: response.status });
      return NextResponse.json({ status: response.status, message: response.message, context: response.context ?? prePopulated });
    }

    const accumulator: ResearchLogEntry[] = [];
    const pkg = await runPackagerGeneration({
      context: parsed.data.context,
      beliefState: { primaryGoal: bs?.primaryGoal?.value as string | null ?? null, geographicMarket: bs?.geographicMarket?.value as string | null ?? null, situation: bs?.situation?.value as string | null ?? null, availableBudget: bs?.availableBudget?.value as string | null ?? null, technicalAbility: bs?.technicalAbility?.value as string | null ?? null, availableTimePerWeek: bs?.availableTimePerWeek?.value as string | null ?? null },
      recommendationPath: roadmap.recommendation?.path ?? null, recommendationSummary: roadmap.recommendation?.summary ?? null,
      roadmapId, researchAccumulator: accumulator,
    });
    const sessionData: Record<string, unknown> = {
      ...(existing ?? {}), id: sid, tool: PACKAGER_TOOL_ID,
      context: parsed.data.context, package: pkg,
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    const next = patchTask(phases, taskId, t => ({ ...t, packagerSession: sessionData }));
    if (!next) throw new HttpError(404, 'Task not found post-merge');
    const nextLog = accumulator.length > 0 ? appendResearchLog(safeParseResearchLog(roadmap.researchLog), accumulator) : null;
    await prisma.roadmap.update({ where: { id: roadmapId }, data: { phases: toJsonValue(next), ...(nextLog ? { researchLog: toJsonValue(nextLog) } : {}) } });
    log.info('[PackagerTask] Generation persisted', { taskId, serviceName: pkg.serviceName, tiers: pkg.tiers.length, researchCalls: accumulator.length });
    return NextResponse.json({ package: pkg });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
