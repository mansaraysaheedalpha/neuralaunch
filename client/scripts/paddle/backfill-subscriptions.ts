#!/usr/bin/env tsx
// scripts/paddle/backfill-subscriptions.ts
//
// Creates a virtual free-tier Subscription row for every existing User
// that does not yet have one. This is the bridge migration for rolling
// out Paddle-gated tiers to users who signed up before the billing
// system existed — every user ends up with a Subscription row, so the
// session callback and requireTierOrThrow() can treat every user
// uniformly (tier defaults to 'free' for the legacy rows).
//
// IDEMPOTENT: users that already have a Subscription row are skipped.
// Safe to run multiple times, safe to resume.
//
// Usage:
//   pnpm tsx scripts/paddle/backfill-subscriptions.ts             # dry run
//   pnpm tsx scripts/paddle/backfill-subscriptions.ts --apply      # write
//
// Run order: do NOT run this script until AFTER the Paddle integration
// has been deployed and Phase 14 is live. Running earlier creates
// Subscription rows that the session callback then reads, which is
// harmless but pollutes telemetry for the rollout window.

import prisma from '../../src/lib/prisma';

const SENTINEL_PERIOD_END = new Date('2099-12-31T00:00:00Z');

async function main() {
  const apply = process.argv.includes('--apply');

  const users = await prisma.user.findMany({
    where:  { subscription: null },
    select: { id: true },
  });

  console.log(
    `[paddle:backfill] Found ${users.length} user(s) without a Subscription row${apply ? '' : ' (dry run — pass --apply to write)'}.`,
  );

  if (users.length === 0) {
    console.log('[paddle:backfill] Nothing to do.');
    return;
  }

  if (!apply) {
    console.log('[paddle:backfill] Sample of affected users:');
    users.slice(0, 10).forEach((u) => console.log(`  - ${u.id}`));
    if (users.length > 10) {
      console.log(`  … and ${users.length - 10} more`);
    }
    return;
  }

  let created = 0;
  let skipped = 0;
  const start = Date.now();

  for (const user of users) {
    // createMany with skipDuplicates could be faster but we want
    // per-row error visibility during the one-shot migration. The
    // loop is also idempotency-proof: upsert keyed on userId means a
    // concurrent run cannot create duplicates.
    const virtualPaddleSubId = `legacy_free_${user.id}`;
    const result = await prisma.subscription.upsert({
      where:  { userId: user.id },
      update: {},
      create: {
        userId:               user.id,
        paddleSubscriptionId: virtualPaddleSubId,
        paddleCustomerId:     '',
        status:               'active',
        tier:                 'free',
        currentPeriodEnd:     SENTINEL_PERIOD_END,
      },
    });

    if (result.paddleSubscriptionId === virtualPaddleSubId) {
      created++;
    } else {
      skipped++;
    }

    if ((created + skipped) % 100 === 0) {
      console.log(`[paddle:backfill] Progress: ${created} created, ${skipped} skipped…`);
    }
  }

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `[paddle:backfill] Done — ${created} created, ${skipped} skipped, ${elapsedSec}s.`,
  );
}

main()
  .catch((err) => {
    console.error('[paddle:backfill] FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
