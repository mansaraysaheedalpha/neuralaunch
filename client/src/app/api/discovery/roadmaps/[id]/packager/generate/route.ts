// src/app/api/discovery/roadmaps/[id]/packager/generate/route.ts
//
// Standalone Service Packager — generate route. Sessions persist in
// roadmap.toolSessions. Omit sessionId on the first call; the route
// mints one and returns it. Pass { message } for context confirmation;
// pass { context } to trigger generation.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  HttpError, httpErrorToResponse, requireUserId,
  enforceSameOrigin, rateLimitByUser, RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import {
  PACKAGER_TOOL_ID, ServiceContextSchema,
  runPackagerContext, runPackagerGeneration,
  buildPrePopulatedContextStandalone,
} from '@/lib/roadmap/service-packager';
import { safeParseResearchLog, appendResearchLog, type ResearchLogEntry } from '@/lib/research';
import { loadPerTaskAgentContext } from '@/lib/lifecycle';
import { renderFounderProfileBlock } from '@/lib/lifecycle/prompt-renderers';
import { requireTierOrThrow } from '@/lib/auth/require-tier';
import { assertVentureNotArchivedByRoadmap } from '@/lib/lifecycle/tier-limits';
import { enforceCycleQuota } from '@/lib/billing/cycle-quota';

export const maxDuration = 90;

const ContextBodySchema  = z.object({ message: z.string().min(1).max(3000), sessionId: z.string().optional() });
const GenerateBodySchema = z.object({ context: ServiceContextSchema, sessionId: z.string().optional() });
const BodySchema         = z.union([ContextBodySchema, GenerateBodySchema]);

/**
 * POST /api/discovery/roadmaps/[id]/packager/generate
 *
 * Standalone packager session. Pass { message, sessionId? } for context
 * confirmation or { context, sessionId? } for generation. Returns
 * sessionId on every call so the client can pass it back.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await enforceCycleQuota(userId, 'packager');
    await rateLimitByUser(userId, 'packager-standalone-generate', RATE_LIMITS.AI_GENERATION);
    const { id: roadmapId } = await params;
    await assertVentureNotArchivedByRoadmap(userId, roadmapId);
    const log = logger.child({ route: 'POST packager-standalone-generate', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const roadmap = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: { id: true, toolSessions: true, researchLog: true, recommendation: { select: { path: true, summary: true, session: { select: { beliefState: true } } } } },
    });
    if (!roadmap) throw new HttpError(404, 'Not found');

    const rawSessions: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
      ? (roadmap.toolSessions as Array<Record<string, unknown>>) : [];
    const sessionId = parsed.data.sessionId ?? `pkg_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const existing  = rawSessions.find(s => s['id'] === sessionId);
    const now       = new Date().toISOString();

    const bsRaw = roadmap.recommendation?.session?.beliefState;
    const bs    = bsRaw ? safeParseDiscoveryContext(bsRaw) : null;

    if ('message' in parsed.data) {
      const history: Array<{ role: 'founder' | 'agent'; message: string }> =
        ((existing?.contextHistory ?? []) as Array<{ role: string; message: string }>)
          .filter(e => e.role === 'founder' || e.role === 'agent')
          .map(e => ({ role: e.role as 'founder' | 'agent', message: String(e.message) }));
      const prePopulated = (existing?.pendingContext as ReturnType<typeof buildPrePopulatedContextStandalone> | undefined)
        ?? buildPrePopulatedContextStandalone({
          beliefState: { geographicMarket: bs?.geographicMarket?.value as string | null ?? null, availableTimePerWeek: bs?.availableTimePerWeek?.value as string | null ?? null, availableBudget: bs?.availableBudget?.value as string | null ?? null },
          recommendationSummary: roadmap.recommendation?.summary ?? null,
        });
      const response = await runPackagerContext({
        founderMessage: parsed.data.message, history,
        prePopulatedContext: prePopulated,
        beliefState: { primaryGoal: bs?.primaryGoal?.value as string | null ?? null, geographicMarket: bs?.geographicMarket?.value as string | null ?? null, situation: bs?.situation?.value as string | null ?? null },
        exchangeNumber: Math.floor(history.length / 2) + 1,
        launchedFromTask: false,
      });
      const newHistory = [...history, { role: 'founder' as const, message: parsed.data.message }, { role: 'agent' as const, message: response.message }];
      const sessionData = {
        ...(existing ?? {}), id: sessionId, tool: PACKAGER_TOOL_ID, contextHistory: newHistory,
        createdAt: existing?.createdAt ?? now, updatedAt: now,
        ...(response.status === 'ready' && response.context ? { pendingContext: response.context } : { pendingContext: prePopulated }),
      };
      const others = rawSessions.filter(s => s['id'] !== sessionId);
      await prisma.roadmap.update({ where: { id: roadmapId }, data: { toolSessions: toJsonValue([...others, sessionData]) } });
      log.info('[StandalonePackager] Context exchange persisted', { sessionId, status: response.status });
      return NextResponse.json({ status: response.status, message: response.message, context: response.context ?? prePopulated, sessionId });
    }

    const { profile } = await loadPerTaskAgentContext(userId);
    const founderProfileBlock = renderFounderProfileBlock(profile);

    const accumulator: ResearchLogEntry[] = [];
    const pkg = await runPackagerGeneration({
      founderProfileBlock: founderProfileBlock || undefined,
      context: parsed.data.context,
      beliefState: { primaryGoal: bs?.primaryGoal?.value as string | null ?? null, geographicMarket: bs?.geographicMarket?.value as string | null ?? null, situation: bs?.situation?.value as string | null ?? null, availableBudget: bs?.availableBudget?.value as string | null ?? null, technicalAbility: bs?.technicalAbility?.value as string | null ?? null, availableTimePerWeek: bs?.availableTimePerWeek?.value as string | null ?? null },
      recommendationPath: roadmap.recommendation?.path ?? null, recommendationSummary: roadmap.recommendation?.summary ?? null,
      roadmapId, researchAccumulator: accumulator,
    });
    const sessionData = {
      ...(existing ?? {}), id: sessionId, tool: PACKAGER_TOOL_ID,
      context: parsed.data.context, package: pkg,
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    const others = rawSessions.filter(s => s['id'] !== sessionId);
    const nextLog = accumulator.length > 0 ? appendResearchLog(safeParseResearchLog(roadmap.researchLog), accumulator) : null;
    await prisma.roadmap.update({ where: { id: roadmapId }, data: { toolSessions: toJsonValue([...others, sessionData]), ...(nextLog ? { researchLog: toJsonValue(nextLog) } : {}) } });
    log.info('[StandalonePackager] Generation persisted', { sessionId, serviceName: pkg.serviceName });
    return NextResponse.json({ package: pkg, sessionId });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
