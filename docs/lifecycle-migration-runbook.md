# Lifecycle Memory Migration Runbook

## Overview

This runbook covers the data migration from the flat recommendation/roadmap
structure to the Venture → Cycle hierarchy with FounderProfile and
CycleSummary generation.

**Prerequisites:**
- Phase 1 Prisma migration deployed (`20260417100000_add_lifecycle_memory`)
- Phase 7 Lifecycle Transition Engine deployed (Inngest function registered)
- All application code from Phases 2-6 deployed

## Step 1 — Deploy Schema Migration

The Prisma migration adds three new tables (FounderProfile, Venture, Cycle)
and two nullable FK columns (Recommendation.cycleId, Roadmap.ventureId).
All additions are backwards-compatible — existing data is untouched.

```bash
# Vercel auto-runs prisma migrate deploy on deployment.
# If running manually:
cd client && pnpm exec prisma migrate deploy
```

**Verify:** all three tables exist and are empty.

## Step 2 — Deploy Application Code

Deploy all Phases 1-7 code. The new lifecycle code paths are dormant
until data exists in the new tables:
- Interview agent: loads FounderProfile (null for all users — no change)
- Synthesis agent: loads lifecycle block (empty — no change)
- Check-in agent: loads profile block (empty — no change)
- Lifecycle Transition Engine: registered but no events to trigger it

**Verify:** the app works identically to before. No regressions.

## Step 3 — Run Backfill (Dry Run)

```bash
cd client
pnpm tsx scripts/lifecycle/backfill.ts
```

This prints what WOULD happen without writing anything. Review the output:
- Each user's roadmaps grouped into ventures
- Chain detection via parentRoadmapId
- Cycle numbering within each venture
- Which cycles would be marked as completed

**Expected:** ventures map 1:1 with recommendation lineages. A user
with one recommendation has one venture with one cycle. A user with a
fork continuation chain has one venture with multiple cycles.

## Step 4 — Run Backfill (Apply)

```bash
pnpm tsx scripts/lifecycle/backfill.ts --apply
```

This creates Venture + Cycle records and links existing Recommendation
and Roadmap rows. Does NOT generate summaries or profiles yet.

**Verify:**
- `SELECT COUNT(*) FROM "Venture"` matches expected count
- `SELECT COUNT(*) FROM "Cycle"` matches expected count
- Spot-check: a few recommendations have non-null `cycleId`
- Spot-check: a few roadmaps have non-null `ventureId`
- App still works — no regressions

## Step 5 — Queue Retroactive Summary Generation

Only run this AFTER verifying the Lifecycle Transition Engine works
for at least one new cycle completion (i.e., a real user completes a
continuation brief and the Inngest dashboard shows both steps succeeded).

```bash
pnpm tsx scripts/lifecycle/backfill.ts --apply --queue-summaries
```

This emits `neuralaunch/cycle.completing` events for every completed
cycle. The Lifecycle Transition Engine processes them:
- Step 1: generates CycleSummary from the existing data (Haiku call)
- Step 2: upserts FounderProfile from belief state + summary (Haiku call)

**Monitor:** Inngest dashboard → look for `lifecycle-transition` function
runs. Check for failures. Each run should complete in < 30 seconds.

**Verify:**
- `SELECT COUNT(*) FROM "Cycle" WHERE summary IS NOT NULL` grows
- `SELECT COUNT(*) FROM "FounderProfile"` grows
- Spot-check a FounderProfile row: parse the JSON, verify it matches
  the FounderProfileSchema structure

## Step 6 — Verify End-to-End

1. As a backfilled user, start a new discovery session with
   `scenario: 'fresh_start'`. Verify the interview acknowledges
   prior ventures.
2. Complete a full cycle and verify the Lifecycle Transition Engine
   fires automatically (not from backfill).
3. Check the Inngest dashboard for both `generate-cycle-summary` and
   `update-founder-profile` steps completing successfully.

## Rollback

The migration is backwards-compatible. If issues arise:
1. The new tables and columns are ignored by pre-lifecycle code
2. Setting `lifecycleScenario` to undefined in the interview state
   makes the interview run as before
3. The Inngest function can be disabled from the Inngest dashboard
   without a code deploy

To fully remove (last resort):
```sql
-- Drop the new tables (CASCADE removes foreign key constraints)
DROP TABLE IF EXISTS "Cycle" CASCADE;
DROP TABLE IF EXISTS "Venture" CASCADE;
DROP TABLE IF EXISTS "FounderProfile" CASCADE;
-- Remove the new columns
ALTER TABLE "Recommendation" DROP COLUMN IF EXISTS "cycleId";
ALTER TABLE "Roadmap" DROP COLUMN IF EXISTS "ventureId";
```

## Cost Estimate

The --queue-summaries step runs two Haiku calls per completed cycle:
- ~$0.001 per cycle summary (small context, fast extraction)
- ~$0.001 per profile update

For 100 completed cycles across all users: ~$0.20 total.
For 1000 completed cycles: ~$2.00 total.
