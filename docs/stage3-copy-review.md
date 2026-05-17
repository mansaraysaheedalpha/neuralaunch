# Stage 3 Copy Review

Consolidated index of every founder-visible string introduced by the
Stage 3 (Opportunity Identification) commits (`d9abac7` backend +
`43cbf4f` UI). Use this doc to approve / rewrite. After approval I'll
land all edits in one `fix(ideation): Stage 3 copy pass` commit, then
push the batch.

Conventions:
- **Current** — what ships today (placeholder draft).
- **Voice note** — quick tone observation from me; ignore if irrelevant.
- File refs use `path:line`.

Skipped:
- Agent prompts in `lib/ideation/stage3-opportunities/calibration-prompts.ts`
  (these shape the model's output but the founder never reads them
  literally; if you want a prompt-tone pass we can do that separately).
- Aria-labels and dev-only console / log strings.

---

## 1. Stage 3 Banner — the framing the founder sees on first entry

File: [Stage3Banner.tsx](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage3Banner.tsx)

**1.1 Banner label** — [Stage3Banner.tsx:51](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage3Banner.tsx#L51)
```
Stage 3 of 5 — Opportunity Identification
```

**1.2 Banner body** — [Stage3Banner.tsx:54](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage3Banner.tsx#L54)
```
Time to find real pain worth solving. Add pain points you've hit
yourself, lived with through someone close, or watched an industry
struggle with — your own life is the strongest signal. The Pain Scout
will surface community signals you might not have seen; treat its
picks as a check on yourself, not the answer. Rate what survives on
intensity, frequency, and niche specificity. We'll shortlist up to
five for Stage 4.
```
Voice note: longer than Stage 2's intro paragraph. The "your own life
is the strongest signal" line is load-bearing — it sets the Troy-
framework primacy. "We'll" vs "I'll" is inconsistent with Stage 2
which used "I" (the agent). Tighten to one or the other?

**1.3 Dismiss button aria** — [Stage3Banner.tsx:60](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage3Banner.tsx#L60)
```
Dismiss Stage 3 intro
```

---

## 2. Stage 3 Chat — surface around the canvas

File: [Stage3Chat.tsx](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage3Chat.tsx)

**2.1 First-turn greeting** — [Stage3Chat.tsx:86](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage3Chat.tsx#L86)
```
{firstName ? `${firstName}, this is where we hunt.` : 'This is where we hunt.'}
```
Voice note: deliberately blunt to match Troy's "hunt for pain" framing.
Could feel macho/aggressive — alternative: "this is where we look for
pain worth solving." Approve or replace?

**2.2 Empty-chat hint (right rail)** — [Stage3Chat.tsx:112](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage3Chat.tsx#L112)
```
Talk to the agent here. It will probe vague pain points, ground
over-stated ones, recommend founder homework, and call out when you
have enough to compose the shortlist.
```
Voice note: this is descriptive scaffolding text — fine for now but
could be trimmed once founders know the loop. "Founder homework" is
internal jargon; "real-world action" might be plainer.

**2.3 Composer input placeholder** — [Stage3Chat.tsx:128](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage3Chat.tsx#L128)
```
Tell me what hurts — yours or theirs.
Session ended.   (terminated state)
```
Voice note: "yours or theirs" is good shorthand for the
self-vs-observed split. "Session ended." is a hard stop; Stage 2 uses
the identical string so consistency is preserved.

---

## 3. Pain Inventory Canvas — the main surface

File: [PainInventoryCanvas.tsx](client/src/components/ideation/stage3/PainInventoryCanvas.tsx)

**3.1 Cascade banner (Stage 1/2 was edited)** — [PainInventoryCanvas.tsx:68](client/src/components/ideation/stage3/PainInventoryCanvas.tsx#L68)
```
An upstream stage was updated — the inventory below is stale. Re-run
the Pain Scout against your fresh Outcome + Requirements, or add your
own pain points to rebuild.
```
Voice note: "upstream stage" is technical. Founder-facing alt:
"You updated Stage 1 or Stage 2 — the picks below are based on what
you had before."

**3.2 Readiness row, not yet ready** — [PainInventoryCanvas.tsx:181-184](client/src/components/ideation/stage3/PainInventoryCanvas.tsx#L181)
```
You have N rated pain points. Compose unlocks at 3.
```

**3.3 Readiness row, ready** — [PainInventoryCanvas.tsx:176-179](client/src/components/ideation/stage3/PainInventoryCanvas.tsx#L176)
```
You have N rated pain points — ready to compose. Up to 5 will make
the shortlist.
```

**3.4 Pain Scout section heading + hint** — [PainInventoryCanvas.tsx:80-83](client/src/components/ideation/stage3/PainInventoryCanvas.tsx#L80)
```
Pain Scout
Optional query — leave empty and I'll scout against your committed
Outcome + Requirements.
```

**3.5 Pain Scout query placeholder** — [PainInventoryCanvas.tsx:91](client/src/components/ideation/stage3/PainInventoryCanvas.tsx#L91)
```
e.g. WhatsApp customer support pain for small businesses
```
Voice note: WhatsApp + small biz is a fine concrete example — keep,
or pick a more neutral one ("freelance bookkeeping for solo
contractors")?

**3.6 Run counter + cap label** — [PainInventoryCanvas.tsx:95-97](client/src/components/ideation/stage3/PainInventoryCanvas.tsx#L95)
```
Runs: N / 5
(at cap)   — appears when N === 5
```

**3.7 Run scout button labels** — [PainInventoryCanvas.tsx:101](client/src/components/ideation/stage3/PainInventoryCanvas.tsx#L101)
```
Scouting…   (in flight)
Run scout   (idle)
```

**3.8 Agent column heading + hint** — [PainInventoryCanvas.tsx:109-111](client/src/components/ideation/stage3/PainInventoryCanvas.tsx#L109)
```
Agent-surfaced
From community signals. Push back on what the agent got wrong; rate
what survives.
```

**3.9 Agent column empty state** — [PainInventoryCanvas.tsx:116](client/src/components/ideation/stage3/PainInventoryCanvas.tsx#L116)
```
No agent picks yet. Run the scout above.
```

**3.10 Founder column heading + hint** — [PainInventoryCanvas.tsx:134-136](client/src/components/ideation/stage3/PainInventoryCanvas.tsx#L134)
```
Your own
From your life, the people you know, or industries you watch —
usually the strongest signal.
```

---

## 4. Pain Point Card — single entry

File: [PainPointCard.tsx](client/src/components/ideation/stage3/PainPointCard.tsx)

**4.1 Source chip** — [PainPointCard.tsx:72](client/src/components/ideation/stage3/PainPointCard.tsx#L72)
```
You added       (founder source)
Agent surfaced  (agent source)
```

**4.2 Agent-suggested score label** — [PainPointCard.tsx:119](client/src/components/ideation/stage3/PainPointCard.tsx#L119)
```
Agent suggested:
```
Plus the numeric breakdown `i=N · f=N · n=N (reasoning)` — that's
data, not copy.

**4.3 Combined score label** — [PainPointCard.tsx:148](client/src/components/ideation/stage3/PainPointCard.tsx#L148)
```
Combined: NN
(unsaved)   — appears when slider doesn't match persisted score
```

**4.4 Pushback toggle** — [PainPointCard.tsx:163](client/src/components/ideation/stage3/PainPointCard.tsx#L163)
```
Hide pushback   (open state)
Push back       (closed state)
```

**4.5 Rate button labels** — [PainPointCard.tsx:173](client/src/components/ideation/stage3/PainPointCard.tsx#L173)
```
Saving…         (in flight)
Update rating   (already rated)
Rate this       (not yet rated)
```

**4.6 Source-link label** — [PainPointCard.tsx:98](client/src/components/ideation/stage3/PainPointCard.tsx#L98)
```
source
```
(With external-link icon next to it.)

**4.7 Remove-button aria** — [PainPointCard.tsx:109](client/src/components/ideation/stage3/PainPointCard.tsx#L109)
```
Remove pain point
```

**4.8 Card-level error fallbacks** (only show on action failure):
- [PainPointCard.tsx:49](client/src/components/ideation/stage3/PainPointCard.tsx#L49) — `Could not save score`
- [PainPointCard.tsx:61](client/src/components/ideation/stage3/PainPointCard.tsx#L61) — `Could not remove`

---

## 5. Score Row — slider per axis

File: [ScoreRow.tsx](client/src/components/ideation/stage3/ScoreRow.tsx) (axis labels live in [labels.ts](client/src/components/ideation/stage3/labels.ts))

**5.1 Axis labels + hints** — [labels.ts:21-31](client/src/components/ideation/stage3/labels.ts#L21)
```
Intensity         — How much does it hurt the people who have it?
Frequency         — How often do they hit it?
Niche specificity — How concentrated in a specific group is the pain?
```
Voice note: directly mirrors Troy's framework. The hints are the
clearest place to invest in plain-language polish — they show every
turn for every card.

---

## 6. Founder Pain Point Form — Human Scout entry

File: [FounderPainPointForm.tsx](client/src/components/ideation/stage3/FounderPainPointForm.tsx)

**6.1 Form heading + hint** — [FounderPainPointForm.tsx:63-66](client/src/components/ideation/stage3/FounderPainPointForm.tsx#L63)
```
Add your own pain point
Your own life is the strongest signal. Add a pain you, someone close
to you, or your industry actually hits.
```

**6.2 Description field** — [FounderPainPointForm.tsx:71](client/src/components/ideation/stage3/FounderPainPointForm.tsx#L71) + placeholder [78](client/src/components/ideation/stage3/FounderPainPointForm.tsx#L78)
```
What is the pain?
Placeholder: One concrete frustration — keep it specific.
```

**6.3 Context picker** — [FounderPainPointForm.tsx:84-91](client/src/components/ideation/stage3/FounderPainPointForm.tsx#L84)
```
Where did this come from?
Default option: Choose one…
```

**6.4 Context options (centralised labels)** — [labels.ts:8-13](client/src/components/ideation/stage3/labels.ts#L8)
```
My own life
Someone close to me
Industry I observe
Gap in an existing tool
```

**6.5 Notes field** — [FounderPainPointForm.tsx:99](client/src/components/ideation/stage3/FounderPainPointForm.tsx#L99) + placeholder [106](client/src/components/ideation/stage3/FounderPainPointForm.tsx#L106)
```
Notes (optional)
Placeholder: Who hits this, when, what they've tried — anything useful for later.
```

**6.6 Submit button labels + aria** — [FounderPainPointForm.tsx:60,116](client/src/components/ideation/stage3/FounderPainPointForm.tsx#L60)
```
Aria-label: Add a pain point you sourced yourself
Adding…       (in flight)
Add pain point (idle)
```

**6.7 Error fallback** — [FounderPainPointForm.tsx:51](client/src/components/ideation/stage3/FounderPainPointForm.tsx#L51)
```
Could not add pain point
```

**6.8 Status labels (currently unused in UI but exported)** — [labels.ts:15-19](client/src/components/ideation/stage3/labels.ts#L15)
```
Not rated   (pending_rating)
Rated       (rated)
Rejected    (rejected_by_founder)
```

---

## 7. Pain Point Pushback Drawer — per-card score debate

File: [PainPointPushbackDrawer.tsx](client/src/components/ideation/stage3/PainPointPushbackDrawer.tsx)

**7.1 Drawer header + close aria** — [PainPointPushbackDrawer.tsx:76,80](client/src/components/ideation/stage3/PainPointPushbackDrawer.tsx#L76)
```
Header:     Push back on the agent's scores
Close aria: Close pushback drawer
```

**7.2 Round-history role tags** — [PainPointPushbackDrawer.tsx:95,98](client/src/components/ideation/stage3/PainPointPushbackDrawer.tsx#L95)
```
you:
agent:
```

**7.3 Reply placeholder** — [PainPointPushbackDrawer.tsx:113](client/src/components/ideation/stage3/PainPointPushbackDrawer.tsx#L113)
```
What is the agent getting wrong about these scores?
```

**7.4 Round counter** — [PainPointPushbackDrawer.tsx:118](client/src/components/ideation/stage3/PainPointPushbackDrawer.tsx#L118)
```
Round N of 5
```

**7.5 Send button** — [PainPointPushbackDrawer.tsx:121](client/src/components/ideation/stage3/PainPointPushbackDrawer.tsx#L121)
```
Sending…   (in flight)
Send       (idle)
```

**7.6 Closed-drawer notice** — [PainPointPushbackDrawer.tsx:129](client/src/components/ideation/stage3/PainPointPushbackDrawer.tsx#L129)
```
Pushback closed. Rate the pain point with the slider above if you
accept the current scores, or remove it from the inventory.
```
Voice note: appears when the engine closes the round OR when the
hard-cap (5 rounds) is reached. Same string for both — fine.

**7.7 Error fallback** — [PainPointPushbackDrawer.tsx:68](client/src/components/ideation/stage3/PainPointPushbackDrawer.tsx#L68)
```
Pushback round failed
```

---

## 8. Pain Inventory Document — committed-artifact review surface

File: [PainInventoryDocumentView.tsx](client/src/components/ideation/stage3/PainInventoryDocumentView.tsx)

**8.1 Eyebrow label** — [PainInventoryDocumentView.tsx:62](client/src/components/ideation/stage3/PainInventoryDocumentView.tsx#L62)
```
Committed · Pain Inventory          (after commit)
Pre-commit review · Pain Inventory  (before commit)
```
Voice note: matches Stage 2 review-surface eyebrow shape. Keep
consistent.

**8.2 Page heading** — [PainInventoryDocumentView.tsx:64-66](client/src/components/ideation/stage3/PainInventoryDocumentView.tsx#L64)
```
Your pain inventory — Stage 3 of 5
```

**8.3 Recommended actions section header** — [PainInventoryDocumentView.tsx:73](client/src/components/ideation/stage3/PainInventoryDocumentView.tsx#L73)
```
Recommended actions
```

**8.4 Action severity chips** — [PainInventoryDocumentView.tsx:86](client/src/components/ideation/stage3/PainInventoryDocumentView.tsx#L86)
```
Strongly advised
Suggested
```

**8.5 Action footer (founder's prior response)** — [PainInventoryDocumentView.tsx:94](client/src/components/ideation/stage3/PainInventoryDocumentView.tsx#L94)
```
You said: <text>
```

**8.6 Action-error fallback** — [PainInventoryDocumentView.tsx:49](client/src/components/ideation/stage3/PainInventoryDocumentView.tsx#L49)
```
Could not commit (HTTP N)
```

**8.7 Footer buttons** — [PainInventoryDocumentView.tsx:115,119,123](client/src/components/ideation/stage3/PainInventoryDocumentView.tsx#L115)
```
Save and come back            (left, ghost button)
I'm ready for Stage 4         (right, primary when output_ready)
Committed · Stage 4 coming soon (right, after commit)
```
Voice note: parallels Stage 2's `I'm ready for Stage 3`. The "coming
soon" line is the seam where the product runs out of road — wording
intentionally honest. Could be tightened.

---

## 9. Shortlist View — the shortlist + rules-out + rejected list

File: [ShortlistView.tsx](client/src/components/ideation/stage3/ShortlistView.tsx)

**9.1 Section header + sub-line** — [ShortlistView.tsx:27-31](client/src/components/ideation/stage3/ShortlistView.tsx#L27)
```
Shortlist (N of up to 5)
Ranked by combined score (intensity × frequency × niche). Stage 4
will deepen each.
```

**9.2 Rules-out section header** — [ShortlistView.tsx:51](client/src/components/ideation/stage3/ShortlistView.tsx#L51)
```
Why these and not the others
```

**9.3 Rules-out empty state** — [ShortlistView.tsx:54](client/src/components/ideation/stage3/ShortlistView.tsx#L54)
```
No exclusions written.
```

**9.4 Considered-but-rejected section header** — [ShortlistView.tsx:61-62](client/src/components/ideation/stage3/ShortlistView.tsx#L61)
```
Considered but not shortlisted (N)
```

**9.5 Per-row summary score label** — [ShortlistView.tsx:88-90](client/src/components/ideation/stage3/ShortlistView.tsx#L88)
```
combined N   (when rated)
unrated      (no score)
```

**9.6 Source-link label** — [ShortlistView.tsx:116](client/src/components/ideation/stage3/ShortlistView.tsx#L116)
```
source
```
(Same as 4.6 for consistency.)

---

## 10. Stage Beyond Placeholder — Stage 4+ not built yet

File: [StageBeyondPlaceholder.tsx](client/src/app/(app)/discovery/no-idea/[sessionId]/StageBeyondPlaceholder.tsx)

**10.1 Eyebrow + heading + body** — [StageBeyondPlaceholder.tsx:19-29](client/src/app/(app)/discovery/no-idea/[sessionId]/StageBeyondPlaceholder.tsx#L19)
```
Eyebrow:  Stage N of 5
Heading:  We're still building this stage
Body:     You've committed everything available so far. The remaining
          stages — where we deepen each shortlisted pain into a
          concrete opportunity and hand off to execution — are under
          construction. We'll email you the moment they're live.
Button:   Return to your ventures
```
Voice note: this was added by an earlier commit, not Stage 3 itself,
but it surfaces directly after a Stage 3 commit until Stage 4 ships.
Worth touching if "we'll email you the moment they're live" isn't a
commitment we want to make (no email pipeline wired yet — soft promise).

---

## 11. Hook-level error fallbacks — surfaced in the chat error bar

File: [useStage3Session.ts](client/src/app/(app)/discovery/no-idea/[sessionId]/useStage3Session.ts)

Strings the hook generates when a fetch fails (the chat renders them
in the top error bar):

- **[useStage3Session.ts:132](client/src/app/(app)/discovery/no-idea/[sessionId]/useStage3Session.ts#L132)** — `Session terminated`
- **[useStage3Session.ts:141](client/src/app/(app)/discovery/no-idea/[sessionId]/useStage3Session.ts#L141)** — `Server returned N`
- **[useStage3Session.ts:147](client/src/app/(app)/discovery/no-idea/[sessionId]/useStage3Session.ts#L147)** — `Server returned N`
- **[useStage3Session.ts:169](client/src/app/(app)/discovery/no-idea/[sessionId]/useStage3Session.ts#L169)** — `Stream interrupted`
- **[useStage3Session.ts:215](client/src/app/(app)/discovery/no-idea/[sessionId]/useStage3Session.ts#L215)** — `Pain scout run failed`

Voice note: these are technical fallbacks — the route's own `error`
string wins when present. Only show when something truly broke. Fine
to leave as-is unless we want a unified founder-friendly tone.

---

## 12. Server-side error messages (surface to client as `data.error`)

These come from `HttpError(status, message)` in the Stage 3 routes
and land in the chat's red error bar (or the form's inline error).

### pain-scout-run/route.ts

- **[L59](client/src/app/api/ideation/stage-runs/[id]/pain-scout-run/route.ts#L59)** — `Invalid JSON`
- **[L61](client/src/app/api/ideation/stage-runs/[id]/pain-scout-run/route.ts#L61)** — `Invalid body`
- **[L64](client/src/app/api/ideation/stage-runs/[id]/pain-scout-run/route.ts#L64)** — `Not a Stage 3 run`
- **[L66](client/src/app/api/ideation/stage-runs/[id]/pain-scout-run/route.ts#L66)** — `Stage 3 row is not in authoring state`
- **[L72](client/src/app/api/ideation/stage-runs/[id]/pain-scout-run/route.ts#L72)** — `Pain Scout run cap reached (5) for this stage`
- **[L83](client/src/app/api/ideation/stage-runs/[id]/pain-scout-run/route.ts#L83)** — `Stage 1 + Stage 2 must be committed before Stage 3 scouting`
- **[L87](client/src/app/api/ideation/stage-runs/[id]/pain-scout-run/route.ts#L87)** — `Stage 1 outcome failed to parse`
- **[L88](client/src/app/api/ideation/stage-runs/[id]/pain-scout-run/route.ts#L88)** — `Stage 2 requirements failed to parse`

### founder-pain-point/route.ts

- **L80, L120, L188** — `Invalid JSON`
- **L82, L122, L189** — `Invalid body`
- **L85, L126, L193** — `Not a Stage 3 run`
- **L87, L128, L195** — `Stage 3 row is not in authoring state`
- **[L133](client/src/app/api/ideation/stage-runs/[id]/founder-pain-point/route.ts#L133)** — `Pain point not found`
- **[L141](client/src/app/api/ideation/stage-runs/[id]/founder-pain-point/route.ts#L141)** — `Only founder-sourced pain points are editable`

### pain-point-pushback/route.ts

- **[L57, L60](client/src/app/api/ideation/stage-runs/[id]/pain-point-pushback/route.ts#L57)** — `Invalid JSON` / `Invalid body`
- **[L63](client/src/app/api/ideation/stage-runs/[id]/pain-point-pushback/route.ts#L63)** — `Not a Stage 3 run`
- **[L65](client/src/app/api/ideation/stage-runs/[id]/pain-point-pushback/route.ts#L65)** — `Stage 3 row is not in authoring state`
- **[L70](client/src/app/api/ideation/stage-runs/[id]/pain-point-pushback/route.ts#L70)** — `Pain point not found`
- **[L73](client/src/app/api/ideation/stage-runs/[id]/pain-point-pushback/route.ts#L73)** — `Pain point pushback version mismatch`
- **[L80](client/src/app/api/ideation/stage-runs/[id]/pain-point-pushback/route.ts#L80)** — `Pain point has no agent-suggested scores to push back on`
- **[L85](client/src/app/api/ideation/stage-runs/[id]/pain-point-pushback/route.ts#L85)** — `Pushback cap reached for this pain point`

Voice note: these read as developer-grade error text ("Not a Stage 3
run", "row is not in authoring state"). The first two never reach a
real user — only a stale tab firing on a closed row hits them. The
ones a founder might actually see:
- `Pain Scout run cap reached (5) for this stage`
- `Stage 1 + Stage 2 must be committed before Stage 3 scouting`
- `Only founder-sourced pain points are editable`
- `Pain point has no agent-suggested scores to push back on`
- `Pushback cap reached for this pain point`

Those five are the realistic targets for a friendlier rewrite. The
rest can stay technical as long as the chat's red bar treats them as
"something went wrong" not "founder-readable copy."

---

## How to mark up

Three options for each item:
1. **Approve** — leave the current wording.
2. **Replace** — write the new wording inline (`→ new text`).
3. **Defer** — mark `(defer)` and we'll revisit before launch.

I'll do a pass with your edits and land them all in one commit, then
push the stacked batch.
