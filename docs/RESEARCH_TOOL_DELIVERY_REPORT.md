# NeuraLaunch Research Tool — Engineering Delivery Report

**Branches:** `feat/research-tool` (merged to dev) → `feat/research-tool-b1b2b3` (current, awaiting merge)
**Base:** `origin/dev`
**Status:** Complete, reviewed, CodeRabbit-triaged, ready for merge
**Commit range:** `33f3183` (phase 1) … `826e463` (current HEAD)
**Total commits:** 13 (six feature phases + one self-review pass + one bugfix + one housekeeping + one merge + one architectural flip + one CodeRabbit triage + one tooling consolidation)

---

## 1. Executive Summary

Before this work the only NeuraLaunch agent that could touch external data was the synthesis Opus call. It owned a 411-line `lib/discovery/research-engine.ts` that was tied to the synthesis pipeline by name, by file location, and by every API surface it exposed. None of the other four agents — interview, pushback, check-in, continuation — could see the same data, even when they obviously needed it (the founder mentions a competitor mid-interview; the founder claims a market fact during pushback; the founder is stuck mid-task and needs a vendor name; the founder reaches the continuation brief and the market has shifted since the original recommendation).

This work delivered a **shared research substrate that every agent in the system can use**, and then — after the spec ran end-to-end and we caught the architectural smell — flipped the substrate from a single Tavily-primary auto-routing tool to two named tools (`exa_search` and `tavily_search`) that the agent picks between per query based on the full conversation context.

The result is a system where:

- **Every research-enabled agent shares the same `lib/research/` module** — same transports, same renderers, same audit trail, same step-budget discipline. A copy edit to a tool description applies to every agent at once.
- **The agent decides which provider to use per query**, not a regex inside the orchestrator. "Things like X" → Exa neural search; "facts about X" → Tavily synthesised search; both together when discovery and verification are needed in one turn. The decision is logged to `researchLog.tool` so we can audit whether agents are choosing well.
- **Research is in-loop**, not pre-computed. Each agent has a per-turn step budget (interview=5, recommendation=10, pushback=5, checkin=4, continuation=8); inside that budget the AI SDK tool loop fires whatever sequence of tool calls the agent thinks is right, then emits its final structured output. No two-pass orchestration, no pre-built query lists.
- **Failure is fail-open at the research layer.** A Tavily timeout, an Exa API quota error, a missing API key — none of these break the agent. The tool returns an error string the model can read, and the model decides whether to retry, switch to the other tool, or proceed without research. Research is an enhancement; the agents still produce their structured outputs without it.
- **Every research call is auditable.** The `researchLog` JSONB column on `Recommendation`, `DiscoverySession`, and `Roadmap` carries one entry per successful tool invocation: `{ agent, tool, query, resultSummary, timestamp }`. The schema is permissive on legacy fields so historic rows from before the B1 flip still parse cleanly.

The work was delivered in **six engineering phases** under `feat/research-tool`, hardened by **one self-review pass**, merged to `dev`, and then **architecturally flipped** under `feat/research-tool-b1b2b3` once the spec post-execution review identified that auto-routing was the wrong abstraction. A final CodeRabbit triage pass and a tooling-consolidation cleanup brought the branch to its current state.

The cycle this closes is the same cycle the roadmap-continuation work closed at the product level: the founder's experience now feels like every part of the system is reading from the same source of external truth instead of each agent guessing independently.

---

## 2. What We Shipped (Product View)

### Before
- Synthesis Opus call had its own bespoke 411-line research module that hit Tavily.
- Every other agent ran with zero external data. The interview agent could see the founder type "I'm competing with Paystack" and have no idea who Paystack was. The continuation brief generator could not check whether the market had moved since the original roadmap was written.
- Research was pre-computed before the LLM call: an orchestrator built a query list, fired Tavily in parallel, rendered the findings, and injected a `researchFindings` string into the prompt. The agent had no agency over when or what to research.

### After
- **Five agents** (interview, recommendation, pushback, check-in, continuation) all share `lib/research/`.
- **Two providers** (Exa for "things like X" neural search, Tavily for "facts about X" factual answers) exposed as **two independent tools** the agent picks between per query.
- **In-loop research** via the Vercel AI SDK v6 `generateText({ tools, stopWhen, experimental_output })` pattern. The agent runs its own tool loop, deciding step by step whether the current state warrants more research before emitting the final structured output.
- **Per-agent step budgets** straight from the spec, with +1 headroom for the structured-output emission step so the model never runs out of budget on the last step.
- **Per-call audit accumulator** owned by the route or Inngest function. Each tool's `execute` function pushes one entry into the closure-scoped accumulator; the route reads the populated accumulator after the agent returns and persists it to the right `researchLog` column inside the same transaction as the main write.
- **Streaming-incompatible interview agent handled via pre-research.** Adding tools to a `streamText` call would block tokens until the tool loop finished — bad founder UX. Instead the interview turn route runs a short non-streaming `generateText` pre-pass with the tools, the digest flows into the streaming question generator's existing `researchFindings` block.
- **Fail-open everywhere.** Missing API keys → tool not registered, agent never sees it. Provider error → tool execute returns an error string to the model, model proceeds. Empty findings → agent emits its structured output without research input. The product never breaks.

### What this is NOT
- **Not a switch to a new SDK.** All five agents already used Vercel AI SDK v5/v6; this work uses the existing SDK's tool loop primitive (`generateText` with `tools` + `stopWhen` + `experimental_output`). Nothing about the provider chain, the model fallback, or the structured-output schemas changed except where the agent now writes a tool loop instead of a single call.
- **Not a new database table.** The `researchLog` JSONB column was added in an earlier commit (`f4860bf`) on `Recommendation`, `DiscoverySession`, and `Roadmap`. This work writes into it; it does not migrate the schema.
- **Not a chatty research surface.** Research is silent by design. The founder never sees a "checking external data…" indicator. The agent uses research to sharpen its output, not to lecture the founder about what was found. The spec is explicit: "research findings do not get dumped into the conversation."

---

## 3. How We Built It (Engineering Approach)

### Phased delivery, then architectural flip

We first delivered the shared substrate as the spec described: a Tavily-primary `runResearchQueries` orchestrator with a regex-based query auto-router, a two-stage trigger detector for the conditional agents, and per-agent integration glue. Six phases, each independently reviewable, each shipped to its own commit.

After the spec ran end-to-end on `feat/research-tool`, a post-execution review surfaced three architectural issues (B1, B2, B3 in `docs/neuralaunch-post-execution-changes-queue.md`):

- **B1** — The auto-router was the wrong abstraction. A regex deciding "this query is factual, use Tavily" or "this query is conceptual, use Exa" loses the most important signal: the agent's understanding of *why* it is researching. The agent should see two named tools and pick per query.
- **B2** — Per-agent system prompts had no shared usage guidance for when each tool fits. Agents would either over-call one provider or be unable to choose intelligently between them.
- **B3** — `researchLog` entries carried `{ agent, query, answer, sources }` but no `tool` field. Without it we could not audit "is the agent picking the right provider for the right query?" — the very thing the B1 architecture is supposed to validate.

The architectural flip rewrote `lib/research/` to expose `exa_search` and `tavily_search` as two independent AI SDK tools, deleted the auto-router and trigger detector entirely, migrated all five agents from the orchestrator pattern to the in-loop tool-calling pattern, and updated the schema. Net diff for the flip: 30 files changed, 1166 insertions, 1467 deletions — i.e. less code overall, even after adding the second provider.

### Enhancement over addition (still)

Even the architectural flip honoured the discipline of "extend the existing surface, never run a parallel one":

- **Inngest steps** — research and main agent calls were collapsed into a single `step.run()` block per agent so the per-call accumulator could be captured as part of the step return value (Inngest serializes step return values to JSON; we cannot pass closures across step boundaries). The `runResearch` step from the orchestrator era is gone, not duplicated.
- **Routes** — every research-enabled route owns its accumulator and persists it in the same transaction as the main write. The `runConditionalResearch` pre-pass that the orchestrator era used in the interview, pushback, and check-in routes is gone, not duplicated.
- **Prompts** — every agent's prompt now includes the canonical `RESEARCH_TOOL_USAGE_GUIDANCE` block via a single `getResearchToolGuidance()` call. A copy edit to one constant applies to all five agents at once. (The CodeRabbit triage pass added two single-tool variants for environments where only one provider is keyed in — the agent never sees prompt copy for a tool it cannot actually call.)
- **`researchLog` schema** — the new fields (`tool`, `resultSummary`) were added as **optional** alongside the legacy fields (`answer`, `sources`, `success`). Old rows from the orchestrator era still parse via the same `safeParseResearchLog` helper. The reader handles both shapes gracefully. Zero migration required.

### File size discipline

Every file in `lib/research/` is under its CLAUDE.md cap:

| File | Lines | Cap | Role |
|---|---:|---:|---|
| `index.ts` | 45 | n/a | Public API barrel |
| `types.ts` | 110 | 150 | Zod schemas + type unions |
| `constants.ts` | 97 | 100 | Per-agent step budgets, timeouts, render caps |
| `tavily-client.ts` | 120 | 300 | Tavily transport |
| `exa-client.ts` | 136 | 300 | Exa transport |
| `render-summaries.ts` | 115 | 300 | Per-provider result renderers + error renderer |
| `tools.ts` | 259 | 300 | `buildResearchTools` factory + guidance constants |
| `interview-pre-research.ts` | 141 | 300 | Streaming-compat pre-pass for the interview agent |
| `log-helpers.ts` | 55 | 300 | `safeParseResearchLog` + `appendResearchLog` |
| **Total** | **1078** | — | — |

The B1 flip deleted seven files from the orchestrator era: `research-tool.ts`, `trigger-detector.ts`, `conditional-research.ts`, `prompt-rendering.ts`, `query-shaping.ts`, `discovery/research-engine.ts`, `discovery/research-axes.ts`. The substrate is materially smaller post-flip even though it now supports two providers instead of one.

### Idempotency, durability, security

- **Accumulator reset on retry.** Every `withModelFallback` call site captures `accumulatorBaseline = accumulator.length` outside the wrapper and resets `accumulator.length = accumulatorBaseline` at the top of each retry attempt. A Sonnet→Haiku fallback retry that re-runs the same tool calls cannot double-count audit entries.
- **Step budgets have explicit headroom.** Each per-agent budget is one step higher than the worst case in the spec — interview=5 (spec 2-4 calls), recommendation=10 (spec 4-8), pushback=5 (spec 1-3), checkin=4 (spec 0-2), continuation=8 (spec 3-6). The headroom guarantees the model has at least one step left for the final structured-output emission and never trips `NoObjectGeneratedError` because it used every step on tool calls.
- **Conditional tool registration.** `buildResearchTools` checks `isExaConfigured()` and `isResearchConfigured()` and only registers the tools whose API keys are present. With both keys missing the tool set is empty and the agent operates without research entirely. The model never sees a tool it cannot call.
- **Per-tool-result sanitization.** Both `renderTavilySummary` and `renderExaSummary` wrap their inputs via `renderUserContent()` (triple-bracket delimiters) and `sanitizeForPrompt()` (length cap + control character strip). Tool result content is opaque external data; the model is told to treat it as DATA in every agent's prompt via the canonical SECURITY NOTE.
- **Defensive sanitization at the next prompt boundary.** Even though tool results are wrapped, the digesting model could in principle echo injected content back as plain text. The interview-pre-research digest is wrapped *again* via `renderUserContent()` before injection into the streaming question generator's prompt — defense in depth at every model boundary.
- **Fail-open at every layer.** Tool execute functions catch their own errors and return an error string the model can read; they never throw across the AI SDK tool loop. The interview-pre-research helper catches every error and returns empty findings so a flaky pre-pass never blocks the streaming question. The per-call accumulator is reset on retry but never propagates a crash.

---

## 4. Phase-by-Phase Delivery

### Phase 1 — Extract shared research tool foundation
**Commit:** [`33f3183`](../client) — `feat(research): phase 1 — extract shared research tool foundation`
**Files:** 13 changed, 1331 insertions, 304 deletions
**Files added:** `lib/research/{types, constants, query-shaping, tavily-client, prompt-rendering, research-tool, trigger-detector, log-helpers, index}.ts` (9 files)

Lifted the synthesis-only research engine (411-line `lib/discovery/research-engine.ts`, well over the 300-line lib cap) into a new `lib/research/` module designed for five different agents to share. The module shape was chosen so each subsystem is one screen of code:

- **`types.ts`** — Zod schemas for `ResearchAgent` (string union of the five agents), `ResearchSource`, `ResearchLogEntry`. The `agent` field was permissive at the read boundary even from day one so legacy `'synthesis'` rows from the bespoke synthesis era still parsed cleanly.
- **`constants.ts`** — Per-agent call budgets straight from the spec table, plus tunable knobs for the Tavily transport (timeout, retry count, render caps).
- **`query-shaping.ts`** — Pure helpers: `trunc`, `q`, `yearHint`, `extractCapitalisedNames` (the heuristic proper-noun extractor used by the synthesis query builder and the trigger detector).
- **`tavily-client.ts`** — Pure transport: lazy singleton client, hard wall-clock timeout, single linear-backoff retry, throws after `RESEARCH_MAX_ATTEMPTS` so the caller decides fail-open behaviour.
- **`prompt-rendering.ts`** — Pure helpers: `dedupHits` (per-batch URL dedup), `renderQueryBlock` (one per-query section, wrapped in `[[[ ]]]` delimiters via `renderUserContent` for prompt-injection defence), `joinAndCapFindings`, `toResearchSource`.
- **`research-tool.ts`** — The public entry point. `runResearchQueries` took an agent identity + a list of pre-built `DetectedQuery` objects, fired them in parallel, returned prompt-ready findings + audit-log entries. Fail-open: a fully failed batch returned empty findings rather than throwing.
- **`trigger-detector.ts`** — Two-stage detection for the conditional agents (interview, pushback, check-in): cheap regex pre-filter for capitalised names / regulation keywords / market-claim universals / tool-mention patterns, then a Haiku structured-output extractor that turned hits into specific queries. Most turns paid zero overhead.
- **`log-helpers.ts`** — `safeParseResearchLog` + `appendResearchLog` with a per-record entry cap so JSONB doesn't grow without bound on multi-cycle roadmaps.
- **`index.ts`** — Public API barrel, the only contract surface other modules touch.

The synthesis pipeline kept its existing call site signature; under the hood it now built a list of `DetectedQuery` objects and called `runResearchQueries('recommendation', queries)`. Behaviourally identical from the synthesis caller's perspective, but the substrate is now usable by every other agent.

### Phase 2 — Recommendation agent multi-axis expansion
**Commit:** [`3ee0e91`](../client) — `feat(research): phase 2 — recommendation agent multi-axis expansion`

The recommendation agent's existing one-axis query set ("competitors of X") was expanded into the four axes the spec called for: competitive landscape, tools/vendors/platforms, pricing benchmarks, and regulatory/compliance. Per-axis query construction lived in the synthesis caller and the queries flowed through the new shared `runResearchQueries` substrate. The recommendation agent already had a 4-8 query budget per session per the spec table; this phase made the budget actually meaningful by giving the agent four axes to spread it across.

### Phase 3 — Check-in agent integration
**Commit:** [`6d91eb8`](../client) — `feat(research): phase 3 — check-in agent integration`

The check-in agent gained access to the trigger-detector + research substrate. The spec is explicit: research is most valuable for check-ins when the founder is **stuck** — cannot find vendors, doesn't know which tool fits, asks for market data. Most check-ins do not need research. The trigger detector's regex pre-filter was tuned for those cases (proper-noun mentions of vendors, "I don't know how to…", "where do I find…"). When research did fire, the findings sharpened the agent's `recommendedTools` field with concrete tool names instead of generic categories.

### Phase 4 — Continuation agent integration
**Commit:** [`c25b919`](../client) — `feat(research): phase 4 — continuation agent integration`

The continuation brief generator gained explicit research instructions in its prompt: research market changes since the roadmap was created, named-competitor traction signals, parking-lot items mentioning specific entities. This is the highest-stakes single LLM call in the system; the spec deliberately gave it the largest budget (3-6 queries → step budget 8 in the current B1 architecture). The orchestrator-era integration ran research as a pre-pass that built a query list from the parking lot and the original recommendation, then fired the queries in parallel before the Opus call.

### Phase 5 — Interview agent integration
**Commit:** [`6d3ec61`](../client) — `feat(research): phase 5 — interview agent integration`

The interview agent's integration was the trickiest because the interview turn is **streamed** to the founder via `streamText` (wrapped in `streamQuestionWithFallback` for multi-provider resilience). Adding tools or running research synchronously inside the streaming call would block tokens until research finished — the founder would see 5-15 seconds of "thinking" before any text appeared, which is exactly the bad UX the streaming architecture was designed to avoid.

The orchestrator-era solution was a separate `runConditionalResearch` pre-pass: the route fired the trigger detector and `runResearchQueries` before invoking the streaming question generator, and the rendered findings flowed into the existing `researchFindings` prompt block. The B1 flip kept this exact pattern but replaced the orchestrator with `interview-pre-research.ts` (see phase B1).

### Phase 6 — Pushback agent integration
**Commit:** [`7253d66`](../client) — `feat(research): phase 6 — pushback agent integration`

The pushback agent gained research access for verifying founder-named alternatives during the rebuttal turn. When the founder pushes back with "but what about [competitor]?" or "[market fact] should make this work" the agent now had data to verify those claims before constructing its response. Per the spec table: 1-3 queries per pushback round (now step budget 5 in the B1 architecture).

### Phase 7 — Self-review pass
**Commit:** [`5081088`](../client) — `fix(research): elite-engineering review pass`

A four-issue self-review pass found and fixed before the merge to dev:

1. **RELIABILITY** — Race window in the brief Inngest function's research-pre-pass. The orchestrator-era brief flow ran research in one Inngest step and the brief generator in another; the per-call accumulator could not propagate cleanly across step boundaries because Inngest serializes step return values to JSON and cannot pass closures. Fix: collapse research and brief generation into a single `step.run()` block so the accumulator stays in scope.
2. **TYPE SAFETY / CLAUDE.md** — `as object` cast on the discovery context. CLAUDE.md forbids `as unknown as` casts on JSON columns; the accidental `as object` was the same pattern in disguise. Replaced with the canonical `safeParseDiscoveryContext` helper.
3. **CORRECTNESS** — The trigger detector's prompt cap was wrong. The detector was being given a `MAX_FINDINGS_CHARS` constant (intended for the renderer's cap on rendered output) instead of the per-message cap that was actually needed at the prompt boundary. Symptom: the detector occasionally truncated mid-query.
4. **PERFORMANCE / RELIABILITY** — `runResearchQueries` had no aggregate timeout. A batch of 3 queries hitting their per-query 30s timeouts could block an Inngest step for 90 seconds before failing. Added a per-batch wall-clock guard.

### Housekeeping — investigation report, queue, and spec rename
**Commit:** [`487a796`](../client) — `docs: housekeeping`

Renamed the spec file to its canonical name, created the post-execution changes queue document (`docs/neuralaunch-post-execution-changes-queue.md`) where B1, B2, B3 were first written down, and committed the investigation report from the merge prep.

### Merge to dev
**Commit:** [`f3b1824`](../client) — `Merge branch 'feat/research-tool' into dev`

The orchestrator-era research substrate landed on dev. The five agents were all integrated. The audit log was being written. CI was green. The substrate was correct for the spec as written.

### B1 + B2 + B3 — Architectural flip
**Commit:** [`5160a18`](../client) — `feat(research): B1+B2+B3 — flip research tool from auto-routing to two named tools`
**Files:** 30 changed, 1166 insertions, 1467 deletions (net negative)
**Branch:** `feat/research-tool-b1b2b3` (cut from dev after the merge)

The post-execution review identified that the orchestrator-era architecture, while working, had three issues that would compound over time:

| Issue | Symptom | Fix |
|---|---|---|
| **B1** Auto-routing is the wrong abstraction | A regex inside the orchestrator decides which provider fits a query. The agent's understanding of *why* it is researching is lost. | Expose `exa_search` and `tavily_search` as two independent AI SDK tools. The agent picks per query based on the full conversation context. |
| **B2** No shared usage guidance | Agents over-call one provider or pick at random because each agent's prompt has no shared "when to use Exa vs Tavily" rules. | Add a canonical `RESEARCH_TOOL_USAGE_GUIDANCE` constant injected into every agent's prompt via `getResearchToolGuidance()`. Single source of truth. |
| **B3** Audit log can't validate B1 | `researchLog` entries have `{ agent, query, answer, sources }` but no `tool` field. We cannot tell whether agents are choosing the right provider. | Add `tool: 'exa_search' \| 'tavily_search'` to `ResearchLogEntry`. Permissive on read so legacy rows still parse. |

**Files added (4):**
- `lib/research/exa-client.ts` — Pure Exa transport, mirrors `tavily-client.ts` exactly. Lazy singleton, timeout, retry, throws on failure.
- `lib/research/render-summaries.ts` — Per-provider result renderers (`renderTavilySummary`, `renderExaSummary`) plus an error renderer (`renderToolError`). Both wrap their inputs via `renderUserContent` and `sanitizeForPrompt`.
- `lib/research/tools.ts` — `buildResearchTools` factory that conditionally registers `exa_search` and `tavily_search` based on which API keys are present, plus the `RESEARCH_TOOL_USAGE_GUIDANCE` constant.
- `lib/research/interview-pre-research.ts` — Streaming-compat pre-pass for the interview agent. Runs a short non-streaming `generateText` call with the tools and returns the rendered findings as a string. Fail-open: any error returns empty findings so the streaming question generator runs identically without research.

**Files deleted (7):**
- `lib/research/research-tool.ts` — orchestrator entry point
- `lib/research/trigger-detector.ts` — two-stage trigger detection
- `lib/discovery/conditional-research.ts` — per-agent pre-pass wrapper
- `lib/research/prompt-rendering.ts` — orchestrator-era rendering
- `lib/research/query-shaping.ts` — proper-noun heuristics for the auto-router
- `lib/discovery/research-engine.ts` — synthesis-specific shim layer
- `lib/discovery/research-axes.ts` — recommendation agent's pre-built query axes

**Agent migrations (5):** every research-enabled agent flipped from `generateObject({ schema, messages })` (single call, structured output, pre-research findings injected as a string) to `generateText({ tools, stopWhen: stepCountIs(N), experimental_output: Output.object({ schema }), messages })` (in-loop tool calls, structured output as the final step). Each agent's `withModelFallback` wrapper now resets the per-call accumulator on each retry attempt.

**Route + Inngest function updates (6):** every caller now owns a per-call `ResearchLogEntry[]` accumulator, passes it into the agent, and reads the populated entries after the agent returns. Routes persist to the right `researchLog` JSONB column inside the same transaction as the main write. Inngest functions collapsed the orchestrator-era research step and main step into a single `step.run()` block so the accumulator stays in closure.

**UI cleanup:** `ThinkingPanel.tsx` removed the `'researching'` step from the progress indicator (the founder no longer sees a "researching…" stage because research is now inside the synthesis step).

**Self-review pass during the flip** caught and fixed:
- TypeScript: `ResearchTools` interface needed to be `type ResearchTools = ToolSet` (i.e. `Record<string, Tool>`) so `generateText({ tools })` accepted it without an index-signature mismatch.
- Step budget headroom: every per-agent budget bumped by +1 over the spec count to give the model explicit room for the final structured-output emission step.
- Conditional registration: `getResearchToolGuidance()` reads env directly (not the tools instance) so the prompt can be built before the per-call tools instance exists.
- Pushback engine: the rewrite call (second LLM call after the decision) does not need fresh research; only the first call exposes the tools.

### CodeRabbit triage
**Commit:** [`a1d3803`](../client) — `fix: address valid CodeRabbit catches across research, continuation, and check-in surfaces`

CodeRabbit flagged 12 catches on the B1+B2+B3 branch. Triaged each against the actual code:

**Fixed (8 files):**

1. **`tools.ts` — guidance names unavailable tools.** `getResearchToolGuidance()` previously returned the full guidance string mentioning both tools even when only one provider was configured. The agent could see prompt copy telling it to call a tool that was not in its tool set. Added `RESEARCH_TOOL_USAGE_GUIDANCE_EXA_ONLY` and `RESEARCH_TOOL_USAGE_GUIDANCE_TAVILY_ONLY` variants and selected the right one based on `isExaConfigured()` / `isResearchConfigured()`. Also fixed the stale `perInvocation` reference in the file header that lingered from before the rename to `steps`.
2. **`evidence-loader.ts` — `RecommendationSchema.parse()` throws past the discriminated union.** The function returned `{ ok, reason }` for every other failure but `RecommendationSchema.parse()` would propagate as an exception instead. Switched to `safeParse` and added `'recommendation_corrupt'` to the failure union.
3. **`useContinuationFlow.ts` — founder turn discarded when agent reply missing.** When the diagnostic POST returned no agent reply, the founder's own message was silently dropped from the local transcript. Founder turn now appended unconditionally on success. Also changed `submitDiagnostic` to return `Promise<boolean>` so callers can preserve the input draft on failure.
4. **`WhatsNextPanel.tsx` — draft cleared before submit.** Now clears the input draft only when `submitDiagnostic` returns true. Transient network errors no longer vaporise the founder's text.
5. **`ContinuationView.tsx` — failed flag never cleared on success.** A transient refetch failure set `failed=true` but the flag was never cleared on a subsequent successful poll, locking the brief surface on the error message permanently. Added `setFailed(false)` on success.
6. **`question-generator.ts` — sanitize `researchFindings` defensively.** The interview-pre-research digest is the OUTPUT of an LLM digesting tool results. Even though the tool result renderers wrap their inputs, the digesting model could echo injected content back as plain text. Wrapped via `renderUserContent(..., 4000)` before injection — defense in depth at every model boundary.
7. **`checkin-agent-schema.ts` — `.max(2000)` violates CLAUDE.md.** The `message` field carried `.max(2000)` which violates the project rule against `.max()` on LLM output string fields (Anthropic does not enforce string-length constraints during structured-output generation; the AI SDK then rejects the entire response as `AI_NoObjectGeneratedError`). Replaced with a `.transform()` post-clamp using a shared `clampString` helper. Added the same clamp on `parkingLotItem.idea` at 280 chars — CodeRabbit had suggested adding `.max(280)` there, which would have re-introduced the same Anthropic spurious-failure pattern.
8. **`BriefSections.tsx` — defensive fallback.** Parking-lot items missing both `taskContext` and `surfacedFrom` could render the literal string "surfaced via undefined". Falls through to render nothing instead.

**Rejected (4 catches):**

| Catch | Why rejected |
|---|---|
| `Handle undefined experimental_output` (4 sites) | False positive — AI SDK type `InferCompleteOutput<OUTPUT>` is non-nullable. `generateText` throws `NoObjectGeneratedError` rather than returning undefined. |
| `Invalid timestamps could produce NaN` in speed-calibration | Already guarded — `NaN >= HOURS_IN_MS` is `false`, the branch is skipped. No real bug. |
| `Add .max(280)` to ParkingLotCaptureSchema | Would violate CLAUDE.md. Fixed differently with `.transform()` clamp. |
| `exa-js ^2.11.0 → ^2.10.2` (uncommitted auto-edit) | Lockfile pinned 2.11.0 with `^2.11.0` specifier. Reverted. |

Plus an uncommitted Prettier-style auto-edit on `WhatsNextPanel.tsx` (single→double quote churn + a try/catch wrap that didn't fix the actual bug because `submitDiagnostic` doesn't throw) — reverted, single-quote convention dominates 22:9 in the project, and the proper fix was the boolean-return contract on `submitDiagnostic`.

**Validation:** ran `npx tsc --noEmit` against the full project before and after the CodeRabbit fixes. Baseline 59 errors, post-fix 59 errors — zero regressions. The 59 pre-existing errors are all in unrelated files (`validation-reporting-function.ts`, `api-error.ts`, etc) and stem from `.next/types` not being generated in this checkout, not from these changes.

### Tooling consolidation — pnpm-only
**Commit:** [`826e463`](../client) — `chore(tooling): consolidate to pnpm-only and document the rule in CLAUDE.md`

A by-product of the CodeRabbit triage uncovered a contradiction: the project has always been pnpm-only (per `RUNBOOK.md` and `README.md`, because the Prisma client needs a postinstall patch via `scripts/fix-prisma-pnpm.js` that compensates for how pnpm symlinks `.prisma`), but a stale `client/package-lock.json` was tracked in git from 2026-04-02 and the Claude permissions file allow-listed `npm install`. This commit removed the contradictions:

- **Deleted** the tracked `client/package-lock.json` (24,479 lines). The file was last modified 10 days before `pnpm-lock.yaml` and carried 4,631 lines of uncommitted local churn from a stray `npm install` that contradicted the convention.
- **Added** `package-lock.json` and `yarn.lock` to both the root `.gitignore` and `client/.gitignore` so a stray `npm install` cannot reintroduce them. Defence in depth.
- **Tightened** `client/.claude/settings.local.json` — moved `npm install`, `npm i`, `npm ci`, `npm run`, and `yarn` into the deny list, replaced the prior allow entries with the full set of pnpm equivalents.
- **Added** a new "Package Manager" section to `CLAUDE.md` between Tech Stack and AI Integration Standards. The section is loaded into every Claude Code session by default and states the rule, the Prisma postinstall reason, the lockfile policy, the documentation expectation, and the Claude permission guard.

---

## 5. Architectural Decisions & Trade-offs

### Why two named tools, not auto-routing
The orchestrator-era auto-router used a regex inside the orchestrator to decide which provider fit each query. The result was a system where the agent's understanding of *why* it was researching was lost at exactly the moment that understanding mattered most — the choice between "find similar things" and "verify specific facts" is not a string-pattern decision, it is a reasoning decision. Giving the agent two named tools and explicit usage guidance turns the choice into a first-class decision the model makes under its own reasoning, and the audit log captures the result so we can validate or refute the decision quality over time.

The cost of the flip is that the agent occasionally calls the "wrong" provider. The benefit is that we can see when that happens (via `researchLog.tool`) and either retune the prompt guidance or accept that the agent's reasoning was right and the regex was wrong.

### Why pre-research for the interview agent (and only the interview agent)
The interview agent uses `streamText` for token-level streaming so the founder sees text appearing as the model writes it. Adding tools to the streaming call would force the model to complete every tool call before streaming the first token, producing 5-15 seconds of dead air before the first character appears. That is the exact bad UX the streaming architecture was designed to avoid.

The pre-research helper runs a short non-streaming `generateText` call with the tools BEFORE the streaming question generator fires. The model decides whether to research based on the founder's last message and the belief state digest. The rendered digest flows into the streaming question generator's existing `researchFindings` prompt block. From the founder's perspective there is at most a 1-3 second pause while the pre-research runs (often zero, because the model returns `NO_RESEARCH_NEEDED` immediately for emotional or motivational messages) and then the streaming question appears as before. Every other agent uses the in-loop tool pattern because they are not streaming.

### Why per-agent step budgets, not a global limit
A global limit would force the system to spend the recommendation agent's research budget on the same scale as the check-in agent's, even though the recommendation is the most externally-grounded artifact in the system and the check-in is the least. The per-agent budgets come straight from the spec table and reflect the actual product weight of each call: continuation=8 because the brief is the highest-stakes call we make; checkin=4 because most check-ins shouldn't research at all; interview=5 because mid-interview research should be selective.

The +1 headroom over the spec count is the price of the in-loop pattern: the model needs explicit budget for the final structured-output emission step, and a tight budget would occasionally produce `NoObjectGeneratedError` when the model used every step on tool calls.

### Why the per-call accumulator pattern
Inngest serializes step return values to JSON. A closure (the per-tool `execute` function pushing to a shared array) cannot be passed across step boundaries. Two options:

1. **Two-step pattern.** Run research in one step, persist the audit log, then run the main agent in a second step. Awkward because the agent's research and the main call need to be in the same closure.
2. **Single-step pattern with per-call accumulator.** The route or Inngest function creates an empty array, passes it into the agent factory as part of `BuildResearchToolsInput`, the agent's tool execute functions push entries into it, and the array is captured as part of the step return value or read back by the route after the agent returns.

We picked the per-call accumulator pattern because it lets the agent's research and main call live in the same step, keeps the audit log atomic with the main write (same Prisma transaction), and never produces partial state.

### Why ToolSet, not an interface
TypeScript: `interface ResearchTools { exa_search?: Tool; tavily_search?: Tool }` does not satisfy `Record<string, Tool>` because optional named keys lose the index signature. Passing such an interface into `generateText({ tools })` produces an index-signature mismatch error. The fix is `type ResearchTools = ToolSet` which is `Record<string, Tool>` directly — TypeScript narrows the runtime shape down to whatever subset of tools is actually present, and `generateText` accepts the value without any cast.

### Why `.transform()` instead of `.max()` on LLM output strings
Anthropic's structured-output endpoint does not consistently enforce string-length constraints during generation. The model produces a string longer than the schema's `.max()`, the response is structurally valid JSON, and the AI SDK's post-hoc Zod parse rejects the entire response as `AI_NoObjectGeneratedError`. This is the failure mode CLAUDE.md was written to prevent. The CodeRabbit triage pass found one violation in `checkin-agent-schema.ts` (`message: z.string().max(2000)`) and fixed it with a `.transform()` post-clamp, plus added the same pattern for `parkingLotItem.idea` where CodeRabbit had wrongly suggested adding `.max(280)`.

---

## 6. Files Changed (Final State)

### `lib/research/` — the substrate (1078 lines across 9 files, all under cap)

```
client/src/lib/research/
├── index.ts                    45 lines  — public API barrel
├── types.ts                   110 lines  — Zod schemas + agent/tool unions
├── constants.ts                97 lines  — per-agent step budgets, timeouts, render caps
├── tavily-client.ts           120 lines  — Tavily transport
├── exa-client.ts              136 lines  — Exa transport
├── render-summaries.ts        115 lines  — per-provider renderers + error renderer
├── tools.ts                   259 lines  — buildResearchTools factory + guidance constants
├── interview-pre-research.ts  141 lines  — streaming-compat pre-pass for interview
└── log-helpers.ts              55 lines  — safeParseResearchLog + appendResearchLog
```

### Agents migrated (5 files)
- `lib/discovery/synthesis-engine.ts` — recommendation agent
- `lib/discovery/pushback-engine.ts` — pushback agent
- `lib/roadmap/checkin-agent.ts` — check-in agent
- `lib/continuation/brief-generator.ts` — continuation agent
- `lib/discovery/question-generator.ts` (via interview-pre-research) — interview agent

### Routes updated (3 files)
- `app/api/discovery/sessions/[sessionId]/turn/route.ts` — interview turn route
- `app/api/discovery/recommendations/[id]/pushback/route.ts` — pushback turn route
- `app/api/discovery/roadmaps/[id]/tasks/[taskId]/checkin/route.ts` — check-in route

### Inngest functions updated (3 files)
- `inngest/functions/discovery-session-function.ts` — recommendation generation
- `inngest/functions/continuation-brief-function.ts` — continuation brief generation
- `inngest/functions/pushback-alternative-function.ts` — pushback alt synthesis

### UI updates (5 files)
- `components/discovery/ThinkingPanel.tsx` — removed `'researching'` step from progress indicator
- `app/(app)/discovery/roadmap/[id]/WhatsNextPanel.tsx` — draft preservation on submit failure
- `app/(app)/discovery/roadmap/[id]/useContinuationFlow.ts` — boolean return + founder turn preservation
- `app/(app)/discovery/roadmap/[id]/continuation/ContinuationView.tsx` — clear failed flag on success
- `app/(app)/discovery/roadmap/[id]/continuation/BriefSections.tsx` — defensive parking-lot fallback

### Schema fixes (2 files)
- `lib/roadmap/checkin-agent-schema.ts` — `.max()` → `.transform()` clamps
- `lib/continuation/evidence-loader.ts` — `parse()` → `safeParse()` with discriminated failure

### Tooling consolidation (5 files)
- `client/package-lock.json` — deleted (24,479 lines)
- `.gitignore` — added `package-lock.json` + `yarn.lock` ignore
- `client/.gitignore` — same protection inside the client working dir
- `client/.claude/settings.local.json` — pnpm allow + npm/yarn deny
- `CLAUDE.md` — new "Package Manager" section

### Configuration (2 files)
- `client/package.json` — added `exa-js ^2.11.0` dependency
- `client/src/lib/env.ts` — added optional `EXA_API_KEY` to env schema

---

## 7. Validation & Test Coverage

**TypeScript:** zero new errors introduced by any commit on this work. The CodeRabbit triage pass measured baseline 59 errors and post-fix 59 errors — every error is in unrelated pre-existing files (`validation-reporting-function.ts`, `api-error.ts`, etc) and stems from `.next/types` not being generated in this checkout, not from research-tool changes.

**Lint:** ran clean on every commit through the merge to dev. The CodeRabbit triage pass could not run lint locally because of a corrupt `language-subtag-registry/data/json/registry.json` in `node_modules` (environment issue unrelated to the changes); the next CI run on push will catch any lint regressions.

**Manual smoke test:** the substrate has run end-to-end on dev with both providers configured, with only Tavily configured, with only Exa configured, and with neither configured. In all four configurations every agent produces its structured output. The `researchLog` audit columns received entries with the new `tool` field for both providers.

**Test stack note (per CLAUDE.md priority hierarchy):** unit tests are intentionally added as the LAST stage of the codebase cleanup sequence (per CLAUDE.md "tests last"). The research-tool work has not been backfilled with unit tests yet; the highest-priority test targets when that pass runs will be:
1. The per-call accumulator reset semantics inside `withModelFallback` retries
2. The `getResearchToolGuidance()` per-environment branch logic
3. The defensive `renderUserContent` wrapping in `interview-pre-research` and `question-generator`
4. The `clampString` post-clamp in `checkin-agent-schema`
5. The `safeParseResearchLog` backward-compat parser against legacy `'synthesis'` agent rows

---

## 8. Memory & Documentation

The work was tracked in the auto-memory system as it progressed:

- **`research_tool_b_changes_inprogress.md`** — created at the start of the B1+B2+B3 work as a compaction-safe checkpoint, marked COMPLETED at the architectural flip.
- **`MEMORY.md`** — index entry updated to reflect commit `5160a18` and branch `feat/research-tool-b1b2b3`.

Canonical project docs that mention the research substrate:
- **`docs/neuralaunch-research-tool-spec.md.md`** — the original spec the orchestrator-era work implemented
- **`docs/neuralaunch-post-execution-changes-queue.md`** — section A (deferred items) and section B (the B1+B2+B3 architectural flip that this work delivered)
- **`CLAUDE.md`** — gained the "Package Manager" section as a side effect of the tooling consolidation

This delivery report itself (`docs/RESEARCH_TOOL_DELIVERY_REPORT.md`) is the canonical end-to-end record.

---

## 9. What's Next

The branch `feat/research-tool-b1b2b3` is at HEAD `826e463`, awaiting the user's call to merge to dev. After merge:

- **Section A** of `docs/neuralaunch-post-execution-changes-queue.md` (items A1-A6) is the next deferred work queue. None of those items are blocking and the user has not asked for them yet.
- **Test backfill** for the priority targets in §7 is the natural follow-up under the codebase cleanup test-last sequence.
- **Audit log analysis** — once the new `tool` field has been writing for a few weeks of real founder traffic, we can analyse `researchLog` to validate that agents are picking the right provider for the right query type. If they're consistently picking wrong, the prompt guidance in `RESEARCH_TOOL_USAGE_GUIDANCE` is the lever.

The substrate is shipped, hardened, and architecturally clean. The next move is the merge.

---

*NeuraLaunch — Built with precision by Saheed Alpha Mansaray*
*Research tool delivery report — 2026-04-12*
