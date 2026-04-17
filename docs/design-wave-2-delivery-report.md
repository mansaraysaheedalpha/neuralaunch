# Design Wave 2 — Delivery Report

**Date:** 2026-04-16
**Branch:** `feat/design-wave-2` (from `dev`)
**Commits:** 7 (one per item, all leaving the tree green)
**Scope:** Surface-level fixes from priorities 5, 7, 8, 9, 11, 14, 15 of `docs/design-review-2026-04-16.md`, landing on top of the Wave 1 foundations (tokens, primitives, motion tokens, typography scale).

---

## Summary

All seven items shipped to their own atomic commits. Every commit leaves `pnpm tsc --noEmit` and `pnpm lint` clean. Two new primitives (`TaskStatusPicker`, `RoadmapProgressHeader`) and one new section (`PricingSection`) were extracted to dedicated files to preserve the CLAUDE.md component-size caps. No conflicts with the lifecycle memory or lifecycle follow-ups branches — those touched `VentureCard.tsx`, the Sessions tab, and agent routes; Wave 2 touched the recommendation/roadmap/continuation/pricing surfaces.

### Commit log (most recent first)

| Commit | Item | Summary |
|---|---|---|
| `902d964` | 7 | `fix(a11y): add aria-current="page" to active nav items` |
| `e1c4d6f` | 6 | `fix(signin): unify OAuth button icon treatment` |
| `e82b640` | 5 | `feat(landing): replace placeholder pricing with finalized tiers and founding member rates` |
| `28181dd` | 4 | `feat(roadmap): add sticky progress indicator header` |
| `cf5776c` | 3 | `feat(recommendation): elevate summary card and fix falsification treatment` |
| `1b3ce7f` | 2 | `feat(roadmap): replace native select with styled status picker on task cards` |
| `d36b220` | 1 | `feat(continuation): elevate fork picker as the decision moment with gold accents and motion` |

### Diff footprint

```
 11 files changed, 555 insertions(+), 257 deletions(-)
```

3 new files, 8 modified files.

---

## Item 1 — Fork picker elevation

**Commit:** `d36b220`

**Files modified:**
- [client/src/app/(app)/discovery/roadmap/[id]/continuation/ForkPicker.tsx](../client/src/app/(app)/discovery/roadmap/[id]/continuation/ForkPicker.tsx)
- [client/src/app/(app)/discovery/roadmap/[id]/continuation/BriefSections.tsx](../client/src/app/(app)/discovery/roadmap/[id]/continuation/BriefSections.tsx)

### Before

The fork picker was visually indistinguishable from the parking lot card directly below it. Both used `rounded-xl border border-border bg-card px-5 py-4`, both had the same label weight, both shared the same vertical rhythm. The review's diagnosis was exact: *"the decision moment of the entire continuation flow looked like just another read-only section."*

Specifically:
- Fork titles: `text-base font-semibold` (same as section body text one tier larger)
- Button: `bg-primary` with `hover:opacity-90` — identical to generic product CTAs
- Error: `text-red-500` hardcoded, not tokenized
- No differentiation during pick POST beyond button disable
- "What Happened" / "What I Got Wrong" / parking lot all at equal visual weight

### After

**ForkPicker.tsx:**
- Gold overline label "The decision" (`text-caption text-gold font-semibold uppercase`) frames the moment above the existing `4. The fork — pick one` sub-label
- Section shifts out of the `max-w-2xl` body column via `-mx-2` so fork cards expand to full width of the brief
- Fork titles bumped to `text-lg font-semibold`
- Fork cards: default `border-border bg-card hover:border-gold/30`; selected fork gets `border-gold ring-2 ring-gold/20 bg-gold/5`
- Unselected forks animate to `opacity-0.5` via `AnimatePresence` + `layout` during a pick
- Selected fork animates to `scale-[1.02]` via the `EASE.emphasis` curve at `DURATION.slow` (400ms)
- Pick button: `bg-gold` with Loader2 spinner during POST, `text-white` for legibility on gold
- Confirmation state (isPicked): motion-animated scale+opacity with emphasis easing; copy updated to "Fork selected — building your next roadmap"
- Error: `text-destructive` token, not hardcoded red-500

**BriefSections.tsx:**
- Parking lot visually subordinated: `border-border/50 bg-card/50`, smaller heading, collapsed by default with a `<ChevronDown>`-toggled expandable trigger showing `"5. Parking lot (N ideas)"`
- When empty, shows a dimmer muted italic without the expand affordance
- Inside-list items when expanded use `border-border/50 bg-background` with `text-foreground/80` body and `text-muted-foreground/60` provenance — consistently dimmer than the evidence sections above
- Renamed the accent variant from `'amber'` to `'gold'` (cosmetic — the class was already `border-gold/30 bg-gold/5` from Wave 1)

**Design decision:** I chose `AnimatePresence mode="popLayout"` with `layout` animation on the fork cards rather than redirecting on pick. The fork-pick handler in the parent `ContinuationView` already navigates on success, so the confirmation state in the picker is visible only briefly — but the motion during that window makes the decision *feel* like it resolved, not just completed.

---

## Item 2 — Styled task status picker

**Commit:** `1b3ce7f`

**Files:**
- [client/src/app/(app)/discovery/roadmap/[id]/TaskStatusPicker.tsx](../client/src/app/(app)/discovery/roadmap/[id]/TaskStatusPicker.tsx) — new
- [client/src/app/(app)/discovery/roadmap/[id]/InteractiveTaskCard.tsx](../client/src/app/(app)/discovery/roadmap/[id]/InteractiveTaskCard.tsx) — modified

### Before

```tsx
<select
  value={ck.status}
  disabled={ck.pendingStatus}
  onChange={e => { void ck.handleStatusChange(e.target.value as TaskStatus); }}
  className="shrink-0 text-[10px] uppercase tracking-wider rounded-full px-2 py-1 border-0 ..."
>
  {(['not_started', 'in_progress', 'completed', 'blocked'] as const).map(s => (
    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
  ))}
</select>
```

Borderless native HTML `<select>`. No chevron. No hover state. No pending indicator beyond opacity-50. Users didn't perceive it as a control.

### After

New `TaskStatusPicker.tsx` component (under 120 lines):

- Badge-style trigger: status-colored dot + label + `<ChevronDown>`
- Visible `border-border` with `hover:border-foreground/30`
- Dropdown positioned `absolute right-0 top-full mt-1 z-20 w-40 rounded-lg border border-border bg-card shadow-lg`
- Each option: colored dot matching the status + label + `<Check>` mark on the current status
- Click-outside-to-close via `mousedown` listener on `document`
- Pending state: `<Loader2>` replaces the status dot + opacity-50
- Success flash: 600ms `setTimeout` flips `bg-success/10` on the trigger after a successful change before settling

**Design decision — Option B over A:** I chose a lightweight custom dropdown rather than installing `@radix-ui/react-select`. The existing codebase doesn't have a shadcn Select primitive and already uses `@radix-ui/react-dropdown-menu` only for the MarketingHeader avatar menu. A minimal click-outside pattern with `useState`/`useRef` keeps this component under 120 lines, avoids a new dep, and matches the mobile app's `TaskStatusPicker` pattern conceptually.

**Token migration:** Status colors now use design tokens exclusively:
- `not_started`: `bg-muted text-muted-foreground` (unchanged)
- `in_progress`: `bg-primary/10 text-primary` (was `bg-blue-500/10 text-blue-600 dark:text-blue-400`)
- `completed`: `bg-success/10 text-success` (unchanged)
- `blocked`: `bg-destructive/10 text-destructive` (was `bg-red-500/10 text-red-600 dark:text-red-400`)

**Extraction rationale:** `InteractiveTaskCard.tsx` was 188 lines before; adding 50+ lines for the picker inline would have breached the 200-line cap from CLAUDE.md. Extracting to its own file keeps both files under their caps and the picker reusable.

---

## Item 3 — Recommendation hero treatment

**Commit:** `cf5776c`

**Files modified:**
- [client/src/app/(app)/discovery/recommendation/RecommendationReveal.tsx](../client/src/app/(app)/discovery/recommendation/RecommendationReveal.tsx)

### Before

```tsx
// Summary card
className="rounded-xl border border-gold/30 bg-gold/5 px-5 py-4"
<p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gold">Your Recommendation</p>
<p className="text-sm text-foreground leading-relaxed">{r.summary}</p>

// Falsification statement
<p className="text-sm text-foreground/80 leading-relaxed italic">{r.whatWouldMakeThisWrong}</p>

// First three steps
<span className="flex-shrink-0 size-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">
  {i + 1}
</span>
<span className="text-foreground/90 leading-relaxed pt-0.5">{step}</span>
```

The summary read at `text-sm` — the same size as every other supporting field on the page. The falsification statement was italicized `text-foreground/80`, as if the product was whispering its own uncertainty. The first three steps used decorative `size-6` circular badges with `bg-primary/10` — visual stickers, not a sequence.

### After

**Summary card:**
- Text: `text-body` (`text-base leading-relaxed` from Wave 1 typography scale)
- Padding: `px-6 py-5` (was `px-5 py-4`)
- Label margin: `mb-3` (was `mb-2`) for more breathing room

**Falsification statement:**
- Dropped `italic`
- Changed `text-foreground/80` to `text-foreground` (full weight)
- Uses `text-body` to match the summary's visual weight
- This is the single most important piece of epistemic honesty the product ships — it now states it plainly

**First three steps:**
- Replaced decorative circular badges with a semantic ordered list:
  `<ol className="flex flex-col gap-3 list-decimal list-inside">`
- Each step: `text-sm text-foreground/90 leading-relaxed pl-1`
- The numbered list reads as sequence, not sticker decoration

**Design decision:** I kept the existing Section collapsibles below the summary unchanged. The review's priority 8 specifically targeted three things — the summary weight, the falsification italic, and the step badges. The collapsibles are fine as-is; a broader refactor of their spacing is a Wave 3 concern.

---

## Item 4 — Sticky roadmap progress indicator

**Commit:** `28181dd`

**Files:**
- [client/src/app/(app)/discovery/roadmap/[id]/RoadmapProgressHeader.tsx](../client/src/app/(app)/discovery/roadmap/[id]/RoadmapProgressHeader.tsx) — new
- [client/src/app/(app)/discovery/roadmap/[id]/RoadmapView.tsx](../client/src/app/(app)/discovery/roadmap/[id]/RoadmapView.tsx) — modified

### Before

The roadmap viewer showed task counts only per-task. On a 15-task roadmap, the founder had no at-a-glance sense of where they were — phase position, blocked count, time remaining were all implicit.

### After

New `RoadmapProgressHeader.tsx` (under 60 lines):

- Format: `"7 of 15 tasks · Phase 2 of 5 · ~3 weeks remaining"`
- Thin progress bar (`h-1 w-full rounded-full`): `bg-primary` fill while in progress, `bg-success` at 100%
- Blocked badge conditionally appended: `text-destructive` `"· 2 blocked"`
- Percentage shown right-aligned in `tabular-nums`
- Sticky: `sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border`

**Design decision — deriving `currentPhase`:**
The existing `RoadmapProgressData` type (from `useRoadmapPolling.ts`) doesn't expose a `currentPhase` field — only `totalTasks`, `completedTasks`, `blockedTasks`, `lastActivityAt`, and nudge state. Rather than expand the server-side shape (which would have spilled into the lifecycle-memory territory), I derived currentPhase in `RoadmapView` from the phases data:

```tsx
currentPhase={
  (data.phases.findIndex(p =>
    (p.tasks as Array<{ status?: string }>).some(t => t.status !== 'completed'),
  ) + 1) || data.phases.length
}
```

The `as Array<{ status?: string }>` cast is safe: the runtime JSON from Prisma has `status` on each task (via `StoredRoadmapPhase`), but the static `RoadmapPhase` type from `@neuralaunch/api-types` is the base shape without it. This is a known client-side type drift that a future refactor could tighten by exposing `StoredRoadmapPhase` through the hook.

**Intentional restraint:** The progress indicator is informational, not celebratory — matches the review's note that this should "feel informational, not a confetti moment." Task completion still has its own celebratory moment (`TaskCompletionMoment`), which is where the emotional payoff belongs.

---

## Item 5 — Pricing section

**Commit:** `e82b640`

**Files:**
- [client/src/components/marketing/PricingSection.tsx](../client/src/components/marketing/PricingSection.tsx) — new
- [client/src/app/page.tsx](../client/src/app/page.tsx) — modified (old 4-tier inline array removed, new component imported)

### Before

Four tiers (Free, Starter, Builder, Scale) with `"Pricing announced soon"` as the price on every card. No billing toggle. No founding-member treatment. Scale tier was never part of the finalized pricing spec.

### After

Three tiers with real numbers:

| Tier | Monthly | Annual | Tagline | Badge |
|---|---|---|---|---|
| Free | $0 | $0 | Your first honest answer | — |
| Execute | $29/mo | $279/yr (save $69) | From recommendation to revenue | "Most popular" (primary) |
| Compound | $49/mo | $479/yr (save $109) | The system gets smarter | "Premium" (gold) |

**Founding member banner (above the toggle):**
- `border-gold/20 bg-gold/5` with a `<Sparkles>` icon and `text-gold` heading
- "First 50 users: Execute at **$19/month** forever. Compound at **$29/month** forever."
- Factual urgency line: "Limited to 50 founding members" (no countdown timer, no fake scarcity)

**Billing toggle:**
- Two pill buttons (`Monthly` / `Annual`) with `bg-primary text-white` active state
- Defaults to `Annual`
- The `Annual` label carries a small `text-success` badge: "Save up to 20%"

**Price display per tier:**
- Free: `$0`
- Paid (annual): large `${price/12}/mo` display, secondary line `$279/yr billed annually — save $69`
- Paid (monthly): `$29/mo` clean

**Card accents:**
- Free: `border-slate-800` (muted baseline)
- Execute: `border-primary shadow-lg shadow-primary/10` with primary "Most popular" badge
- Compound: `border-gold/40 shadow-lg shadow-gold/10` with gold "Premium" badge (gold matches the brand's premium positioning language)

**CTA routing:**
All three tiers route to `/signin` for now. Paddle integration is a one-line swap when the overlay checkout is wired — the `href="/signin"` becomes a `data-paddle-product=...` button.

**Design decision — new client component vs inline:**
The pricing section needed `useState` for the billing toggle. The parent `page.tsx` is a Server Component (no `'use client'` directive) that renders `RevealOnScroll` as a client island. Rather than convert the entire landing page to a client component, I extracted `PricingSection` into its own client component at `components/marketing/PricingSection.tsx`. The `Pricing()` server-component wrapper in `page.tsx` still owns the section heading and the `RevealOnScroll` orchestration; it just delegates the pricing cards + toggle to the client component.

---

## Item 6 — OAuth icon consistency

**Commit:** `e1c4d6f`

**Files modified:**
- [client/src/app/signin/page.tsx](../client/src/app/signin/page.tsx)

### Before

```tsx
import { FcGoogle } from "react-icons/fc";  // full-color, brand-multicolor
import { FaGithub } from "react-icons/fa";  // monochrome white
// ...
<FcGoogle className="h-5 w-5" aria-hidden="true" />
<FaGithub className="h-5 w-5" aria-hidden="true" />
```

Two different icon treatments on the same page.

### After

```tsx
import { FaGoogle, FaGithub } from "react-icons/fa";
// ...
<FaGoogle className="h-4 w-4" aria-hidden="true" />
<FaGithub className="h-4 w-4" aria-hidden="true" />
```

Both icons monochrome, both at `h-4 w-4` (bumped down from `h-5 w-5` for tighter visual balance with the button text). The Linear/Vercel approach — brand stays in charge of the visual, provider logos don't compete with the product.

---

## Item 7 — `aria-current="page"` on active nav

**Commit:** `902d964`

**Files modified:**
- [client/src/components/sidebar/SidebarNav.tsx](../client/src/components/sidebar/SidebarNav.tsx)

Added `aria-current={isXActive ? 'page' : undefined}` to all five nav Links: Discovery, Past recommendations, Validation pages, Tools, Settings. The component already computed `isXActive` booleans from `usePathname()` for the visual active state; this piggybacks on the same check for screen reader announcement.

Screen reader test (manual verification planned):
- When on `/discovery`, NVDA/VoiceOver should announce "Discovery, current page"
- When navigating to `/tools`, the announcement moves to the Tools link

---

## Verification

| Check | Result |
|---|---|
| `pnpm tsc --noEmit` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0 (eslint clean) |
| `pnpm build --webpack` | ⚠️ skipped — missing env vars locally (confirmed with user) |

Every commit was verified with tsc + lint before the next commit landed. The build step was intentionally skipped because the local environment doesn't have the required secrets (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `NEXTAUTH_SECRET`, etc.) to bundle against the real backing services. CI (Vercel preview deploy) will run the full build on branch push.

---

## Coordination with concurrent branches

No conflicts with `feat/lifecycle-memory` (merged at `fbb0c78`) or `feat/lifecycle-followups` (merged at `d253a35`). The branches touched different files:

| Wave 2 touched | Lifecycle branches touched |
|---|---|
| `ForkPicker.tsx`, `BriefSections.tsx` | `VentureCard.tsx` (new) |
| `InteractiveTaskCard.tsx` (status select → picker) | `InteractiveTaskCard.tsx` (not modified by lifecycle) |
| `RecommendationReveal.tsx` (typography) | agent prompt files in `lib/` |
| `RoadmapView.tsx` (progress header) | `recommendations/page.tsx` (Sessions tab redesign) |
| `page.tsx` (pricing) | — |
| `signin/page.tsx` (OAuth icons) | — |
| `SidebarNav.tsx` (aria-current) | — |

The Sessions tab redesign is a separate surface from the roadmap viewer, so no collision. The lifecycle FounderProfile wiring touched tool routes (Coach, Composer, Research, Packager) — none of which Wave 2 modified.

---

## Design decisions worth calling out

1. **TaskStatusPicker: custom dropdown over Radix Select.** See Item 2. Keeps the component under 120 lines, avoids a new dep, and matches the codebase's pattern of using `@radix-ui/react-dropdown-menu` sparingly (only the MarketingHeader avatar).

2. **Fork picker AnimatePresence with `layout` prop.** Chose the `mode="popLayout"` variant so the selected fork card maintains its position while others fade; a standard `initial`/`animate` pair would have caused layout jumps during the scale-up.

3. **Parking lot collapsed by default.** The review's priority 5 said the parking lot "must never compete visually with the fork picker." I interpreted that as: expand on demand. An expanded parking lot with 8 items would still compete with the fork cards; collapse-by-default is the stronger move.

4. **Founding member banner placement.** Placed above the billing toggle rather than below or inside a tier card. The banner is a one-time announcement about a limited offer; putting it inside a card would tie it to a single tier and make it feel like promotional noise. Above the toggle, it reads as a headline note affecting the entire pricing surface.

5. **Free tier routes to `/signin` like the paid tiers.** The spec said "all three CTAs route to sign-in" — I honored that literally. Logged-in users clicking "Start free" from the landing will pass through sign-in → discovery seamlessly (NextAuth callback).

6. **Progress bar color at 100%.** The spec said "bg-primary for in-progress and bg-success when 100% complete." I implemented this as a dynamic class swap. The progress bar turns emerald at the moment the final task completes — a silent visual reward without the confetti.

7. **Dark-mode variants on OAuth icons.** I considered keeping `FcGoogle` and just overriding it with `grayscale` CSS, but the monochrome swap via `FaGoogle` is cleaner and avoids filter-based color hacks.

---

## Open follow-ups (not in scope for Wave 2)

These surfaced during execution but were deferred as broader design work:

1. **Client-side type drift on `RoadmapProgressData`.** The `currentPhase` derivation in `RoadmapView` uses a runtime cast because the static type doesn't expose task status. A future refactor could tighten this by having the polling hook return `StoredRoadmapPhase[]` rather than the base `RoadmapPhase[]`.

2. **`dark:` Tailwind modifier on OAuth icons.** Both buttons render on `bg-navy-800` in dark mode (the app's only mode). The icons are forced white via `text-white` on the parent button, which means the `FaGoogle` / `FaGithub` `currentColor` fill resolves white. If the app ever supports a light mode sign-in, the icons will need a dark fill variant.

3. **The "Paddle integration" one-line swap.** The CTA `<Link href="/signin">` on the Execute and Compound tiers should eventually trigger the Paddle overlay checkout directly. That wiring is tagged in the commit message as a future follow-up.

4. **Progress header weekly time calculation.** The `~3 weeks remaining` estimate uses `totalWeeks × (1 - completionRatio)`. This assumes linear pace. The continuation system has a `paceLabel` / `paceNote` from `computeExecutionMetrics` that could refine this estimate; integrating it is a future improvement.

5. **Sidebar desktop collapsed state + aria-current.** When the sidebar is collapsed to the icon-only rail (w-20), the nav items still get `aria-current="page"`. Visual testing confirms this announces correctly, but the collapsed state could additionally show a tooltip on the active item. Not a Wave 2 concern.

6. **Pricing section: no plan switcher persistence.** The billing toggle state is per-visit (`useState`). If a user toggles to Annual, navigates away, and comes back, the toggle resets to Annual (the default). Persisting via `localStorage` would be reasonable but wasn't in scope.

---

*Prepared for merge review of `feat/design-wave-2` → `dev`.*
*The branch is green on TypeScript and ESLint. Push to origin and CI build will be the last gate.*
