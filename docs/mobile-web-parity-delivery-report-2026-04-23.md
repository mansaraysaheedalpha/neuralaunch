# Mobile–Web Parity Delivery Report — 2026-04-23

**Branch:** `feat/mobile-web-parity` (cut from latest `dev`)
**Source plan:** [docs/mobile-web-parity-plan-2026-04-22.md](mobile-web-parity-plan-2026-04-22.md)
**Source audit:** auto-generated codebase audit, 2026-04-22

---

## Summary

Nine of ten items in the plan landed as scoped, each in its own commit.
Item 10 (Paddle billing integration) was flagged for strategy decision
in the plan; the browser-handoff strategy is in fact already shipped
via items 5 and 6 — native StoreKit / in-app purchase is a separate
sprint that requires App Store / Play Store compliance review before
it can begin.

Every commit below passes `pnpm exec tsc --noEmit` on mobile with only
the three pre-existing `@neuralaunch/constants` resolution errors
documented in the previous two sprint reports.

---

## Commit list

| Commit | Item | Tier | Scope |
|---|---|---|---|
| `27181b4` | 1. Pushback round caps by tier | 2 | Small |
| `4d77b6b` | 2. Aggregate analytics consent toggle | 2 | Small |
| `5fdc3c6` | 3. Tier-gated tool UX / UpgradePrompt | 2 | Small |
| `f0d691e` | 4. Tier transition history in settings | 2 | Small |
| `0132a88` | 5. Billing card in settings (tier, renewal, founding badge) | 1 | Medium |
| `4d61be7` | 6. Welcome-back banner for lapsed paid users | 3 | Small |
| `d943d38` | 7. Voice input in discovery chat | 2 | Medium (new dep) |
| `bb59580` | 8. Validation publishing + distribution polish | 1 | Medium |
| `c6657a8` | 9. Venture-grouped recommendations + swap dialog | 1 | Large |

---

## Per-item notes

### 1. Pushback round caps by tier (`27181b4`)

**Hits:** 3 files. client mobile-auth (adds tier + isFoundingMember to
the mobile session response), mobile auth store (extends User), mobile
recommendation screen (resolves `hardCapForTier(user?.tier ?? 'free')`
via the shared `@neuralaunch/constants` helper).

**Result:** Execute caps at 10 rounds, Compound at 15 (the shared
source of truth). The hardcoded `HARD_CAP_ROUND = 7` constant on
mobile is gone; PushbackChat's existing `userTurns / hardCapRound` UI
honours the resolved cap.

### 2. Aggregate analytics consent toggle (`4d77b6b`)

**Hits:** 1 file (settings). Fetches `/api/user/aggregate-analytics-consent`
alongside the training-consent fetch on mount. Optimistic toggle with
rollback on API failure, mirrors the training-consent pattern exactly.
Privacy section label renamed from "Privacy" to "Privacy and data" to
match the web's restructure.

### 3. Tier-gated tool UX / UpgradePrompt (`5fdc3c6`)

**New primitive:** `mobile/src/components/billing/UpgradePrompt.tsx`.
Compact + hero variants. Gold border + gold-tinted background. Default
copy keyed on `requiredTier` ('execute' | 'compound') ported verbatim
from the web. Tapping opens `${API_BASE_URL}/#pricing` in
`expo-web-browser`; an `onPress` override is accepted for when native
Paddle checkout lands.

**TaskCard** now reads `tier` from the auth store. For free-tier users
with any suggested tool, renders a compact UpgradePrompt above the
actions row and hides the Coach / Outreach / Research / Package
buttons. Check-in always remains available.

### 4. Tier transition history (`f0d691e`)

**New REST endpoint:** `GET /api/user/tier-history` — returns up to ten
`TierTransition` rows + the User's `wasFoundingMember` flag, keyed off
the Bearer session. Matches the inline Prisma query the web
server-component performs.

**New primitive:** `TierHistorySection`. CollapsibleSection showing N
changes; each row uses the same `describeTransition()` event-type →
human-phrase helper as web for copy alignment. Founding transitions
get a gold "Founding rate" badge.

### 5. Billing card in settings (`0132a88`)

**New REST endpoint:** `GET /api/user/billing-overview` — returns
tier + status + isFoundingMember + cancelAtPeriodEnd + currentPeriodEnd
+ hasBillingProfile + the returning-user fields (userName,
lastPaidTier, wasFoundingMember) in a single payload so the section
and the Welcome-back banner share one fetch.

**New primitive:** `BillingSection` + `useBillingOverview()` hook.
Renders tier label, founding-member badge (gold Sparkles chip),
renewal-or-end date, status badge, dunning / past_due / paused copy
mirroring the web. "Manage billing" button opens
`${API_BASE_URL}/settings` in `expo-web-browser` — the web's
Paddle-portal server action mints the ephemeral portal URL from
there. "Opens web" helper text makes the handoff explicit.

### 6. Welcome-back banner (`4d61be7`)

**New primitive:** `WelcomeBackBanner`. Silent unless `tier === 'free'`
AND `lastPaidTier` is set. Gold for founding members or returning
Compound; primary blue for returning Execute. Greets by first name
when available. Preserves the `$19` / `$29` founding rate split from
the web copy. "View plans" opens pricing in the in-app browser.

### 7. Voice input in discovery chat (`d943d38`)

**New deps:** `expo-audio` (pre-bundled with Expo Go SDK 54, config
plugin auto-added to `app.json` for iOS mic permission + Android
RECORD_AUDIO).

**New files:**
- `mobile/src/services/voice.ts` — uploads a file-URI to
  `/api/voice/transcribe` via RN's FormData file-shape. Typed errors
  (`TranscriptionForbiddenError` for 403 tier gate, generic
  `TranscriptionUnavailableError` otherwise).
- `mobile/src/components/ui/VoiceInputButton.tsx` — state machine
  (idle → recording → processing), pulse animation during recording,
  cancel affordance, permission request via
  `requestRecordingPermissionsAsync`. Uses
  `RecordingPresets.HIGH_QUALITY` which produces an m4a the web
  endpoint's mime allow-list already accepts.

**ChatInput** gets optional controlled `value` + `onChangeText` props
and a `leftSlot`. When `leftSlot` is present, the row's left padding
drops from `spacing[4]` to `spacing[1.5]` to stay symmetric with the
send-button side. Back-compat default behaviour unchanged for every
other caller of ChatInput.

**Discovery screen** renders the VoiceInputButton as the leftSlot only
when `tier === 'compound'` (matches the web endpoint's server-side
`assertCompoundTier` gate). Transcription appends to whatever text is
already typed; user reviews before tapping send.

### 8. Validation publishing + distribution polish (`bb59580`)

**Six targeted improvements** to the existing validation detail screen:

- Preview button for LIVE pages (opens `/lp/[slug]` in in-app browser)
- Publish errors now surface as a destructive caption below the
  button (no more silent catch)
- Preview-hint card is tappable on LIVE pages
- Replaced `'✓'` and "Link copied" emoji with Lucide Check + Copy
  icons (aligns with the Phase 2 icon pass)
- Channel checkbox gets hitSlop + `accessibilityRole="checkbox"`
  with a proper Check icon
- "Use as my MVP spec" button gets loading state + try/catch + error
  haptic

No new dependencies. No backend changes — all existing endpoints.

### 9. Venture-grouped recommendations + swap dialog (`c6657a8`)

The largest item. Seven files across backend + mobile.

**New REST endpoints:**
- `GET /api/discovery/ventures` — returns ventures with cycles +
  per-active-venture roadmap progress + tier + cap. Same shape the
  web server-component assembles inline.
- `POST /api/discovery/ventures/swap` — mobile REST counterpart to
  the `swapVentureStatus` server action. Identical transaction shape
  so two racing clients can't double-activate past cap. Same error
  reasons surface with matching status codes.

**New mobile files:**
- `mobile/src/hooks/useVentures.ts` — SWR fetch + `groupVentures()`
  helper (active / paused / completed / archived buckets).
- `mobile/src/components/ventures/VentureCard.tsx` — name, status
  badge, cycle list, active-only progress bar sourced from
  `RoadmapProgress`. Cycles with a `roadmapId` navigate into
  `/roadmap/[id]` on tap.
- `mobile/src/components/ventures/ReactivateDialog.tsx` — at-cap
  swap presented in a `BottomSheet` (reuses the primitive from
  feat/mobile-polish-phase-2). Radio-select which currently-active
  venture to archive. Tier-aware copy matches web wording.
- `mobile/src/components/ventures/ArchivedVenturesSection.tsx` —
  dispatches a direct swap when under cap, opens ReactivateDialog
  when at cap. Free tier sees an informational "upgrade to
  reactivate" banner instead of a button.

**Restructure:** `mobile/src/app/recommendations/index.tsx` is now a
venture-grouped ScrollView with a tier-cap reminder header.
FlatList + per-recommendation card is removed — pre-venture users
will have a venture row backfilled by the webhook processor before
they see this screen again, so the flat fallback is no longer
needed.

### 10. Paddle billing integration — browser handoff shipped

Items 5 and 6 already wire every billing-related mobile button
(Manage billing, View plans, Upgrade) through `expo-web-browser` to
the existing web Paddle flow. This is the **compliant** mobile
strategy:

- Apple App Store rules allow linking out to a web checkout for
  digital subscriptions as long as the flow is not completed inside
  the app. `expo-web-browser` (SFAuthenticationSession on iOS, Custom
  Tabs on Android) is an external browser for compliance purposes.
- Play Store allows this path for subscription management, with the
  same external-browser requirement.

**Native StoreKit / Google Billing integration** — where mobile would
process subscription checkouts in-app — is a separate sprint. It
requires:

1. Product decision about whether to pay the 30% App Store share
   (net-of, this reduces founding-member margins significantly).
2. Backend work to ingest StoreKit receipts into Paddle (or run a
   parallel subscription ledger for mobile-sourced subscriptions).
3. App-side SDK integration (`expo-in-app-purchases` or equivalent).

**Recommendation:** keep browser handoff as the mobile strategy for
now. Revisit native checkout after founding-member pricing stabilises
and the Apple compliance review has been done for the current
external-link approach.

---

## Verification

### `pnpm exec tsc --noEmit` on mobile — PASS

Only the three pre-existing `@neuralaunch/constants` resolution errors
appear (documented in the prior two delivery reports). No new errors
introduced.

### Client typecheck — clean for touched files

The Paddle SDK isn't installed in the local sandbox, so the full client
typecheck surfaces its usual Paddle-related errors and some pre-existing
JsonifyObject type-quirks in Inngest functions. None of my added files
(`client/src/app/api/user/tier-history/route.ts`, `billing-overview/route.ts`,
`discovery/ventures/route.ts`, `discovery/ventures/swap/route.ts`,
`lib/mobile-auth.ts`) contribute any errors.

### New dependency

One new dep: `expo-audio`. Installed via
`pnpm expo install expo-audio -- --ignore-workspace`. Config plugin
auto-added to `app.json` for native permissions. Pre-bundled in Expo
Go SDK 54 (no native rebuild needed); custom dev clients / EAS
pick it up on the next prebuild.

---

## What this plan deliberately still does NOT cover

- **Venture pause / resume / mark-complete / rename UI** — the web's
  `VentureCard` exposes these actions via a menu. Mobile's VentureCard
  is read-only in this pass. Lifecycle actions are a follow-up once
  the grouped list is in production and we have usage data.
- **Cycle-level detail screens** — tap on a cycle navigates into the
  roadmap (when one exists), which is the natural destination.
- **Pricing / landing / About / FAQ pages** — browser-first surfaces,
  correctly out of scope for mobile per the original plan.
- **Native StoreKit checkout** — see item 10 above.

---

*Report prepared 2026-04-23. Every commit carries the Co-Authored-By
trailer per repository convention. All nine implementable commits sit
on `feat/mobile-web-parity`, cut from `dev`. Ready for review.*
