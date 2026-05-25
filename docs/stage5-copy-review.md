# Stage 5 Copy Review

Consolidated index of every founder-visible string the Stage 5 UI
surfaces will ship. Same shape as the Stage 3 + Stage 4 copy reviews —
mark each item **Approve** / **Replace** / **Defer**.

Stage 5 is **deliberative review + handoff** — not authoring. The
founder does not chat here. There is no input box, no scout, no
verdict picker. The surface shows the chosen opportunity, the
reserves the agent set aside, and one CTA that fires the synthesis
bridge. After synthesis succeeds, the founder is delivered to the
legacy Recommendation review surface (which is augmented for the
`no_idea` lifecycle scenario — Sections E, F, G below).

Two areas flagged for **extra eyes** per the brief:

1. **Synthesis-in-flight copy** — the founder waits ~60s while the
   Inngest worker runs. The polling client sees `loading_inputs` →
   `synthesizing` → `persisting`. Surface honestly without
   infantilising. Marked `IN-FLIGHT` below.
2. **Cascade-stale banner** on the legacy Recommendation review —
   factual, not alarming. The data changed; here's how to refresh.
   Marked `CASCADE` below.

Skipped: route-level error strings already covered by the central
`httpErrorToResponse` shape (commit #3 follows the same posture as
Stage 4's accept-and-queue route — only the realistically
founder-visible ones get inline rewrites here), aria/dev strings,
agent prompts (the renderers in `lib/ideation/stage5-handoff/` are
deterministic templates, not LLM prompts — no prompt-tone pass
applies).

---

## A. Pre-synthesis review — `/discovery/no-idea/[sessionId]/stage5`

The canvas-style surface that mirrors Stages 1-4 muscle memory. Read-
only: the founder reviews the chosen opportunity, scans the reserves
the agent set aside, then fires the bridge.

> **Question for review:** the Stage 5 path lives at the existing
> `/discovery/no-idea/[sessionId]` route (the page-level dispatcher
> routes by active stage number, same as Stages 1-4). The brief
> phrases the URL as `.../stage5` for clarity — there is no separate
> route file. Same dispatcher, new branch. Calling this out so the
> review doesn't treat the URL literally.

### A.1 Page header / eyebrow

Eyebrow (mirrors Stage 3.8.1 + Stage 4.13.1 — "Pre-commit review · X"):

```
Pre-synthesis review · Validation Handoff
```

Page heading (mirrors Stage 3.8.2 + Stage 4.13.2):

```
Your handoff to validation — Stage 5 of 5
```

**Voice note:** "Validation Handoff" matches the stage's internal name
and the brief's banner pattern. The heading uses "to validation" with
a small-v "validation" — this is **demand validation** (the next
phase outside Discovery), distinct from Stage 4 Layer B's pain
validation. CLAUDE.md vocabulary discipline calls this out
explicitly.

### A.2 Stage 5 banner — first-entry framing

Mirrors `Stage4Banner.tsx` shape (the "what happens in this stage"
intro every founder gets on first entry; dismissable).

**A.2.1 Banner label**
```
Stage 5 of 5 — Validation Handoff
```

**A.2.2 Banner body**
```
You picked your opportunity in Stage 4. I'll now take everything
you've built — outcome, requirements, pain inventory, the
opportunity itself — and synthesize it into your handoff document.
That's what you'll take into the next phase to actually validate
demand. The alternatives you set aside stay with the handoff in
case you need to fork later.
```

**Voice note:** first-person "I" matches Stage 4 banner approved
posture. Names what the handoff *is for* (demand validation in the
next phase) without overclaiming what the synthesis will do.
"Synthesize" is the load-bearing verb — same word the worker uses
internally so the founder learns the vocabulary.

**A.2.3 Dismiss aria**
```
Dismiss Stage 5 intro
```

### A.3 Chosen opportunity panel

The chosen `ChosenOpportunitySnapshot` rendered as a single
prominent card at the top.

**A.3.1 Section header**
```
Opportunity advancing to validation
```

**Voice note:** mirrors Stage 4's `13.3 Advancing to Stage 5`
header verbatim shape, with "to validation" substituted for "to
Stage 5" because Stage 5 IS the surface we're on. The agent's voice
isn't carrying this label — it's the page voice naming what the
card contains.

**A.3.2 Pain summary label**
```
Pain point:
```
Then the `chosen.painPointSummary` verbatim. Wrapped via
`renderUserContent` server-side (already enforced by the renderers
in `lib/ideation/stage5-handoff/`).

**A.3.3 Why this one — agent reasoning block**
```
Why this one — the agent's read
```
Then `chosen.agentReasoning` verbatim.

**Voice note:** Stage 4's document view uses `13.4 Why this one` as
the bare heading; the suffix "the agent's read" disambiguates from
the founder's verdict block below, which carries the founder's own
reasoning. Without the suffix the two blocks read as competing
headings for the same opportunity.

**A.3.4 Founder's verdict block**
```
Your verdict
```
Then `chosen.founderVerdict` rendered through the long-label map
from `stage4/labels.ts:9` (`Pursue` / `Pursue with caveats` /
`Drop` — the chosen opportunity is always non-null and non-drop by
the Stage 4 readiness gate, but display defensively).

> **Question for review:** does the founder's verdict reasoning
> from Stage 4 (the pushback dialogue, the rationale they wrote into
> the verdict picker) need to surface here too? The
> `ChosenOpportunitySnapshot` schema does NOT carry founder
> reasoning — only the verdict enum. To surface it we'd have to
> either extend the snapshot or fetch the underlying Stage 4 row
> at render time. My read: don't extend the snapshot; if the
> founder wants to see their reasoning they can click "Revisit
> Stage 4" (A.7). The chosen panel stays compact.

**A.3.5 Layer A confidence summary**
```
Layer A research — 4 dimensions
```

Then four compact rows per dimension (mirrors
`LayerASection.tsx:5.3` dimension labels exactly so the founder
recognises them from Stage 4):

```
Market reality   — confidence 0.NN
Customer access  — confidence 0.NN
Will people pay  — confidence 0.NN
Market size      — confidence 0.NN
```

Empty-state line when `chosen.layerASummary` is null (rare — Stage
4 readiness should have gated; defence-in-depth):

```
Layer A research wasn't run on this opportunity.
```

**Voice note:** Stage 5 is intentionally **read-only**. The
reasoning paragraphs from Layer A are NOT re-rendered here — they
already shipped on the Stage 4 review surface. Surfacing them again
would dilute the panel. Confidence-as-number is the minimum signal
the founder needs to recognise what the synthesis is reading off.

**A.3.6 Layer B aggregate signal**
```
Layer B community engagement
```

Then one line:
```
<strength>. N positive · N neutral · N negative.
```

Where `<strength>` is the qualitative label from
`stage4/labels.ts` (`Strong` / `Mixed` / `Weak` / `Contradictory`).
Sentiment counts come straight from
`chosen.layerBSummary.sentimentBreakdown`.

Empty-state line when `chosen.layerBSummary` is null:
```
No community responses were captured.
```

**Voice note:** matches the Stage 4 `6.2 Aggregate signal summary`
shape exactly (`Aggregate: Strong · 5 positive · 2 neutral · 1
negative`) — same single-line cadence. The "Aggregate:" prefix from
Stage 4 is dropped here because the surrounding section header
already names what this is.

### A.4 Reserves section — alternatives considered

Read-only card list of every `ReserveOpportunity` on the authoring
state. Same data the legacy Recommendation review will show in F
post-synthesis.

**A.4.1 Section header**
```
Alternatives considered (N)
```

**A.4.2 Section subtext (one line under the header)**
```
What I evaluated alongside the chosen opportunity. These stay with
your handoff in case you fork later.
```

**Voice note:** first-person "I" matches the agent voice from
Stages 1-4. "Stay with your handoff" telegraphs the continuation-
brief mechanism without naming it (the founder hasn't met the
continuation brief yet).

**A.4.3 Empty state — no reserves**

Shown when `reserveOpportunities.length === 0`:

```
No alternatives — only one opportunity survived Stage 4's shortlist.
```

**Voice note:** factual, not apologetic. A one-opportunity
shortlist is a valid Stage 4 outcome; "only one survived" is the
straightest way to name it. Mirrors Stage 4's `renderAlternativesSection`
fallback string in `render-strategic-analysis.ts:243` so the
internal renderer and the founder UI converge.

**A.4.4 Per-card layout — one ReserveOpportunity**

Card header line:
```
Rank N · <pain point summary>
```

Then four rows below, label-aligned:

```
Agent verdict:   <Pursue | Pursue with caveats | Drop | Pending>
Your verdict:    <Pursue | Pursue with caveats | Drop | Not set>
Layer A:         <avg confidence 0.NN across 4 dimensions>
Layer B:         <Strong | Mixed | Weak | Contradictory | not captured>
```

**Voice note on "avg confidence":** the founder doesn't need four
separate confidence numbers per reserve — that's noise at this
density. One averaged number gives them a glanceable "how strong
was the research signal" without re-implementing Stage 4's
dimension breakdown here. If they want the full breakdown they
click into Stage 4 via A.7.

> **Question for review:** "Not set" vs "—" vs blank for a null
> `founderVerdict`. The reserve genuinely may not have a founder
> verdict (the founder bailed early after their chosen opportunity
> cleared). My read: explicit "Not set" is more honest than a
> dash, which could read as a UI bug.

> **Question for review:** the brief says "NO inline evidence
> drilldown — link to Stage 4 surface for detail." That's
> respected here — the cards show summaries, not citations or full
> reasoning. Is a single "View in Stage 4" affordance per card
> warranted, or does the page-level A.7 link cover it? My read:
> page-level only. Per-card links double-link to the same
> destination and add visual noise to a deliberately quiet panel.

### A.5 Cascade-stale banner (pre-synthesis variant)

Shown above the chosen panel when `Stage5AuthoringState.requiresRederivation`
is true. Different from the post-synthesis cascade banner in E —
this one fires when an upstream stage was edited BEFORE the founder
even fired synthesis.

```
You updated Stage 1, 2, 3, or 4 — the chosen opportunity and
reserves below were captured before that edit. If you fire the
handoff now, the synthesis will read off the prior state. To
rebuild from your fresh inputs, revisit Stage 4.
```

**Voice note:** explicit about which stages can trigger the cascade
(matches the `triggeringStages` enum on
`Stage5CascadeSnapshotSchema`). Names the consequence ("read off the
prior state") instead of hand-waving. The remediation is "revisit
Stage 4" because Stage 5 doesn't own re-derivation — it owns
read-only review of what Stage 4 committed.

**A.5.1 Banner CTA (revisit Stage 4)**
```
Revisit Stage 4
```

**Voice note:** plain verb-noun. Same affordance label as A.7;
deliberately reused so the founder learns one path.

### A.6 Primary CTA — generate handoff

```
Generate handoff
```

Helper text below the button:
```
Synthesis takes ~1 minute. I'll combine your Stage 1-4 evidence
into a single recommendation, then take you to the review surface.
```

In-flight state (covered in detail in B):
```
Generating…
```

**Voice note:** "Generate handoff" not "Synthesize" — the founder
button uses the artifact noun (`handoff`); the worker stage uses
the verb (`synthesizing`). Same separation Stage 3's `Run scout` vs
`Scouting…` uses.

> **Question for review:** "~1 minute" — synthesis budget is
> conservative (8 research steps, 16k reasoning tokens, 16k emit
> tokens per `constants.ts`). Real-world p50 is probably 40-70s but
> we don't have prod data yet. Options:
> 1. Keep "~1 minute" (current).
> 2. Range: "between 30 seconds and 2 minutes".
> 3. Drop the estimate entirely and let the in-flight progress
>    stages do the talking.
> My read: keep #1 — a single number is honest enough at this
> stage and the in-flight progress (B.2) reassures continuously.

### A.7 Secondary action — revisit Stage 4

Placement: ghost button to the left of the primary CTA, matching
the `Save and come back` slot from `13.6 Footer buttons` in
Stage 4's document view.

```
Revisit Stage 4
```

Helper line below (only shown on hover/focus, mirrors button-
helper pattern from Stage 3):
```
Reopens Stage 4 for edits. The handoff hasn't fired yet — nothing
to discard.
```

**Voice note:** "nothing to discard" matters because the founder
might fear the link will throw away the chosen + reserves. It
won't; the cascade snapshot only fires AFTER synthesis runs.

> **Question for review:** confirmation modal on click, or direct
> navigation? My read: direct navigation. The pre-synthesis page
> has no unsaved state and no destructive consequence — a modal
> would teach the founder this is a risky action when it isn't.

### A.8 Footer

```
Stage 5 of 5 · Synthesis happens once. You can re-fire it from the
recommendation review if upstream evidence changes.
```

**Voice note:** plain-spoken commitment to "synthesis happens once"
matters because the founder hasn't seen the re-synthesize path yet
(it's gated behind the cascade-stale banner on the legacy review).
This footer plants the seed.

---

## B. Synthesis in flight — polling state on the Stage 5 page

Same surface as A, but the chosen panel + reserves dim and the CTA
area transforms into a status block. The 3s foreground / 30s
backgrounded poll cadence matches `useToolJob` exactly per the
brief.

### B.1 Status block heading

```
Synthesizing your handoff
```

**Voice note:** verb-noun, present continuous. Matches the worker's
internal `synthesizing` stage label.

### B.2 Progress phase line — `IN-FLIGHT`

The status endpoint exposes the worker's `Stage5JobStage` enum
(`queued` / `loading_inputs` / `synthesizing` / `persisting` /
`succeeded` / `failed`). Map each to founder-facing prose:

```
queued          → Queued.
loading_inputs  → Reading your Stage 1-4 evidence.
synthesizing    → Reasoning across everything you've built (this is the longest step).
persisting      → Saving your recommendation.
```

`succeeded` + `failed` are handled separately (C and D).

**Voice note:** four short status lines visible in sequence as the
worker progresses. "(this is the longest step)" tells the founder
why the bar appears to stall on `synthesizing` — it's the Opus
Phase 1A pass with research, which dominates the run time. Honest
about what's slow without apologising for it.

> **Question for review:** show all four phases as a vertical
> checklist (founder sees the future + completed steps), or show
> only the current phase as a one-liner? My read: vertical
> checklist. The four steps fit comfortably in the status block's
> height; seeing the full plan reduces the anxiety of "how much
> longer". Matches the `<ToolJobProgress>` pattern from the
> Research / Packager / Coach tools.

### B.3 Elapsed time

```
Elapsed: N seconds
Elapsed: N minutes, N seconds
```

**Voice note:** plain elapsed counter, no progress bar. Progress
bars on LLM jobs are a lie (the bar can't predict where the model
is); a counter is honest. Singular/plural handled at the
component level.

### B.4 Reassurance line (under the phase list)

```
This runs on our servers — you can leave this page open or close
it and come back. Your handoff will be waiting.
```

**Voice note:** load-bearing because the worker IS durable
(Inngest) — the founder really CAN navigate away. Telegraphs the
3s/30s polling without saying "polling".

### B.5 Cancel affordance

**Decision: no cancel button.** Per the brief's explicit
preference. The worker is bounded (8 research steps + two model
passes); the cost is small relative to a paid Sonnet retry; a
"Cancel" would orphan the worker mid-step and the founder would
be left with a half-written Recommendation row.

If the founder genuinely wants to abort, they close the tab. The
worker finishes, writes the Recommendation, and the founder sees
it the next time they hit the page. No copy ships.

---

## C. Synthesis succeeded — redirect transition

Polling client observes `stage='succeeded'` with a non-null
`recommendationId` on the status payload.

**Decision: instant redirect, no interstitial.**

The status block flashes a single line:
```
Done. Loading your recommendation…
```

Then `router.replace('/discovery/recommendations/${recommendationId}')`
fires immediately.

**Voice note:** an interstitial "celebration" screen would feel
fake — the founder built this, the synthesis didn't. The single
status line acknowledges completion without ceremony. `router.replace`
not `router.push` so the back button skips the Stage 5 page (going
back would be confusing — the synthesis is already done).

> **Question for review:** should the redirect carry a query param
> like `?from=stage5` so the Recommendation page can render a
> brief "fresh from synthesis" badge or scroll-to-top behaviour?
> My read: no — the page already loads top-aligned and the
> founder knows they just fired synthesis. Adding a flag means
> adding logic on the legacy page.

---

## D. Synthesis failed — error surface on the Stage 5 page

Polling client observes `stage='failed'` with a populated
`errorMessage` on the status payload.

### D.1 Status block heading (failure)

```
Synthesis didn't finish
```

**Voice note:** factual. Not "Something went wrong" (vague, smells
of corporate apology) and not "Error" (developer voice). "Didn't
finish" names what actually happened.

### D.2 Failure-reason line

The status payload's `errorMessage` is already sanitised server-side
(first line, capped 500 chars, no stack trace — see
`sanitiseErrorMessage` in `job.ts`). Render verbatim under a label:

```
What happened: <errorMessage>
```

**Voice note:** the worker's sanitiser already strips stack traces
and PII risk. We surface the message because hiding it teaches the
founder nothing — the next time it fails they're back at square
one. Most failures will be transient model errors ("Anthropic
overload", "step exceeded budget") which the founder can act on by
retrying.

### D.3 Primary recovery CTA — retry

```
Try synthesis again
```

Helper line:
```
Synthesis costs are small. Retrying is the right first move.
```

**Voice note:** "Try again" alone is generic; "Try synthesis again"
names the action. The helper telegraphs "this is cheap, don't agonise"
because some founders will hesitate to re-fire something that
costs money.

> **Question for review:** should the retry CTA have a cap (e.g.,
> "you've retried 3 times — revisit Stage 4 instead")? My read:
> no UI cap. The route-level rate limit (`AI_GENERATION`, 5/min
> per CLAUDE.md) already prevents abuse. Adding a UI cap teaches
> the founder a number they then anchor on.

### D.4 Secondary recovery CTA — revisit Stage 4

Same affordance as A.7, with adjusted helper copy for the failure
context:

```
Revisit Stage 4
```

Helper:
```
If retrying keeps failing, the inputs might need a second look.
Reopens Stage 4 for edits.
```

**Voice note:** offers an out without prescribing it. The founder
decides whether to push through or step back.

### D.5 Permanent vs transient

> **Question for review:** the brief mentions distinguishing
> transient vs permanent failure. My read: don't split the UI
> on this. The `errorMessage` already gives the founder the
> information; D.3 (retry) + D.4 (revisit) cover both paths in
> one surface. A "this is permanent" label would require the
> worker to classify errors as terminal — it doesn't, and adding
> that taxonomy is scope creep for commit #5.
>
> If the user wants split UI: define a `Stage5FailureClass` enum
> on the job row (`transient` / `permanent`), have the worker
> set it, and render different copy. Out of scope for this doc;
> calling it out for a future commit.

---

## E. Cascade-stale banner — `CASCADE` — legacy Recommendation review

Lives at the top of `/discovery/recommendations/[id]`, gated on
`lifecycleScenario === 'no_idea'` AND
`Stage5AuthoringState.requiresRederivation === true`. (Same gate
as the pre-synthesis variant in A.5, surfacing on the
post-synthesis surface.)

### E.1 Banner copy

```
Your evidence changed since this recommendation was synthesized.
You edited Stage 1, 2, 3, or 4 — the recommendation below was
built from the prior state. Re-synthesize to pull your latest
evidence in, or accept as-is if the change doesn't affect this
opportunity.
```

**Voice note:** factual, three-clause rhythm matching Stage 4's
approved cascade banner (`3.1 Cascade banner` in stage4-copy-review,
"You updated Stage 1, 2, or 3 — the evaluations below are based on
what you had before"). Names the consequence (built from prior
state) and both remediations (re-synthesize or accept as-is). The
"accept as-is" branch matters because the brief explicitly says
"Legacy /accept as-is — no extra confirmation step" — the founder
should know that path is still open.

### E.2 Re-synthesize CTA

```
Re-synthesize
```

Helper line (sits next to the button):
```
Takes ~1 minute. Replaces the recommendation below with a fresh
synthesis from your current Stage 1-4 state.
```

**Voice note:** "Replaces" is honest — re-synthesis OVERWRITES the
current Recommendation row (commit #3's worker does an upsert). The
founder needs to know the current text won't survive.

> **Question for review:** the re-synthesis kicks off the same
> Inngest worker as the initial synthesis. Does the founder stay
> on the Recommendation page during re-synthesis (with an in-page
> spinner) or get redirected back to Stage 5 to watch the
> progress? My read: redirect back to Stage 5. The same progress
> UI from B handles it natively; in-page spinning on the legacy
> review surface would require duplicating the polling client.
> Re-fire the worker, redirect to `/discovery/no-idea/[sessionId]`,
> let the dispatcher route to the Stage 5 surface, which shows
> the in-flight state.

### E.3 "Accept as-is" affordance

This is the existing legacy /accept button — no copy change. The
brief says no extra confirmation step. Call out here only for
completeness: the cascade banner does NOT block the legacy Accept
flow.

---

## F. "Alternatives considered" section — legacy Recommendation review

Gated on `lifecycleScenario === 'no_idea'` AND
`reserveOpportunities.length > 0`. Renders below the existing
Recommendation reveal sections (after `whatWouldMakeThisWrong`,
before `alternativeRejected` which is the legacy "rejected variant"
slot — different concept).

### F.1 Empty state — no reserves

**Decision: section does not render at all.** A founder whose
Stage 4 shortlist was one opportunity sees no Alternatives section
on their Recommendation. No "we considered nothing" placeholder.

**Voice note:** zero-noise. The reserves section is additive
context; rendering an empty version is just clutter.

### F.2 Section header (collapsed state)

```
Alternatives considered (N)
```

Same shape as A.4.1 (intentional — the founder recognises the
panel from pre-synthesis review). Chevron right of the count
indicates collapsibility.

### F.3 Collapsed-state preview line (under the header)

```
N opportunities I evaluated alongside this one. Click to expand.
```

**Voice note:** first-person "I" because this is the agent
describing its own work. "Click to expand" telegraphs the affordance
on first encounter; can be removed once a founder has expanded
once.

### F.4 Expanded state — per-card layout

**Decision: same card shape as A.4.4** — identical four rows
(`Agent verdict` / `Your verdict` / `Layer A` / `Layer B`). Rationale:
the founder learned this shape on the pre-synthesis review; reusing
it teaches one card. Different shape here would make them re-learn.

The card header line and row labels are bit-identical to A.4.4. No
need to re-spec them — see A.4.4.

### F.5 Per-card secondary action — "Open in Stage 4"

```
View in Stage 4
```

**Voice note:** A.4 explicitly suppresses per-card drilldowns
(only a page-level Revisit link). The post-synthesis context is
different — the founder is one page away from accepting the
recommendation and may want to verify a specific reserve before
committing. Per-card links earn their weight here.

> **Question for review:** should "View in Stage 4" deep-link to
> the specific OpportunityEvaluation (scroll-to-id pattern), or
> just land on the Stage 4 surface? My read: deep-link by id.
> The Stage 4 document view already renders all opportunities;
> scrolling to the specific one is a one-liner with a URL hash.

### F.6 Collapsed-by-default behaviour

The brief specifies "closed by default" — implementation note,
not copy. Mirrors how the legacy `VersionHistoryPanel` collapses
on first render.

---

## G. "Revisit Stage 4" affordance — legacy Recommendation review

Gated on `lifecycleScenario === 'no_idea'`. Visible regardless of
cascade state (the founder may want to revisit even when the data
hasn't changed).

### G.1 Placement

Sidebar of the Recommendation review surface, below the existing
"Past recommendations" link in the header bar (see
`recommendation/page.tsx:93-107`). Same secondary-link styling.

**Voice note:** the brief offered sidebar / footer / near-Accept
as options. My read: header sibling to "Past recommendations" — it
behaves like a navigation breadcrumb back to the source artifact,
which is exactly what "Past recommendations" already is.

### G.2 Link copy

```
Revisit Stage 4
```

**Voice note:** identical to A.7 and A.5.1 (one verb, one
destination — the founder learns one phrase).

### G.3 Click behaviour

> **Question for review:** confirmation modal first, or direct
> navigation? My read: **direct navigation**, same as A.7. The
> founder is reviewing — clicking "Revisit Stage 4" is a
> navigation, not a commit. If the founder wanted destructive
> behaviour (e.g., "revert this recommendation"), that's a
> separate affordance we haven't designed and shouldn't backdoor
> through this link.
>
> Modal would arguably be warranted IF revisiting Stage 4 deletes
> the synthesized Recommendation. It doesn't — the Recommendation
> row persists; revisiting Stage 4 lets the founder edit the
> inputs and then re-fire synthesis from E.2.

---

## H. Server-side error messages — accept-and-queue route

These come from `HttpError(status, message)` in the Stage 5
synthesize route (commit #3) and surface in the founder's UI if
the POST fails before the worker is enqueued. Realistically
founder-visible ones:

### H.1 Re-fire while in flight

The accept-and-queue route's idempotency check (`findOpenStage5Job`)
returns the in-flight job ID rather than 4xx, so the founder
shouldn't see an error here. Calling out for completeness — no
copy needed.

### H.2 Stage 4 not committed

```
Stage 4 must be committed before you can fire the handoff.
```

**Voice note:** mirrors Stage 3's approved `Commit Stage 1 and
Stage 2 first — the Pain Scout reads them as input.` Names which
upstream gate is missing.

### H.3 Cascade-stale at fire time

```
Your evidence changed — revisit Stage 4 before firing the handoff.
```

**Voice note:** the route's defence-in-depth check (the UI banner
in A.5 should have caught it first). Honest about why and what
to do.

### H.4 Synthesis bridge threw (worker fails before persisting)

This isn't a route error — the worker writes failure to the job
row and the polling client surfaces it via D. No HTTP error copy
needed.

---

## How to mark up

Three options per item — same shape as the Stage 3 / Stage 4
reviews:

1. **Approve** — leave the current wording.
2. **Replace** — write the new wording inline (`→ new text`).
3. **Defer** — mark `(defer)` and we'll revisit before launch.

The `> **Question for review:**` blocks are calls I want to make
explicitly — they're not "needs more design" markers, they're
"here's my read, push back if you disagree" markers. Answer each
with **Confirm** (go with my read) or **Override** (replace with
your choice).

After approval, I'll fold the edits into commit #5 (the UI build)
directly — no separate copy-pass commit, because the strings
ship inline with the components rather than as a post-hoc patch.
