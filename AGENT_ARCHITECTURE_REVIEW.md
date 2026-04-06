# NeuraLaunch — Agent Architecture & Product Flow Review

> Working document. Captures concerns raised during Phase 3 testing about how
> the agents interact with each other, how recommendations are presented, how
> users navigate between phases, and how progress is tracked. We deliberate
> on each item before any code changes.
>
> **Status:** Open for discussion. Nothing here is decided yet.
> **Owner:** Saheed Alpha Mansaray
> **Captured:** 2026-04-06

---

## Concern 1 — Stale `/chat/[id]` route causing 404

**What was observed:** Clicking somewhere in the recommendation flow navigated
to `startupvalidator.app/chat/cmnnadff70001l804jx484tvz` and showed Next.js's
default 404 page.

**Root cause:** The `/chat/[id]` route was deleted during the pre-Phase-3 dead
code cleanup. Some link in the recommendation page (or sidebar, or somewhere
else in the discovery flow) still points to the old conversation URL.

**Severity:** High — visible broken link in production.

**Open questions:**
- Where is the link rendered? Sidebar? Recommendation reveal? A "back to
  conversation" link somewhere?
- Should we redirect `/chat/[id]` → `/discovery/recommendations/[id]` for
  any orphaned bookmarks, or just remove the dead links?

---

## Concern 2 — "Build Validation Page" button shows on every recommendation

**What was observed:** The CTA appears on Aminata's recommendation (where
the answer was "co-design a daily capture protocol with one client" — not
software at all) and on Kwame's recommendation (where the answer was "go
demo what you already built" — also not software-to-be-built). Either
founder could click it even though Phase 3's validation page mechanic does
not apply to their situation, producing nonsense pages and wasted Sonnet/Opus
calls.

**Root cause:** The button is rendered unconditionally on the recommendation
reveal page. There is no check on whether (a) the recommendation involves
building a software product, and (b) validation is the right next step for
this specific user.

**Severity:** High — this is the central UX flaw the rest of this document
revolves around. It also wastes paid LLM calls on irrelevant pages and
gives the user a wrong mental model of when validation is appropriate.

**Open questions:**
- How do we detect "this recommendation is buildable software"? Options:
  (a) a structured field on `Recommendation` that the synthesis prompt is
  asked to fill (`recommendationType: 'build_software' | 'build_service' |
  'sales_motion' | 'process_change' | ...`), or (b) a small classifier call
  that runs once after synthesis and tags the recommendation, or (c) just
  ask Opus to set a boolean `validationPageApplicable: true|false` in the
  schema.
- Should the button be hidden entirely when not applicable, or shown but
  greyed out with an explanation tooltip?
- When `signalStrength === 'negative'` from a *prior* page on the same
  recommendation, the button should also be hidden. Already partially
  handled in the report flow but worth verifying end-to-end.

---

## Concern 3 — The agent should know our validation tool exists, but only suggest it when needed

**What was raised:** "Make the AI know that our system has a landing
validation tool but should only recommend it when necessary, not because
it's ours and for it to be used."

**Translation:** The agent should be tool-aware (it knows Phase 3 exists
as a possible next move) but tool-honest (it does not push the user toward
the tool just because we built it). This is a self-promotion bias problem.

**Severity:** Medium — currently invisible because the button is unconditional,
but as soon as we fix concern 2 we have to make the decision about when the
*recommendation prompt itself* mentions validation.

**Open questions:**
- Should the synthesis prompt list NeuraLaunch's tools as part of "what
  this person could do next", or should the tool surface itself only via
  the UI button (driven by the structured field from concern 2)?
- If we tell the LLM about the tool, how do we prevent it from over-recommending?
  An explicit instruction like "only suggest this when the founder genuinely
  has multiple feature candidates and no way to test them" would help, but
  prompt drift is a real risk.
- Alternative: keep the LLM completely unaware of the validation tool, and
  let UI logic decide when to surface the button based on the structured
  recommendation type. This is cleaner but means the recommendation copy
  itself never mentions "build a validation page" as a next step — the user
  discovers the button independently.

---

## Concern 4 — Recommendations are currently immutable; users have no way to push back

**What was raised:** "Now the system is providing a recommendation that
cannot be altered. The user could maybe say something related to it like
'I don't like this recommendation' and the AI might challenge the user
'this is the best option for you and nothing more', a few back and forth,
the user can be okay with the recommendation and then decide that this is
good by marking it ok for their situation."

**Translation:** The current UX is take-it-or-leave-it. The recommendation
appears, the user reads it, the only action is "Generate Roadmap." There
is no pathway for the user to say "no, this doesn't fit because X" and
have the agent either (a) defend its position with new evidence, or
(b) refine the recommendation based on the new information.

**Severity:** High — this is a trust/agency issue. Users who do not feel
ownership over the recommendation will not commit to executing it.

**Open questions:**
- Is this a chat-style follow-up ("ask the agent why" → free-form back-and-forth)
  or a structured pushback ("flag this risk as wrong" → agent re-runs synthesis
  with the new constraint)?
- How many rounds of pushback before we cap it? (Cost control — every round
  is a paid Opus call.)
- Does pushback produce a *new version* of the recommendation, or does it
  amend the existing one in place? (Versioning gives us audit trail; in-place
  editing is simpler.)
- What does the agent do when the user is wrong and the original recommendation
  is correct? It should defend, not capitulate. How do we prompt for that?

---

## Concern 5 — "Generate Roadmap" should be gated behind explicit acceptance

**What was raised:** "Only after marking the recommendation good to go with
should the generate roadmap button get active."

**Translation:** A new state on `Recommendation`: `accepted`/`acknowledged`.
The roadmap button is hidden or disabled until the user explicitly accepts.
Pairs naturally with concern 4 — pushback rounds end when the user clicks
"this is good for me" which transitions the recommendation to accepted.

**Severity:** Medium — currently the user can generate a roadmap they
disagree with, which wastes another Opus call and produces a roadmap nobody
will execute.

**Open questions:**
- Database: add `acceptedAt: DateTime?` to `Recommendation`?
- Can a user un-accept? (Probably yes — they may revisit and change their
  mind. But that should not invalidate an already-generated roadmap.)
- Should the dashboard show accepted vs unaccepted recommendations differently?

---

## Concern 6 — Phases should know about each other and coordinate

**What was raised:** "How about making the AI know about each other, the
phases knows each other like phase 1 knows there are 4 phases ahead, phase
2 knows there are 3 phases ahead and one phase backwards, phase 3 knows 2
phases ahead and 2 backwards. Just like as if they are all working as one
coordination agent but without them being biased doing their works
accordingly. If a scenario arises wherein one could say get back to the
other phase — say phase 3 said get back to phase 2 and argue with it about
this and then come back to me — whatever argument or addition the previous
agent did, the preceding one knows before the human could even come and
confirm. They work collaboratively, each doing their separate work."

**Translation:** Phase awareness + cross-phase delegation. Today each
phase (discovery, recommendation, roadmap, validation) is its own siloed
prompt. They do not pass coordination context. In practice this means:

- Phase 3's interpretation of validation results does not feed back into
  Phase 1's belief state for the next discovery session.
- Phase 2's roadmap does not know it might be invalidated by Phase 3 data.
- A negative validation signal does not automatically trigger Phase 1 to
  re-run with the disconfirmed assumptions baked in.

The user wants phases to behave like a single coherent agent that can
delegate to its own past steps, the way a human strategist would re-examine
their assumptions when new evidence arrives.

**Severity:** Strategic — this is a fundamental architectural shift, not
a bug fix. It is also the difference between "NeuraLaunch is a tool that
runs scripts" and "NeuraLaunch is an actual coordinated growth engine."

**Open questions:**
- Concrete data structures: what does each phase see from the others?
  Probably a shared `agentMemory` JSON column on `User` or `Recommendation`
  that every phase reads from and appends to.
- Can phases call each other directly, or does the coordination always
  route through the user? (User-routed is safer; agent-routed is more
  powerful but failure modes are scarier.)
- The "argue between phases" idea — is that a real conversation visible
  to the user, or an internal exchange the user only sees the conclusion
  of? My instinct says the user should see the disagreement so they can
  arbitrate, but it adds UI complexity.
- Specific test case: a Phase 3 negative signal should automatically queue
  a Phase 1 re-run with the disconfirmed assumptions as locked starting
  facts. Today the user has to manually click "start a new discovery
  session" with no continuity. That's the smallest concrete example of
  inter-phase coordination.

---

## Concern 7 — Two-track support: software founders vs non-software founders

**What was raised:** "Particularly for those with software businesses
that will go through the 5 phases one way or the other, and for those
not going through it we need to provide a way wherein they can come back
and say 'I am at step 2 of the roadmap and this is exactly what I am
encountering' — the agent should reliably be able to ask few questions
again only if necessary, else it just gives them a response and says
'this is what I think and we need to change that approach or skip that
path and move with that.' Here we have equally helped both technical and
non-technical people like Aminata achieve their goals not by only blindly
providing them roadmap but auditing their roadmap such that Aminata knows
for every step of the roadmap I achieved I need to come and report and
get it marked, and every issue I encounter at a particular stage/step of
the recommendation I need to bring in that again for the agent to reason
out its strategy."

**Translation:** Right now the product implicitly assumes everyone is a
software founder going through the 5-phase pipeline. But the discovery
engine is honest enough to recommend non-software paths (Aminata's
"co-design with one client", a hire-a-VA recommendation, a process change,
a sales motion). Those founders deserve the same level of ongoing support
as the software founders, just through a different mechanism.

The proposed mechanism is **roadmap-level check-ins**:
- For each step, the user can mark it as completed
- For each step, the user can report a blocker / question / unexpected outcome
- The agent receives the issue, reasons about whether the original strategy
  still holds, and either:
  - Refines the next step
  - Says "skip this and do this instead"
  - Triggers a re-think of the recommendation if the issue is fundamental
- Successful completion is rewarded with explicit acknowledgement and a
  data capture event

**Severity:** Strategic. This is the difference between "we generated a
roadmap" and "we walked you through it."

**Open questions:**
- Database: a `RoadmapStepProgress` model? Or a `status` field on each
  task within the roadmap JSON?
- The check-in conversation: chat-style or structured form? Chat is more
  natural but structured produces queryable data.
- Should the agent proactively check in (cron-driven nudges) or only
  respond when the user comes back? Proactive is more helpful but feels
  more like nagging.
- For a non-software founder like Aminata, the "phase 3 → phase 4 → phase 5"
  pipeline never fires. So the entire post-roadmap experience for her is
  this check-in mechanism. That makes it a first-class feature, not an
  add-on.

---

## Concern 8 — Capture successful outcomes as training data

**What was raised:** "At the end, for every roadmap that successfully
helps the user navigate through, really the user can then honestly decide
to mark it in a way that once the user marked it, it gets stored in the
database as one that helped so and so with their situation, and later we
can decide on what to do with that data."

**Translation:** A `recommendationOutcome` event when the user explicitly
marks "this worked for me." Stores the recommendation, the roadmap, the
checkpoints they reported, the final state, and the user's success
attestation. Becomes a training/evaluation corpus for prompt refinement
and (eventually) for fine-tuning.

**Severity:** Important but not blocking. This is the foundation of
NeuraLaunch becoming better at recommendations over time.

**Open questions:**
- What does "successfully helped" mean? Is there a structured outcome the
  user picks from, or is it free text?
- Privacy: this data is sensitive. Can we use it for product improvement
  without explicit per-user opt-in? Probably not — needs a settings toggle.
- What about partial successes ("the recommendation got me 70% of the way
  before I had to pivot")? Should be captured too, as a separate outcome
  type.
- The negative outcome path: when a user explicitly says "this did not
  work, here is why" — equally valuable for training, but socially harder
  to ask for. Worth thinking about how to surface that without making the
  founder feel they failed.

---

## My Initial Take (Brief)

If I had to rank these by what would most change the *character* of
NeuraLaunch:

1. **Concern 4 (immutable recommendations)** + **Concern 5 (gated roadmap)**
   are the same idea and should be solved together. They unblock genuine
   user agency. Probably the highest user-experience leverage.

2. **Concern 7 (two-track ongoing support)** is the biggest product
   differentiator. Right now we're a "generate stuff" tool. After this
   we'd be a "walk you through it" tool. That's a different category of
   product entirely.

3. **Concern 2 (validation button gating)** is the most urgent fix because
   it's actively misleading users today and burning paid LLM calls.

4. **Concern 6 (phase coordination)** is the most architecturally important
   but also the hardest. I would not start here — I would start with the
   simplest concrete case (Phase 3 negative → Phase 1 re-run with
   disconfirmed assumptions) and build the coordination primitives from
   that one example outward.

5. **Concern 8 (outcome capture)** is foundational but can come last,
   because it depends on Concern 7 being in place — you can't capture
   "this helped" if there's no check-in mechanism to mark progress.

6. **Concern 3 (tool-aware but unbiased agent)** is solved naturally by
   Concern 2 — if the structured field on the recommendation determines
   when the button shows, the LLM doesn't need to know about the tool
   at all.

7. **Concern 1 (404)** is a 30-minute fix that should happen today
   regardless of the strategic discussion.

---

## Suggested Order of Deliberation

1. Concern 1 (the 404) — fix it before anything else, it's bleeding trust today
2. Concern 2 (validation button gating) — the central UX fix
3. Concern 4 + 5 together (mutable recommendations, gated roadmap)
4. Concern 7 (two-track ongoing support — the big one)
5. Concern 6 (phase coordination — start with the smallest concrete case)
6. Concern 8 (outcome capture)
7. Concern 3 (resolved by Concern 2)

But this is just a suggestion — your call on what to deliberate first.

---

*Document opened for deliberation. Each concern will be discussed and
resolved (or explicitly deferred) before any code changes.*
