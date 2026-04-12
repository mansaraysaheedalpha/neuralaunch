# NeuraLaunch — Post-Execution Changes Queue

> Items flagged during review that need to be resolved after current in-progress work completes.
> This document is the single source of truth for pending changes.
> Last updated: April 11, 2026 (v7 — A7 committed to Option B with check-in/diagnostic separation, A8 updated for flagged_fundamental removal)

---

## A. Roadmap Continuation — Flagged Issues

These were identified during the review of the Roadmap Continuation engineering delivery report. All are confirmed issues that need resolution.

---

### A1. Diagnostic Hard Cap — Inconclusive Verdict with Founder-Driven Resolution

**Severity:** Correctness
**Location:** Diagnostic route (`POST /api/discovery/roadmaps/[id]/diagnostic`), diagnostic schema, diagnostic engine, WhatsNextPanel UI

**Background:** The diagnostic chat is the conversation that opens when a founder clicks "What's Next?" but hasn't completed enough tasks (Scenario A or B). The agent asks targeted questions to understand what's blocking the founder — confusion, lost motivation, wrong direction, life circumstances. The diagnostic has a hard cap of 10 turns (with a warning at turn 8) to prevent runaway conversations. The agent is expected to reach a verdict before the cap.

**The problem:** If the agent reaches the turn limit without converging on a verdict, the system must do something. Defaulting to `release_to_brief` shunts a stuck founder into a continuation brief generated from empty or thin evidence — the worst possible outcome. Defaulting to `recommend_re_anchor` is the safest landing but not a real resolution — it reflects the founder's motivation back without addressing what's actually blocking them.

**Required fix — the `inconclusive` verdict:**

When the diagnostic hits the turn limit without a terminal verdict, the agent emits a new verdict: `inconclusive`. This verdict carries a `synthesisAttempt` field — the agent's best interpretation of what it thinks the blocker is, based on everything the founder said across all diagnostic turns. The route renders this synthesis to the founder and presents three explicit options:

**Option 1: "That's right, and I want help breaking through it."** Routes to `recommend_breakdown`. The agent takes the identified blocker and helps the founder build a concrete plan to address it — breaking the first task into sub-steps, setting a specific time commitment, making the abstract concrete.

**Option 2: "Actually, I think the roadmap itself is the problem."** Routes to `recommend_pivot`. The agent acknowledges the direction may be wrong and offers to recalibrate the remaining roadmap phases or take the founder back to the recommendation for pushback.

**Option 3: "I need to step away and think about this."** Routes to nothing. Closes the diagnostic gracefully, preserves the full diagnostic transcript in the `diagnosticHistory` column, and leaves the "What's Next?" button active for when the founder is ready to return. No brief generated. No hollow output. The founder leaves with their diagnostic conversation preserved and the door open.

**Implementation details:**

- Add `inconclusive` to the diagnostic verdict enum in `diagnostic-schema.ts`
- Add `synthesisAttempt: z.string().optional()` to the diagnostic response schema — only populated when verdict is `inconclusive`
- At the turn limit, if no terminal verdict has been emitted, the route makes one final agent call with a dedicated prompt: "You have reached the conversation limit. Synthesise everything the founder has told you into a 2-3 sentence interpretation of what you believe the core blocker is. Be honest if you're uncertain."
- The route returns the synthesis plus a `resolutionOptions` array with the three options above, each carrying its mapped verdict
- The UI renders the synthesis text and the three options as distinct buttons
- The founder's option choice maps to the corresponding verdict and the route processes it through the existing `nextStatusForVerdict` helper

**Turn limit:** 10 turns for all users (flat, no subscription gating). Warning fires at turn 8: "We have 2 exchanges left in this diagnostic — let me make sure I understand what's happening." Subscription-gated tiers can be added later by swapping the hard-coded 10 for a function that reads the user's plan. The architecture supports this change with a single constant swap.

---

### A2. Unified Recalibration System — Remove `flagged_fundamental`, Redesign `recalibrationOffer`

**Severity:** Architecture redesign
**Location:** `checkin-agent.ts` (prompt + schema), `checkin-types.ts` (action enum), `checkin/route.ts` (response handling), `InteractiveTaskCard.tsx` (UI blocks), `CheckInHistoryList.tsx` (history rendering)
**Supersedes:** The original A2 (recalibration routing to pushback) is absorbed into this unified change.

**The problem:** `flagged_fundamental` and `recalibrationOffer` are two signals that do the same thing — route the founder to reconsider the recommendation. `flagged_fundamental` fires on a single blocker on a single task and declares "the recommendation is wrong." `recalibrationOffer` fires based on accumulated patterns and suggests "the direction might be off." Both route to the pushback flow. Both ignore roadmap progress — a founder who is 90% done gets the same "reconsider the recommendation" routing as a founder who just started. Two signals, same destination, same problem.

Additionally, `flagged_fundamental` is almost never the right call. A single blocker on a single task is a task-level problem, not a recommendation-level problem. If the blocker is truly fundamental, it will show up as a pattern across multiple check-ins — which is what the recalibration offer is designed to detect. The nuclear option on a single check-in is too reactive and doesn't account for how much of the roadmap already succeeded.

**Required fix — four parts:**

**Part 1: Remove `flagged_fundamental` entirely.**

- Remove `flagged_fundamental` from `CHECKIN_AGENT_ACTIONS` in `checkin-types.ts`. The enum becomes three values: `acknowledged`, `adjusted_next_step`, `adjusted_roadmap` (still reserved).
- Remove all `flagged_fundamental` instructions from the check-in agent's prompt — the three-case blocked logic ("FUNDAMENTAL FLAW — the blocker reveals the recommendation path itself is wrong"), Critical Rule #3, and the schema description.
- Remove the red "Re-examine the recommendation" UI block from `InteractiveTaskCard.tsx`.
- Remove the `flaggedFundamental` boolean from the check-in route's response and the `InteractiveTaskCard`'s local state.
- Remove the red `border-red-500/30` conditional styling for `flagged_fundamental` entries in `CheckInHistoryList.tsx`.

Any blocker that would have triggered `flagged_fundamental` is now handled by either `adjusted_next_step` (if it's a task-level problem) or by the recalibration offer (if it's evidence of a directional problem that accumulates across check-ins).

**Part 2: Add a code-level gate to `recalibrationOffer`.**

The recalibration offer is currently prompt-only — the model decides when to fire it with no code-level guardrails. Add a progress gate in the check-in route:

Before persisting the agent's `recalibrationOffer` to the check-in entry, the route checks whether at least 40% of total tasks have had at least one check-in. If below 40%, the recalibration offer is silently suppressed — the agent's conversational message still renders, but the `recalibrationOffer` structured output is stripped from the entry before persistence. There isn't enough execution evidence yet to justify questioning the recommendation.

```typescript
const checkinCoverage = countTasksWithCheckins(phases) / summary.totalTasks;
const RECALIBRATION_MIN_COVERAGE = 0.4;

const newEntry: CheckInEntry = {
  // ...existing fields
  ...(response.recalibrationOffer && checkinCoverage >= RECALIBRATION_MIN_COVERAGE
    ? { recalibrationOffer: response.recalibrationOffer }
    : {}),
};
```

Add `RECALIBRATION_MIN_COVERAGE = 0.4` to `checkin-types.ts` constants. Add `countTasksWithCheckins` as a pure helper that walks the phases and counts tasks where `checkInHistory.length > 0`.

**Part 3: Sharpen the prompt criteria.**

Replace the current vague "accumulated evidence" instruction with concrete conditions:

```
RECALIBRATION OFFER (recalibrationOffer field):
Fire this when the evidence across the roadmap suggests the direction itself may be wrong. Look for:
  - At least 2 tasks blocked across different phases (check the roadmap outline statuses)
  - The founder has explicitly stated that a market assumption, audience assumption, or pricing assumption from the recommendation is wrong
  - The founder's check-in sentiment has been consistently negative across 3+ check-ins on the current task
  - Concrete evidence from the founder's outreach or execution that contradicts the recommendation's core thesis

Do NOT fire this on normal task difficulty. A hard task is not a wrong direction. A single blocker that could be solved by adjusting the task approach is not a wrong direction. Only fire when the DIRECTION is questionable, not when the EXECUTION is hard.

The system will only surface this to the founder if they have checked in on at least 40% of their tasks, so do not worry about firing too early — the system gates that for you. Focus on whether the evidence genuinely warrants it.
```

**Part 4: Progress-aware routing.**

When the recalibration offer fires, passes the code-level gate, and the founder clicks the action link, where they go depends on their completion percentage:

**Below 50% complete:** Route to the pushback flow with evidence context injected into the pushback agent's prompt: "The founder is arriving via a mid-roadmap recalibration signal, not an objection. Their execution evidence suggests the current direction may not be working. Evaluate the evidence before defending — if the evidence supports a change, refine or replace without resistance." The link text reads "Reconsider the recommendation →". The pushback agent gets the `recalibrationOffer.reason` string as additional context.

**50% or above:** Route to the task-level diagnostic (A6) instead of pushback. The founder has proven the recommendation works for the majority of tasks. The problem is with specific remaining tasks, not the overall direction. The link text changes to "Get help with what's left →". The message changes from "This might be the wrong direction" to "Some of your remaining tasks are hitting resistance — let's work through them." The founder lands on task-level problem solving rather than recommendation-level reconsideration.

**Part 5: Update the 5-round check-in cap message.**

Replace the current ejection message ("start a fresh discovery session and bring this learning forward") with routing to existing help surfaces:

"You've used all 5 check-ins on this task. You can get more help by clicking 'Get help with this task' for focused support, or by clicking 'What's Next?' on your roadmap to evaluate your overall progress."

This routes to the task-level diagnostic (A6) and the roadmap-level continuation system rather than ejecting the founder from the platform.

---

### A3. Closing Thought Quality Control

**Severity:** Quality
**Location:** Brief schema + brief generator prompt

The brief schema includes a `closingThought` field that wasn't in the original five-section spec. The concern is whether this produces generic encouragement ("keep going, you're doing great") or specific, evidence-grounded statements.

**Required fix:** Add explicit prompt instruction for the closing thought: "The closing thought must reference a specific piece of evidence from the execution and state what it means for the founder's next decision. Generic encouragement is not permitted. Example of what to produce: 'Your strongest signal is that catering companies converted 3x faster than restaurants — the fork you choose will determine whether you build on that signal or start over.' Example of what NOT to produce: 'You've made great progress and should be proud of how far you've come.'"

---

### A4. Brief Generator — Thin Evidence Coverage Guard

**Severity:** Correctness
**Location:** `evidence-loader.ts` + `brief-generator.ts` prompt

**Original problem (partially solved by A12):** The brief generator could encounter completed tasks with zero qualitative signal. A12 closes this specific gap — every completed task now always has outcome data (either founder-written or success-criteria-confirmed).

**Remaining problem:** A12 solves the completed-task case, but the brief generator can still face thin evidence overall. A founder might have 12 tasks where only 2 have any check-in data. The rest are in_progress, blocked, or not_started with no messages — the founder just flipped statuses without ever opening the check-in form. The brief generator would try to interpret "what happened" and "what the evidence says" from 2 check-ins across a 12-task roadmap, producing interpretations that sound authoritative but are grounded in 17% of the available surface area.

**Required fix:** Replace the binary `no_checkin_data` flag with a coverage ratio signal.

First, add a `checkinCoverage` field to the evidence loader output — a number between 0 and 1 representing the proportion of tasks that have at least one check-in entry. Computed as `tasksWithCheckins / totalTasks`.

Second, add a conditional block in the brief prompt that calibrates the agent's confidence to the evidence density:

- **Coverage above 60%:** Generate normally. The evidence base is rich enough for confident interpretation.
- **Coverage between 30-60%:** Generate but state the limitation: "I have check-in data on [X] of [Y] tasks. The interpretation below is grounded in that subset — the tasks without check-in data may tell a different story."
- **Coverage below 30%:** Generate with explicit caution: "I have very limited check-in data — only [X] of [Y] tasks have any qualitative signal. The patterns I can see are [what's visible], but I'm working with incomplete evidence. The 'What the Evidence Says' section below reflects only what I can observe, not the full picture."

This ensures the brief generator's confidence is proportional to the evidence it actually has, regardless of how many tasks are completed.

---

### A5. Training Data Export for "What I Got Wrong"

**Severity:** Strategic
**Location:** New export pipeline (does not exist yet)

The continuation brief's `whatIGotWrong` section produces labelled examples of recommendation-reality divergence — the rarest and most valuable training signal in the system. Currently this data is persisted in the `continuationBrief` JSONB column but there is no export mechanism.

**The problem:** The delivery report defers this to "when the volume threshold for fine-tuning is meaningful." But even 10-20 examples are valuable for prompt engineering and manual analysis, even before formal fine-tuning is viable.

**Required fix:** Build a simple admin-only export script (or API endpoint) that queries all roadmaps where `continuationBrief` is not null, extracts the `whatIGotWrong` field along with the original recommendation's `assumptions` and `recommendationType`, and outputs a JSONL file. This can be a standalone script — it doesn't need UI. Run it manually whenever the dataset grows. The output format should be:

```jsonl
{
  "sessionId": "...",
  "recommendationType": "...",
  "originalAssumptions": ["..."],
  "whatIGotWrong": "...",
  "forkChosen": "...",
  "timestamp": "..."
}
```

---

### A6. Task-Level Diagnostic — On-Demand Help Per Roadmap Task

**Severity:** Feature gap
**Location:** New route, extended diagnostic engine, extended task UI

**Background:** The current system has two ways a founder can get help during roadmap execution: the scheduled check-in nudge (proactive, fires every 7 days via Inngest cron) and the "What's Next?" button (reactive, but roadmap-level — it diagnoses the overall situation, not a specific task). There is no mechanism for a founder who is stuck on a specific task right now to ask for immediate, task-specific help.

**The gap:** A founder working on "Contact 10 restaurant owners this week" who can only find 3 restaurant owners has no way to ask the agent for help with that specific task in the moment. They either wait for the next scheduled check-in nudge (which might be days away), or they click "What's Next?" which opens a roadmap-level diagnostic about their overall progress — not about the specific task they're stuck on.

**The two types of diagnostic are fundamentally different:**

**Roadmap-level diagnostic ("What's Next?" button):** Diagnoses the founder's overall situation. Why haven't you progressed? Should you continue, pivot, or proceed to continuation? Strategic in nature. Lives on the roadmap page.

**Task-level diagnostic (new):** Helps the founder execute a specific task they're stuck on. Break it down into sub-steps. Explain it more clearly. Recommend tools and show how to use them. Suggest alternative approaches when the original approach is blocked. Find a different route to the same phase objective. Tactical in nature. Lives on each individual task card.

**What the task-level diagnostic does:**

When a founder is on a specific task and needs help, they can open a task-level diagnostic conversation. The agent receives the specific task description, any prior check-in data for that task, the founder's belief state (budget, technical ability, market), and the phase objective the task belongs to. The agent then helps in whatever way the founder needs:

- **Doesn't understand the task:** Agent breaks it into 3-6 concrete sub-steps, each doable in 30-60 minutes.
- **Doesn't know what tools to use:** Agent recommends specific tools — internal NeuraLaunch tools first (validation page, pushback, parking lot), then external tools appropriate for the founder's budget and technical skill. Agent explains how to use each recommended tool, not just names them.
- **Stuck midway:** Agent helps navigate the specific sticking point. If the task assumed a condition that doesn't hold (e.g., "contact 10 restaurant owners" but only 3 exist in the area), the agent either helps find a different approach to the same goal or pivots the founder to an alternative path that achieves the same phase objective.
- **Task feels wrong:** Agent evaluates whether the task is misaligned with what the founder has learned during execution and offers to adjust it without disrupting the broader roadmap.

**Implementation:**

- Add a "Get help with this task" button on each `InteractiveTaskCard` component. Always visible, always active.
- Create `POST /api/discovery/roadmaps/[id]/tasks/[taskId]/diagnostic` — one turn per call, same pattern as the roadmap-level diagnostic route.
- Reuse the existing diagnostic engine (`diagnostic-engine.ts`) but with a different prompt context. The task-level prompt includes: the specific task title and description, the task's `timeEstimate`, the task's current status and any `checkInHistory`, the phase title and objective the task belongs to, and the founder's relevant belief state fields (budget, technical ability, geographic market). The agent knows it's helping with this specific task, not diagnosing the roadmap as a whole.
- The diagnostic verdict schema is simpler for task-level: `resolved` (founder got what they needed), `still_helping` (conversation continues), `escalate_to_roadmap` (the task problem is actually a roadmap problem — route the founder to the "What's Next?" roadmap-level diagnostic instead).
- Turn limit: 10 turns per task diagnostic conversation, same flat limit as roadmap-level. Warning at turn 8. If the limit is reached without resolution, present the `inconclusive` synthesis and three-option pattern from A1.
- Each task can have multiple diagnostic conversations over its lifetime. The conversation history persists in the task's `checkInHistory` array alongside scheduled check-in entries, tagged with `source: 'task_diagnostic'` to distinguish from scheduled check-ins.
- Rate limit: `AI_GENERATION` tier (same as roadmap-level diagnostic) since every turn is a Sonnet call.

**Relationship to existing check-in agent capabilities:**

Phase 2 of the continuation delivery already gave the check-in agent the ability to produce sub-steps, tool recommendations, and recalibration offers. The task-level diagnostic reuses these same capabilities but makes them available on-demand rather than only through the scheduled nudge flow. The check-in agent is proactive and scheduled. The task-level diagnostic is reactive and immediate. Same agent capabilities, two different entry points, both necessary.

---

### A7. Brief Generator Should See Full Check-In Arc via Pre-Computed Summary

**Severity:** Data quality gap
**Location:** `StoredRoadmapTaskSchema` (new field), check-in route (trigger), new Haiku summarisation call, `brief-generator.ts` → `renderPhasesWithEvidence`

**The problem:** The continuation brief generator only renders the latest check-in entry's free text per task. If a founder had a rich 5-round conversation on a blocked task where they gradually uncovered the real problem, the brief generator only sees round 5's message. The early rounds — where the nuance, the evolution of thinking, and the real diagnosis live — are invisible to the continuation engine.

This means the "What Happened" and "What the Evidence Says" sections of the brief are generated from a fraction of the available evidence. A pattern like "the founder kept saying 'this feels too small' across rounds 2, 3, and 4" is invisible unless it also appears in round 5.

**Required fix — pre-computed conversation arc summary (Option B):**

Add an optional `conversationArc` field to `StoredRoadmapTaskSchema`:

```typescript
conversationArc: z.string().nullable().optional()
```

This field gets populated by a lightweight Haiku summarisation call when the task's check-in conversation reaches a terminal point. The summary is a single sentence capturing the narrative arc of the conversation — not a list of what happened, but an interpretation of how the founder's understanding evolved. Example: "Started confused about approach, escalated through two blocked rounds where the market assumption was challenged, resolved by pivoting from restaurants to catering."

**Trigger conditions — when the summary generates:**

The summary fires on the check-in channel only, not the task-level diagnostic channel (A6). These are separate conversation streams with separate turn budgets. The check-in arc summary captures the check-in narrative. Task-level diagnostic conversations are a separate data source that could get their own summary in the future but are out of scope for A7.

The summary generates when either:
- The founder submits their final check-in round (round 5 — the cap) on this task
- The founder marks the task as completed and the task has 2+ check-in entries

Tasks with only 1 check-in don't need an arc summary — there's no arc to summarise. The single entry's free text is sufficient.

**The Haiku call:**

One Haiku call per qualifying task. The prompt receives the full check-in history for that task (all rounds, both founder messages and agent responses) and produces a single sentence. The call is fire-and-forget — if Haiku is unavailable, the `conversationArc` field stays null and the brief generator falls back to the existing latest-message-only rendering. The brief still generates, just with less narrative context on that task.

```
Summarise this check-in conversation on a single roadmap task in ONE sentence. Capture the narrative arc — how the founder's understanding evolved, what shifted, what was the turning point. Do not list events. Interpret the trajectory.

Task: ${task.title}
Check-in history:
${fullHistoryBlock}
```

**How the brief generator uses it:**

The `renderPhasesWithEvidence` helper is updated to include `conversationArc` when present:

```
• [completed] Contact 10 restaurant owners (5 check-ins)
    arc: Started with cold outreach, hit a wall at 3 conversations, pivoted to catering contacts from existing network which converted faster
    latest check-in: "Closed 2 catering contracts this week, way easier than restaurants"
```

The brief generator now receives both the trajectory (arc) and the current state (latest message) per task. The "What Happened" section can reference the journey, not just the endpoint.

**Cost and performance:**

Haiku is fast and cheap. The call only fires once per task, only on tasks with 2+ check-ins, only at the terminal moment. For a 12-task roadmap where 7 tasks have multiple check-ins, that's 7 Haiku calls spread across the entire roadmap execution period — not a burst. Each call processes at most 5 check-in rounds of text. Negligible cost and latency impact.

---

### A8. Brief Generator Should Extract Structured Signals from Check-In History

**Severity:** Data quality gap
**Location:** `brief-generator.ts` prompt construction

**The problem:** The check-in agent produces rich structured outputs — sub-steps, tool recommendations, recalibration offers, proposed changes. All of these are persisted on the check-in entries inside the JSONB column. None of them are extracted into the brief generator's prompt. The continuation brief can't say "the agent recommended recalibrating twice during your roadmap" or "you needed task breakdowns on 4 of 7 tasks, which suggests the roadmap's granularity was too coarse."

These are high-value signals that exist in the data but are never surfaced at the strategic level where they would directly inform the "What I Got Wrong" and "What the Evidence Says" sections.

**Required fix:** Add a "STRUCTURED SIGNALS FROM CHECK-INS" section to the brief prompt that aggregates across all tasks:

- Count of tasks where `recalibrationOffer` was emitted, with the `reason` strings listed
- Count of check-ins where `agentAction === 'adjusted_next_step'`, with the task titles and rationales
- Count of tasks where `subSteps` were emitted (indicates the roadmap's task granularity was too coarse for this founder)
- Count of tasks where `recommendedTools` were emitted (indicates the roadmap didn't specify tools clearly enough)
- Count of tasks with `conversationArc` summaries (from A7) — include the arc text directly so the brief generator can reference narrative trajectories

This is a lightweight extraction pass over the phases array — iterate tasks, iterate check-in entries, accumulate counts and strings. No additional LLM call. The extraction can be a pure helper function in `brief-generator.ts` or extracted to a shared utility.

---

### A9. Extend CheckInEntrySchema to Declare All Optional Output Fields

**Severity:** Data integrity risk
**Location:** `checkin-types.ts` → `CheckInEntrySchema`

**The problem:** The check-in route writes `subSteps`, `recommendedTools`, and `recalibrationOffer` to check-in entries via conditional spreads. The UI reads them. But the Zod schema (`CheckInEntrySchema`) doesn't declare these fields. Today this works because neither the route nor the UI re-parses stored entries through `CheckInEntrySchema.parse()`. But the moment any code path does — which becomes increasingly likely as the codebase grows and new engineers touch the check-in system — those fields will be silently stripped by Zod's default `.strip()` behaviour.

**Required fix:** Extend `CheckInEntrySchema` to declare all four optional output fields:

```typescript
export const CheckInEntrySchema = z.object({
  id:                z.string(),
  timestamp:         z.string(),
  category:          z.enum(CHECKIN_CATEGORIES),
  freeText:          z.string(),
  agentResponse:     z.string(),
  agentAction:       z.enum(CHECKIN_AGENT_ACTIONS),
  round:             z.number().int().min(1),
  proposedChanges:   z.array(TaskAdjustmentSchema).optional(),
  subSteps:          z.array(z.string()).optional(),
  recommendedTools:  z.array(RecommendedToolSchema).optional(),
  recalibrationOffer: RecalibrationOfferSchema.optional(),
});
```

This makes the contract explicit. Old entries without these fields parse cleanly because all four are `.optional()`. The sub-schemas (`TaskAdjustmentSchema`, `RecommendedToolSchema`, `RecalibrationOfferSchema`) should be imported from `checkin-agent.ts` or extracted to a shared schema file to avoid duplication.

---

### A10. Add Missing Belief State Fields to Check-In Agent Digest

**Severity:** Feature gap
**Location:** `checkin-agent.ts` → `renderBeliefStateForCheckIn`

**The problem:** The check-in agent receives only five belief state fields: primaryGoal, situation, geographicMarket, availableBudget, biggestConcern. Four critical fields are missing:

- **`motivationAnchor`** — needed for re-anchoring behaviour when the founder loses focus or consistency. The continuation spec's re-anchoring flow ("you told me you started this because [motivation]") can't work in the check-in context if the agent never receives the field. The diagnostic engine (A1) receives it, but the check-in agent that fires daily nudges and detects declining engagement does not.
- **`availableTimePerWeek`** — needed for tool recommendations to be time-appropriate. If a founder has 5 hours a week, recommending a tool that requires significant setup time is counterproductive.
- **`technicalAbility`** — needed for sub-step breakdowns to be calibrated to the founder's skill level. "Deploy to Vercel" is a valid sub-step for someone with intermediate technical ability, but meaningless for someone with none.
- **`teamSize`** — needed to know whether task breakdowns should assume the founder is working solo or has help available.

**Required fix:** Extend `renderBeliefStateForCheckIn` to include all four fields:

```typescript
const fields: Array<[string, unknown]> = [
  ['Primary goal',        context.primaryGoal?.value],
  ['Situation',           context.situation?.value],
  ['Geographic market',   context.geographicMarket?.value],
  ['Available budget',    context.availableBudget?.value],
  ['Biggest concern',     context.biggestConcern?.value],
  ['Motivation anchor',   context.motivationAnchor?.value],
  ['Available time/week', context.availableTimePerWeek?.value],
  ['Technical ability',   context.technicalAbility?.value],
  ['Team size',           context.teamSize?.value],
];
```

The per-call cost increase is negligible — four short text fields added to a prompt that already includes the full roadmap outline and task detail.

---

### A11. Nudge Banner Should Name the Actual Stale Task

**Severity:** UX correctness
**Location:** `roadmap-nudge-function.ts` persistence, `RoadmapProgress` schema, `NudgeBanner.tsx`

**The problem:** The cron job identifies which specific task is stale and logs its title. But it doesn't persist the stale task title anywhere the banner can read it. The `NudgeBanner` component re-derives the task to display by walking the phases and finding the first in-progress task — which might not be the same task the cron flagged. If a founder has three in-progress tasks and the stale one is the third one found during the phase walk, the banner names the wrong task.

**Required fix:** Three changes:

1. Add a `staleTaskTitle` field to `RoadmapProgress` (nullable string, default null). No migration needed if `RoadmapProgress` is already a model with explicit columns; if it's JSONB-based, add it to the schema.

2. In `roadmapNudgeFunction`, when flagging a row, persist the stale task title alongside `nudgePending`:
   ```typescript
   await prisma.roadmapProgress.update({
     where: { id: row.id },
     data: {
       nudgePending:    true,
       nudgeLastSentAt: new Date(),
       staleTaskTitle:  stale.taskTitle,
     },
   });
   ```

3. In `NudgeBanner`, read `staleTaskTitle` from the roadmap progress data instead of re-deriving. Fall back to the current `findFirstInProgressTask` logic when `staleTaskTitle` is null (backward compatibility with rows flagged before this change):
   ```tsx
   const taskToShow = staleTaskTitle ?? findFirstInProgressTask(phases)?.title;
   ```

4. In the check-in route's `RoadmapProgress` update, clear `staleTaskTitle` alongside `nudgePending` when the founder submits any check-in:
   ```typescript
   update: {
     nudgePending:   false,
     staleTaskTitle: null,
     // ...existing fields
   },
   ```

---

### A12. Completed Task Must Always Have Outcome Data

**Severity:** Data quality gap
**Location:** `InteractiveTaskCard.tsx` completion flow, `CheckInForm.tsx`, `checkin/route.ts`

**The problem:** When a founder marks a task as completed, the check-in form auto-opens with the "completed" category pre-selected — but the free text is optional. The founder can submit with no notes. This means completed tasks can have zero qualitative signal about what actually happened. The brief generator encounters completed tasks with no outcome data and has to interpret from task-completion booleans alone, which produces thin or misleading "What Happened" sections in the continuation brief.

**Required fix — two-option completion flow:**

When a task transitions to completed, instead of the current optional text field, the founder sees two explicit options:

**Option 1: "Tell us how it went"** — opens the text input. The founder writes what actually happened in their own words. The placeholder should prompt for the specific outcome: "What happened when you did this? Did it match what you expected?" The entry is stored with `source: 'founder'`.

**Option 2: "It went as planned"** — closes the form immediately. The system stores the task's `successCriteria` text as the outcome, tagged as system-inferred. The entry is stored with `source: 'success_criteria_confirmed'`. A brief message is shown to the founder: "Skipping means the outcome matched the success criteria exactly."

**Both paths produce a check-in entry.** Every completed task always has outcome data — either the founder's own reflection or the success criteria they implicitly confirmed by skipping.

**Implementation details:**

- Add a `source` field to `CheckInEntrySchema`: `source: z.enum(['founder', 'success_criteria_confirmed']).optional()`. Optional so old entries (pre-change) parse cleanly. Default assumption for entries without the field: `'founder'`.
- When the founder picks "It went as planned," the route receives `category: 'completed'`, `freeText: <the task's successCriteria text>`, and `source: 'success_criteria_confirmed'`. The agent still responds (acknowledges completion, previews next task, ties back to the goal) but knows the text is the success criteria, not a founder reflection.
- The brief generator should weight `source: 'founder'` outcomes higher than `source: 'success_criteria_confirmed'` outcomes. A founder who wrote "I contacted 10 restaurants but only 2 were interested" is giving real signal. A founder who confirmed the success criteria is giving a default that's only as informative as the original criteria was specific.
- The `InteractiveTaskCard` completion flow changes from: status change → completion animation → check-in form with optional text, to: status change → completion animation → two-button choice → either text input or immediate submission with success criteria as content.

---

## B. Research Tool Architecture Changes

These changes apply to the research tool spec that is currently being executed. They should be applied as a single coherent change set after the current execution completes.

---

### B1. Flip from Tavily-Primary to Two Named Tools (Agent-Chooses)

**Current architecture (being built):** Tavily as the primary research tool with auto-routing logic.

**New architecture:** Both Exa and Tavily are exposed to every agent as separate named tools — `exa_search` and `tavily_search`. No auto-routing. The agent decides which tool to use for each query based on the full conversation context.

**Rationale:** NeuraLaunch's research queries are predominantly semantic and conceptual (find similar companies, discover competitors, explore adjacent markets). Exa's neural embedding-based search is purpose-built for these queries. Tavily's strength is factual retrieval and multi-source aggregation. The agent has the full conversation context and is best positioned to decide which tool fits each specific query — an auto-router only sees the query string and lacks the intent behind it.

**What to change:**
- Remove any auto-routing / query-classification logic that routes queries to a single tool
- Expose `exa_search` and `tavily_search` as two separate tools in every agent's tool definitions
- Add usage guidance to each agent's system prompt (see B2 below)
- The shared `ResearchTool` module becomes a thin wrapper that initialises both clients and exposes them independently, not a router that chooses between them

---

### B2. Agent-Level Tool Usage Guidance

Add the following guidance to each agent's system prompt alongside the tool definitions:

**Use `exa_search` when:**
- Finding companies, products, or services similar to what the founder described
- Discovering competitors the founder hasn't named
- Searching for conceptually related businesses in a specific market or geography
- Finding people, companies, or organisations matching a natural-language description
- Any query where you're looking for "things like X" rather than "facts about X"

**Use `tavily_search` when:**
- Retrieving specific factual information (regulations, pricing, requirements, contact details)
- Getting current news or recent developments about a named entity
- Answering a direct factual question where the answer is a specific retrievable data point
- Getting multi-source aggregated answers on a well-defined topic

**Use both together when:**
- You need to discover who the competitors are (Exa) and then get specific details about each one (Tavily)
- You need to find similar companies in a market (Exa) and then verify their current status or pricing (Tavily)

---

### B3. Research Log Must Capture Tool Choice

The `researchLog` field (JSONB array on session/check-in/continuation records) must capture which tool was used for each query. Updated schema per entry:

```json
{
  "agent": "interview | recommendation | pushback | checkin | continuation",
  "tool": "exa_search | tavily_search",
  "query": "the search query",
  "resultSummary": "brief summary of what was returned",
  "timestamp": "ISO date"
}
```

The `tool` field is critical for later analysis — it tells you which tool the agents are choosing for which types of queries, whether the choices are appropriate, and whether one tool consistently produces better results for certain query types. This is the data that validates or invalidates the agent-chooses architecture.

---

## C. Execution Order

1. ~~Research tool spec execution~~ ✅ Done
2. Apply Section B changes (research tool architecture flip) as a single coherent change set
3. ~~`startedAt` task timestamp fix~~ ✅ Done
4. Apply Section A changes in priority order:
   - **First batch (schema and data integrity):** A9 (extend CheckInEntrySchema), A10 (add missing belief state fields to check-in agent), A11 (nudge banner stale task title), A12 (completed task outcome data) — these are small, isolated fixes with no dependencies on each other
   - **Second batch (brief generator enrichment):** A7 (full check-in arc in brief), A8 (structured signals extraction) — these both modify `brief-generator.ts` and should be applied together
   - **Third batch (diagnostic and recalibration system):** A2 (unified recalibration redesign — remove flagged_fundamental, redesign recalibrationOffer with code gate + progress-aware routing + cap message update), A1 (inconclusive verdict with three-option resolution), A6 (task-level diagnostic) — A2 must land first because A1 and A6 reference the recalibration system's new shape
   - **Fourth batch (quality and UX):** A3 (closing thought quality control), A4 (zero-checkins guard) — prompt-level changes, low risk
   - **Fifth batch (tooling):** A5 (training data export script) — standalone, no dependencies
5. Run the training data export script (A5) once all change sets are merged

---

*Tracked by: Alpha Mansaray, Co-Founder & Chief Engineer*
*Document created: April 11, 2026*
*Updated: April 11, 2026 (v7 — A7 committed to Option B with check-in/diagnostic channel separation clarified, A8 updated to remove flagged_fundamental references)*