# NeuraLaunch — Billing, Cancellation, and Refund Flow Audit

**Date:** 2026-04-18
**Branch surveyed:** `fix/usage-caps-and-abuse-prevention` (based on latest `dev`)
**Scope:** Root-cause the disabled Manage Billing button, and audit the entire cancellation + refund surface against ROSCA / Paddle post-FTC-settlement expectations.
**Status:** Audit only — no code changes.

---

## 1. Executive Summary

**The "Manage Billing" button is disabled for every user who has a `Subscription` row but not a `User.paddleCustomerId`.** That is the entire population created by the legacy-free backfill script at [client/scripts/paddle/backfill-subscriptions.ts:69](../client/scripts/paddle/backfill-subscriptions.ts#L69), which writes `paddleCustomerId: ''` onto `Subscription` and never touches `User.paddleCustomerId`. Alpha's Compound account is almost certainly one of these — a backfilled legacy row whose `tier` was manually upgraded (or whose webhook never completed), so `User.paddleCustomerId` is still `null`. The `BillingSection` correctly reads that as "no billing profile," disables the button, and shows *"Complete a paid checkout to unlock billing management"* — a message that is technically accurate but useless to a user who just paid. Fix is surgical: either derive `hasBillingProfile` from `Subscription.paddleCustomerId !== ''` (the existing source of truth), or backfill `User.paddleCustomerId` from the Subscription row during the Paddle promotion step.

**There is a second, more dangerous bug hiding behind the first.** A legacy-backfilled user who later subscribes through real Paddle checkout will hit a **unique constraint collision on `Subscription.userId`** inside [webhook-processor.ts:106-129](../client/src/lib/paddle/webhook-processor.ts#L106-L129). The upsert is keyed on `paddleSubscriptionId`, which doesn't match the backfilled sentinel `legacy_free_<userId>`, so Prisma tries to *create* a new row — but `userId` is `@unique`, so the create throws `P2002`. The webhook is wrapped in `after(() => try/catch)` at [route.ts:56](../client/src/app/api/webhooks/paddle/route.ts#L56), so the error is swallowed, Paddle sees a 200, the user is charged, and their Subscription row is never updated. This is a P0 blocker for production rollout — every legacy user who pays becomes a stuck account.

**Cancellation UX runs through the Paddle-hosted customer portal** (there is no in-app cancel path). That is defensible under ROSCA — Paddle's portal is the Merchant of Record and offers one-click scheduled cancellation, pause, and reactivation — but **the entrypoint to the portal is the broken Manage Billing button**, which means *today a legitimate subscriber cannot cancel from the NeuraLaunch UI*. This is an immediate ROSCA violation risk and the single most likely thing to cause Paddle to reject the production underwriting application. Fix the button and this becomes compliant; leave it and you will either fail underwriting or ship a product where the cancellation path is formally harder than the subscription path.

**Refund handling is underbuilt.** The ToS promises a 14-day refund on annual subscriptions and no refund on monthly. The codebase has **zero refund webhook handling** — [webhook-processor.ts](../client/src/lib/paddle/webhook-processor.ts) does not listen for `transaction.refunded`, `adjustment.updated`, or any variant. A refunded annual customer keeps their Compound access until `currentPeriodEnd` (sentinel `2099-12-31` if the row was ever touched by the backfill and never reset), because nothing on the refund side demotes them. The refund promise is also undiscoverable — no refund text on the pricing page, no checkout-time disclosure, only buried in §7.2 of the ToS that most users never read. The refund-abuse risk (subscribe → use heavily for 13 days → refund) has no detection or mitigation whatsoever.

**Four scenarios from the edge-case battery work correctly, two are broken.** Scenarios A (mid-cycle cancel), B (reactivate before period end), C (dunning), and F (period-end auto-drop) are genuinely wired — the webhook handlers exist and the database model supports them. Scenarios D (refund request) and E (abusive heavy-use-then-refund) are not handled at all; both will leave the user with their tier intact after the refund, effectively giving them a free paid tier through the next period.

---

## 2. Why the Manage Billing Button Is Disabled — Root Cause

### 2.1 Render logic (in one line)

[BillingSection.tsx:103](../client/src/app/(app)/settings/BillingSection.tsx#L103):
```tsx
disabled={!hasBillingProfile || isPending}
```

`hasBillingProfile` is passed in from the settings page as:

[settings/page.tsx:115](../client/src/app/(app)/settings/page.tsx#L115):
```tsx
hasBillingProfile={Boolean(user.paddleCustomerId)}
```

where `user` is the User model row (not Subscription). So the button is disabled on initial render for any user whose `User.paddleCustomerId` column is `null` or empty string — *regardless of what their Subscription tier says*.

### 2.2 Why Alpha's Compound account hits this

There are three paths by which a user ends up Compound-tier with no `User.paddleCustomerId`:

**Path 1 — Legacy backfill + manual tier upgrade (most likely for Alpha).**
The backfill script at [backfill-subscriptions.ts:63-74](../client/scripts/paddle/backfill-subscriptions.ts#L63-L74) creates every existing user a virtual free Subscription row:
```typescript
{
  userId,
  paddleSubscriptionId: `legacy_free_${user.id}`,
  paddleCustomerId:     '',           // ← empty string on Subscription
  status:               'active',
  tier:                 'free',
  currentPeriodEnd:     SENTINEL_PERIOD_END,  // 2099-12-31
}
```
Note this sets `Subscription.paddleCustomerId = ''` but does **not** touch `User.paddleCustomerId` — that column stays `null`. If Alpha then manually updated his own Subscription row (`UPDATE Subscription SET tier = 'compound' WHERE userId = '…'`) for dev testing — a common pattern when Paddle sandbox is unavailable — the Subscription row reads `compound` but the User row still reads `paddleCustomerId: null`. The settings page computes `hasBillingProfile: false` → button disabled.

**Path 2 — Paddle webhook silently dropped the `customData.internalUserId`.** [webhook-processor.ts:91-98](../client/src/lib/paddle/webhook-processor.ts#L91-L98) logs and returns without writing anything if `customData.internalUserId` is missing. A checkout opened outside the SubscribeButton flow (Paddle dashboard manual creation, Paddle test-invoice link, direct API call) has no internalUserId. Symptom: the user paid, their Paddle account exists, the Tabempa Subscription row does not.

**Path 3 — The unique-constraint collision bug (see §2.3).** Rarer today but universal at launch: legacy-backfilled user pays for real, webhook throws, `User.paddleCustomerId` never gets set, button stays disabled forever.

### 2.3 The compound bug nobody noticed

Schema constraints ([prisma/schema.prisma:126-132](../client/prisma/schema.prisma#L126-L132)):
```prisma
model Subscription {
  userId               String   @unique     // ← only one Subscription per user
  paddleSubscriptionId String   @unique     // ← upsert key
  paddleCustomerId     String
  ...
}
```

When `subscription.created` fires for a legacy-backfilled user:
1. `handleSubscriptionCreated` does `prisma.subscription.upsert({ where: { paddleSubscriptionId: data.id }, … })`.
2. `data.id` is the new Paddle sub id (`sub_01K…`). The backfilled row has `paddleSubscriptionId = legacy_free_<userId>`. No match → Prisma tries `create`.
3. `create` fails on the `userId` unique constraint because the backfilled row already owns that userId.
4. The throw propagates up to [webhooks/paddle/route.ts:56-64](../client/src/app/api/webhooks/paddle/route.ts#L56-L64), which catches inside the `after(...)` scheduler and logs — but the HTTP response was already `200` and Paddle never retries.

**Net effect:** user is charged by Paddle, user's Paddle customer record exists, but NeuraLaunch's database is frozen in the backfilled `tier: 'free'` state. The Manage Billing button is disabled, the tier is wrong, and all paid features 403. This is not theoretical — it is the guaranteed outcome for every legacy user at launch.

### 2.4 What the user sees vs. what they should see

| Actual state | Shown to user | Should show |
|---|---|---|
| `hasBillingProfile=false`, `tier='compound'` | "Compound tier — Status: active — Renews 12/31/2099" + disabled button + "Complete a paid checkout to unlock billing management" | "Compound (developer override — no Paddle customer)" or an admin-only notice. A real paying user should never see this state. |
| Webhook failed silently after real payment | Same as above | Loud banner: "Your subscription was processed but we couldn't sync it. Contact support." + admin alert. |

### 2.5 Specific fixes

**Minimal fix (1 line, unblocks Alpha):** change the settings page to source `hasBillingProfile` from the Subscription row instead of User:
```tsx
// settings/page.tsx line 115
hasBillingProfile={Boolean(subscription?.paddleCustomerId)}
```
This still returns `false` for the backfill's empty string (`''` is falsy) but returns `true` for any real Paddle-created row, which is the correct semantic.

**Correct fix (also prevents the P0 launch bug):** rewrite `handleSubscriptionCreated` to upsert on `userId` (the natural key — one Subscription per user) rather than `paddleSubscriptionId`. Then the legacy-free row gets overwritten with the real Paddle data on a user's first real subscription, and both `User.paddleCustomerId` and `Subscription.paddleCustomerId` land in a consistent state. Pair with a one-line migration to set `User.paddleCustomerId = Subscription.paddleCustomerId` for any row where the Subscription side is non-empty, to repair previously-dropped webhooks.

**UX fix regardless:** when `hasBillingProfile=false` but `tier !== 'free'`, show an error state ("Your billing profile couldn't be located — contact support"), not the happy-path "complete a paid checkout" message. The two conditions should never coexist for a real paying user; if they do, surface it.

---

## 3. Cancellation Flow Walkthrough

### 3.1 User-facing click path

1. **Click Settings** (sidebar) → `/settings`
2. **Scroll to Billing section** (third card, after Account + Privacy)
3. **Click "Manage billing"** ([BillingSection.tsx:100](../client/src/app/(app)/settings/BillingSection.tsx#L100))
4. **Client invokes server action** `generatePortalLink()` ([billing.ts:26](../client/src/app/actions/billing.ts#L26))
5. **Server mints a Paddle customer portal session** ([billing.ts:52](../client/src/app/actions/billing.ts#L52)) scoped to this user's `paddleCustomerId` + any `paddleSubscriptionId` they own
6. **Client redirects** via `window.location.href = result.url` ([BillingSection.tsx:47](../client/src/app/(app)/settings/BillingSection.tsx#L47)) to the Paddle-hosted portal
7. **Inside the Paddle portal**, user chooses one of:
   - **Cancel now** — takes effect at period end (Paddle's default)
   - **Pause** — puts the subscription on hold
   - **Change payment method / card**
   - **Update billing address**
   - **View / download invoices**
   - **Upgrade / downgrade** between plans (if Paddle's product catalog allows)
8. **Paddle fires webhook** back to `/api/webhooks/paddle`
9. **NeuraLaunch webhook processor updates** the Subscription row

### 3.2 Webhook handling per cancellation event

| Paddle event | Handler | Fields mutated | Notes |
|---|---|---|---|
| `subscription.updated` with `scheduledChange.action === 'cancel'` | [handleSubscriptionUpdated:151](../client/src/lib/paddle/webhook-processor.ts#L151) | `status`, `tier`, `priceId`, `isFoundingMember`, **`cancelAtPeriodEnd: true`**, `currentPeriodEnd` | Fires when user clicks "Cancel" in portal — the cancel is scheduled, not immediate. Correctly sets `cancelAtPeriodEnd`. |
| `subscription.canceled` | [handleSubscriptionCanceled:198](../client/src/lib/paddle/webhook-processor.ts#L198) | `status: 'canceled'`, **`tier: 'free'`**, `cancelAtPeriodEnd: false` | Fires at period end when the scheduled cancel takes effect. Demotes tier → free immediately. |
| `subscription.paused` | [handleSubscriptionPaused:232](../client/src/lib/paddle/webhook-processor.ts#L232) | `status: 'paused'` only | **Does NOT change `tier`.** See §3.5 for the hole this creates. |
| `subscription.updated` with `scheduledChange` cleared (user reactivates) | [handleSubscriptionUpdated:151](../client/src/lib/paddle/webhook-processor.ts#L151) | `cancelAtPeriodEnd: false` | Works correctly — `scheduledCancel` is recomputed from `data.scheduledChange?.action === 'cancel'`. |

### 3.3 UI during the cancellation lifecycle

| Subscription state | UI surface | Location |
|---|---|---|
| `status: 'active'`, `cancelAtPeriodEnd: false` | "Status: active · Renews MM/DD/YYYY" + "Manage billing" button | [BillingSection.tsx:76-84](../client/src/app/(app)/settings/BillingSection.tsx#L76-L84) |
| `status: 'active'`, `cancelAtPeriodEnd: true` | Grey banner: "Your subscription is scheduled to end on MM/DD/YYYY. You can resume from the portal before then." + "Ends MM/DD/YYYY" label | [BillingSection.tsx:93-97](../client/src/app/(app)/settings/BillingSection.tsx#L93-L97) |
| `status: 'past_due'` | Amber banner: "Payment failed on your last renewal. Update your card in the portal to keep your subscription active." | [BillingSection.tsx:88-92](../client/src/app/(app)/settings/BillingSection.tsx#L88-L92) |
| `status: 'canceled'` (post-period-end) | Tier drops to Free, status line shows "Status: canceled" with no period-end date (tier is Free). No persistent reminder of prior tier. | Implicit from `tier === 'free'` code path |
| `status: 'paused'` | **No dedicated UI.** The status text just reads "Status: paused." The user still appears to have their Compound tier (because `handleSubscriptionPaused` doesn't change tier). | GAP |

### 3.4 Reactivation flow

A user who scheduled cancellation can undo it from the Paddle portal. Paddle fires `subscription.updated` with `scheduledChange: null`, `handleSubscriptionUpdated` sets `cancelAtPeriodEnd: false`, and the cancel banner disappears on next page refresh. This works — assuming the Manage Billing button works.

No in-app reactivation button exists. If the user tries to come back after `subscription.canceled` has fired (tier already on Free), they must re-checkout from the pricing page — their prior Paddle customer/subscription isn't reused automatically. Minor UX gap; not a compliance issue.

### 3.5 Gaps in the cancellation flow

1. **Paused subscriptions keep their paid tier.** [handleSubscriptionPaused:232](../client/src/lib/paddle/webhook-processor.ts#L232) only touches `status`. A paused Compound subscriber can still use Compound features until Paddle eventually cancels or the record expires. Unlikely abuse vector but a billing-integrity hole.
2. **No prior-tier memory after cancellation.** Once `tier: 'free'` is written, the user's history of having been Compound is gone from the Subscription row. If they re-subscribe at standard rate instead of founding rate, the founding-member history is lost. Survives in Paddle but not queryable locally.
3. **No in-app email-fallback cancel option.** ToS §7.1 says "cancel through the Paddle customer portal or by contacting us at [support email]" — but the support email is a literal placeholder in the ToS file, and there is no mailto link anywhere in Settings for a user whose portal link is broken. If Manage Billing fails (as it does today), the user has no documented escape.

---

## 4. Refund Flow Walkthrough

### 4.1 What the ToS promises

[terms-of-service.md:152-159](./neuralaunch-terms-of-service.md#L152-L159), §7.2:

- **Monthly:** non-refundable. Cancel to prevent future charges.
- **Annual:** full refund within 14 days of purchase or renewal. No refund after 14 days.
- **Founding member:** same policy; but if they cancel, the founding rate is forfeited.

Refund requests: *"Refund requests should be directed to [support email] or processed through the Paddle customer portal."* Again, the support email is a placeholder.

### 4.2 What the product surfaces

| Touchpoint | Refund policy disclosed? |
|---|---|
| Pricing cards ([PricingSection.tsx](../client/src/components/marketing/PricingSection.tsx)) | **No.** No mention of refund policy anywhere. |
| Pre-checkout (SubscribeButton opens Paddle overlay) | **No.** Paddle overlay shows price and billing frequency, but the refund clause lives only in the ToS file. ToS is not explicitly linked near the Subscribe button. |
| Post-checkout confirmation email | **Not audited** — the codebase has no email send logic for checkout confirmations; Paddle sends its own receipt which may or may not include NeuraLaunch's refund terms. |
| Settings → Billing | **No.** No refund text. |
| Paddle customer portal | Likely yes (Paddle surfaces Merchant's refund terms if configured in the dashboard), but not verified. |

**This is a ROSCA risk.** ROSCA requires "clearly and conspicuously" disclosing material terms *before obtaining billing information*. A refund policy buried in a 400-line ToS file that nobody reads, with no mention on the pricing card or at the point of checkout, is exactly the deceptive pattern Paddle's post-FTC-settlement underwriting is watching for.

### 4.3 How a refund actually flows through the system

1. **User requests refund** via Paddle portal (probably) or email (ToS placeholder).
2. **Tabempa / Paddle grants it** — processed in Paddle dashboard or by Paddle support.
3. **Paddle fires webhook** — typically `transaction.refunded` or `adjustment.updated` (refunds in Paddle Billing are Adjustments).
4. **NeuraLaunch webhook processor**: [webhook-processor.ts:27-46](../client/src/lib/paddle/webhook-processor.ts#L27-L46) switches on `event.eventType`. The handled events are `SubscriptionCreated`, `SubscriptionUpdated`, `SubscriptionCanceled`, `SubscriptionPaused`, `TransactionCompleted`, `TransactionPaymentFailed`. **No refund / adjustment event is handled.** Falls through to the `default` branch — logged at debug, no state change.
5. **Local Subscription row remains unchanged.** If the user's annual subscription was refunded on day 7, their Subscription row still says `status: 'active'`, `tier: 'compound'`, `currentPeriodEnd: <next year>` — they keep full Compound access for 358 more days despite having been refunded.

**This is a straight-up financial bug.** A refunded user gets all their money back AND a year of paid access. There is no mechanism in the codebase to demote tier on refund.

### 4.4 Abuse risk

Scenario: user buys Compound annual for $479 at standard rate (or $279 as a founder once that ships, though annual founding isn't offered per spec §1.2). Uses Research Tool aggressively — 25-step Opus + Exa + Tavily, ~$0.50-1.50 per run, 40-60 runs in two weeks is a $20-90 COGS hit. Requests full refund on day 13. The ToS allows it. The webhook doesn't demote them. **Net loss to Tabempa: $479 refunded + ~$50 COGS consumed + full Compound access for the remaining 351 days because nothing strips tier.**

Mitigations that don't exist:
- No per-period usage cap on refundable accounts.
- No detection of "high consumption + refund request" patterns.
- No clawback on granted access after refund.

The refund window on annual is the intended gesture of good faith. It is currently an open invoice.

---

## 5. ROSCA and FTC Compliance Assessment

The 2024–2025 FTC action against Paddle centered on Paddle's tolerance of merchants whose checkout, consent, and cancel flows violated ROSCA (Restore Online Shoppers' Confidence Act of 2010). The settlement changed Paddle's underwriting bar. A new merchant application today is scrutinized for:

### 5.1 Clear disclosure of material terms before payment

**ROSCA requires:** price, billing frequency, renewal terms, and refund policy disclosed "clearly and conspicuously" *before* billing info is collected.

**NeuraLaunch today:**
- Price ✅ — shown on pricing cards.
- Billing frequency ✅ — monthly / annual toggle is explicit.
- Renewal terms ⚠ — the pricing cards do not say the subscription auto-renews. The ToS §5.4 says annual renews automatically, but a user who clicks Subscribe without reading the ToS never sees this.
- Refund policy 🔴 — not disclosed on the pricing page or at checkout; only in the ToS.

**Fix:** add a "Renews automatically. Cancel anytime." line under each paid card's price, and a "14-day refund on annual plans." line on the Compound annual / Execute annual presentations. Copy-only, zero code.

### 5.2 Affirmative opt-in consent

**ROSCA requires:** an explicit consent step (not just clicking "Buy") where the user confirms they understand they're enrolling in a recurring subscription.

**NeuraLaunch today:** the Paddle checkout overlay provides this — Paddle's own checkout UI has a "Start subscription" button with the terms inline. This is Paddle's responsibility as Merchant of Record, and Paddle's post-FTC UI satisfies this bar by design.

**Verdict:** compliant via Paddle. No NeuraLaunch-side change needed.

### 5.3 Simple cancellation mechanism

**ROSCA requires:** cancellation roughly as easy as subscription — ideally one or two clicks.

**NeuraLaunch today:** subscription is 2 clicks (card → Subscribe → Paddle overlay → pay). Cancellation is *designed* as 3 clicks (Settings → Manage billing → Paddle portal "Cancel"). **But the Manage Billing button is disabled for Alpha today, which in practice makes cancellation impossible from the UI.**

**Verdict:** 🔴 Non-compliant until the button bug is fixed. This is the single most likely cause of Paddle underwriting friction if the production application is submitted in the current state.

### 5.4 Clear renewal reminders

**ROSCA:** for annual subscriptions over a certain threshold and initial terms > 6 months, an automatic renewal notification is required at least 3 days before renewal. (Federal law; several states have stricter requirements.)

**NeuraLaunch today:** no renewal-reminder email logic exists in the codebase. No scheduled job in Inngest for this purpose. Paddle may send its own renewal notice depending on dashboard configuration — unverified.

**Verdict:** 🔴 Unverified. Must confirm Paddle's renewal email is enabled and contains the required language, or build a NeuraLaunch-side reminder job.

### 5.5 No deceptive dark patterns

**ROSCA / FTC:** prohibits manipulative cancel flows (guilt prompts, hidden buttons, phone-only cancel, long survey before cancel).

**NeuraLaunch today:** no in-app cancel UI → no dark patterns to review on our side. Paddle portal is standard and clean. **However, the post-tier-cancel UI shows no dark pattern but also no graceful downgrade — the user just wakes up on Free with no explanation or re-engagement.** Not a dark pattern, but weak UX.

**Verdict:** compliant.

### 5.6 Overall ROSCA posture — scored

| Requirement | Status | Blocker for launch? |
|---|---|---|
| Price/frequency disclosed pre-checkout | ✅ | No |
| Auto-renewal disclosed pre-checkout | ⚠ | Copy fix — not a launch blocker but Paddle will flag |
| Refund policy disclosed pre-checkout | 🔴 | **Paddle will flag** |
| Affirmative subscription consent | ✅ (via Paddle) | No |
| Simple cancel path functional | 🔴 | **YES — Manage Billing button broken** |
| Renewal reminders for annual | ⚠ Unverified | Verify Paddle-side or build |
| No deceptive cancel patterns | ✅ | No |

**Two hard blockers (button, refund disclosure), two soft (auto-renewal disclosure, renewal reminders), three clean.**

---

## 6. Edge Case Handling — Scenarios A–F

### Scenario A — Active user cancels mid-cycle

User subscribes Day 1. Clicks Manage Billing Day 10, cancels in portal.

**Expected:** full access through current billing period; tier drops to Free at `currentPeriodEnd`.

**Actual:** ✅ Works as intended.
- Day 10: Paddle fires `subscription.updated` with `scheduledChange.action='cancel'`. Handler at [webhook-processor.ts:151](../client/src/lib/paddle/webhook-processor.ts#L151) sets `cancelAtPeriodEnd: true`. UI shows grey banner "ends on MM/DD/YYYY."
- Day 30 (period end): Paddle fires `subscription.canceled`. Handler at :198 sets `tier: 'free'`, `status: 'canceled'`. Session callback next page load reads tier as free, all Compound features 403.

**Caveat:** depends on Manage Billing button working. Today it doesn't.

### Scenario B — Reactivate before period end

Same as A, but Day 20 user clicks "Resume" in Paddle portal.

**Actual:** ✅ Works.
- Paddle fires `subscription.updated` with `scheduledChange: null`. Handler sets `cancelAtPeriodEnd: false`. Banner disappears next page load.

### Scenario C — Payment fails on renewal (dunning)

Day 30 renewal charge is declined.

**Actual:** ✅ Works but thinly.
- Paddle fires `transaction.payment_failed`. Handler at [webhook-processor.ts:257](../client/src/lib/paddle/webhook-processor.ts#L257) sets `status: 'past_due'`.
- Billing UI renders amber banner: "Payment failed on your last renewal. Update your card in the portal to keep your subscription active." ([BillingSection.tsx:88-92](../client/src/app/(app)/settings/BillingSection.tsx#L88-L92)).
- Paddle's automated dunning (3-5 retries over 2 weeks, depending on dashboard config) runs. If all fail, Paddle cancels and fires `subscription.canceled` → tier drops to Free.

**Gap:** no email notification from NeuraLaunch — the user must happen to visit Settings to see the banner. No grace-period communication.

### Scenario D — User requests refund on annual Day 7 (within 14-day window)

**Actual:** 🔴 **Broken.**
- ToS says the refund should be granted.
- No in-app refund request mechanism (see §4).
- User emails support (ToS placeholder email).
- If granted, Tabempa processes the refund in Paddle dashboard.
- Paddle fires `transaction.refunded` (or an `adjustment.*` event).
- **Neither is handled by [webhook-processor.ts](../client/src/lib/paddle/webhook-processor.ts).** Falls to the default branch, logged at debug only.
- The user keeps `status: 'active'`, `tier: 'compound'`, full access for the remaining 358 days.

**Fix required:** add a `TransactionRefunded` (or Paddle Billing's `adjustment.updated` with `action: 'refund'`) handler that sets `status: 'canceled'` and `tier: 'free'` immediately if the refund is full, or leaves active if it's a partial refund. Requires reading Paddle's Adjustment payload to distinguish.

### Scenario E — Heavy use + refund abuse

User buys Compound annual Day 1, runs Research Tool 50 times in 13 days, requests refund Day 13.

**Actual:** Same broken path as D, plus no abuse detection.
- Refund granted (policy allows).
- Webhook not handled → tier not stripped.
- No usage cap on refund-eligible accounts (the usage caps on the current branch are ratelimit-style, not cumulative-per-period).
- Net: Tabempa loses $479 refunded + ~$50-100 COGS + continued free Compound access.

**Mitigation options:** (a) tighten the refund window from 14 days to 7; (b) pro-rate the refund against consumed usage; (c) build a usage-consumed flag that auto-forfeits refund eligibility above a threshold; (d) switch annual to "non-refundable beyond a cooling-off period of 72 hours." None of these are built.

### Scenario F — Period end after scheduled cancellation

User canceled Day 10 of a monthly cycle. Day 31 arrives.

**Actual:** ✅ Works.
- Paddle fires `subscription.canceled` at the end of the billing period (Paddle's "cancel_at_period_end" behavior).
- Handler sets `tier: 'free'`, `status: 'canceled'`.
- Next session callback read returns `tier: 'free'`. All Execute/Compound routes 403.

**Caveat:** tier gate reads are live on every session callback ([auth.ts:71](../client/src/auth.ts#L71)), so the downgrade is immediate on the next request. Good.

---

## 7. Findings — P0 / P1 / P2 / P3

### P0 — Must fix before Paddle production underwriting

1. **Manage Billing button disabled for legitimate subscribers.** [settings/page.tsx:115](../client/src/app/(app)/settings/BillingSection.tsx#L115) derives `hasBillingProfile` from `User.paddleCustomerId`, which is null for any user hit by the legacy backfill. ROSCA-critical: this is the only cancellation path in the product. **Fix:** change to `Boolean(subscription?.paddleCustomerId)` at minimum; ideally also promote the legacy backfill to populate `User.paddleCustomerId` from the Subscription side when available.

2. **Webhook-processor upsert fails for legacy-backfilled users.** [webhook-processor.ts:106](../client/src/lib/paddle/webhook-processor.ts#L106) keys upsert on `paddleSubscriptionId`; the backfill uses sentinel IDs that never match a real Paddle ID, and the `create` branch collides on `userId @unique`. Every legacy user who pays for real gets a silent webhook failure and a stuck `free`-tier Subscription row. **Fix:** rekey upsert on `userId` (the natural unique). Pair with a migration that wipes the sentinel `legacy_free_*` rows or clears their `paddleSubscriptionId` before launch.

3. **No refund webhook handling.** [webhook-processor.ts:40-46](../client/src/lib/paddle/webhook-processor.ts#L40-L46) does not handle `transaction.refunded` or Paddle Billing `adjustment.updated` with refund action. A refunded user retains paid access indefinitely. Direct financial loss + breach of ToS §7.2 promise. **Fix:** add the handler; on full refund, set `status: 'canceled'`, `tier: 'free'`, `currentPeriodEnd: now()` in a transaction, and bump `User.tierUpdatedAt`.

4. **Refund policy not disclosed at point of sale.** ROSCA explicitly requires pre-billing disclosure of refund terms. Currently only buried in ToS §7.2. **Fix:** add a one-liner under each paid pricing card (e.g., "14-day refund on annual. Monthly non-refundable. Cancel anytime.") and add a similar disclosure in the SubscribeButton helper text or immediately before the Paddle overlay opens. Copy-only change.

5. **Auto-renewal not disclosed on pricing cards.** Same class of ROSCA gap. **Fix:** one-line addition: "Renews automatically. Cancel anytime in Settings." under each paid card.

### P1 — Important, fix soon but not launch-blocking

6. **`/validation/[pageId]/publish/route.ts` lacks tier gate defence-in-depth.** Flagged in the prior tier audit. Cross-referenced here because a downgraded-post-cancel user can still trigger paid Opus calls on publish. **Fix:** add `requireTierOrThrow(userId, 'compound')` at the top of the POST handler.

7. **Paused subscription keeps paid tier.** [handleSubscriptionPaused:232](../client/src/lib/paddle/webhook-processor.ts#L232) only sets `status: 'paused'` and does not demote tier. A paused user retains all paid features until the eventual Paddle cancellation. **Fix:** decide product policy (pause = lose access, or pause = retain access for X days) and reflect in the handler.

8. **Support email is a placeholder throughout the ToS.** Strings `[support email]` appear in §3.2, §7.1, §7.2, §9.6, §14.3, §15.2, §17. Every cancellation and refund path routes through email to nowhere. **Fix:** replace with the real address, confirm the mailbox is monitored.

9. **No renewal reminder for annual subscribers.** ROSCA requires pre-renewal notice for annual subscriptions over certain thresholds. No Inngest scheduled job or email dispatch exists. **Fix:** verify Paddle's dashboard sends a renewal reminder email and enable if not, OR build a NeuraLaunch cron job that sends a 3-day-before renewal email for annual subs.

10. **UI state mismatch when `hasBillingProfile=false` but `tier !== 'free'`.** Today this combination just silently disables the button with the wrong helper text. **Fix:** detect this impossible-for-real-users state and surface a loud "Billing profile not found — contact support" error. This is also how you'll catch future webhook-processing bugs in production.

11. **No in-app cancel confirmation screen.** User clicks Manage Billing → Paddle portal → cancels → comes back to NeuraLaunch with no acknowledgement. **Fix:** add a return-URL parameter to the Paddle portal link so NeuraLaunch knows the user just returned from a cancel action, and show a confirmation toast "Your cancellation is scheduled for MM/DD/YYYY. You can resume anytime."

12. **No mechanism to detect heavy-use-then-refund abuse.** **Fix:** log per-subscription cumulative COGS (or a proxy: API call count weighted by tool) and, if a refund is requested within the window with above-threshold consumption, either downgrade refund to prorated or route the request to a manual review queue.

### P2 — Polish, nice-to-have

13. **Prior-tier memory lost after cancellation.** Once `tier: 'free'` is written, the user's history of having been Compound is not queryable locally. **Fix:** add a `formerTier` or `lastPaidTier` column, or keep a simple audit log of tier transitions.

14. **No in-app reactivation flow for cancelled subscribers.** A user whose subscription has already canceled (past period end) must re-checkout from the pricing page. **Fix:** in Settings → Billing, if `status: 'canceled'`, show a "Resubscribe" button that routes directly to the pricing card for their former tier.

15. **Dunning UI is visible but not actionable from mobile/email.** The amber banner only shows in Settings. **Fix:** send an email on the `transaction.payment_failed` webhook. Mobile push-notification support exists; wire this too.

16. **Post-checkout confirmation email not verified.** Paddle sends its own receipt, but whether it includes the NeuraLaunch refund clause is unverified. **Fix:** verify in Paddle dashboard, or add NeuraLaunch-side confirmation email.

### P3 — Known limitations, document only

17. **Third-party data retention after refund+delete is outside NeuraLaunch's control.** ToS §9.6 already flags this for Anthropic / Exa / Tavily. No action needed.

18. **Paddle portal UI copy is outside NeuraLaunch's control.** If Paddle's portal changes its cancellation UX, NeuraLaunch inherits the change automatically. Accept as merchant-of-record tradeoff.

19. **Sierra Leone jurisdiction for disputes (ToS §15).** Unusual for international users. Documented, not actionable.

---

## Appendix — Paddle Webhook Events Currently Handled

From [webhook-processor.ts:27-46](../client/src/lib/paddle/webhook-processor.ts#L27-L46):

| Event | Handler | Line | Handles |
|---|---|---|---|
| `subscription.created` | `handleSubscriptionCreated` | 87 | Upsert Subscription, set User.paddleCustomerId, bump tierUpdatedAt |
| `subscription.updated` | `handleSubscriptionUpdated` | 151 | Tier changes, cancelAtPeriodEnd flag, period-end refresh |
| `subscription.canceled` | `handleSubscriptionCanceled` | 198 | Demote tier to free, set status to canceled |
| `subscription.paused` | `handleSubscriptionPaused` | 232 | Set status to paused (DOES NOT demote tier — see P1.7) |
| `transaction.completed` | `handleTransactionCompleted` | 244 | Set status to active on successful renewal |
| `transaction.payment_failed` | `handlePaymentFailed` | 257 | Set status to past_due to trigger dunning banner |

**Events NOT handled** (fall through to default case, logged at debug):
- `transaction.refunded` — **P0 gap (see §4.3 and §7.3)**
- `transaction.created` — pre-payment, informational only
- `transaction.updated` — billing address changes, etc.
- `adjustment.created` / `adjustment.updated` — **refund adjustments in Paddle Billing; P0 gap**
- `subscription.activated` — typically follows a paused → active transition
- `subscription.trialing` — trials not offered today
- `subscription.past_due` — currently handled via `transaction.payment_failed` which is a different event class
- `customer.created` / `customer.updated` — not needed, customer is captured via subscription webhook
- `address.created` / `address.updated` — not needed, Paddle owns the address
- `payment_method.saved` — not needed
- `payout.*` — accounting events; handled outside the app

The minimum viable addition for refund integrity is `transaction.refunded` + `adjustment.updated` (Paddle Billing routes refunds through the Adjustment entity; verify the exact event name against the current Paddle SDK types before implementing).

---

**End of audit.**
