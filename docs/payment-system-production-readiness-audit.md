# NeuraLaunch — Payment System Production-Readiness Audit

**Date:** 2026-04-19
**Branch:** `audit/payment-system-production-readiness` (cut from `fix/usage-caps-and-abuse-prevention`)
**Scope:** Final code-level quality gate before Paddle production submission. Covers security, reliability, data integrity, performance, compliance, observability, edge cases, vendor risk, maintainability, and deployment.
**Status:** Audit only — no code changes. Builds on prior closed audits ([tier-audit-report.md](./tier-audit-report.md), [billing-cancellation-refund-audit.md](./billing-cancellation-refund-audit.md), [pre-launch-integrity-delivery-report.md](./pre-launch-integrity-delivery-report.md)).

---

## Executive Summary

1. **The pre-launch integrity branch closed every P0 from the prior billing audit.** Continuation tier, validation publish gate, Manage Billing button, refund webhook, paused tier, ROSCA disclosures, support email — all genuinely landed and verified by reading the post-fix files. The earlier audits are not regressions.
2. **One brand-new P0 has appeared since those fixes:** the webhook receiver at [route.ts:56-65](../client/src/app/api/webhooks/paddle/route.ts#L56-L65) acks Paddle with `200` *before* processing, then runs `handleWebhookEvent` inside `after()` and swallows every error. **A database outage during webhook processing now means silent permanent data loss with no Paddle retry.** This was acceptable behavior in sandbox where you never lose money; it is a launch blocker for production where a missed `subscription.created` is a paid customer with no Subscription row.
3. **The webhook endpoint has no rate limit** ([route.ts:23](../client/src/app/api/webhooks/paddle/route.ts#L23)). Paddle's signature verification is the only bouncer. An attacker who knows the URL can spam-burn signature-verification CPU. Low severity (signature check is fast and Vercel scales) but cheap to fix.
4. **The customer portal server action has no rate limit** ([billing.ts:26](../client/src/app/actions/billing.ts#L26)). A logged-in user can call `generatePortalLink()` in a loop and burn Paddle's API quota. Medium severity — Paddle will throttle eventually but not before bills accumulate.
5. **The founding-member detection has a race condition** that can mint slot 51+. [getPriceIds()](../client/src/lib/paddle/founding-members.ts#L79) reads `getFoundingMemberCount()` at pricing-page render time, but the count is only authoritative *after* the webhook writes `isFoundingMember=true`. Two users checking out within seconds of slot #50 both see "available" and both get founding pricing. Net cost: a few extra users at the lower rate forever — small dollar impact, zero functional bug.
6. **`status='past_due'` does not strip tier access** (no handler change in [webhook-processor.ts:299-306](../client/src/lib/paddle/webhook-processor.ts#L299-L306)). The ToS §6.4 promises *"access to paid features may be temporarily suspended"* during dunning. The code shows a banner but lets the user keep using paid features through Paddle's full retry schedule (typically 14 days). At Compound this is up to ~$50 of API spend per dunning user.
7. **Session callback hits Postgres on every authenticated request** ([auth.ts:71](../client/src/auth.ts#L71)) — `prisma.subscription.findUnique` runs inside the `session()` callback, which fires for every page render and every API call's `auth()` invocation. A logged-in user generating 60 RPM during heavy use is 60 Subscription queries per minute per user. Acceptable today; will be the first thing to bottleneck under scale. `tierUpdatedAt` is bumped by webhooks but **nothing reads it** — the planned cache-invalidation hook never landed.
8. **`account-deletion` does not unsubscribe Paddle.** Schema cascade deletes our Subscription row when a User is deleted, but Paddle keeps the Customer + Subscription alive and continues to bill it. The user's card is charged forever (or until their card expires) for a service their account no longer exists to consume. **This is both a financial bug and a probable GDPR violation.**
9. **The Paddle SDK is pinned with a caret range** (`^3.7.0` in [client/package.json](../client/package.json)) — minor releases auto-install. Webhook event-name enums could shift on a `pnpm install` and silently break event dispatch. Pin exactly.
10. **Sentry is not configured.** The usage-anomaly alerter at [usage-anomaly-detection-function.ts:204](../client/src/inngest/functions/usage-anomaly-detection-function.ts#L204) calls `logger.error` on the assumption "Sentry picks this up" — Sentry doesn't yet exist in this codebase. Anomalies, refund failures, and webhook-after errors all currently disappear into Vercel's log retention with no alerting layer.
11. **No tier-transition audit trail.** Every webhook `update` overwrites the prior tier in place. There is no log of "user X was upgraded from execute → compound on date Y by webhook event Z." Required for chargeback dispute evidence and useful for any future cohort analysis.
12. **The Paddle webhook secret is environment-aware via `NEXT_PUBLIC_PADDLE_ENV`, but `PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET` are NOT cross-validated against the env.** A misconfiguration that pairs a sandbox `PADDLE_WEBHOOK_SECRET` with production `PADDLE_API_KEY` (or vice versa) would silently fail every webhook with an unrelated-sounding "signature mismatch" error.
13. **Spec doc inconsistency:** [neuralaunch-pricing-spec.md §2.4](./neuralaunch-pricing-spec.md) line 124 lists Compound annual as $279/year. The code, the pricing page, and the Paddle price comment in [tiers.ts:40](../client/src/lib/paddle/tiers.ts#L40) all say $479/year. Doc bug only — cards display the correct $479.
14. **The ToS effective-date placeholder is unfilled.** [terms-of-service.md:4](./neuralaunch-terms-of-service.md#L4) reads `**Effective Date:** [Insert Date]` and line 418 reads `*These Terms of Service are effective as of [Next week Friday Date(You the agent do the calculution)].*`. A live legal document with `[Insert Date]` is non-compliant with itself.
15. **No automated tests cover the payment flow** — no Vitest specs touch any file under `lib/paddle/`, the webhook route, the billing action, or BillingSection. Acceptable per the deferred testing strategy in CLAUDE.md, but the highest-value test priorities are listed in §9.4 below.

---

## P0 — Critical (must fix before Paddle production submission)

### P0.1 — Webhook ack-before-process loses payments on DB outages

**Location:** [client/src/app/api/webhooks/paddle/route.ts:56-65](../client/src/app/api/webhooks/paddle/route.ts#L56-L65)

```typescript
after(async () => {
  try {
    await handleWebhookEvent(event);
  } catch (err) {
    logger.error('Paddle webhook processing failed', err);
  }
});

return NextResponse.json({ status: 'ok' }, { status: 200 });
```

**Risk:** The 200 is returned to Paddle *before* `handleWebhookEvent` runs. If processing throws (DB outage, Prisma migration in flight, transaction conflict), the error is logged inside the `after` block and Paddle never sees a non-2xx response, so Paddle never retries. A `subscription.created` lost this way is a paying customer with no Subscription row, no tier, no Manage Billing access. The earlier billing audit's webhook-collision bug was fixed, but the *recovery mechanism* — Paddle's retry on 5xx — is now permanently disabled.

**Recommended fix:** Either (a) await `handleWebhookEvent(event)` inline, returning 5xx on throw and accepting that a slow handler may push past Paddle's 5s budget on cold start (acceptable — Paddle's retry is the safety net); or (b) keep `after()` for fast-path acknowledgement but pipe failed events into an Inngest dead-letter queue that retries with backoff and alerts on permanent failure. Option (a) is one-line; option (b) requires ~30 lines and a new Inngest function `paddle-webhook-retry`. Either is acceptable; (a) is the production-correct minimum.

**Verification:** kill the database in staging, fire a test webhook, confirm Paddle dashboard shows the delivery as failed and re-attempts within minutes.

### P0.2 — Account deletion does not cancel the Paddle subscription

**Location:** No code. The deletion flow doesn't exist as a server-side helper, but the schema cascade on [Subscription:128-129](../client/prisma/schema.prisma#L128-L129) (`onDelete: Cascade`) means deleting a User wipes the Subscription locally without touching Paddle.

**Risk:** A user who clicks "delete my account" (per ToS §14.3, today via email request) loses their NeuraLaunch data and their Subscription row, but their Paddle Customer + Subscription continues to renew indefinitely. They get charged for nothing. Three problems compound:
1. **Financial:** ongoing charges with zero service rendered → chargebacks → Paddle reputation hit.
2. **Legal:** GDPR Article 17 right-to-erasure must include the third-party processor record (Paddle); ToS §9.6 promises *"Request deletion of your payment data from Paddle"* — code doesn't.
3. **Operational:** every deleted user's Paddle subscription becomes orphan revenue that can never be reconciled to a customer.

**Recommended fix:** add a `cancelPaddleSubscriptionsForUser(userId)` server-only helper that, before the User row is deleted, calls `paddleClient.subscriptions.cancel(paddleSubscriptionId, { effectiveFrom: 'immediately' })` for every Subscription owned by the user. Wrap deletion in a saga: cancel Paddle first, then delete locally. If Paddle fails, abort the deletion and surface the error to support — better to leave the account intact than to leave Paddle billing a ghost. The ToS already promises this behavior; the code must match.

### P0.3 — `past_due` status leaves paid tier intact during dunning

**Location:** [client/src/lib/paddle/webhook-processor.ts:299-306](../client/src/lib/paddle/webhook-processor.ts#L299-L306)

```typescript
async function handlePaymentFailed(event: TransactionPaymentFailedEvent): Promise<void> {
  const data = event.data;
  if (!data.subscriptionId) return;
  await prisma.subscription.updateMany({
    where: { paddleSubscriptionId: data.subscriptionId },
    data:  { status: 'past_due' },
  });
}
```

**Risk:** ToS §6.4 says *"During the retry period, your access to paid features may be temporarily suspended."* The code shows a banner ([BillingSection.tsx:128-132](../client/src/app/(app)/settings/BillingSection.tsx#L128-L132)) but does not change `tier`, so the user keeps full Compound/Execute access while Paddle runs its 14-day dunning schedule. At Compound this can be ~$50 of Anthropic + Exa + Tavily spend on a user whose card is permanently declined and who never returns. Worse: this contradicts the ToS, which is a ROSCA-relevant promise.

**Recommended fix:** in `handlePaymentFailed`, after setting status, *also* demote tier to `'free'` (don't touch `currentPeriodEnd` so we know when access would have ended). When `transaction.completed` later fires for the same subscription with a successful payment, [handleTransactionCompleted:286](../client/src/lib/paddle/webhook-processor.ts#L286) needs an extension: also re-resolve and restore the tier from the price (currently it only sets status='active'). The transition flow becomes: `past_due → tier:free + status:past_due` then `payment recovers → tier:execute|compound + status:active`. Wrap both in transactions and bump `User.tierUpdatedAt`.

**Alternate fix (softer):** add a 3-day grace period before demotion — allows a user with a transient bank issue to update their card without losing access. Implement via a delayed Inngest function fired from the past_due handler. Acceptable for most products; choose grace if Alpha values the anti-friction more than the COGS protection.

### P0.4 — Founding-member slot allocation has a race condition

**Location:** [client/src/lib/paddle/founding-members.ts:79-99](../client/src/lib/paddle/founding-members.ts#L79-L99)

**Risk:** `getPriceIds()` is called at pricing-page render time. It reads the live count of `isFoundingMember = true` rows and decides whether to return the founding price id. Two users hitting the pricing page at the same moment when 49 founders exist both see "available" and both check out at the founding rate. The webhook then writes `isFoundingMember=true` for both — slot 50 and slot 51, with nothing in the code preventing 50+ founders from existing.

The actual founding flag is written by [resolveTier()](../client/src/lib/paddle/tiers.ts#L49) which keys off the *price id* the user was charged. Since both users were issued the founding price, both rows correctly carry the founding rate. The system is internally consistent — it just doesn't enforce the "first 50" promise on the pricing page.

**Recommended fix:** the count check needs to happen at *checkout completion time*, not at pricing-page render time. Two implementation paths:
1. **Server-side enforcement at webhook time** — when `subscription.created` fires with a founding price id, count existing founders; if `count >= 50`, demote the priceId in our `Subscription` row to the standard equivalent and trigger a reconciliation in the Paddle dashboard (downgrade the price). Complex but correct. Note: the user's Paddle subscription would still bill at the founding rate unless Paddle is updated, so this requires a Paddle API call.
2. **Acceptance of the bounded over-allocation** — declare in code that the cap is "soft" (50 ± a small race window) and document this. Cheapest. The dollar cost is tiny (10 extra founders at $19 vs $29 = $100/mo of "lost" revenue forever).

**My recommendation:** option 2 + a doc note. The race window is small, the dollar impact is small, and option 1 introduces complex two-system reconciliation. Add a comment in `founding-members.ts` noting the race is accepted, and add a Sentry alert when count crosses 55 to catch a runaway slot leak.

### P0.5 — `generatePortalLink` server action has no rate limit

**Location:** [client/src/app/actions/billing.ts:26-65](../client/src/app/actions/billing.ts#L26-L65)

**Risk:** No `rateLimitByUser` call. A logged-in user with a debugger console can fire `await generatePortalLink()` in a loop. Each call hits Paddle's `customerPortalSessions.create` API. Paddle has an undocumented but real per-merchant rate limit; bursting past it returns 429s that block legitimate users from opening the portal. Net cost: rate-limit exhaustion DoS by a single user.

**Recommended fix:** add at the top of the server action:
```typescript
await rateLimitByUser(session.user.id, 'paddle-portal-link', RATE_LIMITS.API_AUTHENTICATED);
```
This caps each user at 60 portal-link generations per minute, which is 59 more than any legitimate UI flow needs. (`API_AUTHENTICATED` already exists in the rate-limit helper.)

### P0.6 — ToS effective date is a placeholder

**Location:** [docs/neuralaunch-terms-of-service.md:4](./neuralaunch-terms-of-service.md#L4) and line 418, plus [client/src/content/legal/terms.md](../client/src/content/legal/terms.md) (rendered at `/legal/terms`)

**Risk:** A user who reads the live ToS sees `**Effective Date:** [Insert Date]`. Paddle's underwriting reviewer who reads the live ToS sees the same placeholder. This is a 100% certain underwriting friction point. The placeholder text at line 418 even contains an instruction to an AI agent (`(You the agent do the calculution)`) that has clearly never been actioned.

**Recommended fix:** set both placeholders to the real intended effective date (matching whatever date the launch is scheduled for, or a date already in the past for deployments that have been live). Same fix in both `docs/` and `client/src/content/legal/`.

---

## P1 — Important (fix before or immediately after launch)

### P1.1 — Webhook endpoint has no rate limit

**Location:** [client/src/app/api/webhooks/paddle/route.ts:23](../client/src/app/api/webhooks/paddle/route.ts#L23)

The handler does signature verification, but a flood of requests with bogus signatures still consumes CPU on `unmarshal()`. Recommend adding `rateLimitByIp` with a generous limit (Paddle retries are bounded; legitimate bursts shouldn't exceed ~100/min per IP):
```typescript
await rateLimitByIp(getClientIp(req.headers) ?? 'unknown', 'paddle-webhook', { maxRequests: 200, windowSeconds: 60 });
```
Apply BEFORE signature verification so spam can't burn HMAC cycles.

### P1.2 — `tierUpdatedAt` is written but never read

**Location:** Bumped at [webhook-processor.ts:151, 204, 239, 276, 396](../client/src/lib/paddle/webhook-processor.ts) on every tier transition. Read by zero callers — grep returns no references.

The Paddle integration delivery report §4.1 said this column was "preserved for client-side cache invalidation and audit logging downstream." Neither downstream consumer was built. Today it's dead weight. Two options:
1. **Wire it into the session callback** — compare `tierUpdatedAt` against the session's `iat` (when supported by the adapter) to know whether to bypass cache. Useful when SWR / React Query layers cache tier-derived UI state.
2. **Delete the column** — if no audit/cache consumer is planned, drop the migration noise.

I recommend option 1 — the cache-invalidation path matters more once the user base grows.

### P1.3 — Session callback hits Postgres on every authenticated request

**Location:** [client/src/auth.ts:71-77](../client/src/auth.ts#L71-L77)

```typescript
const subscription = await prisma.subscription.findUnique({
  where:  { userId: user.id },
  select: { tier: true, status: true },
});
session.user.tier = (subscription?.tier ?? 'free');
session.user.subscriptionStatus = subscription?.status ?? 'none';
```

Every `auth()` call invokes the session callback. Every authenticated route handler calls `auth()` (or `requireUserId()` which calls it transitively). On a busy session that's hundreds of identical Subscription queries per minute per user. Postgres handles it but the cost is real (~5ms each, adds up).

**Recommendation:** wrap in a 30-second per-user in-memory cache keyed by `userId`. Use a simple Map keyed by userId with a timestamp; invalidate on `tierUpdatedAt` change (which requires P1.2 first). The 30-second window is short enough that a tier upgrade still propagates within one cycle.

Alternatively, embed the tier in NextAuth's `Session` row directly via the adapter's `Session` model (NextAuth supports custom columns) and skip the per-request lookup entirely. That's a bigger refactor.

### P1.4 — Webhook handlers don't audit prior state on tier transitions

**Location:** all five tier-mutating handlers in [webhook-processor.ts](../client/src/lib/paddle/webhook-processor.ts).

When `subscription.updated` fires with a tier change, the prior tier is read into `existing.tier` ([line 175](../client/src/lib/paddle/webhook-processor.ts#L175)) but only used to decide whether to bump `tierUpdatedAt`. Nothing logs "user transitioned from X to Y at time T because of event Z." If a user later disputes a charge with Paddle ("I was on Free, why was I billed Compound?") there is no first-party evidence of the transition.

**Recommendation:** add a `TierTransition` model:
```prisma
model TierTransition {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  fromTier        String?
  toTier          String
  paddleEventType String?
  paddleEventId   String?
  occurredAt      DateTime @default(now())
  @@index([userId, occurredAt])
}
```
Insert a row from each handler whenever `existing.tier !== resolvedTier`. Cheap (one row per actual transition), high evidentiary value. Retention should match Paddle's chargeback dispute window (typically 120 days; keep indefinitely for audit).

### P1.5 — `transaction.completed` can re-activate a canceled subscription

**Location:** [webhook-processor.ts:286-293](../client/src/lib/paddle/webhook-processor.ts#L286-L293)

```typescript
async function handleTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
  const data = event.data;
  if (!data.subscriptionId) return;
  await prisma.subscription.updateMany({
    where: { paddleSubscriptionId: data.subscriptionId },
    data:  { status: 'active' },  // ← unconditional
  });
}
```

If `transaction.completed` arrives after `subscription.canceled` has already fired (rare event-reordering, possible during Paddle outages), the canceled subscription's status flips back to `active` and the user keeps their tier. The `tier` field is *not* re-derived, so this leaves a row with `status='active'` but `tier='free'` if the cancel handler had already demoted — internally inconsistent.

**Recommendation:** scope the `where` clause to only update non-canceled rows:
```typescript
where: { paddleSubscriptionId: data.subscriptionId, status: { not: 'canceled' } }
```
Three lines, tightens an unlikely but real race.

### P1.6 — `handleAdjustment` does not handle chargebacks

**Location:** [webhook-processor.ts:325-340](../client/src/lib/paddle/webhook-processor.ts#L325-L340)

The handler explicitly filters for `data.action === 'refund' && data.status === 'approved'`. Chargebacks (`action === 'chargeback'`) are intentionally ignored per the inline comment ("handled separately by Paddle support workflows"). This is a defensible choice but it leaves a gap: a chargeback is a stronger signal of refund-equivalent than a normal refund — the bank already pulled the money back. Letting the user keep paid access while a chargeback is pending invites further abuse.

**Recommendation:** add a minimal chargeback handler that demotes tier on `action === 'chargeback' && status === 'approved'`. If Paddle's support workflow eventually reverses the chargeback, an `action === 'credit'` adjustment can re-grant tier (out of scope for now). Even partial chargeback coverage is better than zero.

### P1.7 — Webhook secret + API key are not cross-validated for env consistency

**Location:** [client/src/lib/env.ts:82-85](../client/src/lib/env.ts#L82-L85)

`PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_PADDLE_ENV` are validated independently. A misconfiguration that pairs `pdl_live_*` API key with `pdl_sandbox_*` webhook secret (or vice versa) passes Zod validation and boots the app. Webhook signature verification then fails with a generic "Signature mismatch" error that gives no hint about the cross-env mismatch.

**Recommendation:** add a `superRefine` to envSchema that checks the prefix of `PADDLE_API_KEY` against `NEXT_PUBLIC_PADDLE_ENV`:
```typescript
.superRefine((env, ctx) => {
  const isLiveKey = env.PADDLE_API_KEY.startsWith('pdl_live_');
  const isProdEnv = env.NEXT_PUBLIC_PADDLE_ENV === 'production';
  if (isLiveKey !== isProdEnv) {
    ctx.addIssue({ code: 'custom', message: 'PADDLE_API_KEY does not match NEXT_PUBLIC_PADDLE_ENV' });
  }
});
```
Catches the mistake at boot rather than on the first webhook delivery.

### P1.8 — No Sentry / observability layer despite anomaly alerter assuming one

**Location:** [usage-anomaly-detection-function.ts:204](../client/src/inngest/functions/usage-anomaly-detection-function.ts#L204) calls `logger.error` with a comment *"Sentry picks this up"*. No Sentry SDK is installed; no `@sentry/nextjs` import exists; the comment is aspirational.

**Risk:** every refund-handler error, webhook-after error, anomaly-detection alert, and Paddle API failure goes to Vercel's log retention only. There is no on-call alerting, no error grouping, no release tracking. Production debugging will be done by tail-greping Vercel logs.

**Recommendation:** install `@sentry/nextjs`, configure DSN via env var, wrap the webhook-after callback and the billing server action explicitly with `Sentry.captureException()`. See §6 below for the full Sentry instrumentation plan.

### P1.9 — Paddle SDK pinned with caret range

**Location:** [client/package.json](../client/package.json) line shows `"@paddle/paddle-node-sdk": "^3.7.0"`.

**Risk:** caret allows any 3.x.y minor / patch upgrade on `pnpm install`. Webhook event-name enums could shift (Paddle has historically renamed events between minor versions). A silent install on Vercel's build step could break event dispatch in production.

**Recommendation:** pin exactly: `"@paddle/paddle-node-sdk": "3.7.0"` (no caret). Pair with a Renovate or Dependabot rule that opens a PR on each Paddle release for explicit human review. CLAUDE.md already documents this pattern for `zod` and `inngest`.

### P1.10 — No retry / backoff on `customerPortalSessions.create`

**Location:** [billing.ts:51-56](../client/src/app/actions/billing.ts#L51-L56). One try/catch, no retry.

When Paddle returns a transient 502 or 503, the action returns `{ ok: false, reason: 'paddle-error' }` and the user sees *"Could not open the billing portal. Try again in a moment."* — they retry manually. Acceptable for a low-frequency action, but a single Paddle hiccup can prevent dozens of users from canceling during the outage window.

**Recommendation:** wrap the SDK call in a retry with exponential backoff (3 attempts, 200ms / 800ms / 3.2s). The existing `withModelFallback` pattern in `lib/ai/with-model-fallback.ts` is the precedent — copy the shape.

### P1.11 — Paused-handler comment lies about resume behavior

**Location:** [webhook-processor.ts:251-256](../client/src/lib/paddle/webhook-processor.ts#L251-L256) comment claims *"The paid tier snaps back when the user resumes (subscription.updated fires with an active status and resolveTier(priceId) restores the paid tier)."*

But `handleSubscriptionUpdated` ([line 167](../client/src/lib/paddle/webhook-processor.ts#L167)) calls `resolveTier(priceId)` which returns `'free'` if the price id is null or unrecognized. Whether resume actually restores the tier depends on Paddle re-sending the same priceId on the resume event — which it does in current behavior, but is undocumented and could change. The handler should defensively re-resolve and explicitly set tier from the priceId rather than trusting the path.

**Recommendation:** smaller risk than the others; flag only. Rephrase the comment to acknowledge the dependence on Paddle's payload behavior, or add a guard that warns when resume comes with a null/unrecognized priceId.

### P1.12 — `subscription.updated` for unknown subscription does not retry creation

**Location:** [webhook-processor.ts:178-186](../client/src/lib/paddle/webhook-processor.ts#L178-L186)

If `subscription.updated` arrives before `subscription.created` (event reordering), the handler logs warn and returns. The created event will eventually arrive — but in the meantime the row is missing, and any subsequent updated event before created will repeatedly log warn without acting. There's no escape valve for the "permanently lost created event" case.

**Recommendation:** when an updated event arrives for an unknown subscription, attempt to fetch the subscription from Paddle's API (`paddleClient.subscriptions.get(data.id)`) and synthesize a created-equivalent record. This recovers the rare permanent-loss case at the cost of one Paddle API call. Alternatively, accept the gap and rely on a daily reconciliation cron (P2.4 below).

### P1.13 — Paddle pricing-spec doc has a stale annual price

**Location:** [docs/neuralaunch-pricing-spec.md:124](./neuralaunch-pricing-spec.md#L124) lists `pri_comp_yr_01 | $279.00 | Annual`.

Code, cards, and the inline comment at [tiers.ts:40](../client/src/lib/paddle/tiers.ts#L40) all say $479. The spec doc is wrong. The cards are correct. Doc-only fix; no code or revenue impact, but the spec is supposed to be canonical.

---

## P2 — Polish (address within 90 days of launch)

### P2.1 — webhook-processor.ts is 407 lines (cap is 300)

Pre-launch integrity report explicitly deferred this. Split by event family: `subscription-handlers.ts`, `transaction-handlers.ts`, `adjustment-handlers.ts`, with `webhook-processor.ts` reduced to the dispatcher switch. ~1 hour of mechanical refactoring; no behavior change.

### P2.2 — `getPriceIds` is called on every pricing-page render

**Location:** [founding-members.ts:79](../client/src/lib/paddle/founding-members.ts#L79) — comment already flags this: *"If that ever becomes hot, wrap with a short-TTL Upstash cache."*

The pricing page is the most-rendered page on the site. Each render runs a Postgres `count()`. A 60-second Redis cache keyed on `founding-slots:v1` would eliminate ~99% of the queries. Invalidate from the webhook processor when `isFoundingMember` is written.

### P2.3 — Settings page doesn't show prior-tier history

When a user is canceled and on Free, they see no record that they were ever Compound. If they re-subscribe at standard rate and remember they were a founding member, there is no way to verify this from the UI — they'd have to email support, who would have to check Paddle dashboard. Pair with P1.4 (TierTransition log) to surface a small "Subscription history" section in Settings → Billing for canceled users.

### P2.4 — No daily Paddle reconciliation cron

A recurring Inngest function that pulls all active Paddle subscriptions and compares against local state would catch:
- Webhooks dropped during outages (P0.1's safety net)
- Subscriptions canceled in Paddle dashboard manually with no webhook fired (rare but possible)
- Tier mismatches between Paddle's authoritative state and our cache

Run nightly, log discrepancies, optionally auto-reconcile. ~150 lines of Inngest function code.

### P2.5 — No dunning email from NeuraLaunch side

When `transaction.payment_failed` fires, we set status to `past_due` and show a banner in Settings. But Settings is not where users live; many will not see the banner until their account locks out. Paddle sends its own dunning email by default (verify in production dashboard); supplement with our own at minimum.

Also wire mobile push for `past_due` — the Expo push token infra exists and is unused for billing events.

### P2.6 — Pricing card disabled state during Paddle.js loading is invisible

[SubscribeButton.tsx:68](../client/src/components/SubscribeButton.tsx#L68) disables the button while `!isReady`, but a user clicking during the 200-500ms before Paddle.js loads sees nothing happen. Add a "Loading…" label or a small spinner during the disabled state.

### P2.7 — No client-safe tier prefetch in pricing-page-only routes

The pricing page (server component) doesn't pre-warm the tier badge. A signed-in Compound user landing on `/#pricing` sees the same "Subscribe" button as a Free user until SessionProvider hydrates. Minor but easy to fix: hide the upgrade CTA entirely for users already on the highest tier.

### P2.8 — `subscription.activated` event is unhandled

Falls to the default branch. Fires when a paused subscription resumes. We rely on `subscription.updated` firing alongside, which it does today. Defensive coverage would be one more handler.

---

## P3 — Document only

- **Sierra Leone jurisdiction** in ToS §15 will surprise some international users. Documented; intentional.
- **Paddle portal copy is outside our control.** Accept the merchant-of-record tradeoff.
- **Anthropic / Exa / Tavily retention of refunded users' inputs** is governed by their respective ToS. Already disclosed in our ToS §9.6.
- **In-memory rate limiter fallback** when Redis is down is documented in [rate-limit.ts:118-123](../client/src/lib/rate-limit.ts#L118-L123). Acceptable behavior; flagged for awareness.

---

## Production Deployment Checklist

### Vercel environment variables (production)

| Variable | Current | Production value source |
|---|---|---|
| `PADDLE_API_KEY` | sandbox `pdl_sandbox_*` | Paddle production dashboard → Developer Tools → Authentication |
| `PADDLE_WEBHOOK_SECRET` | sandbox value | Paddle production dashboard → Webhooks → notification settings → secret |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | `test_*` | Paddle production dashboard → Developer Tools → Client-side tokens |
| `NEXT_PUBLIC_PADDLE_ENV` | `sandbox` | `production` |
| `USAGE_ANOMALY_WEBHOOK_URL` | unset (likely) | Optional; set to Slack / Discord webhook before launch if alerting is desired |

**Verify:** after the swap, P1.7's superRefine (if added) catches the matched-environment requirement automatically.

### Paddle dashboard configuration

- [ ] Production account approved by Paddle underwriting
- [ ] Products created: `pro_execute_01`, `pro_compound_01` (or whatever IDs Paddle assigns)
- [ ] Six prices created with these display amounts:
  - Execute monthly $29 (public)
  - Execute annual $279 (public)
  - Compound monthly $49 (public)
  - **Compound annual $479 (public — note: spec doc §2.4 incorrectly lists $279, ignore that)**
  - Execute founding $19 (hidden)
  - Compound founding $29 (hidden)
- [ ] Webhook destination set to `https://startupvalidator.app/api/webhooks/paddle`
- [ ] Webhook events subscribed:
  - subscription.created
  - subscription.updated
  - subscription.canceled
  - subscription.paused
  - subscription.activated *(currently unhandled; subscribe anyway for future use)*
  - transaction.completed
  - transaction.payment_failed
  - adjustment.created
  - adjustment.updated
- [ ] Domain verification for `startupvalidator.app`
- [ ] Paddle product description fields populated (Paddle scrutinizes these for ROSCA compliance — must clearly describe what the user is buying)
- [ ] Paddle's customer-portal copy reviewed for Tabempa branding accuracy

### Code-side migrations to run before promotion

- [ ] **Replace sandbox price IDs in [tiers.ts:34-45](../client/src/lib/paddle/tiers.ts#L34-L45) and [founding-members.ts:50-64](../client/src/lib/paddle/founding-members.ts#L50-L64)** with production-generated IDs. Both files have inline TODO comments. Six IDs to swap.
- [ ] **Wipe sandbox Subscription rows from production database** before going live. Any Subscription where `paddleSubscriptionId` matches sandbox patterns (`sub_01k*` from sandbox test runs) must be deleted to avoid colliding with real production IDs.
- [ ] **Backfill `User.paddleCustomerId` from `Subscription.paddleCustomerId`** for any user whose Subscription row was created via legacy backfill before the webhook upsert fix landed. SQL one-liner:
  ```sql
  UPDATE "User" SET "paddleCustomerId" = s."paddleCustomerId"
  FROM "Subscription" s
  WHERE "User".id = s."userId"
    AND s."paddleCustomerId" != ''
    AND "User"."paddleCustomerId" IS NULL;
  ```

### Banking + payouts

- [ ] USD corporate domiciliary account confirmed at UBA / GT Bank / Sierra Leone Commercial Bank
- [ ] SWIFT routing confirmed with Paddle
- [ ] Payout threshold set to $1,500-2,000 (per spec §10.2)
- [ ] Tax filing schedule confirmed with NRA

### Rollback plan

If launch goes wrong within the first 24 hours:
1. Flip `NEXT_PUBLIC_PADDLE_ENV` to `sandbox` in Vercel — every paid surface degrades gracefully (subscribe buttons disable)
2. Disable webhook destination in Paddle production dashboard so no further state mutates
3. **Do not** attempt to reverse subscriptions individually — let them stay until investigated
4. **Data consistency risk:** any user who completed a subscription before the rollback keeps the right Subscription row (it was written by webhook). Their tier remains correct. Rollback is non-destructive to existing customers.
5. Real refunds (if anyone subscribed during the window) must be issued manually via Paddle dashboard.

---

## Sentry Instrumentation Roadmap

Sentry is not yet installed. The following instrumentation should land in the same PR as `@sentry/nextjs` setup. Capture call signature: `Sentry.captureException(err, { extra: {...}, tags: {...} })`.

### Webhook receiver

[client/src/app/api/webhooks/paddle/route.ts](../client/src/app/api/webhooks/paddle/route.ts):

```typescript
// Inside the after() callback
} catch (err) {
  Sentry.captureException(err, {
    tags:  { feature: 'paddle-webhook', eventType: event?.eventType ?? 'unknown' },
    extra: { paddleSubscriptionId: event?.data?.id, paddleCustomerId: event?.data?.customerId },
  });
  logger.error('Paddle webhook processing failed', err);
}
```

### Webhook signature failures (separate from processing failures)

```typescript
} catch (err) {
  // Signature failures are LOW priority but useful as a telemetry signal —
  // a sudden burst suggests credential rotation gone wrong or someone probing
  Sentry.captureMessage('Paddle webhook signature verification failed', {
    level: 'warning',
    tags:  { feature: 'paddle-webhook', failure: 'signature' },
  });
  logger.warn('Paddle webhook signature verification failed', { ... });
  return NextResponse.json({ error: 'Signature mismatch' }, { status: 400 });
}
```

### Billing server action

[client/src/app/actions/billing.ts](../client/src/app/actions/billing.ts):

```typescript
} catch (err) {
  Sentry.captureException(err, {
    tags:  { feature: 'paddle-portal-link' },
    extra: { paddleCustomerId: user.paddleCustomerId },  // OK to log; not a secret
  });
  logger.error('Paddle customer portal session creation failed', err, { userId: session.user.id });
  return { ok: false, reason: 'paddle-error' };
}
```

### Refund handler

[client/src/lib/paddle/webhook-processor.ts](../client/src/lib/paddle/webhook-processor.ts) — wrap the transaction in `handleAdjustment` and capture if it throws. Chargeback is high-severity:
```typescript
Sentry.captureException(err, {
  level: 'error',
  tags:  { feature: 'paddle-refund', adjustmentAction: data.action, adjustmentType: data.type },
  extra: { paddleSubscriptionId: data.subscriptionId, adjustmentId: data.id },
});
```

### Anomaly detection function

Already calls `logger.error` per anomaly. Replace with explicit Sentry capture for each alert so they group correctly in the Sentry dashboard:
```typescript
Sentry.captureException(new Error('usage-anomaly'), {
  level: 'warning',
  tags:  { feature: 'usage-anomaly', tool: alert.tool, tier: alert.tier },
  extra: { userId, usage, threshold, multiplier, cycleEndsAt },
});
```

### PII scrubbing rules (configure in `sentry.server.config.ts`)

- **Strip `userEmail`** — even though our anomaly alerter logs it, Sentry's general policy should be "no email". The anomaly alerter is opt-in to email logging because the operator needs to identify the user; Sentry default should redact.
- **Never log `tier=undefined`** — collapse to `tier='unknown'` to keep Sentry tag cardinality bounded.
- **Hash userId** for Sentry events that don't need exact match — reduces PII surface.
- **Never capture full webhook payloads** — they contain billing details. Capture event type + IDs only.

---

## Metrics and Monitoring Recommendations

The codebase has zero metrics emission today (no Vercel Analytics events, no custom metrics endpoint, no Prometheus exporters). The following would be high-value to track. Ordered by priority:

| Metric | Why | Where to emit |
|---|---|---|
| Webhook delivery success rate (per event type) | Detects Paddle outages and our processing failures | Webhook route, after handler completes |
| Webhook processing latency p95 | Detects slow handlers approaching the 5s ack budget (less critical now if P0.1 moves to inline await) | Webhook route, time the handler |
| Refund rate (rolling 7-day window) | ROSCA-relevant; abnormal refund spikes indicate product or pricing issues | Adjustment handler |
| Cancellation rate (rolling 30-day window) | Standard SaaS health metric; required for any board reporting | Cancellation handler |
| Founding-slot remaining count (gauge) | Monitor approach to 50 — useful for "founding rate ending soon" UX | Read from Subscription, expose at `/api/internal/founding-status` |
| Past-due → recovery vs. past-due → cancel ratio | Paddle dunning effectiveness; informs whether our supplemental dunning email is needed | Cancel + transaction.completed handlers |
| Mean time from `subscription.created` webhook → first paid feature use | Activation funnel — short MTT use is a good leading indicator of retention | Cross-table query on Subscription.createdAt and first AI call |
| Paddle API call latency (per endpoint) | Detect Paddle degradation early | Wrapper around `paddleClient.*` calls |

**Surfacing:**
- **Sentry** for errors and anomalies (see §6)
- **Vercel Analytics** for the rate metrics if cheap; otherwise build a small `/api/internal/metrics` endpoint behind admin auth that returns the rates calculated on demand from Postgres
- **Inngest dashboard** for the existing anomaly function and any future cron jobs (already operational)

**Alerting conditions:**
- Webhook signature failure rate > 10/min for >5 min → Sentry alert (probable misconfiguration)
- Refund rate > 2x trailing 30-day average → Slack alert
- Founding slots remaining ≤ 5 → daily Slack summary
- Any `handleAdjustment` exception → immediate Sentry alert (refund processing must work)
- Any `handleSubscriptionCreated` exception → immediate Sentry alert (paid customer with no row)

---

## Dependencies and Vendor Risk Assessment

### Paddle (Merchant of Record, payment processing, customer portal)

**Blast radius if Paddle is down for hours:**
- New subscriptions cannot be created (Paddle.js overlay won't open or won't complete)
- Existing subscribers cannot manage billing (portal session generation fails)
- Webhooks queue on Paddle's side; our processor is idle but ready
- Existing tier gating continues to work (driven off our Subscription cache)
- Refunds cannot be processed
- **Net:** revenue operations stop; product operations continue for paying users

**Mitigations in place:**
- Paddle as MoR means tax + chargeback + billing infra is owned by Paddle; their uptime is our uptime for those concerns
- Subscription tier is cached locally — Paddle outage does not 403 paying users
- Customer portal link generation has a generic error fallback ("try again in a moment")

**Mitigations missing:**
- No incident-response runbook for Paddle outages
- No status-page integration to read Paddle's status into our app
- No fallback path for cancellation during a Paddle outage (e.g., email-based cancel acknowledgment)

**Recommendation:** add a `docs/paddle-incident-runbook.md` with: how to detect a Paddle outage, what to communicate to customers, how to manually accept refund/cancel requests via email until restored, how to backfill missed webhooks once recovered.

### `@paddle/paddle-node-sdk` (npm package)

- Currently `^3.7.0` — see P1.9. Pin exactly.
- No known CVEs at audit time (verify via `pnpm audit` before launch)
- Upgrade cadence: review every 90 days, bump only after testing in sandbox

### Webhook event contract stability

- Event names are accessed via the SDK's `EventName.X` enum — type-safe at compile time
- Adjustment payload shape (`action`, `type`, `status`, `subscriptionId`) is verified against the SDK's TypeScript types
- Risk: Paddle adds a new `status` value (e.g., `'pending_review'`) that the handler doesn't recognize. Currently handled by the `if (data.status !== 'approved') return;` filter — new statuses are safely ignored. Defensive.

### Inngest (background jobs)

- Hosts the `usage-anomaly-detection` function
- Outage means anomaly detection is delayed up to ~24h (next cron run after recovery)
- Not on the billing critical path — payment, cancel, refund, and tier gating all work without Inngest
- No further action needed

### Upstash Redis (rate limiting + cycle quota)

- Outage has the documented behaviors:
  - Per-request rate limiter falls back to in-memory (per-instance, useless across serverless invocations)
  - Cycle quota check fails open (logs warning, allows request)
- Acceptable degradation; the auth and tier gates are not Redis-dependent
- **Risk:** during a sustained Redis outage, cycle quotas are unenforced — heavy users could spend our COGS. Worst case ~$50-150/user/day for the outage duration. Accept this; alert via P0.1's monitoring once Sentry exists

### Anthropic / Exa / Tavily

- Not on the billing critical path
- Their outages affect product functionality but not subscription management

---

## Appendix A — Webhook Events Currently Handled

From [client/src/lib/paddle/webhook-processor.ts](../client/src/lib/paddle/webhook-processor.ts):

| Paddle event | Handler function | Line | Purpose | Notes |
|---|---|---|---|---|
| `subscription.created` | `handleSubscriptionCreated` | 92 | Upsert Subscription on userId; set User.paddleCustomerId | P0.1 risk — silent failure on DB outage |
| `subscription.updated` | `handleSubscriptionUpdated` | 167 | Tier / cancel-flag / period-end refresh | P1.4 (no audit log); P1.12 (no recovery if created event lost) |
| `subscription.canceled` | `handleSubscriptionCanceled` | 214 | Demote tier to free | Clean |
| `subscription.paused` | `handleSubscriptionPaused` | 248 | Demote tier to free + status paused | P1.11 (resume comment is optimistic) |
| `transaction.completed` | `handleTransactionCompleted` | 286 | Set status active on renewal | P1.5 (can re-activate canceled subs) |
| `transaction.payment_failed` | `handlePaymentFailed` | 299 | Set status past_due | **P0.3 (does not strip tier)** |
| `adjustment.created` | `handleAdjustment` | 325 | Refund processing (full → demote) | P1.6 (no chargeback handling) |
| `adjustment.updated` | `handleAdjustment` | 325 | Same as above | Idempotent via tier-already-free check |

**Events explicitly unhandled** (fall through to logger.debug at line 49):
- `subscription.activated` — P2.8
- `transaction.created`, `transaction.updated` — informational only, no action needed
- `customer.*`, `address.*`, `payment_method.*` — informational
- `payout.*` — accounting; outside app scope

---

## Appendix B — Every Paddle API Call Made by the Codebase

From grep `paddleClient.` across `client/src`:

| Call site | Line | API method | Purpose |
|---|---|---|---|
| Webhook receiver | [route.ts:35](../client/src/app/api/webhooks/paddle/route.ts#L35) | `paddleClient.webhooks.unmarshal(rawBody, secret, signature)` | Verify HMAC + parse payload |
| Billing server action | [billing.ts:52](../client/src/app/actions/billing.ts#L52) | `paddleClient.customerPortalSessions.create(customerId, subscriptionIds)` | Mint portal session URL |

That's the full surface. **No other Paddle SDK calls are made anywhere.** No subscription lookups, no customer fetches, no manual cancellation or refund issuance from our side. Everything else is webhook-driven.

**Implication:** P1.10's retry-and-backoff applies to a single call site, making the fix trivial to scope. P0.2's account-deletion fix would add a third call site (`paddleClient.subscriptions.cancel`).

---

## Appendix C — Every Environment Variable Used by the Payment System

From [client/src/lib/env.ts:82-85](../client/src/lib/env.ts#L82-L85) and grep `PADDLE_`:

| Variable | Required | Where used | Notes |
|---|---|---|---|
| `PADDLE_API_KEY` | yes | [client.ts:26](../client/src/lib/paddle/client.ts#L26) | Server-only. Never imported into a client component. P1.7 cross-validation recommended. |
| `PADDLE_WEBHOOK_SECRET` | yes | [route.ts:37](../client/src/app/api/webhooks/paddle/route.ts#L37) | Server-only. Used for HMAC verification. |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | optional | [providers.tsx:15](../client/src/app/providers.tsx#L15) → [PaddleProvider.tsx:64](../client/src/components/PaddleProvider.tsx#L64) | Client-safe (`test_*` or `live_*` prefix). Optional for local dev. |
| `NEXT_PUBLIC_PADDLE_ENV` | optional (defaults to `sandbox`) | [client.ts:19](../client/src/lib/paddle/client.ts#L19), [providers.tsx:16](../client/src/app/providers.tsx#L16) | Drives env switch on both server SDK and client Paddle.js. |
| `USAGE_ANOMALY_WEBHOOK_URL` | optional | [usage-anomaly-detection-function.ts:69](../client/src/inngest/functions/usage-anomaly-detection-function.ts#L69) | Slack/Discord webhook for anomaly alerts. Falls back to `logger.error` only. |

**No payment-related secrets are referenced from any client component.** Confirmed via `grep -r "PADDLE_" client/src/app | grep -v "use server" | grep -v webhooks`.

---

**End of audit.**
