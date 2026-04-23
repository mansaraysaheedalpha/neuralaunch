# Mobile–Web Parity Plan — 2026-04-22

**Branch:** `feat/mobile-web-parity` (cut from latest `dev`)
**Source audit:** generated 2026-04-22 via codebase exploration of
`client/` vs `mobile/`. This plan consolidates the audit into a work
order mobile can execute one item at a time.

**Context:** Mobile completed two polish sprints
(`feat/mobile-polish`, `feat/mobile-polish-phase-2`) that matched
discovery → recommendation → roadmap → tools → continuation with the
web. While that work was in flight, the web app shipped: Paddle
billing, voice mode, tier gating, validation-page publishing &
distribution tracking, ventures & multi-venture lifecycle,
tier-transition history, aggregate-analytics consent, welcome-back
banners for lapsed subscribers, and tier-scoped tool limits. Most of
these are absent on mobile today. This plan tracks mobile's catch-up.

---

## Summary of gaps

| # | Area | Status on mobile | Tier | Scope |
|---|------|------------------|------|-------|
| 1 | Pushback round caps by tier | No per-tier limit | 2 | Small |
| 2 | Aggregate analytics consent | Missing toggle | 2 | Small |
| 3 | Tier-gated tool UX (UpgradePrompt) | No upgrade CTA | 2 | Small |
| 4 | Tier transition history | Not displayed | 2 | Small |
| 5 | Billing section in settings | Entirely missing | 1 | Medium |
| 6 | Welcome-back banner | Not shown | 3 | Small |
| 7 | Voice input in discovery chat | Not implemented | 2 | Medium |
| 8 | Validation publishing & distribution | Mostly present; polish needed | 1 | Medium |
| 9 | Ventures / multi-venture management | Not implemented | 1 | Large |
| 10 | Paddle billing integration (checkout) | Not integrated | 1 | Large — needs strategy decision |

"Tier" above refers to the audit's priority tier (1 = critical,
2 = high-value enhancement, 3 = polish). The **Paddle billing
integration** (item 10) is called out separately because it is not
purely an engineering task — it requires a decision about App Store /
Play Store compliance strategy (native StoreKit vs. web-browser
handoff vs. Paddle Mobile SDK). Flagged for user input before
implementation.

---

## Execution order

Working smallest → largest so each commit is scoped, reviewable, and
can ship independently:

1. **Pushback round caps** — adds tier awareness to an existing screen.
2. **Aggregate analytics consent toggle** — one new API call + one
   new settings row.
3. **Tier-gated tool UX / UpgradePrompt** — conditional banner on
   task cards.
4. **Tier transition history** — read-only list in settings.
5. **Billing section in settings** — tier label + renewal date +
   founding-member badge + "Manage billing" portal link (browser
   handoff). Stops short of checkout — that's item 10.
6. **Welcome-back banner** — conditional banner above billing section.
7. **Voice input in discovery chat** — new dep, integrated with
   existing `/api/voice/transcribe` backend. Uses `expo-av` (or the
   current Expo SDK audio API).
8. **Validation publishing polish** — verify mobile's existing
   validation detail screen covers all publish / channel / report
   actions; add what's missing (status controls, distribution message
   copy, preview via WebView).
9. **Ventures / multi-venture management** — biggest user-facing gap.
   New hook, new cards, archived section, reactivate dialog.
10. **Paddle billing integration** — flagged; waits for strategy
    decision. When ready, will use the browser handoff pattern
    (open Paddle hosted checkout / portal in `expo-web-browser`)
    rather than native StoreKit to avoid App Store 30% revenue share
    on subscriptions sold through the app. This matches the web's
    existing Paddle flow.

---

## Per-item details

### Item 1 — Pushback round caps by tier

**Problem:** On web, pushback refinement is capped at **10 rounds on
Execute** and **15 rounds on Compound**. Mobile has no per-tier cap —
a founder on Execute can push back indefinitely, at any token cost.

**Files to touch:**
- [mobile/src/components/recommendation/PushbackChat.tsx](../mobile/src/components/recommendation/PushbackChat.tsx)
- [mobile/src/app/recommendation/[id].tsx](../mobile/src/app/recommendation/[id].tsx)

**Acceptance criterion:** Pushback input disables when the round cap
for the current user's tier is hit, with a clear *"Pushback limit
reached on your &lt;tier&gt; plan"* message.

### Item 2 — Aggregate analytics consent toggle

**Problem:** Settings has training-data consent but not aggregate
analytics consent. Web has two independent toggles.

**API endpoints:** `GET/PATCH /api/user/aggregate-analytics-consent`
(already exists on web).

**Files to touch:**
- [mobile/src/app/(tabs)/settings.tsx](../mobile/src/app/(tabs)/settings.tsx)

**Acceptance criterion:** Settings privacy section has two toggles
with independent state. Each reads/writes the matching API.

### Item 3 — Tier-gated tool UX / UpgradePrompt

**Problem:** On free tier, task cards silently render tool buttons
that do nothing (or worse, hit a backend that returns 403). Web shows
a compact `UpgradePrompt` banner instead.

**Files to touch:**
- [mobile/src/components/roadmap/TaskCard.tsx](../mobile/src/components/roadmap/TaskCard.tsx)
- New: `mobile/src/components/billing/UpgradePrompt.tsx`

**Acceptance criterion:** Free-tier founders see an inline upgrade
banner on task cards whose `suggestedTools` are non-empty. Banner
routes to pricing / billing flow (for now, external web link).

### Item 4 — Tier transition history

**Problem:** Web settings shows the last ~10 tier transitions
(e.g. *"2026-03-01 — Upgraded to Execute · Paddle transaction
XYZ"*). Mobile has no equivalent.

**API endpoint:** reuses whatever web uses
(`GET /api/user/tier-history`).

**Files to touch:**
- New: `mobile/src/components/billing/TierHistorySection.tsx`
- [mobile/src/app/(tabs)/settings.tsx](../mobile/src/app/(tabs)/settings.tsx)

**Acceptance criterion:** Settings shows up to 5 most recent tier
transitions, formatted as a single line each.

### Item 5 — Billing section in settings

**Problem:** Mobile settings has no billing UI at all. Users can't
see their tier, renewal date, or launch a billing portal.

**Files to touch:**
- New: `mobile/src/components/billing/BillingSection.tsx`
- [mobile/src/app/(tabs)/settings.tsx](../mobile/src/app/(tabs)/settings.tsx)

**Acceptance criterion:** Settings shows tier label + status + renewal
date + founding-member badge (if applicable). "Manage billing"
button opens the web billing portal in `expo-web-browser`. Does NOT
attempt native checkout — that's item 10.

### Item 6 — Welcome-back banner

**Problem:** Users who previously held Execute/Compound subscriptions
but are now on free tier get no re-engagement prompt.

**Files to touch:**
- New: `mobile/src/components/billing/WelcomeBackBanner.tsx`
- `mobile/src/components/billing/BillingSection.tsx` (renders it)

**Acceptance criterion:** Free-tier users with `lastPaidTier` on
their profile see a gold-accented banner above the billing card, with
founding-member rate mentioned if `wasFoundingMember` is true.

### Item 7 — Voice input in discovery chat

**Problem:** Mobile users must type every discovery response. Web
supports voice input with Whisper transcription.

**Dependencies:** `expo-av` (or the SDK 54 successor) to record. The
backend route `/api/voice/transcribe` already exists.

**Files to touch:**
- New: `mobile/src/components/ui/VoiceInputButton.tsx`
- New: `mobile/src/services/voice.ts`
- [mobile/src/components/ui/ChatInput.tsx](../mobile/src/components/ui/ChatInput.tsx) — add mic slot
- [mobile/src/app/discovery/index.tsx](../mobile/src/app/discovery/index.tsx) — wire mic

**Acceptance criterion:** Discovery chat input has a mic button.
Tap-and-hold (or tap-to-toggle — pick one) records audio, shows
duration + waveform, sends audio to `/api/voice/transcribe`, and
inserts transcribed text into the input for review before sending.

### Item 8 — Validation publishing polish

**Problem:** The audit flagged mobile as "lacks publish controls",
but a spot-check shows `mobile/src/app/validation/[pageId].tsx`
already references publish state. Need to verify and fill gaps.

**Files to touch:**
- [mobile/src/app/validation/[pageId].tsx](../mobile/src/app/validation/[pageId].tsx)
- Possibly new: `mobile/src/components/validation/ValidationPageControls.tsx`, `DistributionTracker.tsx`

**Acceptance criterion:** Mobile can:
- Publish / archive a validation page
- Toggle per-channel "completed" state
- Copy per-channel message text
- Preview the live page (WebView or in-app browser to `/lp/[slug]`)
- Mark the brief as "used for MVP"

### Item 9 — Ventures / multi-venture management

**Problem:** Recommendations render as a flat list. Web groups them
under ventures (projects), shows cycle count + progress, and
supports archived-venture reactivation (with at-cap swap on
Execute/Compound).

**API endpoints:** the `/api/discovery/ventures/*` family
(pause / resume / mark-complete / reactivate).

**Files to touch:**
- New: `mobile/src/hooks/useVentures.ts`
- New: `mobile/src/components/ventures/VentureCard.tsx`
- New: `mobile/src/components/ventures/CycleList.tsx`
- New: `mobile/src/components/ventures/ArchivedVenturesSection.tsx`
- New: `mobile/src/components/ventures/ReactivateDialog.tsx`
- [mobile/src/app/recommendations/index.tsx](../mobile/src/app/recommendations/index.tsx) — restructure

**Acceptance criterion:** Recommendations screen renders as:
- Active ventures grouped by cycles with progress bars
- Archived ventures below, separated
- Tap-to-reactivate with tier-aware swap dialog
- Status badges throughout (Active / Paused / Completed)

### Item 10 — Paddle billing integration (flagged)

**Problem:** Mobile has no way to upgrade from free to Execute /
Compound. Currently the only paths are:
- (a) web checkout via browser (fine if we link out)
- (b) native in-app purchase via StoreKit/Google Billing (Apple
  requires this for digital subscriptions, takes 30% cut)
- (c) Paddle Mobile SDK (bypasses App Store — may be against policy)

**Decision required before implementation:** which strategy?

My recommendation: start with **browser handoff** (option a) for
parity's sake — item 5 already stubs the "Manage billing" button.
For new checkouts, the same button can say "Upgrade on web" and open
Paddle's hosted checkout in `expo-web-browser`. This is compliant
with App Store rules because we're not processing payments inside
the app.

Native StoreKit integration (option b) is a separate sprint and
requires backend changes — Paddle would need to ingest StoreKit
receipts, which is non-trivial.

**When ready to proceed, files likely to touch:**
- `mobile/src/components/billing/BillingSection.tsx` (add Upgrade CTA)
- `mobile/src/services/billing.ts` (portal URL fetching)

**Not implementing in this sprint without user direction.**

---

## What this plan deliberately does NOT cover

These live on web-only and are intentionally out of scope for mobile:

- **Marketing site / landing page / pricing grid / FAQ / About** — app
  store listing + browser-served marketing is correct.
- **Validation page WYSIWYG editor** — complex authoring surfaces
  stay on web; mobile is view + publish + distribute only.
- **Admin / moderation tooling** — internal, not user-facing.
- **API keys / third-party integrations** — developer-facing, web
  portal is correct.

---

*Plan prepared 2026-04-22. Each item above becomes a single commit on
`feat/mobile-web-parity`, with the commit message and any delivery
notes appended to this document as items land. Item 10 waits for an
explicit strategy decision.*
