# Paddle Integration — Migration Runbook

This runbook covers the one-time data migration required when rolling
the Paddle billing integration to production. It assumes the code for
Phases 1–14 is already deployed; the script only mutates data.

---

## 1. What the script does

`client/scripts/paddle/backfill-subscriptions.ts` creates a virtual
free-tier `Subscription` row for every existing `User` who does not yet
have one. After it runs, every user has a `Subscription` row, so:

- The session callback always finds a row and stamps `session.user.tier`.
- `requireTierOrThrow()` has a uniform decision path (no null-vs-free
  branching required).
- Operational queries (`SELECT COUNT(*) FROM Subscription WHERE tier = ...`)
  return accurate totals.

The virtual rows use:

| Column                | Value                        |
|-----------------------|------------------------------|
| `paddleSubscriptionId`| `legacy_free_<userId>`       |
| `paddleCustomerId`    | `''` (empty string)          |
| `status`              | `active`                     |
| `tier`                | `free`                       |
| `priceId`             | `null`                       |
| `currentPeriodEnd`    | `2099-12-31T00:00:00Z`       |
| `isFoundingMember`    | `false`                      |
| `cancelAtPeriodEnd`   | `false`                      |

The sentinel `paddleSubscriptionId` prefix (`legacy_free_`) makes
virtual rows trivially distinguishable from real Paddle-minted rows in
SQL (`WHERE paddleSubscriptionId LIKE 'legacy_free_%'`).

---

## 2. Idempotency

Running the script twice is safe:

- It queries `prisma.user.findMany({ where: { subscription: null } })`,
  so users already carrying a Subscription row are excluded from the
  outer loop entirely.
- The inner write is a `prisma.subscription.upsert` keyed on `userId`
  (which is `@unique` on the table), so even a concurrent retry cannot
  create a duplicate.

The script is also safe to resume after a crash — rerun with `--apply`.

---

## 3. When to run

Run AFTER the following are all true:

1. The Paddle integration branch is merged into `main` and deployed.
2. Phase 14 (pricing page wired to checkout) is live in production.
3. The Paddle production account is approved and the three server env
   vars (`PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`,
   `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENV`) are set
   to production values.

Running the script BEFORE Phase 14 is live is harmless but pollutes
telemetry for the rollout window — the `Subscription` rows will exist
before the pricing UI is visible to users. If in doubt, wait.

---

## 4. How to run

### Dry run (recommended first pass)

```bash
cd client
pnpm tsx scripts/paddle/backfill-subscriptions.ts
```

The dry run prints a count of affected users plus a sample of the first
ten user ids. No rows are written.

### Apply

```bash
cd client
pnpm tsx scripts/paddle/backfill-subscriptions.ts --apply
```

Progress is logged every 100 users. Expect roughly a few hundred
users per second on a warm Postgres connection — a cohort of tens of
thousands finishes in under a minute.

### Against production

Point `DATABASE_URL` at the production database (read it from the
Vercel project's production environment via `vercel env pull`), then
run the apply command. The script does not touch any other database
and does not call Paddle.

---

## 5. Verification

After a successful apply, expect:

```sql
-- Every user has exactly one Subscription row
SELECT COUNT(*) FROM "User";
SELECT COUNT(*) FROM "Subscription";

-- Legacy free rows match (User.count - pre-existing paid rows)
SELECT COUNT(*) FROM "Subscription"
WHERE "paddleSubscriptionId" LIKE 'legacy_free_%';

-- No duplicates
SELECT "userId", COUNT(*) FROM "Subscription"
GROUP BY "userId" HAVING COUNT(*) > 1;
-- Expect zero rows.
```

Smoke-test the app:

- Sign in as a legacy user — `session.user.tier` should be `'free'`.
- Hit a Execute-gated route (e.g. `POST /api/discovery/recommendations/[id]/roadmap`).
  Expect `403 — This feature requires an Execute or Compound
  subscription.` rather than a 500.

---

## 6. Rollback

The backfill adds rows only — it does not modify existing data. To
rollback, delete the legacy rows:

```sql
DELETE FROM "Subscription"
WHERE "paddleSubscriptionId" LIKE 'legacy_free_%';
```

This returns the system to the pre-backfill state. Users who had real
paid subscriptions (not `legacy_free_%`) are untouched.
