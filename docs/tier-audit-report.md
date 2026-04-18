# NeuraLaunch — Tier Structure Audit

**Date:** 2026-04-18
**Branch surveyed:** `fix/usage-caps-and-abuse-prevention` (based on latest `dev`, post-tier-gating-honesty merge)
**Scope:** Feature inventory, tier-to-code reconciliation, and strategic balance of Free / Execute ($29) / Compound ($49).
**Status:** Audit only — no code changes made.

Canonical sources cross-referenced:
- [docs/neuralaunch-pricing-spec.md](./neuralaunch-pricing-spec.md) — §1.3 tier table, §5.3 gating map
- [docs/tier-gating-honesty-delivery-report.md](./tier-gating-honesty-delivery-report.md) — D1/D2/D3 flags
- [docs/paddle-integration-delivery-report.md](./paddle-integration-delivery-report.md) — Paddle phases
- [docs/voice-mode-delivery-report.md](./voice-mode-delivery-report.md) — voice surfaces
- [docs/lifecycle-memory-delivery-report.md](./lifecycle-memory-delivery-report.md) — Ventures / Cycles / FounderProfile
- [client/src/components/marketing/PricingSection.tsx](../client/src/components/marketing/PricingSection.tsx) — current cards

---

## 1. Executive Summary

1. **D1 (continuation gated to `execute` in code, `compound` in spec) is still live.** Both [continuation/route.ts:44](../client/src/app/api/discovery/roadmaps/[id]/continuation/route.ts#L44) and [continuation/fork/route.ts:56](../client/src/app/api/discovery/roadmaps/[id]/continuation/fork/route.ts#L56) call `requireTierOrThrow(userId, 'execute')`. The pricing cards and §1.3 spec both say Compound. **Execute users today get the continuation brief and fork picker even though the cards advertise them as Compound.** This is a real overdelivery bug — users are unaware, but it undermines the Compound upgrade story.
2. **Validation-page creation IS correctly Compound-gated** ([validation-page/route.ts:38](../client/src/app/api/discovery/recommendations/[id]/validation-page/route.ts#L38) and :186). The outdated §5.3 gating map that the paddle-integration delivery report shipped (listing this as Execute) is stale; it has since been corrected in the latest spec. Code and spec are aligned. Flagging for the audit record because the paddle delivery report still reads as if Execute owns validation pages.
3. **Voice mode is no longer stubbed.** [voice/tier-gate.ts:27](../client/src/lib/voice/tier-gate.ts#L27) reads the real `Subscription.tier` and [voice/client-tier.ts:14](../client/src/lib/voice/client-tier.ts#L14) reads `session.user.tier`. The voice-mode delivery report's "STUBBED until Paddle merges" warning is obsolete and should be annotated as resolved.
4. **Venture-limit enforcement is wired and unambiguous** ([tier-limits.ts:63](../client/src/lib/paddle/tiers.ts#L63) + [lifecycle/tier-limits.ts:57](../client/src/lib/lifecycle/tier-limits.ts#L57)): Free=0, Execute=1, Compound=3. Free users literally cannot start a roadmap (no venture = no active cycle to operate on). This is a harder wall than the pricing copy suggests.
5. **Cross-cycle memory (D2) has no explicit code-level gate.** [FounderProfile loaders](../client/src/lib/lifecycle/context-loaders.ts) run for every authenticated user. The "Full cross-cycle memory" Compound bullet is delivered implicitly through the venture cap: Execute = 1 venture so there is only one arc to remember; Compound = 3 so multi-venture memory actually differentiates. The claim isn't false, but it's thin — Execute users also get the benefit on their single venture's successive cycles.
6. **Phantom feature risk is concentrated on "build brief from real market signal."** The validation page collects visitor analytics ([/api/lp/analytics](../client/src/app/api/lp/analytics)) and the validation report endpoint computes `signalStrength`, but the continuation brief generator [brief-generator.ts] does NOT currently read validation analytics as input — brief generation consumes roadmap execution metrics and cycle summaries, not LP visitor data. The card bullet is defensible at the product level (the MVP-flag path, negative-signal blocking on regeneration) but the promised "build brief from real market signal" is not a literal wiring today.
7. **Orphan surfaces are thin but real.** `/discovery/recommendations` (past recommendations, venture cards), account self-service (profile view, provider info, delete-account?), training-consent / aggregate-analytics toggles in Settings, and the public `/api/lp/analytics` beacon are not classified anywhere in §1.3. They're correctly app-wide (available to every authenticated user regardless of tier), but the spec should say so explicitly.
8. **The Execute ↔ Compound gap is fragile.** Compound's $20 premium rests on four pillars: voice mode, validation landing pages, continuation/fork, and cross-cycle memory. Continuation/fork is currently leaking to Execute (D1). Cross-cycle memory is implicit (D2). That leaves voice mode and validation pages doing ~90% of the real upgrade lift on two features most Free trialists haven't yet seen. **My opinion: voice mode is the right Compound anchor, validation pages are genuinely premium, but D1 has to be fixed immediately for Compound to feel distinct.**

---

## 2. Feature Inventory

### 2.1 Discovery + Recommendation (Free entitlements)

| Feature | UI location | Paid API calls | Gating in code |
|---|---|---|---|
| Discovery interview session create | `/discovery`, POST `/api/discovery/sessions` | Anthropic (Sonnet) | `assertVentureLimitNotReached` for `fresh_start` only — Free=0 blocks new venture; first `first_interview` is allowed |
| Discovery turn (streaming) | In-session, POST `/api/discovery/sessions/[id]/turn` | Anthropic (Sonnet + Haiku fallback), Gemini fallback | None — Free |
| Session resume | `/discovery` empty-state card | None | None — Free |
| Recommendation synthesis (Opus) | POST `/api/discovery/sessions/[id]/recommendation` via Inngest | Anthropic (Opus) | None — Free |
| Recommendation view + alternatives + falsification | `/discovery/recommendation`, `/discovery/recommendations/[id]` | None (read-only) | None — Free |
| Past recommendations list (venture-grouped) | `/discovery/recommendations` | None | None — Free |

### 2.2 Execute entitlements

| Feature | UI location | Paid API calls | Gating in code |
|---|---|---|---|
| Pushback (≤7 rounds) | Recommendation page chat | Anthropic (Opus + extended thinking), optional Exa/Tavily | `requireTierOrThrow('execute')` at [pushback/route.ts:68](../client/src/app/api/discovery/recommendations/[id]/pushback/route.ts#L68) |
| Accept recommendation | Recommendation page | None | `requireTierOrThrow('execute')` at accept/route.ts:31, :95 |
| Execution roadmap generation | `/discovery/roadmap/[id]` (via Inngest) | Anthropic (Opus) | `requireTierOrThrow('execute')` at roadmap/route.ts:51 |
| Task check-in (≤5 rounds) | Task card in roadmap | Anthropic (Sonnet), Exa/Tavily | `requireTierOrThrow('execute')` at tasks/[id]/checkin/route.ts:75 |
| Task diagnostic (≤10 turns) | Task card menu | Anthropic (Haiku/Sonnet) | `requireTierOrThrow('execute')` at tasks/[id]/diagnostic/route.ts:65 |
| Conversation Coach — setup / prepare / roleplay / debrief | `/tools/conversation-coach`, or task-scoped | Anthropic (Opus for prep/debrief, Sonnet for setup/roleplay), Exa/Tavily in prep | `requireTierOrThrow('execute')` on all 4 stages (roadmap- and task-scoped variants) |
| Outreach Composer (single / batch / follow-up) | `/tools/outreach-composer`, or task-scoped | Anthropic (Opus) | `requireTierOrThrow('execute')` on generate/regenerate/mark-sent |
| Research Tool (plan / execute / followup) | `/tools/research`, or task-scoped | Anthropic (Opus, 25 steps), Exa, Tavily | `requireTierOrThrow('execute')` on all three |
| Service Packager (generate / adjust) | `/tools/service-packager`, or task-scoped | Anthropic (Opus, 8 steps), Exa/Tavily | `requireTierOrThrow('execute')` on all |
| Roadmap parking-lot / checkpoint / diagnostic | Embedded in `/discovery/roadmap/[id]` | Anthropic (varies) | `requireTierOrThrow('execute')` on each route |
| Continuation brief read (GET) | `/discovery/roadmap/[id]/continuation` | None (read) | **`requireTierOrThrow('execute')` — spec says Compound. D1.** |
| Fork selection (POST) | Fork picker | None (fires Inngest roadmap regen) | **`requireTierOrThrow('execute')` — spec says Compound. D1.** |
| `/tools` standalone hub | `/tools/page.tsx` client gate | None | Client-side: `session.user.tier === 'free'` → UpgradePrompt |

### 2.3 Compound entitlements

| Feature | UI location | Paid API calls | Gating in code |
|---|---|---|---|
| Voice mode transcription | Mic button on 6 surfaces (Discovery, CheckIn, Coach setup, Composer, Research, Packager) | Deepgram Nova-2 + OpenAI Whisper fallback | `assertCompoundTier` at voice/transcribe/route.ts:58; client `useVoiceTier() === 'compound'` |
| Validation landing page generate / regenerate | Recommendation page (post-roadmap-READY) | Anthropic (Opus) for page content | `requireTierOrThrow('compound')` at validation-page/route.ts:38 + :186 |
| Validation page publish | `/discovery/validation/[pageId]` | Anthropic (Opus) for distribution brief | **No explicit tier gate on /publish** — entry is gated by the create step, but direct POST is not re-gated |
| Validation page analytics (visitor beacon) | Public `/lp/[slug]` | None | Public endpoint — IP rate-limited |
| Validation report MVP flag toggle | `/discovery/validation/[pageId]` | None | No tier gate on `/report` POST |
| Continuation brief generation (Inngest side-effect of roadmap completion) | Automatic via roadmap phase completion | Anthropic (Opus), Exa/Tavily | Gated indirectly: only Execute+ users reach a roadmap, so the brief is generated for all paid tiers today |
| Venture slot #2 and #3 | POST `/api/discovery/sessions` | None | `assertVentureLimitNotReached` compares active count to `TIER_VENTURE_LIMITS[tier]` = 3 |
| Full cross-cycle memory (FounderProfile + CycleSummary) | Loaded pre-call in Coach/Composer/Research/Packager/Check-in | None (data already persisted) | **No explicit tier gate.** Implicit via venture cap. |

### 2.4 App-wide (not tier-classified today)

| Feature | Location | Notes |
|---|---|---|
| Account info display (name, email, OAuth providers) | `/settings` → AccountInfoSection | Read-only |
| Training-consent toggle | `/settings` → TrainingConsentSection | Persists to `User.trainingConsent` + timestamp |
| Aggregate-analytics-consent toggle | `/settings` → AggregateAnalyticsConsentSection | Persists to `User.aggregateAnalyticsConsent` + timestamp |
| Billing self-service (Paddle portal link, founding badge, cancel banner) | `/settings` → BillingSection | Links to Paddle-hosted portal |
| Legal / marketing pages | `/`, `/#pricing`, `/signin` | Unauthenticated |
| Validation page public view | `/lp/[slug]` | Public, hardened beacon |
| `/tools` hub tile list | `/tools/page.tsx` | Client-side Free → UpgradePrompt |
| Past recommendations / ventures listing | `/discovery/recommendations` | No tier gate; Free sees their single recommendation |

---

## 3. Mismatches Between Spec and Code

### 3.1 D1 — Continuation + Fork: code `execute`, spec `compound`

**Evidence:**
- Spec §1.3: "Continuation brief at cycle end" ✗ ✗ ✓ (Compound only)
- Spec §1.3: "Fork selection into next cycle" ✗ ✗ ✓ (Compound only)
- Spec §5.3: both routes listed as Compound
- Cards (`PricingSection.tsx:78-79`): "Continuation brief at cycle end" / "Fork selection into next cycle" are in the Compound list, NOT Execute
- Code: [continuation/route.ts:44](../client/src/app/api/discovery/roadmaps/[id]/continuation/route.ts#L44) and [continuation/fork/route.ts:56](../client/src/app/api/discovery/roadmaps/[id]/continuation/fork/route.ts#L56) still call `requireTierOrThrow(userId, 'execute')`.

**Direction I recommend:** Change code to `'compound'`. Reasoning — the cards and the updated spec agree; the Paddle integration Phase-11 gating was written before the spec was rewritten to move continuation into Compound. Tier gating at the wrong level silently erodes Compound's value story. Pair the code change with an `UpgradePrompt(requiredTier='compound')` rendered on `/discovery/roadmap/[id]/continuation` for Execute users so they get a legible "upgrade to unlock" moment instead of a raw 403.

**Business risk to manage:** Any Execute user who has already completed a roadmap and seen the continuation UI will lose access. In practice, there are probably zero such users today (Paddle hasn't flipped to production, no paying customer data exists yet). Fix this pre-launch — cheap now, expensive later.

### 3.2 D2 — Cross-cycle memory: no explicit gate, marketed as Compound-only

**Evidence:**
- Card bullet: "Full cross-cycle memory" on Compound only
- Code: `loadPerTaskAgentContext()` in [lifecycle/context-loaders.ts:112](../client/src/lib/lifecycle/context-loaders.ts) returns `FounderProfile` for any authenticated user; Coach / Composer / Research / Packager all load it without a tier branch
- Indirect gating: Execute=1 venture, Compound=3, so multi-venture memory only has somewhere to live on Compound

**Direction I recommend:** Keep the implicit framing, BUT either (a) soften the card copy from "Full cross-cycle memory" to "Cross-venture memory — the system learns across all 3 of your ventures," which accurately describes what Compound buys, or (b) add an explicit depth constraint on Execute (e.g., load only the current-venture FounderProfile fields; strip `completedCycles` summary for Execute users). Option (a) is a copy change; option (b) is engineering. Option (a) is the honest, zero-build win.

**Business risk:** Marketing the word "full" when Execute users also get their profile loaded is technically a claim gap. Today nobody notices because Execute users don't yet have multi-venture history. When they do, a curious Execute user reading the Compound card could say "wait, my system already remembers me across cycles — what am I paying for?" — and they'd be right.

### 3.3 D3 — Priority synthesis / Opus-on-more-calls: already reconciled

No action needed. The spec and cards no longer claim this; the code never did it. Flagged here only to close the loop from the tier-gating-honesty report.

### 3.4 Paddle delivery report §5.3 is stale on validation page gating

Not a code bug — a documentation bug. The Paddle integration report lists validation-page creation as Execute; it's actually Compound and always was. Any reader of the Paddle report gets a false signal. Recommend adding an erratum note to that report pointing to the current spec as the source of truth. **No spec or code change needed.**

### 3.5 Publish + Report routes lack defence-in-depth tier gates

**Evidence:** [/validation/[pageId]/publish/route.ts](../client/src/app/api/discovery/validation/[pageId]/publish/route.ts) (no `requireTierOrThrow`) and [/validation/[pageId]/report/route.ts](../client/src/app/api/discovery/validation/[pageId]/report/route.ts) (no `requireTierOrThrow`). Both rely on the fact that a page can only exist because a Compound-gated create succeeded.

**Risk:** A user who was Compound during page creation and downgraded to Execute or Free retains access to publish and to flip the `usedForMvp` flag. Low-severity — all the expensive Anthropic work happens on create and publish; the report POST is a boolean toggle. But defence-in-depth says every writing endpoint that can spend Anthropic tokens (publish calls `generateDistributionBrief` with Opus) should re-check.

**Direction I recommend:** Add `await requireTierOrThrow(userId, 'compound')` to `/validation/[pageId]/publish/route.ts` before the rate limit. Leave `/report` as-is (no AI spend). Low-risk mechanical fix.

---

## 4. Orphan Features (Built, Not Classified by Tier)

These are real capabilities that aren't in §1.3's table. All are correctly available to every authenticated user regardless of tier, but the spec should name them so they aren't mistaken for unbuilt promises or dead code.

| Feature | Recommendation |
|---|---|
| `/discovery/recommendations` past recommendations + VentureCard list | **App-wide.** Add a §1.3 row: "Past recommendations / ventures listing — ✓ ✓ ✓". |
| `/settings` Account info (name, email, providers) | **App-wide.** Name it. |
| Training-consent toggle + timestamp | **App-wide.** Privacy regulation requires giving every user equal control. Name it. |
| Aggregate-analytics-consent toggle + timestamp | **App-wide.** Same reasoning. |
| Billing self-service (Paddle portal) | **App-wide, but only usable by paid users.** Name it. |
| Session resumption (60–72h window) | **App-wide.** Not in spec at all; add as Free+. |
| `/api/lp/analytics` public visitor beacon | **Infrastructure, not a user feature.** No user-facing classification needed; it's owned by validation landing pages. |
| Validation page public view `/lp/[slug]` | **App-wide for visitors.** The *owner* must be Compound, but visitors don't need accounts. Note in spec. |
| `/tools` standalone hub page | **Already classified in §5.3 as Execute.** No action. |

**No orphans I'd flag as dead code.** The seven-stage cleanup removed the obvious carcasses already (Projects, Spark Index, BaseAgent). What remains is legitimately used.

---

## 5. Phantom Features (Claimed on Pricing, Not Built or Incomplete)

Going bullet-by-bullet through `PricingSection.tsx`:

### Free

| Bullet | Status |
|---|---|
| Complete discovery interview | ✅ Real. |
| One full recommendation with reasoning | ✅ Real. |
| See the alternatives rejected and why | ✅ Real — `Recommendation.alternativesRejected` is generated and rendered. |
| Honest falsification — what would make this wrong | ✅ Real — `Recommendation.whatWouldMakeThisWrong` populated. |

### Execute

| Bullet | Status |
|---|---|
| Everything in Free | ✅ Correct. |
| Push back up to seven rounds on recommendations | ✅ Real, hard cap enforced server-side (`PUSHBACK_CONFIG.HARD_CAP_ROUND = 7`). |
| Phased execution roadmap | ✅ Real. |
| Conversation Coach — prepare for high-stakes conversations | ✅ Real, full 4-stage flow. |
| Outreach Composer — WhatsApp, email, LinkedIn drafts | ✅ Real, three modes (single / batch / sequence) wired in `COMPOSER_MODES`. |
| Research Tool — deep market research | ✅ Real, Exa + Tavily agents, 25-step Opus budget. |
| Service Packager — structure your service offering | ✅ Real, 8-step Opus with adjustment flow. |
| Task check-ins and diagnostic help | ✅ Real, 5-round check-in cap, 10-turn diagnostic cap. |
| 1 active venture at a time | ✅ Enforced via `TIER_VENTURE_LIMITS.execute = 1`. |

### Compound

| Bullet | Status |
|---|---|
| Everything in Execute | ✅ Correct. |
| Voice mode — speak answers instead of typing | ✅ Real. Six surfaces wired. Tier gate live. |
| Live validation landing pages | ✅ Real — `/lp/[slug]` public, DRAFT → LIVE flow, analytics beacon. Compound-gated at create. |
| Build brief from real market signal | ⚠ **Partial.** Analytics are collected and `signalStrength` is computed on the validation report. The report blocks MVP flag-on when signal is negative. But the *continuation brief generator* does not consume validation analytics as an input today — brief generation runs off roadmap execution metrics + cycle summaries, not visitor behavior. The bullet is defensible at the product level but the literal "build brief from real market signal" wiring is not there. |
| Continuation brief at cycle end | 🔴 **Code live but wrong-tier** (D1 — currently accessible to Execute users). |
| Fork selection into next cycle | 🔴 **Code live but wrong-tier** (D1). |
| Full cross-cycle memory | ⚠ **Implicit, not enforced.** See D2. |
| 3 active ventures simultaneously | ✅ Enforced via `TIER_VENTURE_LIMITS.compound = 3`. |

**Bottom line on phantoms:** Four of the seven Compound-specific bullets are either wrong-tier in code (continuation, fork) or under-delivered vs. the copy (build brief, cross-cycle memory). Voice mode, validation pages, and the 3-venture cap are the only three Compound bullets that are end-to-end honest today. This is the same concern the tier-gating-honesty branch tried to fix but only partially closed.

---

## 6. Tier Balance Analysis (Opinionated)

### 6.1 Free — "Your first honest answer"

**What Free gets:** Complete discovery, one recommendation, alternatives, falsification. No roadmap, no tools, no pushback, no second recommendation — literally one answer per account lifetime, because `TIER_VENTURE_LIMITS.free = 0` means a Free user cannot start a second discovery session after the first (they hit the venture wall on `fresh_start`).

**Assessment:** The Free tier is positioned honestly — it delivers a real, complete artifact (discovery → synthesis → recommendation) without the execution layer. The friction point sits exactly where it should: after the user reads "here's the thing you should do," they discover the roadmap, tools, and pushback are behind $29/mo.

**Risk:** The "zero ventures, zero second recommendations" cap is harder than the pricing copy implies. A Free user who starts a discovery, gets a recommendation they hate, and wants to try again with a different framing will hit the `assertVentureLimitNotReached` wall instead of being gracefully told "Upgrade to Execute or start a push-back round". **My opinion: this is a usability trap, not a pricing strength.** Free users should be able to try discovery twice — it's the cheapest way to prove the product works for them. Current COGS for one Free discovery is ~$0.80-$1.50 with caching; two is $1.60-$3.00. The ROI on letting Free trial twice vs. letting them bounce is heavily positive.

**Recommendation on Free:** Consider allowing 2 discovery interviews per Free account (session-count gate, not venture-count gate). Keep the 1-recommendation-visible rule if needed for storage discipline. This is a product call, not a code bug.

### 6.2 Execute — "$29/mo, from recommendation to revenue"

**What Execute gets:** Everything in Free, plus pushback (7 rounds), roadmap, four tools (Coach / Composer / Research / Packager) with task-scoped and standalone variants, check-ins, diagnostics, 1 active venture.

**Unit economics:** Net revenue $27.05 after Paddle fee, COGS $10-12 with caching → 56-63% gross margin. On founding rate ($19), margin collapses to 32-42% — thin but survivable.

**Assessment:** Execute is the load-bearing tier. It's where the product's value is concentrated and where the cost lives. The bundle is coherent: pushback + roadmap + tools + check-ins is the full "get from idea to action" loop. The 1-active-venture limit is a real constraint — a founder juggling three side projects hits it immediately — and it's the primary lever pushing upgrades to Compound.

**What's wrong with Execute today:** Nothing in the bundle, but the upgrade story out of it is weak. If a user is on Execute and not juggling multiple ventures, the Compound upgrade gets them: voice mode (nice-to-have), validation pages (real — but the recommendation flow has to arrive at a BUILD_SOFTWARE verdict for them to be eligible), continuation (broken — they already have it), cross-cycle memory (invisible to them). The real reason to upgrade is "I want to validate before I build" + "I want to speak instead of type." For a founder who's already decided what to build, Compound's value proposition is thin.

**Recommendation on Execute:** The tier itself is well-sized. The issue is that it's so generous that Compound has to fight for air. See §6.3.

### 6.3 Compound — "$49/mo, the system gets smarter"

**What Compound gets:** Everything in Execute plus voice mode, validation landing pages, continuation brief (broken), fork selection (broken), cross-cycle memory (implicit), 3 concurrent ventures.

**Unit economics:** Net revenue $46.05 after fee, COGS $15-18 → 61-69% margin. Best economics in the stack. Founding rate $29 still gives 33-44% margin.

**Assessment:** Compound is where I have the most concern. The $20/mo premium over Execute buys a bundle that's currently half broken or thin:

- **Voice mode** — genuine differentiator. Anyone who's done a 15-question interview by thumb-typing appreciates this immediately. Works on six surfaces including Discovery, so a Compound trialist gets the wow-moment in their first 20 minutes.
- **Validation landing pages** — real and differentiated, but only for BUILD_SOFTWARE recommendations. A founder whose recommendation is "package your existing skill as a productized service" never sees the value. The feature is genuinely premium but narrowly applicable.
- **Continuation / fork** — already delivered to Execute in code. Fixing D1 restores this as a Compound differentiator.
- **Cross-cycle memory** — invisibly delivered to Execute (single-venture profile). Only has legible value on the 2nd+ venture, i.e., only for Compound users.
- **3 concurrent ventures** — real and meaningful for the founder juggling multiple projects. Probably the single most-used Compound-specific feature in practice.

**My opinion on tier balance:**

- **Compound's upgrade story is weaker than the pricing page suggests**, mostly because continuation/fork (D1) is currently inside Execute. Fix D1 and Compound immediately looks $20 more compelling.
- **Voice mode is in the right tier.** There's an argument for moving voice mode to Execute as a conversion accelerant ("the wow feature that helps trialists convert"). I'd resist it. Voice mode's COGS is $0.02-$0.30/user/month — cheap — but it's the one feature Compound has that's highly visible from day one of a subscription. Moving it down to Execute would leave Compound with only validation pages + 3-venture cap + fixed continuation, and that bundle doesn't justify $20 to a founder without a landing-page need.
- **Validation pages might actually be in the wrong tier.** They're expensive to generate (one Opus call per create, one per publish) but they're narrowly useful (BUILD_SOFTWARE only) and they're the closest thing the product has to a hard "why do I need this" moment for a founder building anything that's not software. Consider whether validation pages belong in Execute as a "here's proof your idea is real" mid-flow artifact, and letting Compound differentiate purely on voice + 3 ventures + continuation + lifecycle memory. This is a product bet, not a clear win. Leaving it in Compound is defensible if the business wants validation pages to be a premium signal; moving to Execute makes them an activation signal.
- **The $20 gap between Execute and Compound is small** — that's intentional per the unit economics (both tiers have similar margin profile). The small gap is fine IF Compound's bundle is end-to-end honest. Today it's not. Fix D1 and (optionally) tighten the "build brief from real market signal" copy and it stops being a worry.

**Recommendation on Compound pricing:** Do not change the price. Fix the bundle integrity (D1) and the claim integrity (soften cross-cycle-memory copy or add an explicit depth gate). Then let the market tell you whether $49 holds.

---

## 7. Recommendations (Sorted by Urgency)

### A. Must-fix mismatches (pre-launch blockers)

1. **[D1] Move continuation + fork to Compound in code.** Change `'execute'` → `'compound'` at [continuation/route.ts:44](../client/src/app/api/discovery/roadmaps/[id]/continuation/route.ts#L44) and [continuation/fork/route.ts:56](../client/src/app/api/discovery/roadmaps/[id]/continuation/fork/route.ts#L56). Add an `UpgradePrompt(requiredTier='compound')` on `/discovery/roadmap/[id]/continuation` for Execute users. ~1 hour of work including UX. Single-digit lines of code.
2. **Add defence-in-depth tier gate to `/validation/[pageId]/publish/route.ts`.** A downgraded-to-Execute user can currently trigger a paid Opus call on publish. Add `await requireTierOrThrow(userId, 'compound')` after `requireUserId()`. ~10 minutes.
3. **Annotate the voice-mode and Paddle delivery reports as partially superseded.** Both documents tell a future reader the tier gating is stubbed or that validation pages are Execute — neither is true now. Add a top-of-file note on each pointing to the spec as the current source of truth.

### B. Tier rebalancing proposals (discuss with business before acting)

1. **Soften the "Full cross-cycle memory" bullet to "Cross-venture memory across all 3 of your ventures."** The "full" word implies something Execute doesn't have; the revised wording accurately describes the actual differentiation (the venture cap). Copy change only.
2. **Allow Free users 2 discovery interviews instead of strictly 1.** Raise Free's `TIER_VENTURE_LIMITS.free` behavior to allow a 2nd `first_interview` scenario without blocking at `assertVentureLimitNotReached`. Rationale: current behavior is a usability trap that loses founders who want to "try once more with different framing." Cost impact: ~$0.80-$1.50 per additional Free discovery with caching. Keep the ceiling at 2 so Free doesn't become a lifetime tier.
3. **Evaluate moving validation landing pages from Compound to Execute** as a potential conversion-accelerant. Rationale: validation pages are only applicable to BUILD_SOFTWARE recommendations (~? of the verdict mix), are a demonstrable "here's proof your idea is real" moment, and would strengthen Execute's story without overloading Compound. Risk: Compound loses a visible differentiator. Don't do this unless voice mode + continuation + 3 ventures + lifecycle memory is considered enough for Compound. **My recommendation: leave in Compound for now, reconsider after 90 days of live data showing which tier founders actually buy.**
4. **Consider adding "Second opinion mode" or "Compare two recommendations side-by-side" as a future Compound-only feature** to thicken the Compound bundle. Out of scope for this audit; flagged as future direction.

### C. Spec / documentation cleanups (nice-to-have, zero risk)

1. **Add a §1.5 "App-wide entitlements" table to the spec** listing Account, Privacy consents, Billing self-service, Past recommendations, Session resumption, and validation page public view. Prevents future reviewers from reading §1.3 and thinking these surfaces are unassigned.
2. **In §5.3 feature gating map, add the publish and report validation routes explicitly.** Currently only create is listed. Either confirm they're intentionally ungated or add the gates recommended in A.2 and update the map.
3. **Add an erratum note to [docs/paddle-integration-delivery-report.md](./paddle-integration-delivery-report.md) §5.3** pointing at the superseding tier-gating-honesty report + current spec.
4. **Mark the voice-mode delivery report's "STUBBED" section as resolved.** Both stub points have been replaced with live tier reads.

---

## Appendix A — Every Gated API Route

Collected via `requireTierOrThrow | assertCompoundTier | assertVentureLimitNotReached` grep across `client/src/app/api`. Ordering: grouped by tier, alphabetical within group.

### Execute-gated (`requireTierOrThrow(userId, 'execute')`)

| Route | Line | Notes |
|---|---|---|
| `POST /api/discovery/recommendations/[id]/accept` | 31, 95 | Accept + detach cases |
| `POST /api/discovery/recommendations/[id]/pushback` | 68 | Pushback turn |
| `POST /api/discovery/recommendations/[id]/roadmap` | 51 | Roadmap generation trigger |
| `GET /api/discovery/roadmaps/[id]/continuation` | 44 | **Should be compound (D1)** |
| `POST /api/discovery/roadmaps/[id]/continuation/fork` | 56 | **Should be compound (D1)** |
| `POST /api/discovery/roadmaps/[id]/coach/setup` | 49 | |
| `POST /api/discovery/roadmaps/[id]/coach/prepare` | 49 | |
| `POST /api/discovery/roadmaps/[id]/coach/roleplay` | 52 | |
| `POST /api/discovery/roadmaps/[id]/coach/debrief` | 51 | |
| `POST /api/discovery/roadmaps/[id]/composer/generate` | 46 | |
| `POST /api/discovery/roadmaps/[id]/composer/regenerate` | 50 | |
| `POST /api/discovery/roadmaps/[id]/composer/mark-sent` | 43 | |
| `POST /api/discovery/roadmaps/[id]/research/plan` | 42 | |
| `POST /api/discovery/roadmaps/[id]/research/execute` | 48 | |
| `POST /api/discovery/roadmaps/[id]/research/followup` | 49 | |
| `GET /api/discovery/roadmaps/[id]/research/sessions/[sessionId]` | 23 | |
| `POST /api/discovery/roadmaps/[id]/packager/generate` | 47 | |
| `POST /api/discovery/roadmaps/[id]/packager/adjust` | 42 | |
| `GET /api/discovery/roadmaps/[id]/packager/sessions/[sessionId]` | 26 | |
| `POST /api/discovery/roadmaps/[id]/tasks/[taskId]/status` | 52 | |
| `POST /api/discovery/roadmaps/[id]/tasks/[taskId]/checkin` | 75 | |
| `POST /api/discovery/roadmaps/[id]/tasks/[taskId]/diagnostic` | 65 | |
| `POST /api/discovery/roadmaps/[id]/tasks/[taskId]/coach/{setup,prepare,roleplay,debrief}` | 52, 49, 58, 53 | Task-scoped variants |
| `POST /api/discovery/roadmaps/[id]/tasks/[taskId]/composer/{generate,regenerate,mark-sent}` | 45, 54, 49 | Task-scoped variants |
| `POST /api/discovery/roadmaps/[id]/tasks/[taskId]/research/{plan,execute,followup}` | 50, 55, 55 | Task-scoped variants |
| `POST /api/discovery/roadmaps/[id]/tasks/[taskId]/packager/{generate,adjust}` | 46, 42 | Task-scoped variants |

### Compound-gated (`requireTierOrThrow(userId, 'compound')` or `assertCompoundTier`)

| Route | Line | Notes |
|---|---|---|
| `POST /api/discovery/recommendations/[id]/validation-page` | 38 | Generate / regenerate page |
| `GET /api/discovery/recommendations/[id]/validation-page` | 186 | Fetch existing page |
| `POST /api/voice/transcribe` | 58 | `assertCompoundTier` helper |

### Venture-limit-gated (`assertVentureLimitNotReached`)

| Route | Line | Notes |
|---|---|---|
| `POST /api/discovery/sessions` | 108 | Only on `fresh_start` scenario; enforces 0/1/3 per tier |

### Ungated (public, auth-only, or Free entitlement)

All other `/api/discovery/sessions/*`, `/api/lp/analytics` (public visitor beacon), `/api/webhooks/paddle` (Paddle signature verified), and the app-wide consent/billing routes. These are intentionally open under current design.

---

**End of audit.**
