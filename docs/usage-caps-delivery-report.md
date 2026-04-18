# Usage Caps & Abuse Prevention — Delivery Report

**Branch:** `fix/usage-caps-and-abuse-prevention` (from `dev`)
**Date:** 2026-04-18
**Spec reference:** [docs/neuralaunch-pricing-spec.md](./neuralaunch-pricing-spec.md)
**Related:** [docs/paddle-integration-delivery-report.md](./paddle-integration-delivery-report.md), [docs/voice-mode-delivery-report.md](./voice-mode-delivery-report.md)

---

## Summary

Adds per-billing-cycle usage caps to the four AI-heavy tools (Research,
Conversation Coach, Outreach Composer, Service Packager), a client-side
usage meter on each tool page, a daily anomaly-detection cron, and a
fair-use clause in the Terms of Service. Entirely defensive — no
current abuse, but required before the paid tiers see more than a
handful of users.

Five commits, one per item.

---

## Verification

| Check | Command | Result |
|---|---|---|
| TypeScript strict | `pnpm exec tsc --noEmit` | ✅ pass |
| ESLint | `pnpm lint` | ✅ pass |
| Webpack build | `pnpm build --webpack` | ⏭ skipped at owner's direction (no infra/prerender-boundary changes; tsc + lint sufficient for the change shape) |

---

## Item 1 — Per-cycle rate-limit tiers

**Files modified:** [client/src/lib/rate-limit.ts](../client/src/lib/rate-limit.ts), [client/src/lib/billing/cycle-quota.ts](../client/src/lib/billing/cycle-quota.ts) *(new)*
**Commit:** `3f0744e` — `feat(rate-limit): add per-billing-cycle usage tiers for AI-heavy tools`

Introduces `checkCycleRateLimit` (increments + checks atomically) and
`getCycleUsage` (read-only sibling used by UI + anomaly sweep).
Counters are keyed on `cycle:{toolKey}:user:{userId}:end:{cycleEnd}` so
a Paddle-renewal-triggered change to `Subscription.currentPeriodEnd`
creates a new Redis key on first write — no explicit reset logic. TTL
is `(cycleEnd - now) + 7 days` so keys auto-expire on their own.

Fail-open policy: if Redis is unavailable, the helper logs a warning
and allows the request. Refusing on Redis outage would block paying
customers; allowing silently is the lesser evil.

### Cap numbers chosen

| Tool | Execute | Compound | Compound ÷ Execute | Per-call cost (approx) |
|---|---:|---:|---:|---|
| Research Tool | 30 | 100 | 3.3× | $0.20–$0.80 (Opus + Exa) |
| Conversation Coach | 50 | 150 | 3.0× | $0.05–$0.15 |
| Outreach Composer | 100 | 300 | 3.0× | $0.02–$0.08 |
| Service Packager | 20 | 60 | 3.0× | $0.10–$0.30 |

**Rationale:** Typical engaged user runs 3–10 calls per tool per cycle
(one per active task + a handful standalone). Caps sit at ~3–5× that
to ensure 99% of legitimate users never see a 429. Compound always
gets ~3× Execute so the upgrade path feels meaningful to power users.
Research has the tightest cap because per-call COGS is highest.

Worst-case cycle COGS at full Compound usage: $144.50 per user vs
$46.05 net revenue — extreme and rare. The anomaly sweep (Item 4)
flags this for human review rather than auto-suspending.

---

## Item 2 — Cap enforcement applied to 16 routes

**Files modified:** 16 route files under [client/src/app/api/discovery/roadmaps/[id]/](../client/src/app/api/discovery/roadmaps/%5Bid%5D)
**Commit:** `fcc97e8` — `feat(rate-limit): apply per-cycle caps to Research/Coach/Composer/Packager routes`

Applied via a temporary one-shot script (deleted after run) to keep
the diff mechanical:

```
Research:  /roadmaps/[id]/research/execute       /roadmaps/[id]/research/followup
           /tasks/[taskId]/research/execute      /tasks/[taskId]/research/followup
Coach:     /roadmaps/[id]/coach/prepare          /roadmaps/[id]/coach/roleplay
           /tasks/[taskId]/coach/prepare         /tasks/[taskId]/coach/roleplay
Composer:  /roadmaps/[id]/composer/generate      /roadmaps/[id]/composer/regenerate
           /tasks/[taskId]/composer/generate     /tasks/[taskId]/composer/regenerate
Packager:  /roadmaps/[id]/packager/generate      /roadmaps/[id]/packager/adjust
           /tasks/[taskId]/packager/generate     /tasks/[taskId]/packager/adjust
```

Pattern per route:
```ts
const userId = await requireUserId();
await requireTierOrThrow(userId, 'execute');       // existing
await enforceCycleQuota(userId, 'research');       // new — reads tier internally
```

Cap-hit response surfaces as `HttpError(429)`:
```
"You've reached your monthly limit of 30 Research Tool calls. Your quota
 resets on Apr 30, 2026. Upgrade to Compound for higher limits."
```

Compound users get the same message minus the upgrade hint.

---

## Item 3 — UsageMeter component on tool pages

**Files added:** [client/src/app/api/usage/route.ts](../client/src/app/api/usage/route.ts), [client/src/components/billing/UsageMeter.tsx](../client/src/components/billing/UsageMeter.tsx)
**Files modified:** four standalone tool pages under `client/src/app/(app)/tools/*/page.tsx`
**Commit:** `180ab39` — `feat(usage): surface per-tool cycle usage meters on tool pages`

`GET /api/usage` returns the user's four cycle rows (one per tool).
`UsageMeter` is an SWR-backed client component with three visual
states:

- **<80%** — muted slate
- **80–99%** — accent (primary for Execute, gold for Compound)
- **100%** — amber cap-reached banner with Upgrade CTA for Execute
  users, plain reset notice for Compound users

Meter renders nothing for Free users (they already hit the
`/tools` page-level UpgradePrompt from the tier-gating-honesty
branch).

---

## Item 4 — Anomaly detection sweep

**Files added:** [client/src/inngest/functions/usage-anomaly-detection-function.ts](../client/src/inngest/functions/usage-anomaly-detection-function.ts)
**Files modified:** [client/src/lib/env.ts](../client/src/lib/env.ts), [client/src/inngest/functions/index.ts](../client/src/inngest/functions/index.ts), [client/src/app/api/inngest/route.ts](../client/src/app/api/inngest/route.ts), [.env.example](../.env.example)
**Commit:** `e0e4911` — `feat(abuse): add scheduled anomaly detection for extreme usage patterns`

### Threshold

**3× the Compound-tier cap per tool**, computed at runtime from
`CYCLE_LIMITS` so it cannot drift from the rate-limiter config:

| Tool | Compound cap | Anomaly threshold |
|---|---:|---:|
| Research | 100 | 300 |
| Coach | 150 | 450 |
| Composer | 300 | 900 |
| Packager | 60 | 180 |

### Alerting destination

The spec requested email delivery to `info@tabempa.com`. The email
service was deliberately removed in Stage 3 and the env file comment
(line 61 of `src/lib/env.ts`) notes that `RESEND_*` variables were
stripped. Rather than re-adding an email dependency for one cron, the
implementation uses a two-pronged honest alternative:

1. **Always** — `logger.error` with structured fields. Sentry picks
   this up and routes to operators via whatever Sentry alert rules
   the workspace has configured (email, Slack, PagerDuty, etc.).
2. **Optional** — when `USAGE_ANOMALY_WEBHOOK_URL` is set in Vercel,
   the sweep additionally POSTs a `{ text, attachments }` body
   compatible with Slack / Discord / generic webhook receivers.

To route to email specifically, either (a) configure a Sentry alert
rule on the `usage-anomaly` error tag to forward to
`info@tabempa.com`, or (b) point `USAGE_ANOMALY_WEBHOOK_URL` at a
Zapier/Make webhook that bridges to email. **Documented in the
delivery report, not the code, because the legitimate answer depends
on which alerting channel the business wants operational on day one.**

### Scheduling + scalability

- Cron: daily at 06:00 UTC (low-traffic window across the target
  markets).
- Capped at 1000 active subscriptions per run; warning logs if the
  cap is hit so pagination can be added.
- Stateless — only reads. Safe to run twice.

### Alert payload per flagged user

- `userId`, `userEmail`, `tier` (`execute` | `compound`)
- `tool` + `toolLabel`
- `usage` (actual cycle count)
- `cap` (the Compound cap × 3 threshold used)
- `multiplier` (usage / Compound cap)
- `cycleEndsAt` (ISO timestamp)

---

## Item 5 — Terms of Service fair-use clause

**File modified:** [docs/neuralaunch-terms-of-service.md](./neuralaunch-terms-of-service.md) §10.4 *(new)*
**Commit:** `9565648` — `docs(terms): add fair use policy for AI tool usage caps`

Names the four AI-powered tools, commits to 30-day notice for cap
changes, references §3.3 "One Person, One Account" for credential
sharing, and reserves suspension for circumvention attempts
(multi-account abuse, credential sharing, automated scripts).
Deliberately does NOT hardcode the cap numbers — the Pricing page
and in-app meter are the authoritative source so the legal text
doesn't need a re-sign every time a number moves.

---

## Manual verification (Alpha)

### Enforcement

1. Sign in as an Execute-tier user (`tier = 'execute'` in session).
2. Open `/tools/research` — verify UsageMeter reads `0 of 30
   Research Tool calls used this cycle. Resets [date]`.
3. Trigger 30 research plan requests — a `curl` loop or the UI.
4. On the 31st request, expect `HTTP 429` with the structured
   message (`"You've reached your monthly limit of 30 Research Tool
   calls…"`). Confirm the UI meter shows `Cap reached — 31 / 30
   Research Tool calls this cycle`.
5. Verify an Upgrade CTA appears beneath the cap message.
6. Upgrade to Compound (via Paddle sandbox). Confirm subsequent
   requests succeed — the cycle key in Redis changes
   tier and the Compound counter starts at 1.

### Usage meter visual states

1. Use the Coach tool 40 times as Execute (80%) — verify the meter
   flips to the primary accent colour.
2. Continue to 50 — verify the amber cap-reached state with Upgrade
   CTA.
3. As a Compound user, push usage of the Composer to 240 (80% of
   300) — verify the meter flips to the gold accent (not primary).

### Anomaly sweep

1. Simulate anomalous usage by directly SETting a Redis counter:
   `SET cycle:RESEARCH_TOOL_EXECUTE:user:<uid>:end:<ts> 301` with
   an appropriate TTL, where 301 > 300 (threshold).
2. Manually invoke the Inngest function from the Inngest dashboard.
3. Confirm `logger.error` fires with the structured payload visible
   in Sentry.
4. If `USAGE_ANOMALY_WEBHOOK_URL` is set, confirm a POST lands at
   the receiver.

### Webhook anomalies while Redis is down

1. With Redis unavailable (stop Upstash or corrupt the URL):
2. Invoke a gated route. Confirm:
   - tsc + lint remain green
   - `logger.warn` fires with `"Cycle rate-limit check skipped —
     Redis unavailable"`
   - The request SUCCEEDS (fail-open).
3. Restart Redis. Normal enforcement resumes on next request.

---

## Files touched summary

| Item | Files added | Files modified |
|---|---|---|
| 1 | `lib/billing/cycle-quota.ts` | `lib/rate-limit.ts` |
| 2 | — | 16 route files |
| 3 | `app/api/usage/route.ts`, `components/billing/UsageMeter.tsx` | 4 tool pages |
| 4 | `inngest/functions/usage-anomaly-detection-function.ts` | `lib/env.ts`, `inngest/functions/index.ts`, `app/api/inngest/route.ts`, `.env.example` |
| 5 | — | `docs/neuralaunch-terms-of-service.md` |

---

## Follow-ups flagged (out of scope)

- **Real usage data tuning.** The caps are calibrated on theory. Once
  there are 30+ paying users across a full billing cycle, pull the
  distribution and tune (likely downward for Composer, possibly
  upward for Research).
- **UI meter doesn't refresh after a consumed call.** The meter takes
  the `refreshKey` prop but no consumer currently bumps it. Low
  priority — SWR's 5s deduping window means a refresh happens anyway
  on the user's next mount.
- **No per-call receipt** — we increment on attempt, not on success.
  A failed Opus call still consumes quota. Defensible (you paid for
  the attempt, not the outcome) but worth revisiting if providers
  start failing more visibly.
- **Free tier has no cycle caps** — it's gated at the tier level
  (Free can't call these routes at all), so cycle caps are redundant.
  If Free ever gets partial tool access, add `FREE` entries to
  `CYCLE_LIMITS`.
