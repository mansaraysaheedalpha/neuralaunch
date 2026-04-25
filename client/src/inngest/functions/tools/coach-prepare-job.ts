// src/inngest/functions/tools/coach-prepare-job.ts
//
// Durable execution of the Conversation Coach preparation call. Opus +
// research tools, 30-90s — the longest single LLM call in the product
// after Research. Removes the 300s ceiling risk and gives the founder
// a step-progress UI.
//
// Pipeline:
//   1. context_loaded → load setup from the session
//   2. researching    → run runCoachPreparation (Opus + tools)
//   3. emitting       → marker for the structured-output phase
//   4. persisting     → write preparation back into the session
//   5. notify-and-complete

import { inngest } from '../../client';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import { type ResearchLogEntry } from '@/lib/research';
import {
  ConversationSetupSchema,
  safeParseToolSessions,
} from '@/lib/roadmap/coach/schemas';
import { runCoachPreparation } from '@/lib/roadmap/coach/preparation-engine';
import { loadPerTaskAgentContext } from '@/lib/lifecycle';
import { renderFounderProfileBlock } from '@/lib/lifecycle/prompt-renderers';
import {
  StoredPhasesArraySchema,
  readTask,
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
import { persistToolJobResult } from '@/lib/tool-jobs/persistence';

export const coachPrepareJobFunction = inngest.createFunction(
  {
    id:       'tool-coach-prepare',
    name:     'Tool — Coach Prepare',
    retries:  1,
    triggers: [{ event: 'tool/coach-prepare.requested' }],
  },
  async ({ event, step }) => {
    const { jobId, userId, roadmapId, sessionId, taskId } =
      event.data as {
        jobId:     string;
        userId:    string;
        roadmapId: string;
        sessionId: string;
        taskId:    string | null;
      };
    const log = logger.child({
      inngestFunction: 'coachPrepareJob',
      jobId, userId, roadmapId, sessionId,
      taskId: taskId ?? null,
    });

    try {
      // ---------------------------------------------------------------
      // Stage 1 — load setup + context
      // ---------------------------------------------------------------
      const ctx = await step.run('context_loaded', async () => {
        await updateToolJobStage(jobId, 'context_loaded');

        const roadmap = await prisma.roadmap.findFirst({
          where:  { id: roadmapId, userId },
          select: {
            id:           true,
            phases:       true,
            toolSessions: true,
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

        let setupRaw: unknown = null;

        if (taskId) {
          const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
          if (!phasesParsed.success) throw new Error('Phases failed schema parse');
          const found = readTask(phasesParsed.data, taskId);
          if (!found) throw new Error('Task not found mid-execution');
          const taskSession = found.task.coachSession as Record<string, unknown> | undefined;
          setupRaw = taskSession?.setup ?? null;
        } else {
          const sessions = safeParseToolSessions(roadmap.toolSessions);
          const session  = sessions.find(s => s.id === sessionId);
          if (!session) throw new Error('Coach session not found');
          setupRaw = session.setup ?? null;
        }

        if (!setupRaw) {
          throw new Error('Coach setup has not been completed. Run setup first.');
        }
        const setupParsed = ConversationSetupSchema.safeParse(setupRaw);
        if (!setupParsed.success) throw new Error('Coach setup data is malformed.');

        const bsRaw = roadmap.recommendation?.session?.beliefState;
        const bs    = bsRaw ? safeParseDiscoveryContext(bsRaw) : null;
        const { profile } = await loadPerTaskAgentContext(userId);

        return {
          setup: setupParsed.data,
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
      // Stage 2 — Opus + research preparation
      // ---------------------------------------------------------------
      const { preparation, accumulatorEntries } = await step.run('researching', async () => {
        await updateToolJobStage(jobId, 'researching');

        const accumulator: ResearchLogEntry[] = [];
        const result = await runCoachPreparation({
          founderProfileBlock:   ctx.founderProfileBlock,
          setup:                 ctx.setup,
          beliefState:           ctx.beliefState,
          recommendationPath:    ctx.recommendationPath,
          recommendationSummary: ctx.recommendationSummary,
          roadmapId,
          researchAccumulator:   accumulator,
        });
        await updateToolJobStage(jobId, 'emitting');
        return { preparation: result, accumulatorEntries: accumulator };
      });

      // ---------------------------------------------------------------
      // Stage 3 — persist
      // ---------------------------------------------------------------
      await step.run('persisting', async () => {
        await updateToolJobStage(jobId, 'persisting');

        const updatedAt = new Date().toISOString();
        await persistToolJobResult({
          roadmapId, userId, sessionId, taskId,
          taskField: 'coachSession',
          buildSession: (existing) => ({
            ...(existing ?? {}),
            preparation,
            updatedAt,
          }),
          researchAccumulator: accumulatorEntries,
        });
      });

      await step.run('notify-and-complete', async () => {
        await notifyToolJobComplete({
          userId, jobId,
          toolType:  'coach_prepare',
          roadmapId, sessionId,
        });
        await completeToolJob(jobId);
      });

      log.info('[CoachPrepareJob] Done', {
        objections:    preparation.objections.length,
        researchCalls: accumulatorEntries.length,
      });

      return { ok: true, sessionId };
    } catch (err) {
      log.error(
        '[CoachPrepareJob] Failed',
        err instanceof Error ? err : new Error(String(err)),
      );
      const errorMessage = err instanceof Error ? err.message : String(err);

      await failToolJob(jobId, err);
      await notifyToolJobFailed({
        userId, jobId,
        toolType:  'coach_prepare',
        roadmapId, sessionId,
        errorMessage,
      });

      throw err;
    }
  },
);
