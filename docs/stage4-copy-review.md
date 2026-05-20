# Stage 4 Copy Review

Consolidated index of every founder-visible string in the Stage 4
UI surfaces. Same shape as the Stage 3 copy review — mark each
item **Approve** / **Replace** / **Defer**.

Two areas flagged for **extra eyes** (per the kickoff brief):

1. **Empty-state copy** — what the founder sees BEFORE Layer A runs
   and BEFORE any community responses arrive. Per-opportunity,
   per-layer. Marked `EMPTY` below.
2. **Vision-extractor error states** — moderation rejection,
   moderation-call failure, extraction failure, unparseable.
   Founders WILL hit these in real testing; copy needs to be honest
   + actionable, not apologetic-vague. Marked `ERROR` below.

After approval, I'll land all edits in one `fix(ideation): Stage 4
copy pass` commit. Skipped: agent prompts in
`lib/ideation/stage4-opportunities/calibration-prompts.ts` (founders
see model output, not the prompt itself — separate prompt-tone
pass if needed) and aria/dev-only strings.

---

## 1. Stage 4 Banner — first-entry framing

File: [Stage4Banner.tsx](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage4Banner.tsx)

**1.1 Banner label** — [Stage4Banner.tsx:48](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage4Banner.tsx#L48)
```
Stage 4 of 5 — Opportunity Evaluation
```

**1.2 Banner body** — [Stage4Banner.tsx:52](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage4Banner.tsx#L52)
```
Time to put your shortlisted pain points to the test. For each
opportunity, I'll research four dimensions (market reality,
customer access, willingness to pay, market size) — that's Layer A.
Then you post a test script on your own accounts and bring back
what real people say — that's Layer B. Both layers feed a verdict
you can push back on. We'll advance the strongest one to Stage 5.
```
**Voice note:** longest banner in the pipeline because it has to
introduce both layers in one breath. Consider whether "We'll
advance" should be "I'll advance" (Stage 3 banner uses "I'll
shortlist" per your earlier markup).

**1.3 Dismiss aria** — [Stage4Banner.tsx:55](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage4Banner.tsx#L55)
```
Dismiss Stage 4 intro
```

---

## 2. Stage 4 Chat — surface around the canvas

File: [Stage4Chat.tsx](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage4Chat.tsx)

**2.1 First-turn greeting** — [Stage4Chat.tsx:82](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage4Chat.tsx#L82)
```
{firstName}, time to test these.
Time to test these.
```
**Voice note:** intentionally short — Stage 3 used "this is where
we look for pain worth solving" which is direct. Want something
similarly grounded? "Time to test these" is action-leaning; could
also be "let's see what holds up" or "now we put these to real
people."

**2.2 Empty-chat hint (right rail)** — [Stage4Chat.tsx:102](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage4Chat.tsx#L102)
```
Talk to me here about what you're finding. I'll probe gaps, ground
over-confidence, recommend specific real-world actions, and tell
you when you have enough to compose.
```
**Voice note:** mirrors the Stage 3 hint pattern (uses "me" + "I'll").

**2.3 Composer placeholder** — [Stage4Chat.tsx:121](client/src/app/(app)/discovery/no-idea/[sessionId]/Stage4Chat.tsx#L121)
```
Tell me what's coming back from the communities.
Session ended.
```

---

## 3. Opportunity Inventory Canvas — main surface

File: [OpportunityInventoryCanvas.tsx](client/src/components/ideation/stage4/OpportunityInventoryCanvas.tsx)

**3.1 Cascade banner (upstream edit invalidated the work)** — [L60](client/src/components/ideation/stage4/OpportunityInventoryCanvas.tsx#L60)
```
You updated Stage 1, 2, or 3 — the evaluations below are based on
what you had before. Re-run Layer A on each opportunity, or commit
again to start fresh.
```
**Voice note:** honest about which upstream changed; actionable.
The Stage 3 cascade banner you approved was similar shape.

**3.2 EMPTY — no opportunities to evaluate** — [L66](client/src/components/ideation/stage4/OpportunityInventoryCanvas.tsx#L66)
```
No opportunities to evaluate yet. This usually means Stage 3
hasn't committed.
```
Should rarely surface in practice (the Stage 3 commit auto-creates
Stage 4 row + seeds opps) — but real founder-facing if Stage 3 was
left in an output_ready limbo.

**3.3 Readiness row — ready** — [L107](client/src/components/ideation/stage4/OpportunityInventoryCanvas.tsx#L107)
```
You have N opportunities with a verdict — ready to compose.
```

**3.4 Readiness row — not yet ready** — [L110](client/src/components/ideation/stage4/OpportunityInventoryCanvas.tsx#L110)
```
You have N verdicts. Compose unlocks at 1.
```

---

## 4. Opportunity Card — collapsed row

File: [OpportunityCard.tsx](client/src/components/ideation/stage4/OpportunityCard.tsx)

**4.1 Verdict chip (inline status row)** — [L53](client/src/components/ideation/stage4/OpportunityCard.tsx#L53)
```
agent={pending | Pursue | With caveats | Drop}, you={pending | Pursue | With caveats | Drop}
```
**Voice note:** dense for the canvas where founders scan multiple
rows. Could replace `agent=` with `Agent:`. The em-dash separator
is `·` (middle dot) elsewhere in the codebase.

**4.2 Status chip labels** — from [labels.ts:21-27](client/src/components/ideation/stage4/labels.ts#L21)
```
Awaiting research
Awaiting engagement
Engagement in progress
Evaluated
Dropped
```
**Voice note:** these chips repeat every row + show in the
collapsed canvas. Worth a careful pass.

---

## 5. Layer A section — agent research

File: [LayerASection.tsx](client/src/components/ideation/stage4/LayerASection.tsx)

**5.1 Section header + description** — [L27-31](client/src/components/ideation/stage4/LayerASection.tsx#L27)
```
Layer A — agent research
Four dimensions across Tavily + Exa + community sources. Runs in ~30 seconds.
```
**Voice note:** mentions tooling by name; could simplify to "Runs
in ~30 seconds against community signals + web sources." The "Tavily
+ Exa" naming is internal jargon.

**5.2 Run / re-run button** — [L40-49](client/src/components/ideation/stage4/LayerASection.tsx#L40)
```
Run research
Re-run
Researching…
```

**5.3 Dimension labels + hints** — [labels.ts:36-47](client/src/components/ideation/stage4/labels.ts#L36)
```
Market reality   — Does this pain exist beyond your own bubble?
Customer access  — Can you reach the people who feel it?
Will people pay  — Is anyone paying for related solutions today?
Market size      — Order-of-magnitude check on who hits this.
```
**Voice note:** these are load-bearing. The hints surface on every
DimensionFindingCard, every opportunity. They're how the founder
learns the framework. Worth careful eyes — the Stage 3 score-axis
hints got polish in your earlier markup (e.g., "How narrow is the
group that feels it?").

**5.4 EMPTY — dimension not researched yet** — [DimensionFindingCard.tsx:42](client/src/components/ideation/stage4/DimensionFindingCard.tsx#L42)
```
Not researched yet. Run Layer A on this opportunity to surface findings here.
```
Shown per-dimension before Layer A runs. The founder sees 4 of
these per opportunity in the initial state.

---

## 6. Layer B section — community engagement

File: [LayerBSection.tsx](client/src/components/ideation/stage4/LayerBSection.tsx)

**6.1 Section header + description** — [L28-31](client/src/components/ideation/stage4/LayerBSection.tsx#L28)
```
Layer B — community engagement
You post the script below on your own accounts, then bring back
what real people said. Text snippets or screenshots both work.
```
**Voice note:** load-bearing because it teaches the founder-runs-it
policy. "On your own accounts" + "you post" matter — these aren't
optional.

**6.2 Aggregate signal summary** — [L73](client/src/components/ideation/stage4/LayerBSection.tsx#L73)
```
Aggregate: Strong · 5 positive · 2 neutral · 1 negative
```

---

## 7. Test Script Viewer — Layer B test script

File: [TestScriptViewer.tsx](client/src/components/ideation/stage4/TestScriptViewer.tsx)

**7.1 EMPTY — no script generated yet** — [L41](client/src/components/ideation/stage4/TestScriptViewer.tsx#L41)
```
No test script generated yet. Generate one to start engaging with real communities.
```

**7.2 Generate button labels** — [L52, L120](client/src/components/ideation/stage4/TestScriptViewer.tsx#L52)
```
Generate test script
Generating…
Regenerate script
Regenerating…
```

**7.3 Section headers** — [L62, L74, L94](client/src/components/ideation/stage4/TestScriptViewer.tsx#L62)
```
Suggested platforms
Post wording
Follow-up questions
```

**7.4 Copy affordance** — [L83](client/src/components/ideation/stage4/TestScriptViewer.tsx#L83)
```
Copy
Copied
```

---

## 8. Community Response Uploader

File: [CommunityResponseUploader.tsx](client/src/components/ideation/stage4/CommunityResponseUploader.tsx)

**8.1 Mode tabs** — [L116-117](client/src/components/ideation/stage4/CommunityResponseUploader.tsx#L116)
```
Paste text
Upload screenshot
```

**8.2 Text textarea placeholder** — [L124](client/src/components/ideation/stage4/CommunityResponseUploader.tsx#L124)
```
Paste the comment text you got back. Keep handles in if they were visible.
```

**8.3 Dropzone hint** — [L154](client/src/components/ideation/stage4/CommunityResponseUploader.tsx#L154)
```
Click to upload a screenshot (PNG / JPEG / WebP, up to 8 MB)
Uploading…
```

**8.4 ERROR — file-type rejection** — [L77](client/src/components/ideation/stage4/CommunityResponseUploader.tsx#L77)
```
Only PNG, JPEG, or WebP screenshots are supported.
```

**8.5 ERROR — size cap** — [L81](client/src/components/ideation/stage4/CommunityResponseUploader.tsx#L81)
```
Screenshot is too large (max 8 MB).
```

**8.6 ERROR — S3 PUT failure** — [L93](client/src/components/ideation/stage4/CommunityResponseUploader.tsx#L93)
```
Upload failed (HTTP N). Try again, or paste the comments as text.
```

**8.7 Add-text button** — [L131](client/src/components/ideation/stage4/CommunityResponseUploader.tsx#L131)
```
Add text response
Saving…
```

---

## 9. Response Gallery — captured responses

File: [ResponseGallery.tsx](client/src/components/ideation/stage4/ResponseGallery.tsx)

**9.1 EMPTY — no responses captured yet** — [L23](client/src/components/ideation/stage4/ResponseGallery.tsx#L23)
```
No responses captured yet. Post the script above on your own
accounts and paste replies or upload screenshots back here.
```

**9.2 In-progress label (vision pipeline running)** — [ExtractionProgress.tsx:16](client/src/components/ideation/stage4/ExtractionProgress.tsx#L16)
```
Reading your screenshot…
```

**9.3 ERROR — moderation call failed** — [ResponseGallery.tsx:127](client/src/components/ideation/stage4/ResponseGallery.tsx#L127)
```
We couldn't check this screenshot.
The moderation service threw an error. Try uploading again in a moment.
```

**9.4 ERROR — extraction failed after safe moderation** — [L130](client/src/components/ideation/stage4/ResponseGallery.tsx#L130)
```
We couldn't read this screenshot.
Extraction failed after the safety check passed. Try a clearer
screenshot or paste the comments as text.
```

**9.5 ERROR — moderation rejected the image** — [L133](client/src/components/ideation/stage4/ResponseGallery.tsx#L133)
```
Screenshot rejected.
<reason from the model — e.g. "Appears to be an unrelated personal photo">
```
Reason comes verbatim from Haiku's `safe=false` output (we
instructed the model to return a one-sentence reason).

**9.6 ERROR — fallback (no reason captured)** — [L136](client/src/components/ideation/stage4/ResponseGallery.tsx#L136)
```
Screenshot not processed.
Try a different screenshot or paste the comments as text.
```

**9.7 Screenshot summary line** — [L100-110](client/src/components/ideation/stage4/ResponseGallery.tsx#L100)
```
<platform> · N comments · N contradictions
<unparseableNotes if present>
```

**9.8 No-comments edge case** — [L94](client/src/components/ideation/stage4/ResponseGallery.tsx#L94)
```
Screenshot processed but no comments extracted.
```

---

## 10. Verdict Section — agent + founder verdicts

File: [VerdictSection.tsx](client/src/components/ideation/stage4/VerdictSection.tsx)

**10.1 Section header + description** — [L27-32](client/src/components/ideation/stage4/VerdictSection.tsx#L27)
```
Verdict
The agent reads Layer A + Layer B and offers a verdict; your call
is what advances to Stage 5.
```

**10.2 Agent verdict block** — [L37](client/src/components/ideation/stage4/VerdictSection.tsx#L37)
```
Agent says
```

**10.3 EMPTY — agent verdict pending** — [L65](client/src/components/ideation/stage4/VerdictSection.tsx#L65)
```
No agent verdict yet. Once you bring back at least one community
response, the agent will read the signal and offer a call.
```

**10.4 Founder verdict header** — [L78](client/src/components/ideation/stage4/VerdictSection.tsx#L78)
```
Your call:
```

**10.5 Pushback toggle** — [VerdictSection.tsx:48](client/src/components/ideation/stage4/VerdictSection.tsx#L48)
```
Push back
Hide pushback
```

---

## 11. Verdict Picker — three-button choice

File: [VerdictPicker.tsx](client/src/components/ideation/stage4/VerdictPicker.tsx) + [labels.ts:9-15](client/src/components/ideation/stage4/labels.ts#L9)

**11.1 Short labels (button text)** — [labels.ts:15](client/src/components/ideation/stage4/labels.ts#L15)
```
Pursue
With caveats
Drop
```
**Voice note:** confirmed three-option pattern from Stage 3.
"Drop" is direct — could be "Set aside" if "Drop" reads too
final. Same question came up in Stage 3 copy review.

**11.2 Long labels (used in summaries)** — [labels.ts:9](client/src/components/ideation/stage4/labels.ts#L9)
```
Pursue
Pursue with caveats
Drop
```

---

## 12. Verdict Pushback Drawer

File: [VerdictPushbackDrawer.tsx](client/src/components/ideation/stage4/VerdictPushbackDrawer.tsx)

**12.1 Drawer header** — [L79](client/src/components/ideation/stage4/VerdictPushbackDrawer.tsx#L79)
```
Push back on the verdict
```

**12.2 Reply placeholder** — [L107](client/src/components/ideation/stage4/VerdictPushbackDrawer.tsx#L107)
```
What is the agent getting wrong about this verdict?
```
**Voice note:** Stage 3's pushback drawer used "What did I get
wrong about these scores?" (first-person, with the agent saying
"I"). Should this match the same first-person pattern?

**12.3 Round counter** — [L114](client/src/components/ideation/stage4/VerdictPushbackDrawer.tsx#L114)
```
Round N of 5
```

**12.4 Send button** — [L117](client/src/components/ideation/stage4/VerdictPushbackDrawer.tsx#L117)
```
Send
Sending…
```

**12.5 Closed-drawer notice** — [L127](client/src/components/ideation/stage4/VerdictPushbackDrawer.tsx#L127)
```
Pushback closed. Set your own verdict above if you accept the
agent's call, or drop this opportunity.
```

**12.6 Error fallback** — [L60](client/src/components/ideation/stage4/VerdictPushbackDrawer.tsx#L60)
```
Pushback round failed
```

---

## 13. Document View — committed/output_ready review

File: [OpportunityEvaluationsDocumentView.tsx](client/src/components/ideation/stage4/OpportunityEvaluationsDocumentView.tsx)

**13.1 Eyebrow** — [L60](client/src/components/ideation/stage4/OpportunityEvaluationsDocumentView.tsx#L60)
```
Committed · Opportunity Evaluations
Pre-commit review · Opportunity Evaluations
```

**13.2 Page heading** — [L64](client/src/components/ideation/stage4/OpportunityEvaluationsDocumentView.tsx#L64)
```
Your opportunity evaluations — Stage 4 of 5
```

**13.3 Chosen-one section header** — [L72](client/src/components/ideation/stage4/OpportunityEvaluationsDocumentView.tsx#L72)
```
Advancing to Stage 5
```

**13.4 Why-this-one section** — [L90](client/src/components/ideation/stage4/OpportunityEvaluationsDocumentView.tsx#L90)
```
Why this one
```

**13.5 Why-not-the-others section** — [L96](client/src/components/ideation/stage4/OpportunityEvaluationsDocumentView.tsx#L96)
```
Why not the others (N)
```

**13.6 Footer buttons** — [L117, L121, L126](client/src/components/ideation/stage4/OpportunityEvaluationsDocumentView.tsx#L117)
```
Save and come back              (left, ghost)
I'm ready for Stage 5           (right, when output_ready)
Committed · Stage 5 is still being built  (right, when committed)
```
**Voice note:** parallels the Stage 3 "I'm ready for Stage 4" copy.

---

## 14. Hook-level error fallbacks — chat error bar

File: [useStage4Session.ts](client/src/app/(app)/discovery/no-idea/[sessionId]/useStage4Session.ts)

Surfaced in the chat's red error bar when an action fails:

- **L132** — `Session terminated`
- **L141, L147** — `Server returned N` (HTTP fallback)
- **L169** — `Stream interrupted`
- **L184** — `Research failed`
- **L196** — `Script generation failed`
- **L235** — `Removing responses isn't supported yet. Add a different response or paste corrected text.`

**Voice note:** technical fallbacks; route-level error strings win
when present. Fine as-is unless we want a unified founder-friendly
shape.

---

## 15. Server-side error messages — founder-facing rewrites

These come from `HttpError(status, message)` in the Stage 4 routes
and surface in the chat's red bar. The realistic founder-visible
ones are the same shape as Stage 3 reviewed (route-existence is
defence in depth; founders rarely hit stale-tab paths).

**15.1** [community-response/route.ts:84](client/src/app/api/ideation/stage-runs/[id]/community-response/route.ts#L84)
```
Stage 4 row is not in authoring state
```

**15.2** [community-response/route.ts:82](client/src/app/api/ideation/stage-runs/[id]/community-response/route.ts#L82)
```
Not a Stage 4 run
```

**15.3** [opportunity-pushback/route.ts:86](client/src/app/api/ideation/stage-runs/[id]/opportunity-pushback/route.ts#L86)
```
No agent verdict yet on this opportunity. Add a community response
or wait for verdict synthesis.
```
**Voice note:** this is realistically founder-visible — fires when
they click Push back before any community response has landed.

**15.4** [opportunity-pushback/route.ts:81](client/src/app/api/ideation/stage-runs/[id]/opportunity-pushback/route.ts#L81)
```
Pushback cap reached for this opportunity
```
**Voice note:** Stage 3 was rewritten to "You've reached the 5-round
limit on this pain point..." — should match?

**15.5** [derive-opportunity-research/route.ts:81](client/src/app/api/ideation/stage-runs/[id]/derive-opportunity-research/route.ts#L81)
```
Stage 1 and Stage 2 must be committed before Stage 4 research
```
**Voice note:** Stage 3 rewrote this for Pain Scout to "Commit
Stage 1 and Stage 2 first — the Pain Scout reads them as input."
Same shape applies here.

**15.6** [presign-response-upload/route.ts:91](client/src/app/api/ideation/stage-runs/[id]/presign-response-upload/route.ts#L91)
```
Screenshot upload is temporarily unavailable. Try again later or
paste the response as text.
```
Already rewritten for the 503 case.

---

## How to mark up

Three options per item — same shape as the Stage 3 review:

1. **Approve** — leave the current wording.
2. **Replace** — write the new wording inline (`→ new text`).
3. **Defer** — mark `(defer)` and we'll revisit before launch.

I'll do a pass with your edits and land them all in one commit,
then push the stacked batch.
