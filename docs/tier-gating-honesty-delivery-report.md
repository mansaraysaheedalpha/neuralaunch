# Tier Gating & Pricing Honesty — Delivery Report

**Branch:** `fix/tier-gating-and-pricing-honesty` (from `main`)
**Date:** 2026-04-18
**Spec reference:** [docs/neuralaunch-pricing-spec.md](./neuralaunch-pricing-spec.md)
**Related:** [docs/paddle-integration-delivery-report.md](./paddle-integration-delivery-report.md), [docs/voice-mode-delivery-report.md](./voice-mode-delivery-report.md)

---

## Summary

Closes two related honesty gaps that the Paddle launch left open:

1. The pricing page's per-tier feature lists no longer match what the
   code actually delivers per tier (Free claimed pushback, Compound
   omitted voice mode).
2. The standalone `/tools` page rendered all four tool tiles for
   every authenticated user — Free users could click into a tool flow
   that immediately 403'd them at the API boundary.

Three commits, one per item, plus the spec update.

---

## Verification

| Check | Command | Result |
|---|---|---|
| TypeScript strict | `pnpm exec tsc --noEmit` | ✅ pass |
| ESLint | `pnpm lint` | ✅ pass |
| Webpack build | `pnpm build --webpack` | ⏭ skipped at owner's direction (no infra-affecting changes; only copy + a single client-component conditional) |

---

## Item 1 — Pricing card feature lists

**File modified:** [client/src/components/marketing/PricingSection.tsx](../client/src/components/marketing/PricingSection.tsx)
**Commit:** `ed170df` — `fix(pricing): align tier feature lists with actual entitlements`

### Before

```
Free
  ✓ Complete discovery interview
  ✓ One full recommendation, with reasoning
  ✓ Push back up to seven rounds                  ← FALSE: pushback is Execute-gated
  ✓ See the alternatives the system rejected

Execute
  ✓ Phased execution roadmap
  ✓ Conversation Coach
  ✓ Outreach Composer
  ✓ Research Tool
  ✓ Task check-ins and diagnostic help
  ✓ Parking lot for adjacent ideas
  (no "Everything in Free" line; venture limit not stated)

Compound
  ✓ Everything in Execute
  ✓ Live validation landing page
  ✓ Build brief from real market signal
  ✓ Continuation brief at cycle end
  ✓ Fork selection into next cycle
  ✓ Full cross-cycle memory
  (no voice mode; no venture limit stated)
```

### After

```
Free
  ✓ Complete discovery interview
  ✓ One full recommendation with reasoning
  ✓ See the alternatives rejected and why
  ✓ Honest falsification — what would make this wrong

Execute
  ✓ Everything in Free
  ✓ Push back up to seven rounds on recommendations
  ✓ Phased execution roadmap
  ✓ Conversation Coach — prepare for high-stakes conversations
  ✓ Outreach Composer — WhatsApp, email, LinkedIn drafts
  ✓ Research Tool — deep market research
  ✓ Service Packager — structure your service offering
  ✓ Task check-ins and diagnostic help
  ✓ 1 active venture at a time

Compound
  ✓ Everything in Execute
  ✓ Voice mode — speak answers instead of typing
  ✓ Live validation landing pages
  ✓ Build brief from real market signal
  ✓ Continuation brief at cycle end
  ✓ Fork selection into next cycle
  ✓ Full cross-cycle memory
  ✓ 3 active ventures simultaneously
```

---

## Item 2 — `/tools` page tier gate

**File modified:** [client/src/app/(app)/tools/page.tsx](../client/src/app/(app)/tools/page.tsx)
**Commit:** `07a7f38` — `fix(tools): gate standalone tools page behind Execute tier`

Reads `session.user.tier` via `useSession()` (matches the pattern in
[RecommendationReveal.tsx](../client/src/app/(app)/discovery/recommendation/RecommendationReveal.tsx#L101)). Loading state collapses to `'free'`, so the
upgrade prompt always wins ambiguous renders. A paid user may see a
single-render flash of the prompt on cold load that resolves to the
tile list within one render cycle.

- Free users → `<UpgradePrompt requiredTier="execute" variant="hero" …>` directing them to the pricing page.
- Execute and Compound users → existing four-tile list, unchanged.

---

## Item 3 — Spec update

**File modified:** [docs/neuralaunch-pricing-spec.md](./neuralaunch-pricing-spec.md)
**Commit:** `2cc3158` — `docs(pricing): update spec to match honest tier entitlements`

- §1.1 Tier Definitions — narrative descriptions rewritten to mirror
  the card copy verbatim. New line up top: "PricingSection.tsx MUST
  match this table verbatim — drift is a regression."
- §1.3 Tier Boundaries — added rows for "Alternatives rejected" and
  "Honest falsification" (Free deliverables that were implicit), moved
  Continuation brief and Fork selection from Execute to Compound,
  renamed "Active cycles" → "Active ventures at once", added the
  explicit instruction that runtime gating must agree with this table.
- §5.3 Feature Gating Map — moved the two continuation routes from
  Execute to Compound, named the helpers explicitly
  (`assertCompoundTier`, `assertVentureLimitNotReached`), added a row
  for the new `/tools` client gate.
- §5.4 UI Gating — added the `/tools` gate, clarified voice-mode
  gating is via `useVoiceTier()`.

---

## Discrepancies between updated spec and current code

The spec is now the single source of truth (per the user's
instruction). These are the cases where current runtime behaviour
disagrees with the updated spec — each needs a follow-up fix to bring
code in line.

### D1. Continuation routes are still Execute-gated in code

**Spec now says:** Compound only (matches the card copy).
**Code does:** Gates `/api/discovery/roadmaps/[id]/continuation/route.ts`
and `/api/discovery/roadmaps/[id]/continuation/fork/route.ts` with
`await requireTierOrThrow(userId, 'execute');` per the Paddle
integration (commit `0d51b3d`).

**Fix needed:** Change the second argument from `'execute'` to
`'compound'` in both files. Single token swap each. Worth pairing
with a UI change so an Execute user who would now lose continuation
sees an UpgradePrompt rather than a 403, since this is a
restriction, not an expansion.

**Risk:** Any user who paid for Execute under the previous spec did
so on the implied promise that continuation was included. If the
business hasn't actually decided to move continuation to Compound
(versus the card copy being aspirational), reverse the spec edit
instead. The user should confirm intent before D1 is fixed in either
direction.

### D2. Cross-cycle memory has no per-tier difference in code today

**Spec / cards say:** "Full cross-cycle memory" is a Compound feature.
**Code does:** The `FounderProfile` model is loaded for every
authenticated user regardless of tier. The "depth" of cross-cycle
memory is naturally constrained by the venture limit (Execute = 1
venture, so there is functionally one cycle to remember; Compound = 3
ventures, so multi-cycle/multi-venture memory has somewhere to live).

**Reading:** Probably fine as-is — the differentiation is implicit
through the venture cap. But if marketing wants explicit gating
(e.g. truncating profile fields for Execute users), that's an
unbuilt feature.

**Fix needed:** None unless product wants explicit gating beyond the
venture cap. Document the implicit-via-venture-cap framing if the
"Full cross-cycle memory" bullet on the Compound card is meant to
imply a code-level restriction.

### D3. "Priority synthesis quality" / Opus-on-more-calls is undocumented in code

**Old spec said:** Compound got "priority research depth and
synthesis quality (higher step budgets, Opus on more calls)".
**Cards (and updated spec) drop this claim.**
**Code does:** Model selection in
`client/src/lib/ai/with-model-fallback.ts` does not branch on the
caller's tier. Every user gets the same primary/fallback chain.

**Reading:** Removing the claim is the honest move — the underlying
mechanism doesn't exist. If product wants to revive "priority
synthesis quality" as a real Compound differentiator later, it's a
new build, not a copy change.

**Fix needed:** None for the current scope — the spec and cards are
already in agreement that this is not a current entitlement.

---

## Manual verification (Alpha)

- [ ] Visit `/#pricing` while signed out — confirm Free, Execute, Compound feature lists match the bullets in Item 1's "After" block above.
- [ ] Visit `/#pricing` while signed in as a Free user — same result; no false claims.
- [ ] Visit `/tools` as a Free user — confirm `UpgradePrompt` hero is shown, no four-tile list.
- [ ] Visit `/tools` as an Execute user — confirm four tiles render.
- [ ] Visit `/tools` as a Compound user — confirm four tiles render.

---

## Out of scope

- D1, D2, D3 above are flagged but not fixed. D1 in particular needs a
  product call before any code change.
- Voice mode UI surfacing on the pricing page (we list it as a feature
  but do not show a screenshot or demo). Marketing concern, not in
  scope here.
- Any change to the per-route gating helpers themselves.
