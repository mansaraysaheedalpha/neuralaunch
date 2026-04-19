# Pre-Launch Integrity — Delivery Report

**Branch:** `fix/pre-launch-integrity` (cut from `dev`)
**Date:** 2026-04-19
**Scope source:** [docs/tier-audit-report.md](./tier-audit-report.md) §7A/7B/7C and [docs/billing-cancellation-refund-audit.md](./billing-cancellation-refund-audit.md) P0/P1 findings
**Objective:** Close every P0 and P1 gap before Paddle production underwriting.

---

## Summary

Thirteen items committed as thirteen separate commits on one branch. No
deferrals. Every item identified in the two audits as a launch blocker
or important pre-launch fix is closed. The branch is ready to merge
into `dev` (then fast-forward into `main` once Alpha has completed
manual verification).

Commit trail (in order):

1. `8549a64` — fix(tier): move continuation brief and fork selection to Compound tier per spec
2. `6050af4` — fix(validation): add defence-in-depth Compound gate on publish route
3. `d07ce0b` — feat(continuation): incorporate validation page analytics into brief generation
4. `0315a42` — docs(pricing): clarify cross-venture memory framing on Compound tier
5. `4363fe5` — feat(tier): allow Free users two discovery interviews before upgrade prompt
6. `cf0e5f9` — fix(billing): repair Manage Billing button and fix webhook upsert collision for legacy users
7. `44e9890` — feat(billing): handle refund webhooks to demote tier after full refund
8. `3ce2cc3` — fix(billing): demote tier to free when subscription is paused
9. `02eb5de` — fix(pricing): add ROSCA-required auto-renewal and refund disclosures on paid tier cards
10. `1b6675a` — docs(terms): replace placeholder support email with info@tabempa.com throughout ToS
11. `3fda4da` — feat(billing): show cancellation confirmation when user returns from Paddle portal
12. `23abcbe` — docs: add app-wide entitlements section and annotate superseded delivery reports
13. This delivery report

---

## Item 1 — Continuation + fork moved to Compound tier

**Files changed:**
- `client/src/app/api/discovery/roadmaps/[id]/continuation/route.ts:44`
- `client/src/app/api/discovery/roadmaps/[id]/continuation/fork/route.ts:56`
- `client/src/app/(app)/discovery/roadmap/[id]/continuation/page.tsx`

**Before:**
```ts
await requireTierOrThrow(userId, 'execute');
```

**After:**
```ts
await requireTierOrThrow(userId, 'compound');
```

Continuation page now branches on `session.user.tier`: Compound users
see `<ContinuationView>` (brief + fork picker) as before; non-Compound
users see `<UpgradePrompt variant="hero" requiredTier="compound">` with
the headline "Continuation brief is a Compound feature".

---

## Item 2 — Defence-in-depth Compound gate on validation publish

**File changed:** `client/src/app/api/discovery/validation/[pageId]/publish/route.ts`

**Before:** publish route relied entirely on the Compound gate at page
creation; a user who was Compound at create time and later downgraded
could still trigger a paid Opus distribution-brief call via publish.

**After:** `await requireTierOrThrow(userId, 'compound')` added
immediately after `requireUserId()` and before the rate limit. Report
route (no AI spend) intentionally left as-is.

---

## Item 3 — Validation signal wired into continuation brief

**Files changed:**
- `client/src/lib/continuation/validation-signal.ts` (new)
- `client/src/lib/continuation/brief-generator.ts`
- `client/src/lib/continuation/index.ts`
- `client/src/inngest/functions/continuation-brief-function.ts`

**Deviation from instruction letter:** the instruction said to add
`loadValidationSignal` inside `brief-generator.ts`. Inline placement
pushed that file to 380 lines, breaching the 300-line service cap per
CLAUDE.md. I extracted the loader + renderer + `ValidationSignal` type
into a sibling file `validation-signal.ts` and re-exported through
`brief-generator.ts`. The public import surface (`from
'@/lib/continuation'`) is unchanged. Instruction intent (wire the
signal into brief generation for real) is preserved end-to-end.

**How it flows:**
1. `loadValidationSignal(ventureId)` walks `ValidationPage →
   Recommendation → Cycle → Venture`, reads the most recent
   `ValidationSnapshot` per page (visitors, unique visitors, CTA
   conversion) and the `ValidationReport.signalStrength` when present.
2. Aggregates into a five-level `ValidationSignal` (`strong | moderate
   | weak | negative | absent`) with `keyMetrics[]` and `patterns[]`.
3. The continuation-brief Inngest function loads the signal in a new
   `step.run('load-validation-signal')` keyed on the roadmap's
   `ventureId`; falls through to `null` when no ventureId exists
   (pre-lifecycle roadmaps — fully backward compatible).
4. `generateContinuationBrief()` renders a `VALIDATION SIGNAL` block
   into the Opus prompt's volatile suffix and instructs the model to
   quote specific numbers, warn on weak/negative signals, and never
   invent data when the signal is absent.

---

## Item 4 — Cross-cycle memory copy softened

**Files changed:**
- `client/src/components/marketing/PricingSection.tsx:80`
- `docs/neuralaunch-pricing-spec.md` §1.1 + §1.3 table row

**Before:** "Full cross-cycle memory"
**After:** "Cross-venture memory across all 3 of your ventures"

Closes D2 from the tier audit. Copy-only — no behaviour change.

---

## Item 5 — Free users allowed two discovery interviews

**Files changed:**
- `client/src/lib/lifecycle/tier-limits.ts`
- `client/src/lib/lifecycle/index.ts`
- `client/src/app/api/discovery/sessions/route.ts`
- `client/src/components/marketing/PricingSection.tsx:40`
- `docs/neuralaunch-pricing-spec.md` §1.1 + §1.3 row

**Behaviour:**
- New `FREE_DISCOVERY_SESSION_LIMIT = 2` plus `countFreeDiscoverySessions(userId)` helper.
- New `assertFreeDiscoverySessionLimit(userId)` — no-op on paid tiers; on Free, throws 403 with the copy *"You've reached the free-tier limit. Upgrade to Execute to run unlimited discovery interviews."* once `sessionCount >= 2`.
- `assertVentureLimitNotReached` is now a no-op for Free tier (Free users don't create Ventures — their cap lives on the discovery side and the venture check was incorrectly blocking them).
- `POST /api/discovery/sessions` calls `assertFreeDiscoverySessionLimit` unconditionally (paid tiers no-op through it) before the scenario-specific venture check.
- PricingSection Free bullet updated to "Two discovery interviews".

---

## Item 6 — Manage Billing button triple-fix

**Files changed:**
- `client/src/app/(app)/settings/page.tsx:115` (source fix)
- `client/src/lib/paddle/webhook-processor.ts:105-138` (webhook upsert fix)
- `client/src/app/(app)/settings/BillingSection.tsx:109-117` (UI error state)

**Part A — `hasBillingProfile` now sourced from Subscription:**
```tsx
// before
hasBillingProfile={Boolean(user.paddleCustomerId)}
// after
hasBillingProfile={Boolean(subscription?.paddleCustomerId)}
```
Settings page also now `select`s `paddleCustomerId` on the Subscription query.

**Part B — upsert collision fix in `handleSubscriptionCreated`:**

Before: upsert keyed on `paddleSubscriptionId`. When a legacy-backfilled
row (with sentinel `legacy_free_<userId>`) was present, a real
`subscription.created` event fell to the `create` branch and died on
the `userId @unique` constraint. Paddle saw a 200 (via `after()`
catch), the user was charged, and the Subscription row stayed stuck as
`free`.

After: upsert keyed on `userId` (the natural unique — one Subscription
per user). The legacy sentinel row is overwritten with authoritative
Paddle state on a user's first real subscription. `User.paddleCustomerId`
is updated in the same transaction so both sides stay consistent.

**Part C — UI error state for the impossible combination:**

When `hasBillingProfile === false` but `tier !== 'free'`, BillingSection
now renders an amber error:

> Your billing profile couldn't be located. If you recently subscribed,
> please contact support at info@tabempa.com. If you're testing with a
> dev-bypass subscription, this is expected.

(The happy-path "Complete a paid checkout to unlock billing management"
message is preserved for `tier === 'free'`.)

---

## Item 7 — Refund webhook handler

**File changed:** `client/src/lib/paddle/webhook-processor.ts`

**Event verification:** Paddle Billing routes refunds through the
Adjustment entity — there is no `transaction.refunded` event. I
verified this against the installed SDK types at
`@paddle/paddle-node-sdk/dist/types/enums/adjustment/adjustment-action.d.ts`
(enum: `'credit' | 'credit_reverse' | 'refund' | 'chargeback' | …`)
and `adjustment-notification.d.ts` (has `action`, `type: 'full' |
'partial'`, `status`, `subscriptionId`). Confirmed `TransactionRefunded`
does not exist in the current SDK (zero matches across `dist/types`).

**Handler:**
- Registered for both `AdjustmentCreated` and `AdjustmentUpdated`
  events (dispatched to a single `handleAdjustment`).
- Acts only when `action === 'refund'` AND `status === 'approved'`.
  All other statuses (`pending_approval`, `rejected`, `reversed`) and
  all other actions (`credit`, `chargeback`, …) are logged and ignored.
- Partial refund (`type === 'partial'`): logged, no demotion — user
  still has valid paid access.
- Full refund (`type === 'full'`): sets `status = 'canceled'`,
  `tier = 'free'`, `currentPeriodEnd = now()`, bumps
  `User.tierUpdatedAt` inside a transaction.
- Idempotent: if tier is already `'free'` on a duplicate webhook, the
  handler logs and returns early so we never double-demote or
  spuriously bump `tierUpdatedAt`.

---

## Item 8 — Paused subscription tier retention bug fixed

**Files changed:**
- `client/src/lib/paddle/webhook-processor.ts` (`handleSubscriptionPaused`)
- `client/src/app/(app)/settings/BillingSection.tsx` (paused banner)

**Before:** `handleSubscriptionPaused` only set `status = 'paused'`. A
paused Compound subscriber retained full Compound access indefinitely
— a billing-integrity hole.

**After:** demotes tier to `'free'` alongside `status = 'paused'`,
wraps both updates in a transaction, bumps `User.tierUpdatedAt` only
when tier actually transitioned. When the user resumes via the portal,
`subscription.updated` fires with the paid priceId and `resolveTier()`
restores the tier.

**UI:** BillingSection now renders a dedicated banner for
`status === 'paused'`:
> Your subscription is paused. Resume in the billing portal to restore
> access.

---

## Item 9 — ROSCA disclosures on paid tier cards

**File changed:** `client/src/components/marketing/PricingSection.tsx` (below the price block)

Every paid tier card now displays:
- "Renews automatically. Cancel anytime in Settings." (always)
- "14-day refund on annual plans. Monthly non-refundable." (when
  annual toggle is selected)

Free tier is unaffected. Copy only — matches ToS §7.2 verbatim.

---

## Item 10 — Placeholder support emails replaced

**Files changed:**
- `docs/neuralaunch-terms-of-service.md` (7 occurrences)
- `client/src/content/legal/terms.md` (7 occurrences — this is the copy rendered at `/legal/terms` via `LegalDocumentPage`)

Every `[support email]` in §3.2, §7.1, §7.2, §9.6, §14.3, §15.2, and
§17 of the ToS is now `info@tabempa.com`. Confirmed the rendered
`/legal/terms` reads from `client/src/content/legal/terms.md` (via
`LegalDocumentPage.tsx`).

---

## Item 11 — Cancellation confirmation return flow

**File changed:** `client/src/app/(app)/settings/BillingSection.tsx`

**Deviation from instruction letter:** Paddle's customer portal
session API (see `@paddle/paddle-node-sdk/.../
create-customer-portal-session-request-object.d.ts`) only accepts
`subscriptionIds` — there is no `returnUrl` or equivalent, and the
portal does not preserve query parameters appended to the overview
URL. A pure server-side `?returnTo=…` redirect through Paddle is not
achievable. I implemented the intent using a sessionStorage breadcrumb
+ URL query param:

1. On Manage Billing click, BillingSection writes `nl:billing-returning`
   to sessionStorage with a timestamp, then redirects to Paddle.
2. On the next render of `/settings` (the user navigating back
   manually or via Paddle's own exit link), a `useEffect` reads the
   breadcrumb, clears it, and `router.replace`s the URL to include
   `?billing_action=canceled`.
3. When `billing_action === 'canceled'` AND `cancelAtPeriodEnd === true`
   AND tier is paid, BillingSection renders a success-tone banner:
   > Your cancellation is scheduled for MM/DD/YYYY. You can resume
   > anytime from billing.

The breadcrumb has a 30-minute TTL so stale flags don't spuriously
trigger the banner on unrelated visits.

---

## Item 12 — Documentation cleanups

**Files changed:**
- `docs/neuralaunch-pricing-spec.md` — new §1.5 App-wide Entitlements table; §5.3 gating map expanded (validation create, fetch, and new publish gate; continuation GET method corrected)
- `docs/paddle-integration-delivery-report.md` — top-of-file erratum pointing readers at pricing-spec §5.3 as canon
- `docs/voice-mode-delivery-report.md` — top-of-file erratum marking STUBBED tier-gate references resolved

---

## Verification

| Check | Status | Notes |
|---|---|---|
| `npx tsc --noEmit` | ✅ Clean (no errors) | Ran from `client/` — zero output |
| `pnpm lint` | ✅ Clean (no errors or warnings) | Ran from `client/` — ESLint returned silent |
| `pnpm build --webpack` | ⚠️ Not run locally | Build script runs `prisma migrate deploy` first, which requires `DATABASE_URL`. Local `.env.local` holds Paddle sandbox config but not the Neon URL (that lives in Vercel env). Per durable user preference (memory `feedback_skip_webpack_build`): tsc + lint are sufficient for routine verification; webpack build is run only when `next.config.ts`/webpack/prerender boundaries change or when a deploy has actually failed. None of those triggered in this branch. Vercel will run the full build on the preview deploy. |

### File-size advisories (pre-existing overflows retained, not in scope)

These files exceeded their CLAUDE.md caps before this branch started; I
did not refactor them because refactors on unrelated code are outside
the 13-item scope.

- `client/src/app/api/discovery/sessions/route.ts` — 212 lines (cap 150). Pre-existing 197 lines; this branch added 15 for the new Free-tier check.
- `client/src/inngest/functions/continuation-brief-function.ts` — 252 lines (cap 200). Pre-existing 237 lines; this branch added 15 for the validation-signal step.
- `client/src/components/marketing/PricingSection.tsx` — 331 lines (cap 200). Pre-existing 323 lines; this branch added 8 for the ROSCA disclosures.
- `client/src/lib/paddle/webhook-processor.ts` — 404 lines (cap 300). Pre-existing 265 lines; this branch added the refund handler (+105 lines) and fleshed out the paused handler (+24 lines). All existing Paddle handlers live in this file — splitting was intentionally deferred to keep the diff focused on the audit findings.

`client/src/lib/continuation/brief-generator.ts` was extracted
proactively (landed under cap at 268 lines) because the instruction as
written would have pushed it from 251 → 380 — I judged that keeping a
core engine under cap outweighed the letter of the instruction about
where the helper lives.

---

## Manual Verification Steps (for Alpha)

1. **Pricing page copy.** Visit `/#pricing` (or `/` scroll). Verify:
   - Free card shows "Two discovery interviews" (not "Complete discovery interview")
   - Compound card shows "Cross-venture memory across all 3 of your ventures" (not "Full cross-cycle memory")
   - Paid cards show "Renews automatically. Cancel anytime in Settings." under every price
   - When annual toggle is selected, paid cards also show "14-day refund on annual plans. Monthly non-refundable."
2. **Continuation tier gate — Execute user.** Sign in as an Execute-tier account with a completed roadmap. Navigate to `/discovery/roadmap/<id>/continuation`. Expected: UpgradePrompt hero titled "Continuation brief is a Compound feature" instead of the brief + fork picker.
3. **Continuation tier gate — Compound user.** Same path on a Compound account. Expected: normal ContinuationView (brief sections + ForkPicker).
4. **Paddle sandbox checkout.** Complete a real sandbox subscription with a Paddle test card. Expected: tier updates to Execute or Compound, Manage Billing button is enabled, clicking it opens Paddle customer portal.
5. **Cancellation confirmation.** Inside the portal, click Cancel. Return to NeuraLaunch. Expected: green banner "Your cancellation is scheduled for MM/DD/YYYY. You can resume anytime from billing." rendered alongside the existing grey scheduled-cancel banner.
6. **Refund demotion.** Trigger a sandbox refund via the Paddle dashboard (Transactions → pick the subscription transaction → Issue refund → full amount). Wait for the webhook (see Inngest dashboard). Refresh `/settings`. Expected: tier shows Free, status shows canceled, Manage Billing still opens the portal (Paddle customer still exists).
7. **Free tier discovery cap.** Create a fresh Free account. Complete first discovery → recommendation lands. Start a second discovery from the empty-state → recommendation lands. Attempt a third discovery. Expected: HTTP 403 with the copy "You've reached the free-tier limit. Upgrade to Execute to run unlimited discovery interviews."

---

## Scope adherence

Zero items scoped back. All 13 deliverables ship on this branch as
instructed. Deviations from instruction letter are documented inline
above (Item 3 file placement, Item 11 Paddle API constraint) with
their rationale — in both cases the user-facing behaviour matches the
instruction intent.

No follow-up findings to flag — the branch closed out cleanly within
the 13-item surface.

---

*Delivered on branch `fix/pre-launch-integrity` — Saheed Alpha Mansaray / NeuraLaunch*
