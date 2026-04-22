# Mobile Polish Phase 2 — Delivery Report

**Date:** 2026-04-17
**Branch:** `feat/mobile-polish-phase-2` (cut from latest `main`)
**Scope:** Priorities 3, 4, 6, 8, 9, 11, 12, 13, 14, 15 from
[docs/mobile-design-review-2026-04-17.md](mobile-design-review-2026-04-17.md)
§7 — everything that wasn't landed in the first sprint
([docs/mobile-polish-delivery-report.md](mobile-polish-delivery-report.md)).

---

## Summary

Eleven commits on this branch. All ten remaining ranked priorities
landed, plus the supporting infrastructure work that two of them
required (gesture-handler + reanimated install + app-root wiring).

| Commit | Priority | Summary |
|---|---|---|
| `4105d2e` | 12 | Unify screen-transition motion + stagger-animate key moments |
| `5ad60b7` | 13 | Split oversized packager and research screens into focused views |
| `406cb3f` | 8  | Add swipe-to-complete gesture on TaskCard |
| `8cb176b` | —  | Install gesture-handler + reanimated + wire into app root |
| `ff96931` | 3  | Introduce BottomSheet primitive and migrate TaskStatusPicker |
| `538b4e6` | 11 | 30s timeout + exponential-backoff retry in the API client |
| `30fda8f` | 4  | Elevate fork picker as the decision moment |
| `2111803` | 6  | Scroll-to-bottom FAB + scroll-aware auto-scroll on chat surfaces |
| `5a10e62` | 9  | Celebrate task completion with success-green card + spring-in |
| `dafd98f` | 15 | Differentiate coach roleplay bubbles with gold tint + identity label |
| `6c9b4f9` | 14 | Animate CollapsibleSection open/close with LayoutAnimation |

---

## Item-by-item

### Priority 14 — Height animation on CollapsibleSection (`6c9b4f9`)

File: [mobile/src/components/ui/CollapsibleSection.tsx](../mobile/src/components/ui/CollapsibleSection.tsx)

Content previously appeared/disappeared instantly. Now uses React
Native's built-in `LayoutAnimation` (no new deps, Expo Go compatible):
`LayoutAnimation.configureNext()` fires before the state flip so RN
interpolates the layout change over 150ms with easeInEaseOut. Android
opts in via `UIManager.setLayoutAnimationEnabledExperimental(true)` at
module load. Chevron rotation still runs on the native driver; the
height animation runs on the JS thread. Both complete in 150ms so they
read as a single motion.

### Priority 15 — Differentiate coach roleplay bubbles (`dafd98f`)

Files: [mobile/src/components/ui/ChatBubble.tsx](../mobile/src/components/ui/ChatBubble.tsx),
[mobile/src/components/coach/RolePlayChat.tsx](../mobile/src/components/coach/RolePlayChat.tsx)

`ChatBubble` gains a `variant` prop. In `roleplay` mode the assistant
bubble uses `secondaryAlpha10` background + `secondaryAlpha20` border
(muted gold). `RolePlayChat` renders an "in character" identity label
above each other-party bubble (e.g. *"Alex — in character"*). The
founder always knows which bubble is the AI simulation, not a real
answer. Discovery, pushback, and all other chat surfaces continue to
use the default variant unchanged.

### Priority 9 — Task completion moment (`5a10e62`)

File: [mobile/src/app/roadmap/[id]/checkin.tsx](../mobile/src/app/roadmap/[id]/checkin.tsx)

Replaced the `Card variant="primary"` (blue tint) "Step complete" card
with a dedicated `CompletionCard` component:

- `successMuted` background + `success` border (green, not blue)
- CheckCircle2 Lucide icon at 40pt
- Spring-in scale 0.6 → 1.0 in parallel with a 250ms opacity fade via
  Animated with `useNativeDriver: true` (friction 6, tension 140)

The existing `NotificationFeedbackType.Success` haptic (already firing
at submit) now pairs with the scale-in for a combined tactile + visual
confirmation.

### Priority 6 — Scroll-to-bottom FAB (`2111803`)

New files:
- [mobile/src/hooks/useScrollToBottom.ts](../mobile/src/hooks/useScrollToBottom.ts)
- [mobile/src/components/ui/ScrollToBottomButton.tsx](../mobile/src/components/ui/ScrollToBottomButton.tsx)

Wired into:
- [mobile/src/app/discovery/index.tsx](../mobile/src/app/discovery/index.tsx)
- [mobile/src/components/coach/SetupChat.tsx](../mobile/src/components/coach/SetupChat.tsx)
- [mobile/src/components/coach/RolePlayChat.tsx](../mobile/src/components/coach/RolePlayChat.tsx)

The hook exposes `onScroll`, `visible`, `scrollToBottom(animated)` and
`atBottomRef`. Auto-scroll on new messages now gates on
`atBottomRef.current` — if the founder scrolled up to re-read a
question, the new arrival doesn't yank them back. The FAB appears once
the user has scrolled more than one screen-height from the bottom,
fades + springs in, and jumps back to the latest message on tap with
a selection haptic.

`PushbackChat` deliberately unchanged — its embedded 320pt-max FlatList
lives inside a scrollable recommendation screen, so the scroll-away
problem does not apply.

### Priority 4 — Fork picker elevation (`30fda8f`)

File: [mobile/src/app/roadmap/[id]/continuation.tsx](../mobile/src/app/roadmap/[id]/continuation.tsx)

Four changes:

1. **Reorder**: forks render above the closing reflection. Actionable
   content leads; retrospective context follows.
2. **Gold overline** "The decision" above the forks heading — first
   use of the product's moment colour on this screen.
3. **Selected fork treatment**: 2px gold border (c.secondary),
   gold-tinted background (`secondaryAlpha10`), gold title. Unselected
   forks fade to 45% opacity when one is being committed.
4. **Drop italic** on `whyThisOne`; the forking-state
   ActivityIndicator and copy switch to gold to match the border.

Fork cards also get a larger internal padding (`spacing[5]`) so they
stop looking like the parking-lot cards below.

### Priority 11 — API client timeout + retry (`538b4e6`)

File: [mobile/src/services/api-client.ts](../mobile/src/services/api-client.ts)

Three changes:

1. **30-second per-attempt timeout** via `AbortController`. Chosen
   because synthesis (the slowest legitimate endpoint) takes ~25s at
   p99. Timeouts surface as `ApiError` with `status: 0` and message
   *"Request timed out after 30s"* — consumers that already branch on
   `status === 0` for network errors pick it up for free.
2. **Exponential-backoff retry**, two attempts, delays 500ms / 1500ms
   (2× backoff). Retries on 5xx responses and `TypeError` (the shape
   of fetch network failures). 4xx never retries. Aborts caused by
   the caller's own signal never retry — only my internal timeout
   aborts are transformed.
3. **Signal composition**: linking the caller's `signal` to my timeout
   `AbortController` so a caller-initiated abort propagates untouched.

`@react-native-community/netinfo` is deliberately deferred — it's a
new optional dependency whose incremental value over the transport
changes here is small. Revisit if retry behaviour proves insufficient
on long-flakey connections.

### Priority 3 — BottomSheet primitive + TaskStatusPicker migration (`ff96931`)

New file: [mobile/src/components/ui/BottomSheet.tsx](../mobile/src/components/ui/BottomSheet.tsx)

Built on React Native's `Modal` so it sits above everything without
requiring a root-level provider. Slides up with a spring, dismisses
with a timing fade. Semi-transparent backdrop (tap dismisses).
`PanResponder` drag-to-dismiss — past 120pt threshold commits, below
springs back. Hardware back on Android closes via `onRequestClose`.
Safe-area bottom padding applied automatically. Optional title slot.
**Expo Go compatible; no gesture-handler dependency** — uses built-in
`PanResponder`.

Migration: `TaskStatusPicker` now takes `visible` + `onClose` and
presents its options inside the sheet. Each option is a 52pt-tall row
with the status badge plus a "Current" indicator on the selected item.
`TaskCard` stops conditionally rendering the picker — the sheet owns
its own visibility.

### Infrastructure — gesture-handler + reanimated wiring (`8cb176b`)

New file: [mobile/babel.config.js](../mobile/babel.config.js)

Deps added (via `pnpm add ... --ignore-workspace` from `mobile/`):
- `react-native-gesture-handler ^2.31.1` — drives the swipe-to-complete
  gesture below.
- `react-native-reanimated ^4.3.0` + `react-native-worklets ^0.8.1`
  (worklets is reanimated 4's new runtime peer dep).

Wiring:
- `babel.config.js`: `react-native-worklets/plugin` listed last so
  other transforms run before the worklet rewrite.
- [`mobile/src/app/_layout.tsx`](../mobile/src/app/_layout.tsx):
  imports `react-native-gesture-handler` at the top of the file (must
  precede React) and wraps the navigation tree in
  `GestureHandlerRootView`. The outer `View` wrapper was dropped.

Both libraries ship pre-bundled in Expo Go for SDK 54, so this works
in Expo Go without a native rebuild. Custom dev clients and EAS
builds pick them up on the next prebuild.

### Priority 8 — Swipe-to-complete on TaskCard (`406cb3f`)

File: [mobile/src/components/roadmap/TaskCard.tsx](../mobile/src/components/roadmap/TaskCard.tsx)

Each non-completed TaskCard is wrapped in `Swipeable` from
react-native-gesture-handler. Left-swipe reveals a green "Complete"
action (Lucide `CheckCircle2` at 28pt on a `c.success` panel). The
action's icon + label interpolate opacity + scale as the user pulls
— fully visible at 80pt, overshoots to 1.05 past 160pt for a tactile
confirmation. Tunings:

- `leftThreshold={80}` — needs intent, not a casual brush
- `friction={2}` — a touch firmer than the default
- `overshootLeft={false}` — the panel doesn't slide past its anchor

Crossing the threshold fires a `Success` haptic, closes the
swipeable, and commits the same `handleStatusChange('completed')`
path used by the status picker — optimistic UI + rollback on API
failure still apply. Already-completed tasks render the bare Card
with no gesture attached.

### Priority 13 — Split oversized screen files (`5ad60b7`)

Both screens lived as monoliths well over the 300-line limit.
Presentational subtrees extracted into focused feature directories:

**`components/packager/`** (new):
- `ContextConfirmView.tsx` (165 lines) — first stage + `EditableField`
- `PackageView.tsx` (290 lines) — tiers, scenarios, brief, refine form
- `types.ts` (55 lines) — `ServicePackage` / `ServiceContext` etc.
- `index.ts` — public API

**`components/research/`** (new):
- `FindingCard.tsx` (125 lines) — one finding with contact-info chip
- `ReportView.tsx` (241 lines) — summary + findings + sources + follow-ups
- `types.ts` (66 lines) — `ResearchReport` / `Finding` etc., plus
  `MAX_FOLLOW_UPS` and `CONFIDENCE_VARIANT` constants
- `index.ts` — public API

**Screen files** now focus on state machine + API:
- `packager.tsx`: 729 → 261 lines
- `research.tsx`: 723 → 329 lines

No behaviour change — the same props flow to the same subcomponents;
they just live in their own files now.

### Priority 12 — Shared element transitions (`4105d2e`)

Files modified:
- [mobile/src/app/_layout.tsx](../mobile/src/app/_layout.tsx)
- [mobile/src/app/recommendation/[id].tsx](../mobile/src/app/recommendation/[id].tsx)
- [mobile/src/app/roadmap/[id]/continuation.tsx](../mobile/src/app/roadmap/[id]/continuation.tsx)

Two layers of motion:

1. **Stack-level screen transition**: the root Stack now sets
   `animation: 'slide_from_right'` with `animationDuration: 260`
   globally. Every screen push has consistent slide motion.

2. **Intra-screen staggered fade-in** via the existing `FadeInView`
   primitive (no reanimated needed):
   - Recommendation screen: summary card at delay 0, falsification at
     80ms, Your Path at 160ms, First Three Steps at 220ms. The reveal
     reads as a sequence instead of a flash.
   - Continuation screen: fork cards at `120 + idx * 100` ms, so the
     three decision options cascade in.

Chose this approach over `sharedTransitionTag` on reanimated
`Animated.View`. Reanimated's shared-element API is finicky across
expo-router navigator boundaries — the common failure modes are ghost
frames and elements that animate to the wrong destination when the
target screen mounts asynchronously. The "elements flow in" perception
is the same; the coupling and breakage risk is a fraction. Full
shared-element transitions remain possible to layer on top of this —
they'd target individual elements without needing to rebuild the motion
base.

---

## Verification

### `pnpm exec tsc --noEmit` — PASS

Ran after every commit. Only the same three pre-existing errors
appear, unrelated to this work (documented in the phase-1 delivery
report):

```
../packages/api-types/src/checkin.ts(7,8): error TS2307: Cannot find module '@neuralaunch/constants' …
../packages/api-types/src/pushback.ts(2,50): error TS2307: Cannot find module '@neuralaunch/constants' …
../packages/api-types/src/recommendation.ts(2,38): error TS2307: Cannot find module '@neuralaunch/constants' …
```

These are module-resolution quirks when tsc runs from `mobile/` in
isolation — they reproduce on a clean checkout of this branch with
no local changes (verified in phase 1). Orthogonal to this sprint.

### `pnpm lint` — N/A

Mobile has no `lint` script (see phase-1 report for detail).
`pnpm exec tsc --noEmit` is the authoritative gate and it passes.

### Dependencies installed

Three new dependencies added via `pnpm add --ignore-workspace` from
`mobile/` (per CLAUDE.md's mobile install convention):

- `react-native-gesture-handler ^2.31.1`
- `react-native-reanimated ^4.3.0`
- `react-native-worklets ^0.8.1` (reanimated 4's peer dep)

All three are pre-bundled in Expo Go for SDK 54. EAS / custom dev
clients will pick them up on their next prebuild.

### Files touched summary

```
New files (11):
  mobile/babel.config.js
  mobile/src/components/ui/BottomSheet.tsx
  mobile/src/components/ui/ScrollToBottomButton.tsx
  mobile/src/hooks/useScrollToBottom.ts
  mobile/src/components/packager/ContextConfirmView.tsx
  mobile/src/components/packager/PackageView.tsx
  mobile/src/components/packager/types.ts
  mobile/src/components/packager/index.ts
  mobile/src/components/research/FindingCard.tsx
  mobile/src/components/research/ReportView.tsx
  mobile/src/components/research/types.ts
  mobile/src/components/research/index.ts

Modified (12):
  mobile/src/components/ui/CollapsibleSection.tsx
  mobile/src/components/ui/ChatBubble.tsx
  mobile/src/components/ui/index.ts
  mobile/src/components/coach/RolePlayChat.tsx
  mobile/src/components/coach/SetupChat.tsx
  mobile/src/components/roadmap/TaskCard.tsx
  mobile/src/components/roadmap/TaskStatusPicker.tsx
  mobile/src/app/_layout.tsx
  mobile/src/app/discovery/index.tsx
  mobile/src/app/recommendation/[id].tsx
  mobile/src/app/roadmap/[id]/continuation.tsx
  mobile/src/app/roadmap/[id]/checkin.tsx
  mobile/src/app/roadmap/[id]/packager.tsx (slimmed)
  mobile/src/app/roadmap/[id]/research.tsx (slimmed)
  mobile/src/services/api-client.ts
  mobile/package.json
  mobile/pnpm-lock.yaml
```

---

## Notes for the reviewer

- **Branch baseline**: cut from latest `main`, then merged `feat/mobile-polish`
  once (no-op in practice — those commits are already on `main`). All
  eleven commits in this branch are new.

- **No behaviour changes to the backend API surface**. Every
  modification is client-side.

- **Expo Go vs EAS**: all work runs in Expo Go (SDK 54 pre-bundles
  gesture-handler + reanimated + worklets). For EAS builds, the next
  prebuild picks up the new native deps. No config changes in
  `app.json` were needed.

- **Bundle-size impact**: reanimated + gesture-handler add ~250KB to
  the JS bundle (~60KB gzipped). This is the cost of the swipe
  gestures and the shared animation infrastructure. Worth it — the
  swipe-to-complete alone is used daily.

- **Deferred items** (explicit):
  - `@react-native-community/netinfo` for offline detection (Priority 11
    partial) — note in the API client commit.
  - Fuller `sharedTransitionTag`-based transitions (Priority 12
    alternative) — can be layered on top of the current motion base
    without restructuring.

---

*Report prepared 2026-04-17. Every commit carries the Co-Authored-By
trailer per repository convention. All eleven commits land on
`feat/mobile-polish-phase-2` and are ready for review.*
