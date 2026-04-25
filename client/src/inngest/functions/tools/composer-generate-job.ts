// src/inngest/functions/tools/composer-generate-job.ts
//
// Durable execution of the Outreach Composer generate call. Same shape
// as packager-generate-job.ts. The Sonnet + research-tool loop typically
// takes 5-45s; this function moves it off the synchronous serverless
// path so a heavy research session never times out at 300s.

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
  COMPOSER_TOOL_ID,
  OutreachContextSchema,
  runComposerGeneration,
  type ComposerChannel,
  type ComposerMode,
} from '@/lib/roadmap/composer';
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

export const composerGenerateJobFunction = inngest.createFunction(
  {
    id:       'tool-composer-generate',
    name:     'Tool — Composer Generate',
    retries:  1,
    triggers: [{ event: 'tool/composer-generate.requested' }],
  },
  async ({ event, step }) => {
    const { jobId, userId, roadmapId, sessionId, taskId, contextJson, mode, channel } =
      event.data as {
        jobId:       string;
        userId:      string;
        roadmapId:   string;
        sessionId:   string;
        taskId:      string | null;
        contextJson: string;
        mode:        string;
        channel:     string;
      };
    const log = logger.child({
      inngestFunction: 'composerGenerateJob',
      jobId, userId, roadmapId, sessionId,
      taskId: taskId ?? null,
    });

    try {
      const ctx = await step.run('context_loaded', async () => {
        await updateToolJobStage(jobId, 'context_loaded');

        const parsedContext = OutreachContextSchema.safeParse(JSON.parse(contextJson));
        if (!parsedContext.success) {
          throw new Error('Composer context payload failed schema parse');
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

      const { output, accumulatorEntries } = await step.run('researching', async () => {
        await updateToolJobStage(jobId, 'researching');

        const accumulator: ResearchLogEntry[] = [];
        const result = await runComposerGeneration({
          founderProfileBlock:   ctx.founderProfileBlock,
          context:               ctx.context,
          mode:                  mode as ComposerMode,
          channel:               channel as ComposerChannel,
          beliefState:           ctx.beliefState,
          recommendationPath:    ctx.recommendationPath,
          recommendationSummary: ctx.recommendationSummary,
          roadmapId,
          researchAccumulator:   accumulator,
        });
        await updateToolJobStage(jobId, 'emitting');
        return { output: result, accumulatorEntries: accumulator };
      });

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

          const existingSession = (found.task.composerSession ?? {}) as Record<string, unknown>;
          const updatedSession = {
            ...existingSession,
            id:        sessionId,
            tool:      COMPOSER_TOOL_ID,
            context:   ctx.context,
            mode,
            channel,
            output,
            createdAt: existingSession['createdAt'] ?? updatedAt,
            updatedAt,
          };
          const next = patchTask(phasesParsed.data, taskId, t => ({
            ...t,
            composerSession: updatedSession,
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
          const baseSession = existingSession ?? {
            id:        sessionId,
            tool:      COMPOSER_TOOL_ID,
            createdAt: updatedAt,
          };
          const updatedSession = {
            ...baseSession,
            context: ctx.context,
            mode,
            channel,
            output,
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

      await step.run('notify-and-complete', async () => {
        await notifyToolJobComplete({
          userId, jobId,
          toolType:  'composer_generate',
          roadmapId, sessionId,
        });
        await completeToolJob(jobId);
      });

      log.info('[ComposerGenerateJob] Done', {
        messageCount:  output.messages.length,
        researchCalls: accumulatorEntries.length,
      });

      return { ok: true, sessionId };
    } catch (err) {
      log.error(
        '[ComposerGenerateJob] Failed',
        err instanceof Error ? err : new Error(String(err)),
      );
      const errorMessage = err instanceof Error ? err.message : String(err);

      await failToolJob(jobId, err);
      await notifyToolJobFailed({
        userId, jobId,
        toolType:  'composer_generate',
        roadmapId, sessionId,
        errorMessage,
      });

      throw err;
    }
  },
);
