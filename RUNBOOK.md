# NeuraLaunch — Production Incident Runbook

> On-call playbook. Open this when production is broken.
> Every section is structured: **Symptom / Likely Cause / Diagnosis / Fix.**
> Every command, path, and SQL statement is real — no placeholders.

---

## 1. How to use this runbook

Consult this document the moment something in production looks wrong — a 5xx alert, a Sentry email, a founder-reported bug, a stuck Inngest run, or a failed Vercel deploy. Use the **Quick Reference** in section 2 to jump to the right playbook in seconds. Every playbook follows the **Symptom / Likely Cause / Diagnosis / Fix** convention so you can triage without re-reading.

When a new incident class occurs that isn't already in here, add a new entry to section 5 in the same format and add a row to section 2's table. Do not let this document drift — a runbook that lies is worse than no runbook.

---

## 2. Quick reference

| Symptom | Section |
|---|---|
| Vercel build fails with `P3009` | 5a |
| 500 from a `generateObject` route, log mentions "Grammar compilation timed out" | 5b |
| 504 / "Task timed out after N seconds" | 5c |
| Recommendation / roadmap / validation report never appears | 5d |
| Logs show `[session-store] Redis unavailable — falling back to Prisma` | 5e |
| `/api/auth/*` 500s, sign-in broken | 5f |
| `RecommendationOutcome` row with `consentedToTraining=false` and non-null `anonymisedRecord` | 5g |
| Pushback widget missing on `/discovery/recommendation` | 5h |
| Sentry email about a new error class | 5i |
| Stuck `DiscoverySession` with `status='ACTIVE'` for hours | 6 (query) |
| Need to fix npm-corrupted node_modules locally | 7 |
| Need to know what NEVER to do under pressure | 8 |

---

## 3. Production endpoints and dashboards

- **Production URL:** https://startupvalidator.app
- **Vercel dashboard:** https://vercel.com/dashboard — project name `neuralaunch` (or `client` depending on the import). Filter by domain `startupvalidator.app` to confirm. The `main` branch is the production deployment; `dev` and `chore/codebase-cleanup-and-bulletproofing` produce preview deploys.
- **Neon Postgres:** https://console.neon.tech — the project has separate **dev** and **production** branches. Production is the branch attached to the `DATABASE_URL` in Vercel's Production environment. **Always confirm which branch you're connected to in the Neon SQL editor before running an UPDATE.**
- **Inngest dashboard:** https://app.inngest.com — app id `neuralaunch-agent` (declared in `client/src/inngest/client.ts`). Use the **Runs** tab and filter by event name to find a stuck run. Event names live in `src/inngest/client.ts` and are listed in section 5d.
- **Sentry:** https://sentry.io — project `neuralaunch`. Most route handler errors flow through `httpErrorToResponse` (commit `6db8292`) and so also appear in Vercel logs.
- **Upstash Redis:** https://console.upstash.com — the discovery session store uses key prefix `discovery:session:` (verified in `client/src/lib/discovery/constants.ts:188` as `SESSION_KEY_PREFIX`). TTL is 15 minutes sliding (`SESSION_TTL_SECONDS`).
- **Anthropic console:** https://console.anthropic.com — usage and rate limits.
- **Anthropic status page:** https://status.anthropic.com — first stop for any "AI calls suddenly failing across the board".

---

## 4. Deploy pipeline

Branch flow during the cleanup-and-bulletproofing phase:

```
chore/codebase-cleanup-and-bulletproofing  →  dev  →  main
```

- All three branches auto-deploy on Vercel.
- `chore/...` and `dev` produce **preview** deployments.
- **Production deploys land only when something is merged to `main`.**
- Vercel runs `pnpm build` which runs `prisma migrate deploy && prisma generate && next build` (see `client/package.json` line 7). A failed migration at deploy time will block the build — see playbook 5a.
- **Never** push directly to `main`. **Never** force-push to `main`.

---

## 5. Incident playbooks

### 5a. Prisma migration P3009 failure on Vercel build

**Symptom**
Vercel build log contains:
```
Error: P3009: migrate found failed migrations in the target database
```
The build fails before `next build` even runs.

**Likely cause**
A prior deploy crashed mid-migration (timeout, Neon hiccup, dropped connection). Postgres rolled back the transaction but Prisma left a row in `_prisma_migrations` with `finished_at = NULL`. On the next deploy, `prisma migrate deploy` refuses to proceed until that row is resolved.

**Diagnosis**

In the Neon SQL editor (production branch), find the failed migration:

```sql
SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, logs
FROM "_prisma_migrations"
WHERE finished_at IS NULL
ORDER BY started_at DESC;
```

Then determine whether the schema changes from that migration are **already applied**. Open the migration's SQL file under `client/prisma/migrations/<name>/migration.sql` and check whether the columns/tables/indexes it declares actually exist. Example query for an outcome-capture migration:

```sql
-- Are the outcome-capture columns already present?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'RecommendationOutcome'
  AND column_name IN ('consentedToTraining', 'anonymisedRecord', 'outcomeStatus');

-- Does a specific table exist yet?
SELECT to_regclass('"RecommendationOutcome"');
```

**Fix**

Two paths — pick based on what you found in the diagnosis:

1. **Schema changes ARE present** → mark the migration applied. Either via Prisma:
   ```bash
   cd client && pnpm prisma migrate resolve --applied <migration_name>
   ```
   Or directly in SQL if you can't run Prisma against production:
   ```sql
   UPDATE "_prisma_migrations"
      SET finished_at = NOW(),
          logs = NULL,
          rolled_back_at = NULL,
          applied_steps_count = 1
    WHERE migration_name = '<migration_name>'
      AND finished_at IS NULL;
   ```

2. **Schema changes are NOT present** → mark the migration rolled back so the next deploy retries it cleanly:
   ```bash
   cd client && pnpm prisma migrate resolve --rolled-back <migration_name>
   ```

Then re-trigger the Vercel deploy from the dashboard.

**Critical:** never blindly UPDATE `_prisma_migrations` to "make the build green". If the schema changes are not actually present, marking applied will silently desync Prisma's view of the database from reality and the next migration to touch the same table will explode.

---

### 5b. Anthropic structured output: "Grammar compilation timed out"

**Symptom**
A route that calls `generateObject` returns 500. Vercel log entry contains:
```
AI_APICallError: Grammar compilation timed out.
```

**Likely cause**
Anthropic-side, transient. Their structured-output grammar compiler times out under load. The Zod schema is **not** the problem — the same schema works seconds later.

**Diagnosis**
1. Check https://status.anthropic.com.
2. Search Vercel logs across the last hour for the literal string `Grammar compilation timed out` to see whether multiple `generateObject` sites are failing concurrently. If yes → confirmed Anthropic-side.

**Fix**
The pushback engine is currently the **only** site with a narrow retry shim for this error. See `client/src/lib/discovery/pushback-engine.ts` around line 291–313 — it matches `/grammar compilation timed out/i` against `err.message` and retries once.

If a different `generateObject` site starts hitting this in production:
1. Short term — copy the same regex-targeted retry pattern to that site (NOT a blanket retry; we only retry on this exact error class).
2. Long term — the centralised resilience pass in **Stage 7** of the bulletproofing plan will move all `generateObject` callers behind one wrapper that handles this transparently.

Do **not** "fix" the Zod schema. The schema is correct. Touching it will create real bugs.

---

### 5c. Vercel function timeout (504 / "Task timed out")

**Symptom**
Client request hangs and eventually returns 504. Vercel function log:
```
Vercel Runtime Timeout Error: Task timed out after Ns
```

**Likely cause**
Either the route does not declare `maxDuration` at all (defaults to 10s on Hobby, 15s on Pro), or its declared value is below the worst-case observed latency for that route's AI call.

**Diagnosis**
Open the route file and check the top-level `export const maxDuration`. Current verified values:

| Route | maxDuration | File |
|---|---|---|
| Discovery turn | 90 | `client/src/app/api/discovery/sessions/[sessionId]/turn/route.ts:24` |
| Pushback | 180 | `client/src/app/api/discovery/recommendations/[id]/pushback/route.ts:15` |
| Outcome capture | 30 | `client/src/app/api/discovery/recommendations/[id]/outcome/route.ts:19` |
| Roadmap task check-in | 60 | `client/src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/checkin/route.ts:29` |
| Roadmap task status | 30 | `client/src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/status/route.ts:25` |

The Vercel Pro plan caps `maxDuration` at **300 seconds**. Anything that needs longer must move to Inngest — synthesis, roadmap generation, and pushback alternative generation already do (see section 5d).

**Fix**
Raise the value to the next safe ceiling and add a comment above it documenting the worst-case observed latency that justifies the new value. Example:
```ts
// Worst case observed: 142s during Anthropic congestion 2026-03-15.
// Pushback may regenerate the entire recommendation patch.
export const maxDuration = 180;
```
If the worst-case latency exceeds 300s, the work belongs in Inngest, not in a route handler. Do not raise past 300.

---

### 5d. Inngest function failure / stuck run

**Symptom**
A founder accepts a recommendation and the roadmap never appears, or completes a synthesis-eligible interview and the recommendation never lands, or a validation page goes a full reporting cycle with no `ValidationReport` row.

**Likely cause**
A step inside the responsible Inngest function threw an error and exhausted retries, or the worker is rate-limited by Anthropic.

**Diagnosis**
Open the Inngest dashboard → **Runs** tab → filter by event name. The four event names and their consumers (declared in `client/src/inngest/client.ts`):

| Event | Consumer | Triggered by |
|---|---|---|
| `discovery/synthesis.requested` | `discoverySessionFunction` | Discovery turn route when belief state is ready |
| `discovery/roadmap.requested` | `roadmapGenerationFunction` | Synthesis warm-up step + recommendation accept |
| `discovery/pushback.alternative.requested` | `pushbackAlternativeFunction` | HARD_CAP_ROUND closing pushback turn |
| `validation/report.requested` | `validationReportingFunction` | Validation reporting cron + on-demand admin |
| `validation/lifecycle.check` | `validationLifecycleFunction` | Daily lifecycle cron + ad-hoc admin |

Find the failed run, expand the failing step, read the captured error and stack trace.

**Fix**
- Inngest already retries failed steps automatically. Do **not** intervene unless a function is stuck across many retries (typically > 5).
- If the function is stuck: in the dashboard, **Cancel** the run, then re-trigger the event manually with the same payload. The original call site (in the route handler) shows the exact payload shape — see the type map in `client/src/inngest/client.ts`.
- All Inngest functions are idempotent by contract (CLAUDE.md, "Scalability"). Re-firing the same event is safe.
- If the failure is Anthropic-side overload, wait for `status.anthropic.com` to recover before re-triggering — re-firing into an outage just burns more retry budget.

---

### 5e. Redis (Upstash) unavailable

**Symptom**
Discovery turn requests still succeed but feel slower. Vercel logs contain:
```
[session-store] Redis unavailable — falling back to Prisma
```

**Likely cause**
Upstash regional outage, or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are misconfigured in Vercel.

**Diagnosis**
1. Check the Upstash console for incidents on the production database.
2. In the Vercel project settings → Environment Variables, confirm both vars exist and look correct for the Production environment.

**Fix**
Usually nothing. The session store has a Prisma fallback path — `getSession` in `client/src/lib/discovery/session-store.ts` lines 161–206 reconstructs `InterviewState` from the `DiscoverySession.beliefState` JSON column, which is synced on every turn write. The system continues to function; latency goes up because each turn now hits Postgres twice instead of Redis once.

**Do not bypass the 15-minute sliding TTL.** It is a contract documented in CLAUDE.md ("Scalability"). If you "fix" the latency by writing to Postgres without the TTL, sessions will accumulate forever.

If env vars were the cause, fix them in Vercel and redeploy.

---

### 5f. NextAuth / sign-in failures

**Symptom**
`/api/auth/*` returning 500. Sign-in callback fails. Founders cannot log in.

**Likely cause**
1. The `Session`, `Account`, or `VerificationToken` tables were dropped (most catastrophic).
2. A required NextAuth env var is missing or wrong: `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` (all declared as required in `client/src/lib/env.ts:19-27`).

**Diagnosis**
1. Check `client/src/auth.ts` for the adapter configuration.
2. Check `client/src/lib/env.ts` for the required NextAuth env vars and verify each one in Vercel.
3. In Neon SQL editor, confirm the three tables still exist:
   ```sql
   SELECT to_regclass('"Session"'), to_regclass('"Account"'), to_regclass('"VerificationToken"');
   ```

**Fix**
- Missing env var → set it in Vercel and redeploy.
- Missing table → restore from the most recent Neon snapshot. **Never delete these three tables.** They are required by `@auth/prisma-adapter` even though there is no direct `prisma.session.*` reference anywhere in the codebase. The adapter accesses them via raw SQL.

This is documented in `ARCHITECTURE.md` section 9 (Hard data invariants).

---

### 5g. Hard data invariant: orphaned `anonymisedRecord` on a non-consenting user

**This is the most serious data integrity issue in the system. Treat any positive result as a P0.**

**Symptom**
A `RecommendationOutcome` row exists where `consentedToTraining = false` AND `anonymisedRecord IS NOT NULL`. The contract is: if the user did not consent to training, no anonymised record may exist for that outcome — ever.

**Diagnosis**
Run in the Neon SQL editor (production branch):
```sql
SELECT id, "userId", "consentedToTraining", "anonymisedRecord"
FROM "RecommendationOutcome"
WHERE "consentedToTraining" = false
  AND "anonymisedRecord" IS NOT NULL;
```

A non-empty result is a confirmed invariant breach.

**Fix**
1. **Immediately** null the offending records:
   ```sql
   UPDATE "RecommendationOutcome"
      SET "anonymisedRecord" = NULL
    WHERE "consentedToTraining" = false
      AND "anonymisedRecord" IS NOT NULL;
   ```
2. Investigate the writing code path. The most likely culprit is a regression to the consent gate in `client/src/app/api/discovery/recommendations/[id]/outcome/route.ts` — this is where the Concern 5 work landed. Read the route and verify the gate still rejects writes to `anonymisedRecord` whenever `consentedToTraining` is false.
3. Add a Vitest case under the priority-1 invariant tests (per CLAUDE.md "Testing") so this can never silently regress again.

---

### 5h. Pushback chat not appearing on the recommendation page

**Symptom**
Founder lands on `/discovery/recommendation?from=<recommendationId>` and sees the "View My Execution Roadmap" button, but the pushback widget is missing entirely.

**Likely cause**
A regression to the gate inside `client/src/app/(app)/discovery/recommendation/RecommendationReveal.tsx`. The gate must be `!isAccepted` — gating on `!roadmapReady` is **wrong** because the synthesis function fires `discovery/roadmap.requested` as a warm-up step the moment a recommendation is persisted, so `roadmapReady` flips to true within seconds. Any `roadmapReady`-based gate kills the pushback feature for almost every founder.

**Diagnosis**
Open `RecommendationReveal.tsx`, find the JSX block that renders the pushback chat, confirm the conditional. If you see `roadmapReady` anywhere near the pushback render gate, that's the bug.

**Fix**
Restore the gate to `!isAccepted`. The historical incident is captured in commits `c86db18` and `bb0bc89` — read them for the full reasoning before changing this file.

---

### 5i. Sentry alerts and where to triage

**Symptom**
Sentry email lands about a new error class.

**Diagnosis**
1. Open the Sentry issue link.
2. Read the breadcrumb trail and the captured stack frame.
3. Cross-reference with Vercel logs for the same time window — most route errors flow through the central `httpErrorToResponse` logger (commit `6db8292`), so they will appear in both places.
4. Identify the route or Inngest function and jump to the matching playbook in this document.

**Fix**
Triage by route and error class. Create a `feature/...` or `fix/...` branch off `dev` (per CLAUDE.md "Git Workflow") and ship the fix through `dev` → `main`. Never patch directly on `main`.

---

## 6. Common diagnostic queries (Neon SQL editor)

**Inngest events:** there is no audit table for Inngest events in Postgres. The Inngest dashboard is the source of truth for run history. Filter by event name (see section 5d) and status `Failed`.

**Stuck active discovery sessions** (active, no turn in over 1 hour — almost certainly abandoned but worth a look):
```sql
SELECT id, "userId", phase, "questionCount", "updatedAt"
FROM "DiscoverySession"
WHERE status = 'ACTIVE'
  AND "updatedAt" < NOW() - INTERVAL '1 hour'
ORDER BY "updatedAt" DESC
LIMIT 50;
```

**Recommendations with no `acceptedAt` but a READY roadmap** — the warm-up regression cohort:
```sql
SELECT r.id, r."userId", r."createdAt", r."acceptedAt", rm.status AS roadmap_status
FROM "Recommendation" r
LEFT JOIN "Roadmap" rm ON rm."recommendationId" = r.id
WHERE r."acceptedAt" IS NULL
  AND rm.status = 'READY'
ORDER BY r."createdAt" DESC
LIMIT 50;
```

**Validation pages by status:**
```sql
SELECT status, COUNT(*) FROM "ValidationPage" GROUP BY status ORDER BY status;
```

**The consent invariant** (must always return zero rows):
```sql
SELECT id, "userId", "consentedToTraining", "anonymisedRecord"
FROM "RecommendationOutcome"
WHERE "consentedToTraining" = false
  AND "anonymisedRecord" IS NOT NULL;
```

**Recent Inngest call sites you can use to re-fire events** — see `client/src/inngest/client.ts` for the canonical typed payload shapes.

---

## 7. Local development emergency commands

This project uses **pnpm**, never npm. `npm install` will silently corrupt `node_modules` because of how the Prisma client is patched in `scripts/fix-prisma-pnpm.js` (declared as the `postinstall` hook in `client/package.json`).

```bash
# Install / reinstall deps (from repo root — runs the whole workspace)
pnpm install

# Run dev server
pnpm --filter client dev

# Production build (runs `prisma migrate deploy && prisma generate` first)
pnpm --filter client build

# Create a new migration from a schema edit (do NOT apply yet)
pnpm --filter client prisma migrate dev --create-only

# Resolve a P3009 stuck migration (see playbook 5a)
pnpm --filter client prisma migrate resolve --applied <migration_name>
pnpm --filter client prisma migrate resolve --rolled-back <migration_name>

# After deleting routes, clear the Next.js type cache and re-typecheck
cd client && rm -rf .next/types && pnpm exec tsc --noEmit

# Mobile install / typecheck (mobile is standalone, not part of the workspace)
cd mobile && pnpm install --ignore-workspace
cd mobile && pnpm exec tsc --noEmit

# Inspect git state safely (NEVER use -uall — memory issues on this repo)
git status
git log --oneline -5
```

---

## 8. What NOT to do under pressure

Pressure makes people skip steps. These are the steps that are never optional, ranked by severity of the consequence.

1. **Never `git push --force` to `main`.** The production branch is protected for a reason. Force-pushing rewrites history that other tools (Sentry releases, Vercel deploy markers) depend on.
2. **Never run `prisma migrate reset` against production.** It will drop the schema. There is no undo.
3. **Never manually `UPDATE _prisma_migrations` to mark a migration applied unless you have first verified the schema changes are present** using the `information_schema` queries in playbook 5a. Doing it blindly desyncs Prisma from reality and the next migration will explode.
4. **Never bypass the consent gate in `RecommendationOutcome` writes.** The invariant in playbook 5g must hold absolutely. Skipping the gate "just to capture an outcome quickly" is a data-protection breach.
5. **Never delete the `Session`, `Account`, or `VerificationToken` Prisma models / tables.** They are load-bearing for `@auth/prisma-adapter` even though no `prisma.session.*` calls exist in the codebase.
6. **Never remove `pushbackVersion` from `Recommendation`.** It is the row-level optimistic concurrency lock for pushback turn writes. Without it, two concurrent pushback writes will silently corrupt the history.
7. **Never use `npm install` in this project.** Always `pnpm install`. npm corrupts `node_modules` because of the Prisma postinstall patch.
8. **Never raise `maxDuration` past 300.** That work belongs in Inngest, not in a route handler. The Pro plan ceiling is 300; trying to exceed it just produces silent timeouts at Vercel's edge.
9. **Never log user message content, belief state, or AI outputs at INFO level.** Use DEBUG. Production must run with DEBUG off. (CLAUDE.md "Security".)
10. **Never commit a fix straight to `main`.** The pipeline is `chore/...` → `dev` → `main`. Even one-line emergency fixes go through `dev` first so the previews catch regressions.

---

*NeuraLaunch — Built with precision by Saheed Alpha Mansaray*
*Runbook last updated: 2026-04-07*
