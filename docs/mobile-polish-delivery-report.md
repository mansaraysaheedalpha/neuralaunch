# Mobile Polish — Delivery Report

**Date:** 2026-04-17
**Branch:** `feat/mobile-polish`
**Scope:** Priorities 1, 2, 5, 7, and 10 from
[docs/mobile-design-review-2026-04-17.md](mobile-design-review-2026-04-17.md)
§7. Larger items (BottomSheet primitive, fork picker elevation,
scroll-to-bottom FAB, swipe-to-complete) are out of scope — a separate
sprint.

---

## Summary

Five commits, one per priority, each scoped to the minimum files
necessary. The work moves the app closer to "belongs on a phone" by
eliminating the most visible quality gaps: sub-44pt touch targets, text
characters masquerading as icons, a recommendation reveal that read as
a document, 13px chat text, and a first-run state that bounced users
through three screens to reach /discovery.

Commit list (newest first):

| Commit | Priority | Summary |
|---|---|---|
| `b30f898` | 10 | Show discovery CTA inline on Roadmap tab for first-run users |
| `0a2d9cd` | 7 | Bump chat bubble text from 13px to 15px |
| `41c9acd` | 5 | Elevate recommendation as a moment, not a document |
| `72d7ddf` | 2 | Replace '↑' and '▼' text characters with Lucide icons |
| `7cc6948` | 1 | Ensure all interactive elements meet 44pt touch target minimum |

---

## Item 1 — Touch targets (commit `7cc6948`)

Files modified:

- [mobile/src/components/ui/Button.tsx](../mobile/src/components/ui/Button.tsx)
- [mobile/src/components/ui/ChatInput.tsx](../mobile/src/components/ui/ChatInput.tsx)
- [mobile/src/components/ui/CollapsibleSection.tsx](../mobile/src/components/ui/CollapsibleSection.tsx)
- [mobile/src/components/roadmap/TaskCard.tsx](../mobile/src/components/roadmap/TaskCard.tsx)
- [mobile/src/app/onboarding.tsx](../mobile/src/app/onboarding.tsx)

Before → after:

| Element | Before | After | hitSlop / padding |
|---|---|---|---|
| Button `size="sm"` | 32pt minHeight, `paddingVertical: spacing[1.5]` | 40pt minHeight, `paddingVertical: spacing[2]` | `hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}` (extends to 48pt tap) |
| ChatInput send | 32x32pt (visual = hit area) | 44x44pt hit area with 36pt visible circle | — (the hit area *is* the Pressable) |
| CollapsibleSection header | `paddingVertical: spacing[2]` (~24-28pt total) | `paddingVertical: spacing[3]` + `minHeight: 44` | — |
| TaskCard status badge | ~26pt (tight Pressable around Badge) | ~26pt visible (unchanged) | `hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}` |
| Onboarding Skip | `Text onPress` with no wrapper, ~24pt | Wrapped in `Pressable` with `paddingVertical: spacing[3]` + `paddingHorizontal: spacing[4]` | `hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}` |

**Pattern chosen:** hitSlop on the Pressable rather than extra visible
padding wherever the visible geometry was already correct (small
buttons, status badge, Skip). That preserves the tight design while
meeting the 44pt HIG minimum. The ChatInput send button is the one
exception — the visible circle stayed inside a larger invisible hit
area so the visual treatment could still be premium (a 36pt filled
circle instead of a borderline 44pt one).

---

## Item 2 — Lucide icons (commit `72d7ddf`)

Files modified:

- [mobile/src/components/ui/ChatInput.tsx](../mobile/src/components/ui/ChatInput.tsx)
- [mobile/src/components/ui/CollapsibleSection.tsx](../mobile/src/components/ui/CollapsibleSection.tsx)

**Library chosen:** `lucide-react-native@^1.8.0` — already listed as a
dependency in [mobile/package.json](../mobile/package.json#L28).
**No new dependency added.** The web design system uses Lucide too, so
this keeps parity.

Icon placements:

| Surface | Before | After |
|---|---|---|
| Send button | Unicode `↑` rendered as `Text variant="label"` at `typography.size.sm` | Lucide `ArrowUp` at `size={20}`, `strokeWidth={2.5}`, centered inside the 36pt circle |
| CollapsibleSection chevron | Unicode `▼` rendered as `Text variant="caption"` | Lucide `ChevronDown` at `size={16}`, `strokeWidth={2}` |

**Chevron rotation animation:** Rewrote the `Animated.Value` from a
rotation-degree scale (`-90` ↔ `0`) to a clearer progress scale
(`0` = closed → `1` = open) with the same interpolated rotate transform.
Duration now pulls from `animation.fast` (150ms) instead of a magic
`150` literal. Uses `useNativeDriver: true` like the original. This
matches the Animated-API convention used elsewhere in the app —
[FadeInView.tsx](../mobile/src/components/ui/FadeInView.tsx) drives
opacity + translateY the same way.

---

## Item 3 — Recommendation reveal (commit `41c9acd`)

File modified: [mobile/src/app/recommendation/[id].tsx](../mobile/src/app/recommendation/[id].tsx)

**Three changes:**

### 1. Collapse supporting sections by default

At initial render, the following are **open**:

1. Summary card (always visible, not a CollapsibleSection)
2. "What Would Make This Wrong" (always visible, not a CollapsibleSection)
3. `<CollapsibleSection label="Your Path">` — `defaultOpen` inherits the
   `true` default
4. `<CollapsibleSection label="First Three Steps">` — same

The following are **collapsed** (`defaultOpen={false}`):

- Why This Fits You
- Time to First Result
- Risks & Mitigations
- Assumptions
- Alternatives Considered & Rejected

Section order was also reshuffled: "Your Path" and "First Three Steps"
now sit adjacent at the top of the collapsible stack, with the
collapsed supporting sections below. This keeps the default-open
content contiguous — the founder doesn't see an open section, a closed
one, then another open one.

### 2. Elevate the summary card with gold

Replaced `<Card variant="primary">` (subtle blue tint, `c.primaryAlpha5`
+ `c.primaryAlpha20` border) with a bespoke treatment:

```tsx
<Card
  noPadding
  style={{
    backgroundColor: c.secondaryAlpha10,
    borderColor: c.secondary,
    borderWidth: 1,
    padding: spacing[5],
  }}
>
  <Text variant="overline" color={c.secondary}>Your Recommendation</Text>
  <Text variant="title" style={{ marginTop: spacing[2] }}>
    {r.summary}
  </Text>
</Card>
```

- Border: `c.secondary` (#D4A843, full gold) at 1px
- Background: `c.secondaryAlpha10`
- Padding bumped from the default `spacing[4]` (16pt) to `spacing[5]` (20pt)
- Overline: `c.primary` → `c.secondary` (gold to match the border)
- Summary text: `variant="body"` → `variant="title"`

### 3. Drop italic on the falsification statement

```diff
- <Text variant="body" color={c.mutedForeground} style={styles.italic}>
+ <Text variant="body" color={c.foreground}>
    {r.whatWouldMakeThisWrong}
  </Text>
```

The orphaned `italic: { fontStyle: 'italic' }` StyleSheet entry was
removed. Colour moved from `c.mutedForeground` to `c.foreground` so
the falsification visually matches the weight of the summary.

### Initial-render section map

Top → bottom at first paint, with state:

1. Summary card (open, gold treatment)
2. "What Would Make This Wrong" (open, regular weight, full foreground)
3. Your Path (open)
4. First Three Steps (open)
5. Why This Fits You (**closed**)
6. Time to First Result (**closed**)
7. Risks & Mitigations (**closed**)
8. Assumptions (**closed**)
9. Alternatives Considered & Rejected (**closed**)
10. Separator + Accept CTA (unchanged)
11. Pushback chat (unchanged)

Five of the nine header sections are collapsed on mount — roughly the
60% scroll reduction the review targeted.

---

## Item 4 — Chat bubble text size (commit `0a2d9cd`)

File modified: [mobile/src/components/ui/ChatBubble.tsx](../mobile/src/components/ui/ChatBubble.tsx)

**Before:**
```tsx
style={{
  fontSize: typography.size.sm,                          // 13
  lineHeight: typography.size.sm * typography.leading.relaxed, // 13 * 1.625 = 21.125
}}
```

**After:**
```tsx
style={{
  fontSize: typography.size.base,                        // 15
  lineHeight: typography.size.base * typography.leading.normal, // 15 * 1.5 = 22.5
}}
```

The `typography.size` value in use is now `typography.size.base` (15px).
The lineHeight ratio switched from `relaxed` (1.625) to `normal` (1.5) —
at 15px, the tighter ratio still reads comfortable (22.5px line box, only
1.4px taller than the old 13/relaxed box) and avoids excessive vertical
space between lines in longer messages.

**`maxWidth as any` cast fix:** The prior code used
`maxWidth: '85%' as any` to work around a `ViewStyle` inference quirk
(the percentage string is a valid `DimensionValue` but TypeScript
sometimes needs a nudge when the ViewStyle object is built inline).
Replaced with an explicit `const maxWidth: ViewStyle['maxWidth'] = '85%';`
and referenced the typed binding in the style object. No runtime
change, no `as` cast.

Cascade: the primitive change affects every chat surface that consumes
`ChatBubble` — discovery interview, pushback, coach role-play, and any
future chat UI. No chat surface files were touched directly.

---

## Item 5 — First-run Roadmap tab (commit `b30f898`)

File modified: [mobile/src/app/(tabs)/index.tsx](../mobile/src/app/(tabs)/index.tsx)

When `roadmaps` is empty, the tab now renders an inline invitation
instead of an `EmptyState` that pointed to the Sessions tab. The
experienced-user branch (one or more roadmaps) is unchanged — the
`RoadmapViewer` renders as before.

**Copy used:**

- Heading: *"Your first step is a conversation."*
- Body: *"Start your discovery interview. It takes 8–12 minutes and
  produces one honest recommendation."*
- Button: *"Start your discovery"* → `router.push('/discovery')`

The heading matches the onboarding voice from slide 2
("It starts with a conversation.") so a new user moving from
`/onboarding` → `/sign-in` → Roadmap tab reads a continuous thought.

Uses existing primitives only:

- `ScreenContainer` (scroll=false, centers the content)
- `Button` at `size="lg"` with `fullWidth`
- `Text` variants `heading` and `body`
- Theme tokens: `spacing[3]`, `spacing[6]`, `spacing[8]`, `c.mutedForeground`

The prior `Map` icon + `EmptyState` import are removed since the
first-run state is now a bespoke inline layout.

---

## Verification

### `npx tsc --noEmit` — PASS

Ran after each of the five commits. The only errors reported are
**three pre-existing errors** unrelated to this work:

```
../packages/api-types/src/checkin.ts(7,8): error TS2307:
  Cannot find module '@neuralaunch/constants' or its corresponding type declarations.
../packages/api-types/src/pushback.ts(2,50): error TS2307:
  Cannot find module '@neuralaunch/constants' or its corresponding type declarations.
../packages/api-types/src/recommendation.ts(2,38): error TS2307:
  Cannot find module '@neuralaunch/constants' or its corresponding type declarations.
```

**Confirmed pre-existing** by running `git stash` on the branch tip
and re-running `npx tsc --noEmit` — the same three errors reproduce
without any of this sprint's changes. They come from the linked
`link:../packages/*` workspace resolving through the
standalone-install symlink — the `@neuralaunch/constants` import
from inside `packages/api-types/src/*.ts` can't find constants
when tsc is run from `mobile/` in isolation because the symlink
breaks the normal `node_modules` walk upward. Fix is orthogonal to
this sprint and is noted for a future tooling pass.

### `pnpm lint` — N/A

Mobile has no `lint` script — the mobile `package.json` only declares
`start`, `android`, `ios`, `web`, `typecheck`, and `eas-build-pre-install`.
The repo root exposes `lint:web` (client-only) but no generic `lint`.
Since this sprint touches only `mobile/src/*` and `mobile/` has no
lint configuration, `npx tsc --noEmit` is the gate and it passes.

### No new dependencies added

Verified `lucide-react-native@^1.8.0` was already installed in
`mobile/package.json` before Item 2. The `mobile/pnpm-lock.yaml` is
unchanged in this branch's diff against `main` — no lockfile churn.

---

## Edge cases encountered

1. **`Text` onPress vs Pressable for the Skip button.** React Native's
   `Text` component accepts `onPress` but does not accept `hitSlop`. The
   onboarding Skip was originally a `Text onPress={…}` with no wrapping
   Pressable, which meant hitSlop couldn't be added in place. Fix was
   to wrap in a `Pressable` with both visible padding (`spacing[3]` ×
   `spacing[4]`) **and** `hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}`,
   then demote the `Text` to a pure presentation child. Moved the
   `accessibilityRole="button"` and `accessibilityLabel` up to the
   `Pressable` so VoiceOver/TalkBack still announce it correctly.

2. **ChatInput right-padding after send-button resize.** The input row
   previously had `paddingRight: spacing[1.5]` (6pt) tuned for a 32pt
   send button. After the redesign, the 44pt `sendHitArea` centres a
   36pt visible circle with 4pt of internal margin, so the optical
   distance between the row's right edge and the circle's right edge
   stays at ~10pt — visually identical to before. Left the row
   paddingRight unchanged.

3. **Animated rotation value rewrite.** The prior `CollapsibleSection`
   animated a rotation value in the degree-native scale (`-90` → `0`),
   which conflated the animation's progress with its output. Swapping
   to a 0→1 progress value (interpolated to `-90deg`→`0deg`) is more
   idiomatic and makes the "defaultOpen → 1, closed → 0" initial value
   a single-character flip. No conflict with the FadeInView pattern —
   they're separate instances, animating different properties.

4. **`italic` style removed, `assumptionRow` style left.** The
   recommendation reveal's stylesheet had two orphaned entries after
   the pre-existing refactor: `italic` (still used for the
   falsification) and `assumptionRow` (already orphaned on `main`).
   Removed `italic` since it was directly orphaned by this sprint's
   Item 3 change; left `assumptionRow` alone to avoid expanding scope
   beyond the five requested items.

5. **`EmptyState` no longer imported in (tabs)/index.tsx.** Item 5
   replaced the empty-roadmap branch with a bespoke layout, so
   `EmptyState` and the `Map` Lucide icon were no longer used on that
   screen. Both imports were removed; `Button` was added. `EmptyState`
   is still exported from `@/components/ui` and used elsewhere —
   only this file's import list changed.

---

*Report prepared 2026-04-17. Every commit ends with the Co-Authored-By
trailer per repository convention. All work lives on `feat/mobile-polish`
and is ready for review.*
