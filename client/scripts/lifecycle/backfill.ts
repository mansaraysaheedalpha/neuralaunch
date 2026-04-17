#!/usr/bin/env tsx
// scripts/lifecycle/backfill.ts
//
// Migration backfill for the lifecycle memory architecture. Groups
// existing recommendations into Ventures (by roadmap parentRoadmapId
// chain), creates Cycle records within each Venture, and optionally
// queues batch Inngest jobs for retroactive CycleSummary generation
// and FounderProfile bootstrapping.
//
// IDEMPOTENT: uses upsert patterns throughout. Running twice does not
// create duplicate records. Safe to resume from partial state.
//
// Usage:
//   pnpm tsx scripts/lifecycle/backfill.ts           # dry run
//   pnpm tsx scripts/lifecycle/backfill.ts --apply    # actually write
//   pnpm tsx scripts/lifecycle/backfill.ts --apply --queue-summaries
//
// The --queue-summaries flag emits neuralaunch/cycle.completing events
// for completed cycles so the Lifecycle Transition Engine generates
// retroactive summaries and bootstraps profiles. Only use AFTER the
// Phase 7 Inngest function is deployed and verified.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes('--apply');
const QUEUE_SUMMARIES = process.argv.includes('--queue-summaries');

interface RoadmapRow {
  id: string;
  userId: string;
  recommendationId: string;
  parentRoadmapId: string | null;
  createdAt: Date;
  ventureId: string | null;
  continuationBrief: unknown;
  recommendation: {
    id: string;
    path: string;
    summary: string;
    cycleId: string | null;
  };
  progress: {
    completedTasks: number;
    totalTasks: number;
  } | null;
}

async function main() {
  console.log(`\n=== Lifecycle Memory Backfill ${DRY_RUN ? '(DRY RUN)' : '(APPLYING)'} ===\n`);

  // Load all roadmaps with their recommendations
  const roadmaps = await prisma.roadmap.findMany({
    select: {
      id: true, userId: true, recommendationId: true,
      parentRoadmapId: true, createdAt: true, ventureId: true,
      continuationBrief: true,
      recommendation: { select: { id: true, path: true, summary: true, cycleId: true } },
      progress: { select: { completedTasks: true, totalTasks: true } },
    },
    orderBy: { createdAt: 'asc' },
  }) as unknown as RoadmapRow[];

  console.log(`Found ${roadmaps.length} roadmaps across all users`);

  // Group roadmaps by user
  const byUser = new Map<string, RoadmapRow[]>();
  for (const rm of roadmaps) {
    const list = byUser.get(rm.userId) ?? [];
    list.push(rm);
    byUser.set(rm.userId, list);
  }

  let totalVentures = 0;
  let totalCycles = 0;
  let totalSkipped = 0;
  const cyclesToQueue: Array<{ cycleId: string; userId: string; ventureId: string }> = [];

  for (const [userId, userRoadmaps] of byUser) {
    console.log(`\nUser ${userId}: ${userRoadmaps.length} roadmaps`);

    // Build the parentRoadmapId chains. Each chain is a venture.
    // A root roadmap has parentRoadmapId = null. Following children
    // via parentRoadmapId builds the chain forward.
    const byId = new Map(userRoadmaps.map(r => [r.id, r]));
    const visited = new Set<string>();

    // Find root roadmaps (no parent or parent not in this user's set)
    const roots = userRoadmaps.filter(r =>
      !r.parentRoadmapId || !byId.has(r.parentRoadmapId),
    );

    for (const root of roots) {
      // Walk the chain forward from root
      const chain: RoadmapRow[] = [];
      let current: RoadmapRow | undefined = root;
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        chain.push(current);
        // Find the child that points back to this roadmap
        current = userRoadmaps.find(r =>
          r.parentRoadmapId === current!.id && !visited.has(r.id),
        );
      }

      if (chain.length === 0) continue;

      // Skip if already backfilled (first roadmap already has a ventureId)
      if (chain[0].ventureId && chain[0].recommendation.cycleId) {
        console.log(`  Venture for "${chain[0].recommendation.path.slice(0, 50)}" — already backfilled, skipping`);
        totalSkipped++;
        continue;
      }

      // Create the Venture
      const ventureName = chain[0].recommendation.summary.slice(0, 120) || chain[0].recommendation.path.slice(0, 120);
      console.log(`  Creating venture: "${ventureName.slice(0, 60)}..." (${chain.length} cycle${chain.length > 1 ? 's' : ''})`);

      let ventureId: string;
      if (!DRY_RUN) {
        const venture = await prisma.venture.upsert({
          where: { id: `backfill_${chain[0].id}` }, // Deterministic ID for idempotency
          create: {
            id: `backfill_${chain[0].id}`,
            userId,
            name: ventureName,
            status: 'active',
          },
          update: { name: ventureName },
        });
        ventureId = venture.id;
      } else {
        ventureId = `dry_${chain[0].id}`;
      }
      totalVentures++;

      // Create Cycles for each roadmap in the chain
      for (let i = 0; i < chain.length; i++) {
        const rm = chain[i];
        const cycleNumber = i + 1;
        const isCompleted = rm.continuationBrief != null
          || (rm.progress && rm.progress.completedTasks >= rm.progress.totalTasks);

        console.log(`    Cycle ${cycleNumber}: "${rm.recommendation.path.slice(0, 50)}" — ${isCompleted ? 'completed' : 'in progress'}`);

        let cycleId: string;
        if (!DRY_RUN) {
          const cycle = await prisma.cycle.upsert({
            where: { id: `backfill_cycle_${rm.id}` },
            create: {
              id: `backfill_cycle_${rm.id}`,
              ventureId,
              cycleNumber,
              status: isCompleted ? 'completed' : 'in_progress',
              roadmapId: rm.id,
              completedAt: isCompleted ? rm.createdAt : null,
            },
            update: {
              cycleNumber,
              status: isCompleted ? 'completed' : 'in_progress',
              roadmapId: rm.id,
            },
          });
          cycleId = cycle.id;

          // Link the recommendation to this cycle
          await prisma.recommendation.update({
            where: { id: rm.recommendationId },
            data: { cycleId },
          });

          // Link the roadmap to this venture
          await prisma.roadmap.update({
            where: { id: rm.id },
            data: { ventureId },
          });

          // Update venture's currentCycleId if this is the latest
          if (i === chain.length - 1) {
            await prisma.venture.update({
              where: { id: ventureId },
              data: {
                currentCycleId: cycleId,
                status: isCompleted ? 'completed' : 'active',
              },
            });
          }
        } else {
          cycleId = `dry_cycle_${rm.id}`;
        }
        totalCycles++;

        // Queue summary generation for completed cycles
        if (isCompleted && QUEUE_SUMMARIES) {
          cyclesToQueue.push({ cycleId, userId, ventureId });
        }
      }
    }

    // Handle any roadmaps not in a chain (orphans)
    for (const rm of userRoadmaps) {
      if (!visited.has(rm.id)) {
        console.log(`  Orphan roadmap ${rm.id} — creating standalone venture`);
        // Same logic as above but for single-roadmap ventures
        if (!DRY_RUN) {
          const venture = await prisma.venture.upsert({
            where: { id: `backfill_${rm.id}` },
            create: {
              id: `backfill_${rm.id}`,
              userId,
              name: rm.recommendation.summary.slice(0, 120) || rm.recommendation.path.slice(0, 120),
              status: 'active',
            },
            update: {},
          });
          const cycle = await prisma.cycle.upsert({
            where: { id: `backfill_cycle_${rm.id}` },
            create: {
              id: `backfill_cycle_${rm.id}`,
              ventureId: venture.id,
              cycleNumber: 1,
              status: 'in_progress',
              roadmapId: rm.id,
            },
            update: {},
          });
          await prisma.recommendation.update({
            where: { id: rm.recommendationId },
            data: { cycleId: cycle.id },
          });
          await prisma.roadmap.update({
            where: { id: rm.id },
            data: { ventureId: venture.id },
          });
          await prisma.venture.update({
            where: { id: venture.id },
            data: { currentCycleId: cycle.id },
          });
        }
        totalVentures++;
        totalCycles++;
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Users processed: ${byUser.size}`);
  console.log(`Ventures created: ${totalVentures}`);
  console.log(`Cycles created: ${totalCycles}`);
  console.log(`Skipped (already backfilled): ${totalSkipped}`);
  console.log(`Cycles queued for summary generation: ${cyclesToQueue.length}`);

  if (cyclesToQueue.length > 0 && !DRY_RUN) {
    console.log(`\nTo queue summary generation, run with --queue-summaries.`);
    console.log(`This will emit neuralaunch/cycle.completing events for each`);
    console.log(`completed cycle, triggering the Lifecycle Transition Engine.`);
    console.log(`Make sure Phase 7 is deployed first.`);

    if (QUEUE_SUMMARIES) {
      // Dynamic import to avoid pulling Inngest into the backfill
      // when summary queuing is not requested.
      const { inngest } = await import('@/inngest/client');
      console.log('\nQueuing events...');
      for (const { cycleId, userId, ventureId } of cyclesToQueue) {
        await inngest.send({
          name: 'neuralaunch/cycle.completing',
          data: { cycleId, userId, ventureId },
        });
        console.log(`  Queued: cycleId=${cycleId}`);
      }
      console.log(`Done. ${cyclesToQueue.length} events queued.`);
    }
  }

  if (DRY_RUN) {
    console.log(`\nThis was a DRY RUN. No data was written.`);
    console.log(`Run with --apply to actually write.`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
