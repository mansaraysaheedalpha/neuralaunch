// src/inngest/functions/roadmap-nudge-function.ts
import { inngest } from '../client';
import prisma      from '@/lib/prisma';
import { logger }  from '@/lib/logger';
import {
  StoredPhasesArraySchema,
  type StoredRoadmapPhase,
} from '@/lib/roadmap/checkin-types';

/**
 * roadmapNudgeFunction
 *
 * Once-a-day cron sweep that flags active roadmaps where an
 * in-progress task has gone stale. Sets RoadmapProgress.nudgePending
 * to true so the next time the founder opens their roadmap view, a
 * gentle prompt appears at the top.
 *
 * Definition of "active":
 *   - completedTasks < totalTasks   (the founder has not finished)
 *   - lastActivityAt is not null     (the founder has interacted at least once)
 *
 * Definition of "stale enough to nudge":
 *   - At least one task is currently 'in_progress'
 *   - The most recent activity is older than the in_progress task's
 *     time estimate (parsed loosely from the timeEstimate string)
 *   - nudgePending is currently false (do not stack)
 *   - nudgeLastSentAt is null OR > 7 days ago (no spam)
 *
 * Nudge delivery is in-app only — no email, no push, no SMS in v1.
 * The client reads nudgePending and renders the prompt.
 *
 * Idempotent: running twice on the same day is a no-op on the second
 * pass because the first pass will have set nudgePending=true (or
 * the row was not stale enough either time).
 */
export const roadmapNudgeFunction = inngest.createFunction(
  {
    id:      'roadmap-nudge-sweep',
    name:    'Roadmap — Proactive Nudge Sweep',
    retries: 2,
    triggers: [
      // Daily at 14:00 UTC — mid-afternoon for African markets, late
      // morning for European, early morning for US East. Fires when
      // founders are most likely to engage if nudged.
      { cron: '0 14 * * *' },
    ],
  },
  async ({ event, step }) => {
    const log = logger.child({ inngestFunction: 'roadmapNudge', runId: event.id });

    const candidates = await step.run('load-active-progress-rows', async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return prisma.roadmapProgress.findMany({
        where: {
          nudgePending: false,
          OR: [
            { nudgeLastSentAt: null },
            { nudgeLastSentAt: { lt: sevenDaysAgo } },
          ],
          // Avoid touching completed roadmaps. We do this with a raw
          // comparison because Prisma cannot reference another column
          // in a where clause directly; we filter in JS below.
        },
        select: {
          id:              true,
          roadmapId:       true,
          totalTasks:      true,
          completedTasks:  true,
          lastActivityAt:  true,
        },
      });
    });

    if (candidates.length === 0) {
      log.info('No nudge candidates');
      return { swept: 0, flagged: 0 };
    }

    let flagged = 0;

    for (const row of candidates) {
      // Skip completed roadmaps (filtered in JS — see comment above)
      if (row.completedTasks >= row.totalTasks) continue;

      try {
        await step.run(`evaluate-${row.roadmapId}`, async () => {
          const roadmap = await prisma.roadmap.findUnique({
            where:  { id: row.roadmapId },
            select: { phases: true },
          });
          if (!roadmap) return;

          const parsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
          if (!parsed.success) {
            log.warn('Roadmap phases failed schema parse', { roadmapId: row.roadmapId });
            return;
          }
          const phases: StoredRoadmapPhase[] = parsed.data;

          // Find the first in-progress task that has gone stale.
          // row.lastActivityAt arrives as an ISO string when this
          // function body is rehydrated by Inngest after the outer
          // step.run; coerce defensively.
          const stale = findStaleInProgressTask(phases, new Date(row.lastActivityAt));
          if (!stale) return;

          await prisma.roadmapProgress.update({
            where: { id: row.id },
            data:  {
              nudgePending:    true,
              nudgeLastSentAt: new Date(),
            },
          });

          flagged++;
          log.info('[RoadmapNudge] Flagged roadmap', {
            roadmapId:    row.roadmapId,
            staleTaskTitle: stale.taskTitle,
          });
        });
      } catch (err) {
        log.error(
          '[RoadmapNudge] Failed to evaluate roadmap',
          err instanceof Error ? err : new Error(String(err)),
          { roadmapId: row.roadmapId },
        );
      }
    }

    log.info('[RoadmapNudge] Nudge sweep complete', { swept: candidates.length, flagged });

    // -----------------------------------------------------------------
    // Concern 5 — Trigger #2: outcome prompt for stale partial completions
    //
    // Eligibility:
    //   - completedTasks / totalTasks >= 50%
    //   - lastActivityAt is more than 30 days ago
    //   - The parent recommendation has no outcome row yet
    //   - The founder has never explicitly skipped the prompt for
    //     this roadmap
    //
    // Sets RoadmapProgress.outcomePromptPending = true. The client
    // reads this flag on roadmap page load and surfaces the outcome
    // form once. The form's submit / skip handlers clear the flag.
    // -----------------------------------------------------------------
    const outcomeFlagged = await step.run('flag-outcome-prompts', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const eligible = await prisma.roadmapProgress.findMany({
        where: {
          outcomePromptPending:   false,
          outcomePromptSkippedAt: null,
          lastActivityAt:         { lt: thirtyDaysAgo },
          roadmap: {
            recommendation: {
              outcome: null,
            },
          },
        },
        select: {
          id:             true,
          roadmapId:      true,
          totalTasks:     true,
          completedTasks: true,
        },
      });

      let count = 0;
      for (const row of eligible) {
        // 50% threshold — only flag if the founder actually engaged
        // meaningfully with this roadmap. Below 50% they likely
        // never really started and the outcome prompt would feel
        // accusatory rather than honouring.
        if (row.totalTasks === 0) continue;
        if (row.completedTasks / row.totalTasks < 0.5) continue;
        // Skip already-completed (those will be picked up by
        // trigger #1 inside the status PATCH route, not here).
        if (row.completedTasks >= row.totalTasks) continue;

        await prisma.roadmapProgress.update({
          where: { id: row.id },
          data:  { outcomePromptPending: true },
        });
        count++;
        log.info('[RoadmapNudge] Outcome prompt flagged', { roadmapId: row.roadmapId });
      }
      return count;
    });

    return { swept: candidates.length, flagged, outcomeFlagged };
  },
);

// ---------------------------------------------------------------------------
// Stale-task detection
// ---------------------------------------------------------------------------

/**
 * Walk the roadmap looking for the first in-progress task whose
 * estimated duration has been exceeded since the founder's last
 * activity. The duration is parsed loosely from task.timeEstimate
 * which is a free-text string like "3 hours across 2 evenings" or
 * "1 week" — we extract the largest unit we recognise and convert
 * to milliseconds.
 *
 * Returns null when no stale in-progress task exists.
 */
function findStaleInProgressTask(
  phases:         StoredRoadmapPhase[],
  lastActivityAt: Date,
): { taskTitle: string } | null {
  const now = Date.now();
  const idleMs = now - lastActivityAt.getTime();

  for (const phase of phases) {
    for (const task of phase.tasks) {
      if (task.status !== 'in_progress') continue;
      const estimateMs = parseTimeEstimateToMs(task.timeEstimate);
      if (estimateMs == null) continue;
      if (idleMs > estimateMs) {
        return { taskTitle: task.title };
      }
    }
  }
  return null;
}

const TIME_UNIT_PATTERNS: Array<{ regex: RegExp; ms: number }> = [
  { regex: /(\d+(?:\.\d+)?)\s*(?:weeks?|wks?)\b/i,    ms: 7  * 24 * 60 * 60 * 1000 },
  { regex: /(\d+(?:\.\d+)?)\s*(?:days?)\b/i,           ms:      24 * 60 * 60 * 1000 },
  { regex: /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i,    ms:           60 * 60 * 1000 },
  { regex: /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/i, ms:                60 * 1000 },
];

function parseTimeEstimateToMs(text: string): number | null {
  for (const { regex, ms } of TIME_UNIT_PATTERNS) {
    const m = text.match(regex);
    if (m) {
      const value = parseFloat(m[1]);
      if (Number.isFinite(value)) return value * ms;
    }
  }
  return null;
}
