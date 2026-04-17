# NeuraLaunch — Design Review

**Date:** 2026-04-16
**Scope:** client/ (Next.js 15 web app), marketing surfaces, core product flows, design system foundations, accessibility, responsive behaviour.
**Standard of comparison:** Linear, Vercel, Stripe, Figma, Superhuman, Raycast, Arc, Anthropic, Notion, Attio.

---

## 1. Executive summary

NeuraLaunch sits roughly two-thirds of the way between "hackathon prototype" and "Series A product customers pay for." The architecture is there — nine thoughtfully-ordered marketing sections, a disciplined product shell, careful accessibility considerations, a palette that isn't embarrassing. The engineering behind it is legitimately above the bar. But the visual authority is not yet at the level the prose voice claims it is.

The single most precise way to describe the current state: **the product looks competent. It does not yet look committed.** Headings are `font-semibold` where `font-bold` is wanted. Landing-page sections are stacked cards on a dark background without a single product screenshot. The fork picker — the emotional crescendo of the continuation flow — is styled identically to the read-only parking-lot card next to it. The public validation landing page at `/lp/[slug]` — the surface NeuraLaunch *generates* for founders to send to their real customers — is a centered `max-w-2xl` column of Tailwind defaults that would convert worse than a 2018 Notion template. And the palette is declared twice: marketing pages hardcode `#070F1C` / `#D4A843` everywhere, product pages use `bg-card` / `text-muted-foreground` tokens. Two parallel color systems with no shared source of truth means every downstream refinement has to happen twice.

A sophisticated founder landing on the site today will not immediately close the tab. They will read the hero, feel the voice, and believe that someone real is behind it. What they will not yet feel is that *the product itself* has been built to the standard the copy promises. That gap — between the promise of craft and the evidence of craft — is the exact thing this review is about closing.

---

## 2. The landing page verdict

[page.tsx](client/src/app/page.tsx) is nine sections: Hero → Problem → HowItWorks → OneRecommendation → ExecutionTools → Differentiation → ItStaysWithYou → Pricing → FinalCTA. The order is right. The copy is excellent. The palette is disciplined. The execution is not yet where the words want it to be.

### What works

- **The narrative arc.** Problem → mechanism → principle → tools → difference → promise → pricing → CTA is the correct order. Nothing is out of place.
- **The voice.** Sentences like "NeuraLaunch does not do that" ([page.tsx:320](client/src/app/page.tsx#L320)) and "When someone is lost, they do not need more options" ([page.tsx:347-349](client/src/app/page.tsx#L347-L349)) are the best text on any startup homepage I've read this year. Voice is earned; keep every line.
- **The palette restraint.** Gold appears exactly where it matters — on the hero phrase, on the "One Recommendation" principle card, on the final CTA. Electric blue carries the CTAs and accents. Emerald is held in reserve for "It Stays With You." This is correct palette thinking.
- **Accessibility landmarks.** Every section has `aria-labelledby` wired to its heading ([page.tsx:66, 151, 234, 292](client/src/app/page.tsx#L66)). The landing page passes WCAG's structural bar cleanly. This is above the startup average and should be preserved.

### What doesn't work

- **The hero has no visual anchor.** The hero ends at the CTA. Below the CTA is nothing — no product screenshot, no motion sequence, no evidence the product exists. A Linear, Vercel, Attio, or Stripe homepage puts its strongest product visual inside the first viewport. NeuraLaunch puts a radial blue gradient. The question a visitor is asking in the first three seconds — *is this real?* — is not answered until they scroll three sections deep.
- **The hero weight is too conversational.** `font-semibold` at `text-4xl sm:text-5xl md:text-6xl` ([page.tsx:87](client/src/app/page.tsx#L87)) is the weight of a blog post title, not a product hero. A hero that says "we'll tell you what — and walk it with you" needs the visual authority to back the confidence. `font-bold` at one tier larger per breakpoint is the correct fix.
- **Section rhythm is flat.** Every section uses the same container pattern: max-width wrapper, centered eyebrow pill in brand-accent uppercase tracking-wider (`text-sm font-semibold uppercase tracking-wider`), then a 3xl/4xl/5xl heading, then a row of bordered dark cards. Nine sections using this template is eight sections too many. Premium landing pages vary: two-column editorial stretches, full-bleed product visuals, quote strips, asymmetric emphasis. NeuraLaunch has one move and uses it nine times.
- **HowItWorks in five columns is cramped.** `lg:grid-cols-5` ([page.tsx:254](client/src/app/page.tsx#L254)) puts five numbered cards in one row at desktop. Five is too many for a row. The eye reads this as a checklist, not a narrative arc. The Product Vision describes a *journey* ("Arrive → Be Heard → Decide → Execute → Learn → Continue"). A journey deserves a line, not a table.
- **Differentiation reads defensive.** The strikethrough-versus-NeuraLaunch table ([page.tsx:517-540](client/src/app/page.tsx#L517-L540)) is a table of negations. Mature products assert their position and let confidence do the talking. Linear doesn't have a "why not Asana" table on its homepage. Cut this section to two lines and fold them into "One Recommendation."
- **"Pricing announced soon" on four tiers kills trust.** Four tiers with the phrase "Pricing announced soon" ([page.tsx:747](client/src/app/page.tsx#L747)) tells the visitor the product isn't ready. Either ship one number, or remove the section until you do.
- **The final CTA is a duplicate of the hero CTA.** Same button, same copy frame, same styling. The page isn't long enough to earn the repetition. A second CTA should *sound different* — ideally pointing at a real outcome ("Mariama shipped her first paid tutoring session 18 days after her discovery interview. Here's her roadmap.").
- **Problem section over-indexes on breadth.** Five personas ([page.tsx:125-146](client/src/app/page.tsx#L125-L146)) rendered as identical cards. Every persona dilutes the others. Three is the right number. Better still: one named person ("Mariama, 26, Freetown — graduated, 14 months applied, nothing landed") who carries the emotional weight the abstract cards can't.

### Verdict

**The landing page is at the level of a confident pre-launch product.** It looks like someone with taste shipped it. It does not yet look like the front door of a serious business. The gap is closable: four structural changes (hero anchor, five-columns-to-a-line, kill pricing or commit, one persona) and two weight changes (hero h1 tier up, font-bold) move it from "competent" to "serious." The copy is already where it needs to be.

---

## 3. Surface-by-surface review

### Marketing header — [MarketingHeader.tsx](client/src/components/marketing/MarketingHeader.tsx)

**Verdict: strong.** The auth-aware CTA is the single most mature move on the whole site. Signed-out visitors see "Sign in" (secondary link) + "Start Your Discovery" (primary blue). Signed-in visitors see an avatar dropdown with Dashboard / Settings / Sign out. Most early-stage startups bungle this — an "Open App" button is a giveaway that nobody on the team has shipped a product at scale. NeuraLaunch gets it right.

**Fix:** mobile button `py-2.5` at [MarketingHeader.tsx:202](client/src/components/marketing/MarketingHeader.tsx#L202) vs desktop `py-2` at [line 109](client/src/components/marketing/MarketingHeader.tsx#L109). Pick one. The scale of the inconsistency is small; the signal it sends ("nobody reviewed this diff on mobile") is large.

### Sign-in — [signin/page.tsx](client/src/app/signin/page.tsx)

**Verdict: polished but generic.** Motion choreography is thoughtful (staggered 0.15s / 0.25s / 0.35s / 0.4s reveal). The radial blue glow echoes the landing page. The card treatment is correct. But the page is indistinguishable from any other B2B SaaS sign-in page with "Continue with Google" and "Continue with GitHub."

**Concrete issues:**
- [signin/page.tsx:88](client/src/app/signin/page.tsx#L88) vs [line 98](client/src/app/signin/page.tsx#L98): `FcGoogle` is a full-color icon; `FaGithub` is monochrome white. Pick one treatment. Monochrome both is the Linear/Vercel default — it keeps the brand in charge rather than letting Google's logo dominate.
- [line 109](client/src/app/signin/page.tsx#L109): `text-slate-500` on `bg-[#0A1628]` is the "Secure authentication" divider label. Contrast is ~3.1:1. WCAG AA requires 4.5:1 for body text. Fails. Bump to `text-slate-400`.
- [line 62](client/src/app/signin/page.tsx#L62): "Welcome to NeuraLaunch / Sign in to start your discovery" is the generic every-SaaS copy. The product is about meeting the founder where they are. This is the first chance to prove it. Try: *"Your interview takes 8–12 minutes. You can pause whenever. We'll be here when you come back."* That sentence builds trust at the exact moment it's most needed.

### Auth error page — [auth/error/page.tsx](client/src/app/auth/error/page.tsx)

**Verdict: broken brand cohesion.** The error page uses system Tailwind tokens (`from-background`, `to-muted`, `destructive`) instead of the deep-navy palette every other page uses. A user bouncing from OAuth failure lands on what looks like a different product. Hardcode the same `#070F1C` / `#0A1628` palette as signin.

### Discovery entry — [(app)/discovery/page.tsx](client/src/app/(app)/discovery/page.tsx) and `DiscoveryChat`

**Verdict: functional, lacks ceremony.** The draft persistence (localStorage on the chat input) is a real quality-of-life win — the kind of detail that only ships when someone cares. Preserve it. But the placeholder `"Share your thoughts…"` frames the interview as a chat app. The product's pitch is structured listening; the placeholder should reflect that: *"Answer here…"* or *"Continue…"* or even *"What's on your mind?"* — which is how Anthropic's Claude frames its input. The first-question moment of the product is the moment NeuraLaunch has to feel different from every other chat-with-an-AI app. It currently feels like every other chat-with-an-AI app.

### Recommendation reveal — `RecommendationReveal.tsx`

**Verdict: good architecture, weak typography.** Seven stacked collapsibles is the right shape for the data — the committed summary, the path, the reasoning, first three steps, risks, assumptions, alternatives rejected. But they are all `text-sm`, all bordered cards, all the same visual weight.

**Concrete issues:**
- The gold-bordered summary card ([line 212 of RecommendationReveal.tsx](client/src/components/discovery/RecommendationReveal.tsx#L212)) uses `bg-[#D4A843]/5` as a hardcoded hex. `--gold` is defined in [globals.css:50](client/src/app/globals.css#L50) but not exposed as a Tailwind utility. The palette leaks from tokens into hex strings every time a component reaches for the gold. Fix the Tailwind config once, replace every hex.
- [line 220](client/src/components/discovery/RecommendationReveal.tsx#L220): "What Would Make This Wrong" is rendered italic `text-foreground/80`. This is the *falsification statement* — the single most important piece of epistemic honesty the product ships. Italicizing it reads as a caption. It should be regular weight, `text-foreground`, and visually equal to the summary.
- First three steps use decorative `size-6` circular badges with `bg-primary/10 text-primary font-semibold`. These read as stickers, not process. An ordered list (`1. 2. 3.`) with proper hanging indent would feel more mature.
- No global visual difference between "this is the recommendation" and "this is a supporting field." The recommendation *is* the product. Its hero moment should be the largest, boldest, most visually distinct surface in the app. Currently it's a dark card stack.

### Roadmap and task cards — `RoadmapView.tsx`, `InteractiveTaskCard.tsx`, `PhaseBlock.tsx`

**Verdict: strong structure, weak control design.**

- **No global progress indicator.** Seven of fifteen tasks done with two phases left is the one piece of information the roadmap view must surface at the top of the page. It currently exists only as per-task badges. A persistent `"7 of 15 tasks · 2 of 5 phases · 3 weeks of work remaining"` header is a half-day of work and a measurable reduction in cognitive load.
- **Status change uses a borderless native `<select>`.** `border-0` on a select ([InteractiveTaskCard.tsx ~line 102](client/src/components/roadmap/InteractiveTaskCard.tsx)) with only color coding for state is not acceptable at this price point. Users don't perceive it as a control. Replace with the shadcn Select component — or at minimum, give it a visible border, a chevron, and hover state. A status POST needs a visible pending state (opacity + spinner). Without one, the product feels dead between click and response.
- **Phase numbers all look identical.** Every phase's circle is `bg-primary/10 text-primary`. A five-phase roadmap should have a visual difference between "current phase" and "future phase." A filled circle vs outlined circle, or a slightly more saturated `bg-primary/20` for the current phase, differentiates them in a glance.
- **Completed tasks use `border-green-500/30`**, not the design-token `--success` (160 84% 39%) defined in [globals.css:52](client/src/app/globals.css#L52). Tailwind's generic green is not the brand emerald. The token drift happens in every state-colored component across the app.

### Continuation brief and fork picker — `BriefSections.tsx`, `ForkPicker.tsx`

**Verdict: the fork picker is the single most important UX failure in the product.**

The fork picker is the *moment of decision* at the end of a cycle. It's what the founder has spent weeks of work building toward. Emotionally, it's the crescendo.

Visually, in the current build, it is a bordered card styled identically to the "Parking Lot" card below it. Same `rounded-xl border border-border bg-card`, same padding, same text-base heading. The decision moment and the reference section look like equals.

**Fix:** full-width, not constrained to `max-w-2xl`. Larger fork titles (`text-lg font-semibold`). A gold accent on the entry ("The decision — pick one"). A gold-glow ring on the selected fork. A `Loader2` spinner inside the pick button during POST. When picked, the confirmation state ([ForkPicker.tsx ~line 28-44](client/src/components/continuation/ForkPicker.tsx)) should be ceremonial — a motion-animated expansion, not a static green-bordered box.

The "What I Got Wrong" section uses `bg-amber-500/5` — semantic amber, not `--gold`. Every state color that should be carrying the brand palette (success → emerald, warning → gold) is using Tailwind's generic equivalent instead. This is the same token-leakage pattern as the recommendation.

### Public validation landing page — [lp/[slug]/page.tsx](client/src/app/lp/[slug]/page.tsx) and [ValidationPageProduct.tsx](client/src/components/validation/public/ValidationPageProduct.tsx)

**Verdict: this is the most urgent design problem in the product.**

This page is not an internal surface. It is the page NeuraLaunch *outputs* to paying customers who will paste its URL into WhatsApp, email, LinkedIn to validate their ideas with real strangers. Its quality is NeuraLaunch's reputation in the founder's target market. Every single visitor to every single `/lp/[slug]` page is forming an opinion about whether the founder is credible, and by extension, about whether NeuraLaunch is a tool serious people use.

The current build is a centered `max-w-2xl` column ([ValidationPageProduct.tsx:62](client/src/components/validation/public/ValidationPageProduct.tsx#L62)) with:
- An h1 at `text-3xl sm:text-4xl` (no hero background, no visual anchor, no subtle grain)
- Two bordered cards — "The Problem" and "The Solution" — with `text-xs uppercase tracking-widest` labels
- A "What we're building" features panel with checkboxes
- A plain email signup form

There is no product-UI visual, no motion, no sense of brand behind the page, no sense the founder's idea has weight. A Notion template from 2018 would convert better. And a founder sending this URL to their actual restaurant-owner customer is going to get lower signup rates than they should, which will distort the validation signal the reporting pipeline interprets, which will give them the wrong next-step brief. **The bad design of this page corrupts the product's core epistemic loop.**

The three layout variants — product, service, marketplace — should be genuine design variants, not structural shuffles of the same flat column. A real reference to study is Stripe Atlas's landing-page generator or Typedream's templates. The bar is not high. The current build doesn't meet it.

**This should be the first thing redesigned.** Not the landing page, not the recommendation reveal — this. The leverage is highest here because the downstream epistemic cost is highest here.

### Tools — Conversation Coach, Outreach Composer, Research Tool, Service Packager

**Verdict: functional, not yet a family.** The four tools share a state-machine pattern (setup → loading → output → done). They do not share form primitives. Ring widths differ (1px, 2px, 3px) depending on which tool you're looking at. Chat bubbles are 11px on every breakpoint. `ResearchReportView` hardcodes `blue-500` for its roadmap-connection callouts instead of using `--primary`. Tools look like four adjacent products rather than four features of one.

**Fix with one move:** build a canonical `Input` / `Textarea` primitive (see §4 below). Every form in the app today reinvents its own. A single shared primitive fixes the rings, the paddings, the placeholders, the focus states everywhere.

---

## 4. Design system assessment

**Verdict: tokens exist. A system does not.**

### What exists

- **CSS variables.** [globals.css](client/src/app/globals.css) defines a clean, comprehensive token set — backgrounds, foregrounds, primary, secondary, accent, muted, border, destructive, `--gold`, `--success`, shadows, radii, transitions. Dark-mode overrides are complete. This is good thinking.
- **shadcn/ui primitives.** `Button` is disciplined (cva-based, 8 variants, 3px focus ring, proper SVG handling). `Badge`, `Card`, `Dialog`, `Avatar`, `Separator` exist and are conventional.
- **Lucide icon usage.** Consistent across the codebase. No mixed icon libraries.

### What doesn't exist

- **A Tailwind binding for `--gold` and `--success`.** The tokens are defined in CSS variables but never bound into Tailwind config at [tailwind.config.ts](client/tailwind.config.ts). So there's no `text-gold`, no `bg-gold/5`, no `border-success/30`. Every component that needs gold writes `text-[#D4A843]`. Every component that needs success-green writes `border-green-500/30` or `text-emerald-500`. The token contract is declared and then immediately abandoned.
- **Two parallel color systems.** Marketing pages hardcode the brand hex (`#070F1C`, `#0A1628`, `#0D1E38`, `#2563EB`, `#D4A843`, `#10B981`). Product pages use Tailwind utilities driven by CSS variables (`bg-card`, `bg-muted`, `text-muted-foreground`, `border-border`). There is no bridge. Nothing enforces that `bg-card` and `#0A1628` are the same color. They are — by accident.
- **No `Input` primitive.** [components/ui/](client/src/components/ui/) has no `Input.tsx`. Every form in the product reimplements it. Focus rings at 1px, 2px, or 3px depending on the file. Padding at `px-2 py-1.5` or `px-3 py-2` depending on the component. Placeholder colors that don't match. This is the single highest-leverage system gap in the codebase — more so than the color tokens — because it's the primitive every interactive form reaches for.
- **No motion token system.** Fade durations vary (0.3s, 0.5s, 0.6s, 0.7s). Eases vary (`ease-out`, implicit cubic-bezier, Tailwind `transition-all`). RevealOnScroll is hardcoded to 700ms. Button hover is default Tailwind. Three canonical durations (150ms / 250ms / 400ms) and two easings (standard ease-out, and an ease-out-cubic for emphasis) would unify the product's sense of rhythm.
- **Secondary token collapsed to neutral.** The old pink `--secondary` was removed (correctly — it was off-brand) but nothing replaced it. The "secondary" slot now maps to a neutral gray, which means every `Button variant="secondary"` renders as an un-themed slate button. That's fine if it's intentional. It's less fine as a silent consequence of a refactor. Either give secondary a real brand role (the warm gold is a candidate) or delete the variant and let outline/ghost carry the non-primary buttons.

### Iconography

Consistent. Lucide throughout. Sizes drift (`size-4` in some spinners, `size-5` in others, `size-6` in the first-three-steps badges). Pick three canonical sizes (`size-4` for inline, `size-5` for controls, `size-6` for section icons) and enforce.

### Accessibility

- **Color contrast.** The most common failure is `text-slate-400` or `text-slate-500` on `#070F1C`. Rough contrast is 3.1–3.5:1 depending on exact combination. WCAG AA body-text requires 4.5:1. There are visible failures on the sign-in page ("Secure authentication" label), the landing-page legal microcopy, the footer caption text, and scattered `text-muted-foreground` callouts on `bg-primary/5` surfaces. Fix: bump `text-slate-400` → `text-slate-300` for body text on dark navy. Reserve `slate-500` for truly tertiary captions where contrast can be lower by design.
- **Focus states.** Button has a strong `focus-visible:ring-[3px]`. Most inputs have inconsistent ring widths. Dialog close button ring doesn't match. Unify on 3px across every interactive primitive.
- **Semantic landmarks.** Marketing pages have `aria-labelledby` on sections. App pages mostly don't. The app shell has no `<main>` wrapper with a stable id. Fix by standardising the `(app)/layout.tsx` to wrap in `<main id="main">`.

---

## 5. Ranked priority list

These are ordered by where a 1-week investment moves the product furthest up the quality spectrum.

1. **Redesign the public validation page (`/lp/[slug]`).**
    - Problem: the page NeuraLaunch outputs to a founder's real market is a centered text column with no hero anchor, no product identity, no motion. Converts poorly, corrupts the validation signal, and sets a bad first impression with every stranger who sees it.
    - Fix: a real landing-page design with a hero visual, a real section rhythm, proper feature cards, trust cues. Three layout variants (product / service / marketplace) should visibly differ, not just structurally.
    - Impact: enormous. This affects the validation signal quality, which affects the build-brief quality, which affects the founder's next cycle. Every other design problem is downstream of this one.
    - Effort: medium (1–2 weeks for a real rebuild).

2. **Unify the two color systems.**
    - Problem: marketing hardcodes brand hex; product uses CSS-var tokens. `--gold` and `--success` are defined and never used. Every "gold" instance in the product writes `#D4A843` inline.
    - Fix: expose `gold`, `success`, `navy-950/900/800` in [tailwind.config.ts](client/tailwind.config.ts). Replace every hardcoded hex with the utility. Ban raw hex in PR review going forward.
    - Impact: structural — unlocks every subsequent improvement. Also eliminates the single most common source of visual drift.
    - Effort: small (1 day of disciplined find-and-replace).

3. **Build the `Input` / `Textarea` primitive.**
    - Problem: every form in the app reinvents padding, ring width, focus color. Rings vary between 1px, 2px, 3px. No two forms look the same on focus.
    - Fix: ship [components/ui/Input.tsx](client/src/components/ui/Input.tsx) with canonical padding, a 3px focus ring matching the Button, a consistent placeholder color. Then replace every ad-hoc `<input>` in a sprint.
    - Impact: compounds everywhere — every tool page, every check-in form, every setup flow gets visually tighter in one move.
    - Effort: small primitive, medium sweep.

4. **Rebuild the landing-page hero.**
    - Problem: font-semibold at text-4xl/5xl/6xl is too conversational. No product visual. No evidence the product exists in the first viewport.
    - Fix: `font-bold` one tier up per breakpoint (`text-5xl sm:text-6xl md:text-7xl`). Add a product screenshot or a 10-second motion sequence of the Arrive → Decide arc directly below the subhead. Drop the eyebrow pill badge — the tagline belongs in the hero, not above it.
    - Impact: large. The first-viewport impression is the single most leveraged surface for conversion and trust.
    - Effort: small for typography; medium if producing real product screenshots.

5. **Elevate the fork picker.**
    - Problem: the decision moment of the continuation flow looks identical to the read-only parking-lot card.
    - Fix: full-bleed layout, larger fork titles (`text-lg font-semibold`), gold-glow ring on the selected fork, spinner in the pick button during POST, motion-animated confirmation state.
    - Impact: turns the continuation flow's emotional crescendo into something that feels like one.
    - Effort: small.

6. **Fix contrast failures.**
    - Problem: `text-slate-400` and `text-slate-500` on `#070F1C` fail WCAG AA for body text.
    - Fix: bump `slate-400` → `slate-300` for body text; keep `slate-500` only for truly tertiary captions. Audit sign-in, about, faq, landing, footer.
    - Impact: accessibility (legal + ethical) plus perceived polish.
    - Effort: small.

7. **Replace the native `<select>` on task cards.**
    - Problem: borderless native select, no hover or pending states.
    - Fix: shadcn Select (or Radix DropdownMenu) with visible chevron, proper border, opacity + spinner during status POST.
    - Impact: the product stops feeling dead between interaction and response.
    - Effort: small.

8. **Redesign the recommendation hero treatment.**
    - Problem: the most important moment in the product renders at `text-sm` with italic body for the falsification statement.
    - Fix: bump summary to `text-base`, drop italics from "What Would Make This Wrong," make the gold-bordered card visually dominant over the collapsibles below it.
    - Impact: the first payoff moment of the product lands.
    - Effort: small.

9. **Add a global roadmap progress indicator.**
    - Problem: roadmap view gives no at-a-glance sense of where the founder is.
    - Fix: a persistent header at the top — `"7 of 15 tasks complete · Phase 2 of 5 · ~3 weeks of work remaining"`. Drive from the existing `RoadmapProgress` counters.
    - Impact: reduces cognitive load dramatically on a view that can otherwise scroll for pages.
    - Effort: small.

10. **Cut HowItWorks from 5 columns to a line.**
    - Problem: five cards in a row at lg is a checklist, not a journey.
    - Fix: either a horizontal connected stepper (like Stripe's onboarding graphics), or a 2×3 grid, or a vertical story.
    - Impact: the product's narrative arc becomes scannable.
    - Effort: small.

11. **Commit or cut the pricing section.**
    - Problem: "Pricing announced soon" on four tiers reads as unfinished.
    - Fix: either ship a single number with conviction, or replace the section with a short "early access" block until pricing exists.
    - Impact: trust.
    - Effort: depends on business decision.

12. **Build a motion token system.**
    - Problem: fade durations and easings vary across the codebase.
    - Fix: three durations (150/250/400ms), two easings (ease-out standard, ease-out-cubic emphasis). Bind into Tailwind `transition-duration` utilities or a theme object consumed by Motion.
    - Impact: the product gets a consistent sense of rhythm.
    - Effort: small.

13. **Typography scale.**
    - Problem: the type system relies on `text-xs` / `text-sm` / `text-base` with weight shifts. There is no named scale (display / heading / subheading / body / caption).
    - Fix: commit to a five-tier scale and map every page to it. This is the "Refactoring UI" exercise; it takes a day and makes everything look more designed.
    - Impact: ties the whole product together.
    - Effort: medium.

14. **OAuth icon consistency.**
    - Problem: Google colored, GitHub monochrome on the sign-in page.
    - Fix: monochrome both.
    - Effort: trivial.

15. **Sidebar active-state `aria-current="page"`.**
    - Problem: active nav item is not announced to screen readers.
    - Fix: add `aria-current="page"` to the active Link.
    - Effort: trivial.

---

## 6. Specific changes to make the landing page feel like a real business

Not general advice. Concrete changes, with the intended structure named.

### Hero ([page.tsx:63-120](client/src/app/page.tsx#L63-L120))

- **Typography:** `font-bold` (not semibold), `text-5xl sm:text-6xl md:text-7xl` (not 4xl/5xl/6xl). `leading-[0.95]` on the largest breakpoint to tighten.
- **Structure:** remove the eyebrow pill. The tagline "From lost to launched. For everyone." belongs on the final CTA, not above the h1. Redundancy weakens both surfaces.
- **Visual anchor:** below the subhead, add a real artifact. Two options, in decreasing order of difficulty:
  - *Best:* a curated product-UI composite — the recommendation reveal with a real example, a roadmap with tasks in mid-execution, a check-in conversation. Styled the way Linear's homepage composites feature UI. Static PNG at `max-w-4xl`, with a subtle tilt and a soft blue glow behind it.
  - *Second best:* a minimal motion sequence cycling through six labeled frames — Arrive, Be Heard, Decide, Execute, Learn, Continue — each showing one second of the actual product. 10-second loop, autoplays.
  - *Do not:* a gradient blob, a Figma illustration, a stock AI-brain icon. Those move the page in the wrong direction.
- **CTA microcopy:** keep "Start Your Discovery." Drop "Free to start. No credit card required." until pricing exists. That line is marketing shorthand for "we're paid software"; saying it before pricing is live is premature.

### Problem section ([page.tsx:125-193](client/src/app/page.tsx#L125-L193))

- **Trim to three personas.** The graduate, the stuck founder, the shop owner. Aspiring builder and mid-journey professional are real audiences but weaken the section by density.
- **Replace abstract titles with named protagonists.** "Mariama, 26, Freetown" rather than "The graduate." A named person in a specific place carries emotional weight that "The graduate" cannot.
- **Change the heading** from "You are not the first person to feel stuck." to something that names the reader's state specifically. The current heading is a reassurance. Try: *"Right now, in fifty cities, someone is where you are."*

### HowItWorks ([page.tsx:232-282](client/src/app/page.tsx#L232-L282))

- **Drop to a horizontal stepper or a vertical story.** Five cards in one grid row is a checklist. The copy is calling it a journey; the design should too.
- **Add one real screenshot per step.** 240×160 product image, rounded, subtle shadow. Tiny evidence that the thing exists.
- **Replace the gray numbered-badge-plus-icon pattern** with a single motif — either only numbers, or only icons — not both. Double-encoding weakens both.

### OneRecommendation ([page.tsx:288-358](client/src/app/page.tsx#L288-L358))

- **This is the strongest section on the page.** Keep the gold-bordered card, the headline, the two-column principle layout. One addition: below the principle, include a real recommendation excerpt. Three sentences of an actual NeuraLaunch recommendation for a real (or realistic) founder. *"For Mariama: one-to-one tutoring over group classes. Here's why. Here are the three risks. Here's what would make this wrong."* That turns the principle into evidence.

### ExecutionTools ([page.tsx:397-463](client/src/app/page.tsx#L397-L463))

- **Keep largely as-is.** This is the second-strongest section. The "What it does" callout with a concrete example ("Five biggest restaurant suppliers in Freetown and what they charge") is the best copy on the page. Preserve.
- **Add a subtle connector** between the three cards — a line, a chevron, some visual cue that they compose into a chain (research → compose → coach). Right now they read as parallel options; in the product they're a choreography.

### Differentiation ([page.tsx:492-544](client/src/app/page.tsx#L492-L544))

- **Cut or halve.** The strikethrough-vs-us table is the one moment the page reads defensive. Confident products don't enumerate their competitors. Either cut the section entirely and fold the strongest line ("Advice tools give you options. NeuraLaunch gives you one answer.") into OneRecommendation, or keep two rows max.

### ItStaysWithYou ([page.tsx:549-609](client/src/app/page.tsx#L549-L609))

- **Cut from four beats to three.** Bell, brain, refresh is the strongest three. Compass ("It tells you what's next") duplicates the closing of the page.
- **Differentiate the beats visually.** Currently all four are identical emerald-accented cards in a vertical stack. Give one of them (the recalibration — "It notices patterns across tasks") more visual weight, since it's the most unique.

### Pricing ([page.tsx:695-787](client/src/app/page.tsx#L695-L787))

- **Ship prices or cut the section.** "Pricing announced soon" on four tiers is the most trust-damaging element on the page. Replace with a single "Currently in early access — [link]" block until pricing is real.

### FinalCTA ([page.tsx:792-828](client/src/app/page.tsx#L792-L828))

- **Do not repeat the hero CTA verbatim.** If the final CTA earns its place, it does so by adding a proof. One sentence with a real or plausible story: *"Mariama shipped her first paid tutoring session 18 days after her discovery interview. Her roadmap, pushback, and continuation brief are on her profile."* Link that. Show a real product artifact.

---

## 7. What NeuraLaunch already does well

These are the things to preserve as you fix the above. A critique that only points to weaknesses misses where the work is already earning its pay.

- **The prose voice.** The landing copy is the strongest asset on the site. *"NeuraLaunch does not do that."* / *"When someone is lost, they do not need more options."* / *"Nothing has been built for the moments in between. Until now."* Every one of these sentences belongs in the final product. The tonal discipline matches Claude's, Linear's, Superhuman's — confident without being arrogant, plain without being bland. Do not let a copywriter "polish" this.
- **The palette choice.** Deep navy + electric blue + warm gold + emerald is unusual and adult. Most AI startups reach for purple/pink/neon. The gold is a genuinely differentiated choice. The restraint with which gold is deployed (appears on the hero phrase, the One Recommendation principle card, and the final CTA — three places, not thirty) shows taste.
- **The auth-aware marketing header.** Most early-stage startups get this wrong and ship "Login / Sign up" buttons to authenticated users. NeuraLaunch's avatar dropdown with Dashboard / Settings / Sign out is a maturity signal. Preserve and replicate this pattern in the signed-in app shell.
- **The draft persistence in DiscoveryChat.** LocalStorage-backed draft that survives refresh is a detail that only ships when someone cares. Exactly the kind of quality-of-life move that Superhuman made its reputation on.
- **The assumption-flag interaction.** Click a flag on an assumption, stream a scoped impact analysis, allow a clarification follow-up. This is a legitimately novel UI primitive for AI recommendations. I haven't seen it anywhere else. Elevate it — it could be the product's defining interaction.
- **The section architecture on the landing page.** The narrative order (Problem → Mechanism → Principle → Tools → Differentiation → Persistence → Pricing → CTA) is correct. The story is right. Only the execution of each section needs to catch up.
- **Accessibility thoughtfulness.** `aria-labelledby` on sections, `prefers-reduced-motion` respected in `RevealOnScroll`, visible focus rings on the Button primitive. Above the startup average. The contrast failures are real but the intent is there — it's a finish problem, not an absence problem.
- **Engineering discipline leaking into UX.** The rate-limited routes, the central `httpErrorToResponse`, the prompt-injection protocol, the idempotent Inngest functions — none of this is visible on screen, but all of it makes the product *feel* trustworthy when a user hits an edge case. The "generic 500 never leaks internals" rule is a silent quality signal that compounds.
- **Session resumption logic on /discovery.** Checking for sessions between 60 seconds and 72 hours old and offering resumption is exactly the kind of edge-case care that cheap products skip. Preserve.

---

## 8. References and inspiration

Specific products. Specific pages. Specific things to study. Not "look at good design."

- **[linear.app](https://linear.app)** — Study the first-viewport composition. How the product screenshot is the *first* thing after the h1, how every section thereafter is anchored by another real product visual. This is the model for the NeuraLaunch landing hero rebuild (§6).
- **[vercel.com](https://vercel.com)** — The "Deploy → Preview → Ship" scroll-tied motion sequence. The motion isn't decorative — it *is* the product explanation. NeuraLaunch's Arrive → Be Heard → Decide → Execute arc is begging for the same treatment.
- **[attio.com](https://attio.com)** — The closest aesthetic cousin to what NeuraLaunch wants to be. Dark, generous type, product-anchored, opinionated. Study specifically their section-to-section rhythm and their screenshot treatment (soft blue glow, slight rotation, subtle grain).
- **[superhuman.com](https://superhuman.com)** — The pricing page. One tier, one number, zero apology. The opposite of "Pricing announced soon." When NeuraLaunch is ready, this is the reference.
- **[raycast.com](https://raycast.com)** — The onboarding and empty-state design. Exactly the reference for the DiscoveryChat empty-state rebuild. Raycast makes the first-run moment feel ceremonial without being twee.
- **[anthropic.com/claude](https://anthropic.com/claude)** — Direct neighbour in the AI product space. Study the typography hierarchy — Anthropic uses far fewer sizes than NeuraLaunch does, but each is more differentiated. Also study the use of the orange accent: one place per screen, maximum.
- **[figma.com/config](https://config.figma.com)** — For pure editorial voice on section headers. NeuraLaunch's section titles ("How it works", "The tools", "Pricing") are functional. Figma's event site shows what it looks like when section titles are written with the same voice as the rest of the copy.
- **[stripe.com/atlas](https://stripe.com/atlas)** and **[stripe.com/climate](https://stripe.com/climate)** — Sub-sites where dense conceptual content is rendered without feeling like a brochure. The tone-match for NeuraLaunch's About page and tool pages.
- **[notion.com](https://notion.com)** — The feature-page treatment (e.g. `/product/ai`). Close to what the NeuraLaunch "One Recommendation" section should feel like, with a real product artifact as the anchor.
- **[height.app](https://height.app)** (pre-acquisition archive) — The best reference for calm, centered, dark-theme landing composition that doesn't feel sparse. Exactly the aesthetic NeuraLaunch is reaching for and hasn't quite hit.
- **Adam Wathan & Steve Schoger's *Refactoring UI*.** The typography and spacing chapters specifically. The distance between NeuraLaunch's current flat hierarchy and a deliberate type scale can be closed by applying the advice in that book mechanically. A day of work.

For the public validation page redesign (priority #1), the references are different:
- **[typedream.com/templates](https://typedream.com/templates)** and **[framer.com/templates](https://framer.com/templates)** — templates in the exact category NeuraLaunch is generating. Study what a "product launch landing page" looks like at professional-template quality. That's the floor the `/lp/[slug]` pages need to clear.
- **[stripe.com/atlas](https://stripe.com/atlas)** — not for the design itself, but for the conceptual move: Stripe generates real operational artefacts for founders that look like real business assets. The `/lp/[slug]` pages should read like real business assets, not like internal product output.

---

*Review prepared 2026-04-16. For follow-ups or specific implementation reviews on any of the fifteen priorities, the shortest path is to ship priorities 1–3 first — they unlock everything downstream.*
