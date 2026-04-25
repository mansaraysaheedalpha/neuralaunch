// src/inngest/functions/tools/packager-adjust-job.ts
//
// Durable execution of the Service Packager adjust call. Sonnet-only
// (no research tools), runs ~8-10s — safely under the serverless
// ceiling today, but moved here for consistency with the other tool
// jobs and to keep the founder UI on a uniform progress-ladder pattern.
//
// Pipeline:
//   1. context_loaded → read existing session, validate adjustment cap
//   2. emitting       → run runPackagerAdjustment (Sonnet)
//   3. persisting     → write the updated package back
//   4. notify-and-complete

import { inngest } from '../../client';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import {
  MAX_ADJUSTMENT_ROUNDS,
  runPackagerAdjustment,
  safeParsePackagerSession,
} from '@/lib/roadmap/service-packager';
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

export const packagerAdjustJobFunction = inngest.createFunction(
  {
    id:       'tool-packager-adjust',
    name:     'Tool — Packager Adjust',
    retries:  1,
    triggers: [{ event: 'tool/packager-adjust.requested' }],
  },
  async ({ event, step }) => {
    const { jobId, userId, roadmapId, sessionId, taskId, adjustmentRequest } =
      event.data as {
        jobId:             string;
        userId:            string;
        roadmapId:         string;
        sessionId:         string;
        taskId:            string | null;
        adjustmentRequest: string;
      };
    const log = logger.child({
      inngestFunction: 'packagerAdjustJob',
      jobId, userId, roadmapId, sessionId,
      taskId: taskId ?? null,
    });

    try {
      // ---------------------------------------------------------------
      // Stage 1 — load existing session + belief state, enforce cap
      // ---------------------------------------------------------------
      const ctx = await step.run('context_loaded', async () => {
        await updateToolJobStage(jobId, 'context_loaded');

        const roadmap = await prisma.roadmap.findFirst({
          where:  { id: roadmapId, userId },
          select: {
            id: true,
            phases: true,
            toolSessions: true,
            recommendation: { select: { session: { select: { beliefState: true } } } },
          },
        });
        if (!roadmap) throw new Error('Roadmap not found for jobId');

        const bsRaw = roadmap.recommendation?.session?.beliefState;
        const bs    = bsRaw ? safeParseDiscoveryContext(bsRaw) : null;

        let existingSession: Record<string, unknown> | null = null;

        if (taskId) {
          const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
          if (!phasesParsed.success) throw new Error('Phases failed schema parse');
          const found = readTask(phasesParsed.data, taskId);
          if (!found) throw new Error('Task not found mid-execution');
          existingSession = (found.task.packagerSession ?? null) as Record<string, unknown> | null;
        } else {
          const rawSessions: Array<Record<string, unknown>> = Array.isArray(roadmap.toolSessions)
            ? (roadmap.toolSessions as Array<Record<string, unknown>>)
            : [];
          existingSession = rawSessions.find(s => s['id'] === sessionId) ?? null;
        }

        if (!existingSession) throw new Error('Packager session not found');
        const session = safeParsePackagerSession(existingSession);
        if (!session?.package) throw new Error('No generated package found. Run generate first.');

        const priorAdjustments = session.adjustments ?? [];
        if (priorAdjustments.length >= MAX_ADJUSTMENT_ROUNDS) {
          throw new Error(`Adjustment limit reached (${MAX_ADJUSTMENT_ROUNDS} adjustments maximum).`);
        }
        const round = priorAdjustments.length + 1;

        return {
          existingSession,
          parsedSession:    session,
          priorAdjustments,
          round,
          beliefState: {
            geographicMarket:     bs?.geographicMarket?.value ?? null,
            availableTimePerWeek: bs?.availableTimePerWeek?.value ?? null,
          },
        };
      });

      // ---------------------------------------------------------------
      // Stage 2 — run the adjustment
      // ---------------------------------------------------------------
      const updatedPackage = await step.run('emitting', async () => {
        await updateToolJobStage(jobId, 'emitting');
        return await runPackagerAdjustment({
          existingPackage:   ctx.parsedSession.package!,
          context:           ctx.parsedSession.context,
          priorAdjustments:  ctx.priorAdjustments,
          adjustmentRequest,
          round:             ctx.round,
          beliefState:       ctx.beliefState,
        });
      });

      // ---------------------------------------------------------------
      // Stage 3 — persist back
      // ---------------------------------------------------------------
      await step.run('persisting', async () => {
        await updateToolJobStage(jobId, 'persisting');

        const updatedAt = new Date().toISOString();
        const adjustments = [
          ...ctx.priorAdjustments,
          { request: adjustmentRequest, round: ctx.round },
        ];

        if (taskId) {
          const fresh = await prisma.roadmap.findFirst({
            where:  { id: roadmapId, userId },
            select: { phases: true },
          });
          if (!fresh) throw new Error('Roadmap disappeared mid-execution');
          const phasesParsed = StoredPhasesArraySchema.safeParse(fresh.phases);
          if (!phasesParsed.success) throw new Error('Phases failed schema parse');
          const found = readTask(phasesParsed.data, taskId);
          if (!found) throw new Error('Task not found mid-execution');

          const existing = (found.task.packagerSession ?? {}) as Record<string, unknown>;
          const updatedSession = {
            ...existing,
            package: updatedPackage,
            adjustments,
            updatedAt,
          };
          const next = patchTask(phasesParsed.data, taskId, t => ({
            ...t,
            packagerSession: updatedSession,
          }));
          if (!next) throw new Error('patchTask returned null mid-execution');

          await prisma.roadmap.update({
            where: { id: roadmapId },
            data:  { phases: toJsonValue(next) },
          });
        } else {
          const fresh = await prisma.roadmap.findFirst({
            where:  { id: roadmapId, userId },
            select: { toolSessions: true },
          });
          if (!fresh) throw new Error('Roadmap disappeared mid-execution');
          const rawSessions: Array<Record<string, unknown>> = Array.isArray(fresh.toolSessions)
            ? (fresh.toolSessions as Array<Record<string, unknown>>)
            : [];
          const existing = rawSessions.find(s => s['id'] === sessionId);
          if (!existing) throw new Error('Session disappeared mid-execution');

          const updatedSession = {
            ...existing,
            package: updatedPackage,
            adjustments,
            updatedAt,
          };
          const others = rawSessions.filter(s => s['id'] !== sessionId);

          await prisma.roadmap.update({
            where: { id: roadmapId },
            data:  { toolSessions: toJsonValue([...others, updatedSession]) },
          });
        }
      });

      // ---------------------------------------------------------------
      // Stage 4 — push + complete
      // ---------------------------------------------------------------
      await step.run('notify-and-complete', async () => {
        await notifyToolJobComplete({
          userId, jobId,
          toolType:  'packager_adjust',
          roadmapId, sessionId,
        });
        await completeToolJob(jobId);
      });

      log.info('[PackagerAdjustJob] Done', { round: ctx.round });
      return { ok: true, sessionId };
    } catch (err) {
      log.error(
        '[PackagerAdjustJob] Failed',
        err instanceof Error ? err : new Error(String(err)),
      );
      const errorMessage = err instanceof Error ? err.message : String(err);

      await failToolJob(jobId, err);
      await notifyToolJobFailed({
        userId, jobId,
        toolType:  'packager_adjust',
        roadmapId, sessionId,
        errorMessage,
      });

      throw err;
    }
  },
);
