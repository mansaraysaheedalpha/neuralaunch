// src/inngest/functions/lifecycle-transition-function.ts
//
// The Lifecycle Transition Engine. Triggered by the continuation
// brief function emitting neuralaunch/cycle.completing. Runs two
// chained Haiku calls:
//   1. generateCycleSummary — compress the cycle into CycleSummary
//   2. updateFounderProfile — patch the Founder Profile with cycle
//      learnings and calibration
//
// Job 1 MUST complete before Job 2 runs (the profile update uses the
// summary as input). Inngest's step.run chaining enforces this.

import { inngest } from '../client';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { loadCycleSummaryGeneratorContext } from '@/lib/lifecycle/context-loaders';
import { getFounderProfile, upsertFounderProfile } from '@/lib/lifecycle/profile';
import { generateCycleSummaryFromContext } from '@/lib/lifecycle/engines/generate-cycle-summary';
import { updateFounderProfileFromCycle } from '@/lib/lifecycle/engines/update-founder-profile';

export const lifecycleTransitionFunction = inngest.createFunction(
  {
    id:       'lifecycle-transition',
    name:     'Lifecycle — Cycle Completion Processor',
    retries:  2,
    timeouts: { start: '5m' },
    triggers: [{ event: 'neuralaunch/cycle.completing' }],
  },
  async ({ event, step }) => {
    const { cycleId, userId, ventureId } = event.data as {
      cycleId:   string;
      userId:    string;
      ventureId: string;
    };
    const log = logger.child({
      inngestFunction: 'lifecycleTransition',
      cycleId,
      userId,
      ventureId,
      runId: event.id,
    });

    // Step 1 — Generate the Cycle Summary (Haiku)
    const cycleSummary = await step.run('generate-cycle-summary', async () => {
      const cycle = await prisma.cycle.findUnique({
        where:  { id: cycleId },
        select: { cycleNumber: true },
      });
      if (!cycle) throw new Error(`Cycle ${cycleId} not found`);

      const ctx = await loadCycleSummaryGeneratorContext(cycleId);
      const summary = await generateCycleSummaryFromContext(ctx, cycle.cycleNumber);

      await prisma.cycle.update({
        where: { id: cycleId },
        data:  {
          summary:     toJsonValue(summary),
          status:      'completed',
          completedAt: new Date(),
        },
      });

      log.info('[LifecycleTransition] Cycle summary generated and persisted', {
        cycleNumber: cycle.cycleNumber,
        completionPct: summary.execution.completionPercentage,
      });

      return summary;
    });

    // Step 2 — Update the Founder Profile (Haiku)
    await step.run('update-founder-profile', async () => {
      const currentProfile = await getFounderProfile(userId);

      // Load the belief state from the cycle's recommendation's
      // discovery session for profile bootstrapping (first cycle).
      const cycle = await prisma.cycle.findUnique({
        where:  { id: cycleId },
        select: {
          recommendation: {
            select: {
              session: { select: { beliefState: true } },
            },
          },
        },
      });
      const beliefState = cycle?.recommendation?.session?.beliefState as Record<string, unknown> | null ?? null;

      // Active venture names for the profile's currentSituation.
      const activeVentures = await prisma.venture.findMany({
        where:  { userId, status: 'active' },
        select: { name: true },
      });
      const activeVentureNames = activeVentures.map(v => v.name);

      const updatedProfile = await updateFounderProfileFromCycle({
        currentProfile,
        cycleSummary,
        beliefState,
        activeVentureNames,
      });

      await upsertFounderProfile(userId, updatedProfile, cycleId);

      log.info('[LifecycleTransition] Founder profile updated', {
        speedMultiplier: updatedProfile.behaviouralCalibration.realSpeedMultiplier,
        completedCycles: updatedProfile.journeyOverview.completedCycles,
        isBootstrap:     !currentProfile,
      });
    });

    return { cycleId, status: 'complete' };
  },
);
