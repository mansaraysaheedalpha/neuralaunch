# Paddle Integration — Delivery Report

**Branch:** `feat/paddle-integration`
**Target:** `dev` (then fast-forward `main` after business sign-off)
**Delivered:** 2026-04-17
**Spec reference:** [docs/neuralaunch-pricing-spec.md](./neuralaunch-pricing-spec.md)

> **Erratum (2026-04-18):** This report's §5.3 gating map is superseded.
> The feature-gating table listed validation-page creation as Execute;
> it is actually Compound and always was. Continuation and fork routes
> have also moved to Compound per the fix/pre-launch-integrity branch.
> See [docs/neuralaunch-pricing-spec.md §5.3](./neuralaunch-pricing-spec.md)
> for the canonical tier gating map.

---

## 1. Summary

Ships the full Paddle billing infrastructure end-to-end in **sandbox
mode**. Every piece of code works identically in sandbox and
production — promoting to production is a four-environment-variable
swap in Vercel, with zero code changes required.

Seventeen phases delivered across seventeen commits. Each phase was
type-checked (`tsc --noEmit`) and lint-clean (`pnpm lint`) before
commit. A final `pnpm build --webpack` smoke is included below.

---

## 2. Verification — three green checks

| Check                   | Command                         | Result  |
|-------------------------|---------------------------------|---------|
| TypeScript strict build | `pnpm exec tsc --noEmit`        | ✅ pass |
| ESLint (zero warnings)  | `pnpm lint`                     | ✅ pass |
| Next.js webpack build   | `pnpm build --webpack`          | ✅ pass |

The build check runs with placeholder credentials; the database-backed
landing-page prerender exercises the fail-safe path in `getPriceIds`
and still emits a valid static page. In production the real database
is always reachable, so the live path (showing the founding-rate
banner and slot count) is the one users see.

---

## 3. Files created or modified — by phase

### Phase 1 — env + SDK (commit `7fd7242`)
- **Modified:** `client/package.json` — `@paddle/paddle-node-sdk@^3.7.0`
- **Modified:** `pnpm-lock.yaml`
- **Modified:** `client/src/lib/env.ts` — four Paddle variables declared
- **Created:** `.env.example` — root-level reference for all env vars
- **Created:** `client/.env.local` — local sandbox placeholders (gitignored)

### Phase 2 — Prisma schema (commit `5a47abd`)
- **Modified:** `client/prisma/schema.prisma` — adds `Subscription`
  model, `paddleCustomerId`, `tierUpdatedAt` on `User`
- **Created:** `client/prisma/migrations/20260417160000_add_paddle_subscription/migration.sql`

### Phase 3 — SDK singleton (commit `5f50146`)
- **Created:** `client/src/lib/paddle/client.ts`

### Phase 4 — price map (commit `296091f`)
- **Created:** `client/src/lib/paddle/tiers.ts`

### Phase 5 — webhook route (commit `1dceadd`)
- **Created:** `client/src/app/api/webhooks/paddle/route.ts`
- **Created:** `client/src/lib/paddle/webhook-processor.ts` (stub; replaced in Phase 6)

### Phase 6 — webhook processor (commit `5c5a0a1`)
- **Modified:** `client/src/lib/paddle/webhook-processor.ts` — six event handlers

### Phase 7 — PaddleProvider (commit `8b23b81`)
- **Created:** `client/src/components/PaddleProvider.tsx`
- **Modified:** `client/src/app/providers.tsx` — mounts PaddleProvider inside SessionProvider/ThemeProvider

### Phase 8 — SubscribeButton (commit `0301eff`)
- **Created:** `client/src/components/SubscribeButton.tsx`

### Phase 9 — CSP (commit `c30e3bf`)
- **Modified:** `client/src/proxy.ts` — adds `cdn.paddle.com` to script-src, `*.paddle.com` to frame-src + connect-src

### Phase 10 — session tier (commit `f733142`)
- **Modified:** `client/src/auth.ts` — async session callback fetches tier
- **Modified:** `client/src/next-auth.d.ts` — extends Session with tier + subscriptionStatus

### Phase 11 — tier gating (commit `0d51b3d`)
- **Created:** `client/src/lib/auth/require-tier.ts`
- **Modified:** 35 API route files (see §5.3 of the spec) to call `requireTierOrThrow`

### Phase 12 — customer portal (commit `e4bb559`)
- **Created:** `client/src/app/actions/billing.ts`
- **Created:** `client/src/app/(app)/settings/BillingSection.tsx`
- **Modified:** `client/src/app/(app)/settings/page.tsx` — adds Billing section

### Phase 13 — founding member detection (commit `881d1c5`)
- **Created:** `client/src/lib/paddle/founding-members.ts`

### Phase 14 — wire pricing (commit `4e1a7f9`)
- **Modified:** `client/src/components/marketing/PricingSection.tsx` — accepts price-id props, renders SubscribeButton
- **Modified:** `client/src/app/page.tsx` — `Pricing` is now async and fetches price ids

### Phase 15 — backfill script (commit `2b92bf7`)
- **Created:** `client/scripts/paddle/backfill-subscriptions.ts`
- **Created:** `docs/paddle-migration-runbook.md`

### Phase 16 — sandbox runbook (commit `c8b6a85`)
- **Created:** `docs/paddle-testing-runbook.md`

### Phase 17 — verification + fail-safe (commit `a772eaa`)
- **Modified:** `client/src/lib/paddle/founding-members.ts` — try/catch in `getPriceIds` so landing-page build tolerates transient DB failure

---

## 4. Deviations from the spec — documented

### 4.1 Session tier embedding (Phase 10)

The spec (§5.1) specifies a **JWT** callback and an `iat` vs
`tierUpdatedAt` comparison. This codebase uses **database sessions**
via `PrismaAdapter` — there is no JWT to embed the tier in. Instead,
the `session` callback fetches the tier from the `Subscription` row
on every `auth()` call (the adapter already loads the User in the
same call path, so the extra query is warm-cached).

`tierUpdatedAt` still exists on `User` and is bumped by the webhook
processor whenever the tier transitions. With database sessions the
column is currently unused for auth (every session read is live), but
it is preserved for client-side cache invalidation and audit logging
downstream.

### 4.2 Fail-safe in `getPriceIds` (Phase 17)

Not in the spec. Added because the landing page at `src/app/page.tsx`
is statically prerendered and the `async Pricing` component would
crash the entire page render if the database were briefly unreachable.
The fallback path returns standard (non-founding) prices — a UX
imperfection is strictly better than a build failure.

---

## 5. Placeholders that need real values before production

### 5.1 Environment variables (Vercel production)

Every variable is currently set to a sandbox placeholder. Flip all
four in the Vercel dashboard — no code change required:

| Variable                            | Current (sandbox)                  | Needs (production)                    |
|-------------------------------------|-------------------------------------|----------------------------------------|
| `PADDLE_API_KEY`                    | `pdl_sandbox_apikey_REPLACE_ME`     | `pdl_live_apikey_<real hash>`          |
| `PADDLE_WEBHOOK_SECRET`             | `pdl_ntfset_REPLACE_ME`             | Webhook signing secret from Paddle     |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`   | `test_REPLACE_ME`                   | `live_<real hash>`                     |
| `NEXT_PUBLIC_PADDLE_ENV`            | `sandbox`                           | `production`                           |

Reference: see `.env.example` at the repo root.

### 5.2 Paddle price ids in `lib/paddle/tiers.ts` + `lib/paddle/founding-members.ts`

Six price ids are currently placeholders (`pri_exec_mo_01`, etc.).
After the Paddle dashboard products and prices are created (spec §2.4)
the real Paddle-generated ids must replace them in two files:

- `client/src/lib/paddle/tiers.ts` → `PRICE_TO_TIER` map
- `client/src/lib/paddle/founding-members.ts` → `PRICE_IDS` map

Both files carry an inline comment flagging this requirement.

---

## 6. Pre-launch checklist — Alpha + business team

### Paddle account

- [ ] Paddle supplier account approved (2–7 business days per spec §2.1)
- [ ] `pro_execute_01` and `pro_compound_01` products created in Paddle dashboard
- [ ] Six prices created and attached to the right products:
  - [ ] `pri_exec_mo_01` — $29.00 / month — public
  - [ ] `pri_exec_yr_01` — $279.00 / year — public
  - [ ] `pri_comp_mo_01` — $49.00 / month — public
  - [ ] `pri_comp_yr_01` — $279.00 / year — public
  - [ ] `pri_exec_fnd_01` — $19.00 / month — **hidden**
  - [ ] `pri_comp_fnd_01` — $29.00 / month — **hidden**
- [ ] Webhook destination configured in Paddle dashboard pointing at
  `https://<production-domain>/api/webhooks/paddle`
- [ ] Webhook signing secret captured and stored in Vercel as
  `PADDLE_WEBHOOK_SECRET`
- [ ] Production API key generated and stored in Vercel as `PADDLE_API_KEY`
- [ ] Production client token generated and stored in Vercel as
  `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
- [ ] `NEXT_PUBLIC_PADDLE_ENV` set to `production` in Vercel

### Banking

- [ ] USD corporate domiciliary account open under Tabempa Engineering
  Limited at UBA / GT Bank / Sierra Leone Commercial Bank
- [ ] SWIFT payout details confirmed with Paddle
- [ ] Payout threshold set to $1,500–2,000 (spec §10.2)

### Code — after all of the above

- [ ] Real Paddle price ids substituted in `tiers.ts` and
  `founding-members.ts`, deployed
- [ ] Every scenario in `docs/paddle-testing-runbook.md` exercised
  against the production account (using real cards, one test
  subscription per card, then cancel immediately)
- [ ] Backfill script run per `docs/paddle-migration-runbook.md`
- [ ] Smoke: complete one real monthly subscription, verify DB row,
  verify tier gating, then cancel

---

## 7. Out-of-scope items flagged

- **Voice mode endpoints** — spec §5.3 lists these as Compound-gated,
  but they do not exist in the codebase yet. When they ship, add
  `await requireTierOrThrow(userId, 'compound');` per the pattern
  established in Phase 11.
- **Venture count enforcement (1 for Execute, 3 for Compound)** —
  spec §1.3 line "Active cycles at once". The venture creation
  endpoint (`POST /api/discovery/ventures`) does not yet enforce this.
  Adding it belongs with the venture create route change, not the
  Paddle integration branch.
- **UI gating** — §5.4 of the spec (hide tool buttons for free users,
  upgrade prompt on recommendation page, founding-member badge in
  account settings). Partially delivered (founding-member pill shipped
  in Settings → Billing), but the per-tool hide logic is a separate
  UX pass.
- **14-day email notification before the hard cutoff** — the migration
  runbook mentions it; the email template itself is deferred until
  the rollout date is scheduled.

---

## 8. Follow-ups already captured

- `docs/paddle-migration-runbook.md` — when + how to run the backfill.
- `docs/paddle-testing-runbook.md` — thirteen QA scenarios covering
  the full subscription lifecycle, dunning, cancellation, founding
  member flow, duplicate webhooks, customer portal, cold-start
  timeout, CSP, and the signed-out redirect.
- `docs/paddle-integration-delivery-report.md` — this document.
