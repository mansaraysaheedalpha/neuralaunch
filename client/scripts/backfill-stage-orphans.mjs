// One-off backfill for stage-row orphans in the No Idea archetype.
//
// Two known orphan classes:
//
//   A. Stage 1 committed BEFORE the lazy-create fix shipped
//      (commit f3ae4bc, 2026-05-16 22:10 UTC). 1 row affected in prod
//      as of the audit. Already backfilled by the predecessor script.
//
//   B. Stage 3 committed AT ANY TIME between Stage 3 ship (b93dd85,
//      2026-05-16) and the lazy-create fix for Stage 3 (this commit).
//      markStage3Committed never lazy-created Stage 4 — every founder
//      who reached Stage 3 commit was stuck. As of the audit, zero
//      founders had reached Stage 3 commit in prod (everyone is still
//      authoring Stage 1), so this is forward-looking — but the
//      backfill is here in case dev sessions surface the dead end.
//
// For both classes the same pattern: missing downstream row blocks the
// dispatcher's "find first non-committed" logic from advancing, so
// the founder lands on the committed view permanently.
//
// Idempotent — re-running is safe (only fires upsert for missing rows).
//
// Usage:
//   pnpm dlx dotenv-cli -e .env.local -- node ./scripts/backfill-stage-orphans.mjs
//   pnpm dlx dotenv-cli -e .env.local -- node ./scripts/backfill-stage-orphans.mjs --apply

import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const db = new PrismaClient();

const EMPTY_STAGE_STATE = {
  // Stage 2 empty shape
  2: {
    skillInventory:        null,
    expectedProfile:       [],
    constraints:           [],
    recommendedActions:    [],
    structuralBlocker:     { triggered: false, founderChoice: 'not_yet_chosen', notes: null },
    requiresRederivation:  false,
    cascadeSnapshot:       null,
  },
  // Stage 3 empty shape — the safeParse will fill in any missing optional
  // fields when the dispatcher reads the row, so the minimum shape here
  // is enough to make the row valid.
  3: {
    agentPainPoints:     [],
    founderPainPoints:   [],
    recommendedActions:  [],
    researchLog:         [],
    cascadeSnapshot:     null,
    requiresRederivation: false,
  },
  // Stage 4 empty shape
  4: {
    opportunities:             [],
    founderCommunityResponses: [],
    recommendedActions:        [],
    researchLog:               [],
    cascadeSnapshot:           null,
    requiresRederivation:      false,
  },
};

async function findOrphans(committedStage, missingStage) {
  const allRuns = await db.ideationStageRun.findMany({
    where:  { stageNumber: { in: [committedStage, missingStage] } },
    select: { sessionId: true, stageNumber: true, status: true, committedAt: true },
  });
  const bySession = new Map();
  for (const r of allRuns) {
    if (!bySession.has(r.sessionId)) bySession.set(r.sessionId, []);
    bySession.get(r.sessionId).push(r);
  }
  const orphans = [];
  for (const [sessionId, runs] of bySession) {
    const committed = runs.find(r => r.stageNumber === committedStage && r.status === 'committed');
    const missing   = runs.find(r => r.stageNumber === missingStage);
    if (committed && !missing) {
      orphans.push({ sessionId, committedAt: committed.committedAt });
    }
  }
  return orphans;
}

async function backfill(committedStage, missingStage) {
  const orphans = await findOrphans(committedStage, missingStage);
  console.log(`  Stage ${committedStage} committed without Stage ${missingStage}: ${orphans.length} orphan${orphans.length === 1 ? '' : 's'}`);
  for (const o of orphans) {
    console.log(`    sessionId=${o.sessionId}  committedAt=${o.committedAt?.toISOString() ?? 'null'}`);
  }
  if (!APPLY || orphans.length === 0) return 0;
  for (const o of orphans) {
    await db.ideationStageRun.upsert({
      where:  { sessionId_stageNumber: { sessionId: o.sessionId, stageNumber: missingStage } },
      create: {
        sessionId:   o.sessionId,
        stageNumber: missingStage,
        status:      'authoring',
        output:      EMPTY_STAGE_STATE[missingStage],
        startedAt:   new Date(),
      },
      update: {},
    });
    console.log(`    wrote Stage ${missingStage} row for sessionId=${o.sessionId}`);
  }
  return orphans.length;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write missing rows)' : 'DRY-RUN (no writes)'}`);
  console.log('');
  console.log('Scanning for orphans...');

  const checks = [
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
  ];
  let totalWritten = 0;
  for (const [committed, missing] of checks) {
    totalWritten += await backfill(committed, missing);
  }
  console.log('');
  if (!APPLY) {
    console.log('Re-run with --apply to write missing rows.');
  } else {
    console.log(`Done. Wrote ${totalWritten} row${totalWritten === 1 ? '' : 's'}.`);
  }
}

main()
  .catch((err) => { console.error('Backfill failed:', err); process.exitCode = 1; })
  .finally(() => db.$disconnect());
