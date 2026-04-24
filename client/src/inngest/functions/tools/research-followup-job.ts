// src/inngest/functions/tools/research-followup-job.ts
//
// Durable execution of a Research Tool follow-up round. Same shape as
// research-execute-job — moved off the synchronous serverless route
// to remove the 300s ceiling. The follow-up engine uses Sonnet rather
// than Opus and a tighter step budget (10 vs 25), but provider latency
// stacks the same way and follow-ups have hit the ceiling in
// production too.

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
  FOLLOWUP_MAX_ROUNDS,
  safeParseResearchSession,
  runResearchFollowUp,
} from '@/lib/roadmap/research-tool';
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

export const researchFollowupJobFunction = inngest.createFunction(
  {
    id:      'tool-research-followup',
    name:    'Tool — Research Follow-up',
    retries: 1,
    triggers: [{ event: 'tool/research-followup.requested' }],
  },
  async ({ event, step }) => {
    const { jobId, userId, roadmapId, sessionId, taskId, query } =
      event.data as {
        jobId:     string;
        userId:    string;
        roadmapId: string;
        sessionId: string;
        taskId:    string | null;
        query:     string;
      };
    const log = logger.child({
      inngestFunction: 'researchFollowupJob',
      jobId,
      userId,
      roadmapId,
      sessionId,
      taskId: taskId ?? null,
    });

    try {
      // -------------------------------------------------------------------
      // Stage 1 — load belief state + the existing research session
      // (needed to feed runResearchFollowUp the original query +
      // existing findings to build on).
      // -------------------------------------------------------------------
      const context = await step.run('context_loaded', async () => {
        await updateToolJobStage(jobId, 'context_loaded');

        const roadmap = await prisma.roadmap.findFirst({
          where:  { id: roadmapId, userId },
          select: {
            id:           true,
            toolSessions: true,
            phases:       true,
            recommendation: {
              select: { session: { select: { beliefState: true } } },
            },
          },
        });
        if (!roadmap) throw new Error('Roadmap not found for jobId');

        // Pull the existing research session from the right place
        // depending on whether this was task-launched or standalone.
        let existingRaw: Record<string, unknown> | null = null;
        if (taskId) {
          const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
          if (phasesParsed.success) {
            const found = readTask(phasesParsed.data, taskId);
            existingRaw = (found?.task.researchSession ?? null) as
              | Record<string, unknown> | null;
          }
        } else {
          const rawSessions: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
            ? (roadmap.toolSessions as Array<Record<string, unknown>>)
            : [];
          existingRaw = rawSessions.find(s => s['id'] === sessionId) ?? null;
        }
        if (!existingRaw) throw new Error('Research session not found');

        const parsed = safeParseResearchSession(existingRaw);
        if (!parsed?.report) {
          throw new Error('Research has not been executed yet — no report to follow up on');
        }
        const currentRounds = parsed.followUps?.length ?? 0;
        if (currentRounds >= FOLLOWUP_MAX_ROUNDS) {
          throw new Error(`Follow-up cap (${FOLLOWUP_MAX_ROUNDS}) reached`);
        }

        const bsRaw = roadmap.recommendation?.session?.beliefState;
        const bs    = bsRaw ? safeParseDiscoveryContext(bsRaw) : null;

        return {
          existingSession: parsed,
          currentRounds,
          beliefState: {
            geographicMarket: bs?.geographicMarket?.value ?? null,
            primaryGoal:      bs?.primaryGoal?.value ?? null,
            situation:        bs?.situation?.value ?? null,
          },
        };
      });

      const round = context.currentRounds + 1;

      // -------------------------------------------------------------------
      // Stage 2 — run the follow-up engine.
      // -------------------------------------------------------------------
      const { result, accumulatorEntries } = await step.run('researching', async () => {
        await updateToolJobStage(jobId, 'researching');

        const accumulator: ResearchLogEntry[] = [];
        const r = await runResearchFollowUp({
          followUpQuery:       query,
          originalQuery:       context.existingSession.query,
          existingFindings:    context.existingSession.report?.findings ?? [],
          existingReport:      context.existingSession.report!,
          beliefState:         context.beliefState,
          roadmapId,
          researchAccumulator: accumulator,
          followUpRound:       round,
        });
        await updateToolJobStage(jobId, 'emitting');
        return { result: r, accumulatorEntries: accumulator };
      });

      // -------------------------------------------------------------------
      // Stage 3 — persist the new follow-up round.
      // -------------------------------------------------------------------
      await step.run('persisting', async () => {
        await updateToolJobStage(jobId, 'persisting');

        const updatedAt = new Date().toISOString();
        const newFollowUp = {
          query,
          findings: result.findings,
          round,
        };

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

          const existingResearchSession = (found.task.researchSession ?? {}) as Record<string, unknown>;
          const existingFollowUps = Array.isArray(existingResearchSession['followUps'])
            ? (existingResearchSession['followUps'] as Array<Record<string, unknown>>)
            : [];
          const updatedResearchSession = {
            ...existingResearchSession,
            followUps: [...existingFollowUps, newFollowUp],
            updatedAt,
          };
          const next = patchTask(phasesParsed.data, taskId, t => ({
            ...t,
            researchSession: updatedResearchSession,
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
          if (!existingSession) {
            throw new Error('Session disappeared from toolSessions mid-execution');
          }
          const existingFollowUps = Array.isArray(existingSession['followUps'])
            ? (existingSession['followUps'] as Array<Record<string, unknown>>)
            : [];
          const updatedSession = {
            ...existingSession,
            followUps: [...existingFollowUps, newFollowUp],
            updatedAt,
          };
          const otherSessions = rawSessions.filter(s => s['id'] !== sessionId);

          const nextLog = accumulatorEntries.length > 0
            ? appendResearchLog(safeParseResearchLog(fresh.researchLog), accumulatorEntries)
            : null;

          await prisma.roadmap.update({
            where: { id: roadmapId },
            data:  {
              toolSessions: toJsonValue([...otherSessions, updatedSession]),
              ...(nextLog ? { researchLog: toJsonValue(nextLog) } : {}),
            },
          });
        }
      });

      await step.run('notify-and-complete', async () => {
        await notifyToolJobComplete({
          userId,
          jobId,
          toolType: 'research_followup',
          roadmapId,
          sessionId,
        });
        await completeToolJob(jobId);
      });

      log.info('[ResearchFollowupJob] Done', {
        round,
        findings:      result.findings.length,
        researchCalls: accumulatorEntries.length,
      });

      return { ok: true, sessionId, round };
    } catch (err) {
      log.error(
        '[ResearchFollowupJob] Failed',
        err instanceof Error ? err : new Error(String(err)),
      );
      const errorMessage = err instanceof Error ? err.message : String(err);

      await failToolJob(jobId, err);
      await notifyToolJobFailed({
        userId,
        jobId,
        toolType:    'research_followup',
        roadmapId,
        sessionId,
        errorMessage,
      });

      throw err;
    }
  },
);
