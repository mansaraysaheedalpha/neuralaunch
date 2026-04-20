// src/inngest/functions/backfill-roadmap-task-ids-function.ts
//
// One-shot Inngest backfill that mints deterministic task ids for
// legacy roadmaps generated BEFORE RoadmapTaskSchema.id was added
// (packages/api-types/src/roadmap.ts). Idempotent: rows that already
// have ids on every task are skipped entirely.
//
// Triggered manually from the Inngest dashboard via the named event.
// No cron — this is a one-time migration, not a recurring sweep. Safe
// to re-run if something goes wrong; the idempotency check prevents
// double-writes.

import 'server-only';
import { inngest } from '../client';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { mintTaskId } from '@/lib/roadmap/roadmap-engine';

interface LegacyTask {
  id?: string;
  title?: string;
  [key: string]: unknown;
}

interface LegacyPhase {
  phase: number;
  tasks: LegacyTask[];
  [key: string]: unknown;
}

export const backfillRoadmapTaskIdsFunction = inngest.createFunction(
  {
    id:      'backfill-roadmap-task-ids',
    name:    'Roadmap — Backfill task ids on legacy roadmaps',
    retries: 1,
    triggers: [{ event: 'neuralaunch/backfill.roadmap-task-ids' }],
  },
  async ({ step }) => {
    const log = logger.child({ inngestFunction: 'backfillRoadmapTaskIds' });

    const roadmaps = await step.run('load-roadmaps', async () =>
      prisma.roadmap.findMany({ select: { id: true, phases: true } }),
    );

    let scanned = 0;
    let updated = 0;
    let taskIdsMinted = 0;

    for (const row of roadmaps) {
      scanned++;

      // phases is Prisma JsonValue — coerce through unknown and then
      // our LegacyPhase shape. Any row whose phases aren't an array
      // of objects is skipped defensively (nothing to mint).
      const phases = row.phases as unknown;
      if (!Array.isArray(phases)) continue;

      let changed = false;
      const nextPhases = (phases as LegacyPhase[]).map(phase => {
        if (!Array.isArray(phase.tasks)) return phase;
        const nextTasks = phase.tasks.map((task, idx) => {
          if (typeof task.id === 'string' && task.id.length > 0) return task;
          taskIdsMinted++;
          changed = true;
          return { ...task, id: mintTaskId(phase.phase, idx) };
        });
        return { ...phase, tasks: nextTasks };
      });

      if (!changed) continue;

      await prisma.roadmap.update({
        where: { id: row.id },
        data:  { phases: nextPhases as object[] },
      });
      updated++;
    }

    log.info('[BackfillRoadmapTaskIds] complete', { scanned, updated, taskIdsMinted });

    return { scanned, updated, taskIdsMinted };
  },
);
