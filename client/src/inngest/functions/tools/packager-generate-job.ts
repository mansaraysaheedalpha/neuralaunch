// src/inngest/functions/tools/packager-generate-job.ts
//
// Durable execution of the Service Packager generate call. Removes the
// Vercel 300s ceiling for the Opus tool loop (research-tool-augmented
// package generation, ~20-30s per call). Same shape as
// research-execute-job.ts; see that file for the canonical pattern.
//
// Pipeline:
//   1. context_loaded → load belief state + recommendation + parse the
//                       ServiceContext payload off the event
//   2. researching    → run runPackagerGeneration (Opus + tools, 8 steps)
//   3. emitting       → marker step (the engine's structured emit phase
//                       happens inside step 2, but the founder UI gets
//                       a clean transition into the package-rendering
//                       stage)
//   4. persisting     → write package + research log into roadmap
//   5. notify-and-complete → push notification + mark job done

import { inngest } from '../../client';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import {
  safeParseResearchLog,
  appendResearchLog,
  type ResearchLogEntry,
} from '@/lib/research';
import {
  PACKAGER_TOOL_ID,
  ServiceContextSchema,
  runPackagerGeneration,
} from '@/lib/roadmap/service-packager';
import { loadPerTaskAgentContext } from '@/lib/lifecycle';
import { renderFounderProfileBlock } from '@/lib/lifecycle/prompt-renderers';
import {
  StoredPhasesArraySchema,
  readTask,
  patchTask,
} from '@/lib/roadmap/checkin-types';
import {
  updateToolJobStage,
  completeToolJob,
  failToolJob,
} from '@/lib/tool-jobs/helpers';
import {
  notifyToolJobComplete,
  notifyToolJobFailed,
} from '@/lib/tool-jobs/notifications';

export const packagerGenerateJobFunction = inngest.createFunction(
  {
    id:       'tool-packager-generate',
    name:     'Tool — Packager Generate',
    retries:  1,
    triggers: [{ event: 'tool/packager-generate.requested' }],
  },
  async ({ event, step }) => {
    const { jobId, userId, roadmapId, sessionId, taskId, contextJson } =
      event.data as {
        jobId:       string;
        userId:      string;
        roadmapId:   string;
        sessionId:   string;
        taskId:      string | null;
        contextJson: string;
      };
    const log = logger.child({
      inngestFunction: 'packagerGenerateJob',
      jobId, userId, roadmapId, sessionId,
      taskId: taskId ?? null,
    });

    try {
      // ---------------------------------------------------------------
      // Stage 1 — load belief state, parse context off the event
      // ---------------------------------------------------------------
      const ctx = await step.run('context_loaded', async () => {
        await updateToolJobStage(jobId, 'context_loaded');

        const parsedContext = ServiceContextSchema.safeParse(JSON.parse(contextJson));
        if (!parsedContext.success) {
          throw new Error('Packager context payload failed schema parse');
        }

        const roadmap = await prisma.roadmap.findFirst({
          where:  { id: roadmapId, userId },
          select: {
            id: true,
            recommendation: {
              select: {
                path:    true,
                summary: true,
                session: { select: { beliefState: true } },
              },
            },
          },
        });
        if (!roadmap) throw new Error('Roadmap not found for jobId');

        const bsRaw = roadmap.recommendation?.session?.beliefState;
        const bs    = bsRaw ? safeParseDiscoveryContext(bsRaw) : null;
        const { profile } = await loadPerTaskAgentContext(userId);

        return {
          context: parsedContext.data,
          founderProfileBlock: renderFounderProfileBlock(profile) || undefined,
          beliefState: {
            primaryGoal:          bs?.primaryGoal?.value ?? null,
            geographicMarket:     bs?.geographicMarket?.value ?? null,
            situation:            bs?.situation?.value ?? null,
            availableBudget:      bs?.availableBudget?.value ?? null,
            technicalAbility:     bs?.technicalAbility?.value ?? null,
            availableTimePerWeek: bs?.availableTimePerWeek?.value ?? null,
          },
          recommendationPath:    roadmap.recommendation?.path ?? null,
          recommendationSummary: roadmap.recommendation?.summary ?? null,
        };
      });

      // ---------------------------------------------------------------
      // Stage 2 — run the generation. The Opus tool loop happens here.
      // ---------------------------------------------------------------
      const { pkg, accumulatorEntries } = await step.run('researching', async () => {
        await updateToolJobStage(jobId, 'researching');

        const accumulator: ResearchLogEntry[] = [];
        const result = await runPackagerGeneration({
          founderProfileBlock:   ctx.founderProfileBlock,
          context:               ctx.context,
          beliefState:           ctx.beliefState,
          recommendationPath:    ctx.recommendationPath,
          recommendationSummary: ctx.recommendationSummary,
          roadmapId,
          researchAccumulator:   accumulator,
        });
        await updateToolJobStage(jobId, 'emitting');
        return { pkg: result, accumulatorEntries: accumulator };
      });

      // ---------------------------------------------------------------
      // Stage 3 — persist into roadmap.toolSessions (standalone) OR
      // task.packagerSession (task-launched).
      // ---------------------------------------------------------------
      await step.run('persisting', async () => {
        await updateToolJobStage(jobId, 'persisting');

        const updatedAt = new Date().toISOString();

        if (taskId) {
          const fresh = await prisma.roadmap.findFirst({
            where:  { id: roadmapId, userId },
            select: { phases: true, researchLog: true },
          });
          if (!fresh) throw new Error('Roadmap disappeared mid-execution');
          const phasesParsed = StoredPhasesArraySchema.safeParse(fresh.phases);
          if (!phasesParsed.success) throw new Error('Phases failed schema parse');
          const found = readTask(phasesParsed.data, taskId);
          if (!found) throw new Error('Task not found mid-execution');

          const existingSession = (found.task.packagerSession ?? {}) as Record<string, unknown>;
          const updatedSession = {
            ...existingSession,
            id:        sessionId,
            tool:      PACKAGER_TOOL_ID,
            context:   ctx.context,
            package:   pkg,
            createdAt: existingSession['createdAt'] ?? updatedAt,
            updatedAt,
          };
          const next = patchTask(phasesParsed.data, taskId, t => ({
            ...t,
            packagerSession: updatedSession,
          }));
          if (!next) throw new Error('patchTask returned null mid-execution');

          const nextLog = accumulatorEntries.length > 0
            ? appendResearchLog(safeParseResearchLog(fresh.researchLog), accumulatorEntries)
            : null;

          await prisma.roadmap.update({
            where: { id: roadmapId },
            data:  {
              phases: toJsonValue(next),
              ...(nextLog ? { researchLog: toJsonValue(nextLog) } : {}),
            },
          });
        } else {
          const fresh = await prisma.roadmap.findFirst({
            where:  { id: roadmapId, userId },
            select: { toolSessions: true, researchLog: true },
          });
          if (!fresh) throw new Error('Roadmap disappeared mid-execution');
          const rawSessions: Array<Record<string, unknown>> = Array.isArray(fresh.toolSessions)
            ? (fresh.toolSessions as Array<Record<string, unknown>>)
            : [];
          const existingSession = rawSessions.find(s => s['id'] === sessionId);
          // Standalone path: the context-confirmation phase persists the
          // session row before the founder triggers generation, so it
          // SHOULD exist. If it doesn't (race / cleanup), create it.
          const baseSession = existingSession ?? {
            id:        sessionId,
            tool:      PACKAGER_TOOL_ID,
            createdAt: updatedAt,
          };
          const updatedSession = {
            ...baseSession,
            context: ctx.context,
            package: pkg,
            updatedAt,
          };
          const others = rawSessions.filter(s => s['id'] !== sessionId);
          const nextLog = accumulatorEntries.length > 0
            ? appendResearchLog(safeParseResearchLog(fresh.researchLog), accumulatorEntries)
            : null;

          await prisma.roadmap.update({
            where: { id: roadmapId },
            data:  {
              toolSessions: toJsonValue([...others, updatedSession]),
              ...(nextLog ? { researchLog: toJsonValue(nextLog) } : {}),
            },
          });
        }
      });

      // ---------------------------------------------------------------
      // Stage 4 — push + complete
      // ---------------------------------------------------------------
      await step.run('notify-and-complete', async () => {
        await notifyToolJobComplete({
          userId, jobId,
          toolType:  'packager_generate',
          roadmapId, sessionId,
        });
        await completeToolJob(jobId);
      });

      log.info('[PackagerGenerateJob] Done', {
        serviceName:   pkg.serviceName,
        tiers:         pkg.tiers.length,
        researchCalls: accumulatorEntries.length,
      });

      return { ok: true, sessionId };
    } catch (err) {
      log.error(
        '[PackagerGenerateJob] Failed',
        err instanceof Error ? err : new Error(String(err)),
      );
      const errorMessage = err instanceof Error ? err.message : String(err);

      await failToolJob(jobId, err);
      await notifyToolJobFailed({
        userId, jobId,
        toolType:  'packager_generate',
        roadmapId, sessionId,
        errorMessage,
      });

      throw err;
    }
  },
);
