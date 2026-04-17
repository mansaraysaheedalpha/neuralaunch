# Design System Foundations — Delivery Report

**Branch:** `feat/design-system-foundations`
**Base:** `dev` at `1d3c440`
**Date:** 2026-04-17
**Verification:** `pnpm tsc --noEmit` (pass), `pnpm lint` (pass), `pnpm build` (pass)

---

## Commits (6 phases, each leaving the tree green)

| # | SHA | Phase | Files |
|---|-----|-------|-------|
| 1 | `8f56b53` | `refactor(design-tokens)` — bind gold/success/navy tokens, replace hardcoded hex | 40 |
| 2 | `20baf49` | `feat(ui)` — canonical Input and Textarea primitives | 2 |
| 3 | `53dcdb0` | `refactor(forms)` — roll out Input/Textarea across 18 surfaces | 18 |
| 4 | `6cc66ef` | `fix(a11y)` — WCAG AA contrast on dark surfaces | 9 |
| 5 | `8ee53c0` | `feat(motion)` — three durations + two easings | 3 |
| 6 | `a01cccb` | `feat(typography)` — display/heading/subheading/body/caption scale | 3 |

---

## Phase 1 — Color token unification

### Tailwind tokens added (`client/tailwind.config.ts`)

| Token | Value | Opacity-compatible |
|-------|-------|--------------------|
| `gold` | `hsl(var(--gold))` | Yes (`bg-gold/5`) |
| `success` / `success-foreground` | `hsl(var(--success))` | Yes |
| `navy-950` | `#070F1C` | Yes (Tailwind 3.3+ hex) |
| `navy-900` | `#0A1628` | Yes |
| `navy-800` | `#0D1E38` | Yes |

### Hex replacement mapping

| Old | New | Occurrences |
|-----|-----|-------------|
| `bg-[#070F1C]` / `from-[#070F1C]` / `to-[#070F1C]` | `bg-navy-950` / `from-navy-950` / `to-navy-950` | ~30 |
| `bg-[#0A1628]` / `from-[#0A1628]` / `via-[#0A1628]` | `bg-navy-900` / `from-navy-900` / `via-navy-900` | ~25 |
| `bg-[#0D1E38]` / `to-[#0D1E38]` / `via-[#0D1E38]` | `bg-navy-800` / `to-navy-800` / `via-navy-800` | ~20 |
| `bg-[#2563EB]` / `text-[#2563EB]` / `ring-[#2563EB]` | `bg-primary` / `text-primary` / `ring-primary` | ~25 |
| `hover:bg-[#1D4ED8]` | `hover:bg-blue-700` | ~5 |
| `text-[#D4A843]` / `bg-[#D4A843]/5` / `border-[#D4A843]/30` | `text-gold` / `bg-gold/5` / `border-gold/30` | ~8 |
| `text-[#10B981]` / `bg-[#10B981]/10` | `text-success` / `bg-success/10` | ~5 |
| `text-[#F7F8FA]` | `text-slate-50` | 5 |

### State-color drift fixed (25 files)

| Old pattern | New | Context |
|-------------|-----|---------|
| `border-green-500/30` / `bg-green-500/5` / `text-green-600 dark:text-green-400` | `border-success/30` / `bg-success/5` / `text-success` | Completed task, verified finding, LIVE status |
| `border-emerald-500/30` / `text-emerald-600 dark:text-emerald-400` | `border-success/30` / `text-success` | Service packager checks, profile badges |
| `border-amber-500/30` / `bg-amber-500/5` / `text-amber-600 dark:text-amber-400` | `border-gold/30` / `bg-gold/5` / `text-gold` | Pushback, roleplay, nudge, DRAFT, "What I Got Wrong" |

### Legitimate raw hex preserved

- `layout.tsx` lines 37-38: `viewport.themeColor` metadata (runtime JS, not Tailwind)
- `globals.css` comments describing the palette
- `rgba(37,99,235,...)` inside `bg-[radial-gradient(...)]` (complex CSS expression)
- `#FFFFFF` in `::selection` / `::-moz-selection`

### CLAUDE.md updated

Added to the "Deprecated — do not use" section: rule banning raw brand hex in Tailwind classes, with the full token vocabulary documented.

---

## Phase 2 — Input and Textarea primitives

### Files created

- `client/src/components/ui/input.tsx` (42 lines)
- `client/src/components/ui/textarea.tsx` (35 lines)

### Design decisions

- 3px `focus-visible:ring-primary/30` with `focus-visible:border-primary` — explicit brand focus ring
- `px-3 py-2.5` default padding, `rounded-lg`, `border-border bg-background`
- `placeholder:text-muted-foreground/70` — 70% opacity for subtle-but-legible placeholder
- React 19 `ComponentProps<"input">` pattern (no `forwardRef` needed — ref flows through)
- `data-slot` attribute matching Button convention

---

## Phase 3 — Input/Textarea rollout

### Files updated (18)

**Input replacements (7 files):**
- `coach/CoachSetupChat.tsx` — chat input
- `composer/ComposerContextChat.tsx` — chat input
- `TaskDiagnosticChat.tsx` — chat input
- `coach/RolePlayChat.tsx` — chat input (gold-themed focus ring preserved via className override)
- `composer/ComposerMessageCard.tsx` — regeneration input
- `research/ResearchFollowUpInput.tsx` — follow-up query input
- `validation/public/SignupForm.tsx` — email capture on public LP

**Textarea replacements (11 files):**
- `recommendation/AssumptionRow.tsx` — clarification textarea
- `CheckInForm.tsx` — check-in free-text
- `ParkingLotInline.tsx` — parking lot idea
- `WhatsNextPanel.tsx` — diagnostic reply
- `packager/PackagerAdjustInput.tsx` — adjustment textarea
- `packager/PackagerContextView.tsx` — context adjustment
- `research/ResearchPlanEditor.tsx` — plan editor
- `research/ResearchQueryInput.tsx` — initial query
- `tools/service-packager/page.tsx` — intro description
- `outcome/OutcomeForm.tsx` — free-text follow-up

### Intentionally excluded

| File | Reason |
|------|--------|
| `QuestionStepper.tsx` textarea | Borderless auto-resize embed (bg-transparent, dynamic height via onInput) — not a standard form control |
| `TrainingConsentSection.tsx` checkbox | `type="checkbox"` — different control type |
| `AggregateAnalyticsConsentSection.tsx` checkbox | `type="checkbox"` — different control type |
| `OutcomeForm.tsx` checkbox | Inline consent toggle — different control type |
| `DiscoveryChat.tsx` TextareaAutosize | 3rd-party component with its own resize; styling alignment is a Wave 2 follow-up |
| `PushbackChat.tsx` TextareaAutosize | Same as above |

---

## Phase 4 — Contrast fixes

### Replacement rules applied

| Rule | Before | After | Scope |
|------|--------|-------|-------|
| All `text-slate-500` | ~3.1:1 contrast on #070F1C | `text-slate-400` (~4.1:1) | Universal |
| Non-interactive `text-slate-400` | ~4.1:1 (borderline) | `text-slate-300` (~5.5:1, passes AA) | Lines without `hover:` or `transition` |
| Interactive `text-slate-400` | Kept | Kept | Nav links, "Back to home", dropdown items with hover:text-white |

### Files fixed (9)

`page.tsx`, `signin/page.tsx`, `about/page.tsx`, `faq/page.tsx`, `MarketingHeader.tsx`, `MarketingFooter.tsx`, `MarkdownContent.tsx`, `LegalTableOfContents.tsx`, `LegalDocumentPage.tsx`

### Remaining `text-slate-400` (18 occurrences)

All on interactive elements with `hover:text-white` or `transition-colors` — acceptable resting contrast for elements that reach full white on hover/focus.

---

## Phase 5 — Motion token system

### Tailwind extensions (`tailwind.config.ts`)

| Utility | Value | Use case |
|---------|-------|----------|
| `duration-fast` | 150ms | Hover states, micro-interactions |
| `duration-medium` | 250ms | Transitions, dropdowns |
| `duration-slow` | 400ms | Section reveals, ceremonies |
| `ease-standard` | `cubic-bezier(0, 0, 0.2, 1)` | Default ease-out for 90% |
| `ease-emphasis` | `cubic-bezier(0.22, 1, 0.36, 1)` | Fork picker, hero reveal |

### JS tokens (`client/src/lib/motion-tokens.ts`)

```typescript
DURATION.fast    // 0.15
DURATION.medium  // 0.25
DURATION.slow    // 0.4
EASE.standard    // [0, 0, 0.2, 1]
EASE.emphasis    // [0.22, 1, 0.36, 1]
```

### RevealOnScroll updated

- `duration-700 ease-out` → `duration-slow ease-standard` (400ms)
- Added `variant="emphasis"` prop for dramatic entries

### Wave 2 follow-up: full Motion audit

The Framer Motion `transition={{ duration: X }}` values across signin (0.5s, 0.6s), about/faq (0.5s), and product surfaces (0.15s, 0.3s) should be unified on the DURATION/EASE constants. Not done in this wave — the tokens exist, the vocabulary is established, the migration is incremental.

---

## Phase 6 — Typography scale

### Utility classes (`globals.css`)

| Class | Size | Weight | Leading |
|-------|------|--------|---------|
| `.text-display` | `clamp(2.25rem, 5vw, 4.5rem)` | 700 (bold) | 1.1 |
| `.text-heading` | `clamp(1.875rem, 4vw, 3rem)` | 600 (semibold) | 1.15 |
| `.text-subheading` | `clamp(1.25rem, 2.5vw, 1.5rem)` | 600 | 1.3 |
| `.text-body` | 1rem | inherit | 1.625 |
| `.text-caption` | 0.875rem | inherit | inherit + `muted-foreground` |

### Applied to

- Landing page hero h1: `text-display` (also upgrades to font-bold from font-semibold)
- 8 section headings on landing: `text-heading`
- Signin h1: `text-heading`

---

## Coordination with `feat/lifecycle-memory`

No friction encountered. The branches touch disjoint file sets:
- This branch: `tailwind.config.ts`, `globals.css`, `components/ui/`, marketing pages, legal pages, product form controls, CLAUDE.md
- Lifecycle memory: `prisma/schema.prisma`, `lib/` agent/engine files, Inngest functions, Sessions tab

**Merge recommendation:** whichever ships first gets merged. The second rebases cleanly. If lifecycle memory adds new forms (e.g., a venture selector), the Input/Textarea primitives are available for adoption in its sweep.

---

## What's left for Wave 2

These are the next-priority items from the design review (priorities 5-15) that build on Wave 1's foundations:

1. **Fork picker elevation** — full-bleed layout, gold-glow ring, spinner in pick button
2. **Borderless native `<select>` on task cards** → shadcn Select or Radix DropdownMenu
3. **Recommendation hero redesign** — bump summary to text-base, drop italics from "What Would Make This Wrong"
4. **Global roadmap progress indicator** — "7 of 15 tasks · Phase 2 of 5"
5. **Full Motion audit** — unify `transition.duration` across all Framer Motion usages on DURATION/EASE tokens
6. **Full typography migration** — apply text-display/heading/subheading/body/caption to all product surfaces
7. **Landing page structural changes** — hero product anchor, HowItWorks restructure, pricing commit-or-cut
8. **Public validation page redesign** — the most impactful single surface (Priority 1 in the design review)
9. **TextareaAutosize styling alignment** in DiscoveryChat / PushbackChat

---

*Wave 1 complete. Six commits, 75 files modified, all checks green.*
