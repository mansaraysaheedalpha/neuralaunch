# NeuraLaunch — Post-Execution Changes Queue

> Items flagged during review that need to be resolved after current in-progress work completes.
> This document is the single source of truth for pending changes.
> Last updated: April 11, 2026 (v2 — A1 finalised, A6 added)

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

### A2. Recalibration Offer Routing to Pushback

**Severity:** Design mismatch
**Location:** Check-in agent recalibration offer → pushback flow

The recalibration offer (Phase 2 of continuation) carries a "Reconsider the recommendation" link into the existing pushback flow. The pushback agent is designed for adversarial dialogue — its prompt says "NEVER capitulate" and treats the founder as someone challenging the recommendation.

**The problem:** A founder arriving via recalibration isn't pushing back — they're reporting execution evidence that the recommendation may be wrong. The pushback agent might defend a recommendation that the founder's own data has already disproven. The adversarial framing is inappropriate for this entry point.

**Required fix:** When the recalibration path routes into pushback, inject additional context into the pushback agent's prompt: "The founder is arriving via a mid-roadmap recalibration signal, not an objection. Their execution evidence suggests the current direction may not be working. Evaluate the evidence before defending — if the evidence supports a change, refine or replace without resistance." This preserves the existing pushback infrastructure while adjusting the agent's stance for evidence-based recalibration vs. opinion-based pushback.

---

### A3. Closing Thought Quality Control

**Severity:** Quality
**Location:** Brief schema + brief generator prompt

The brief schema includes a `closingThought` field that wasn't in the original five-section spec. The concern is whether this produces generic encouragement ("keep going, you're doing great") or specific, evidence-grounded statements.

**Required fix:** Add explicit prompt instruction for the closing thought: "The closing thought must reference a specific piece of evidence from the execution and state what it means for the founder's next decision. Generic encouragement is not permitted. Example of what to produce: 'Your strongest signal is that catering companies converted 3x faster than restaurants — the fork you choose will determine whether you build on that signal or start over.' Example of what NOT to produce: 'You've made great progress and should be proud of how far you've come.'"

---

### A4. Evidence Loader — Missing Zero-Checkins Guard

**Severity:** Correctness
**Location:** `evidence-loader.ts` discriminated union + `brief-generator.ts` prompt

The evidence loader returns failure shapes for `not_found`, `no_belief_state`, and `phases_corrupt` — but has no variant for a founder who completed tasks without ever doing a single check-in.

**The problem:** A founder with task completions but zero check-ins gives the brief generator completion data but no qualitative signal. The "What Happened" and "What the Evidence Says" sections would be generated from task-completion booleans alone, potentially producing interpretations that sound confident but are grounded in thin evidence.

**Required fix:** Two changes. First, add a `no_checkin_data` flag to the evidence loader output (not a failure state — the brief can still generate, but the generator needs to know). Second, add a conditional block in the brief prompt: "If no check-in data exists, explicitly state this limitation in the 'What the Evidence Says' section: 'I don't have check-in data to interpret — here's what the task completion pattern alone suggests.' Do not generate confident interpretations from completion data alone."

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

1. Let the current research tool spec execution complete fully across all phases
2. Apply Section B changes (research tool architecture flip) as a single coherent change set
3. Apply the `startedAt` task timestamp fix (already prompted to the agent separately — adds `startedAt` to `StoredRoadmapTaskSchema`, writes it on `in_progress` transition, fixes `findStaleInProgressTask` to use per-task start time, updates speed calibration to use exact per-task duration)
4. Apply Section A changes (continuation flagged issues A1–A6) as a separate change set
5. Run the training data export script (A5) once all change sets are merged

---

*Tracked by: Alpha Mansaray, Co-Founder & Chief Engineer*
*Document created: April 11, 2026*
*Updated: April 11, 2026 (v2 — A1 finalised with inconclusive verdict + three-option resolution, A6 task-level diagnostic added, execution order updated)*