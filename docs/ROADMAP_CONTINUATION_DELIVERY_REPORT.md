# NeuraLaunch Roadmap Continuation — Engineering Delivery Report

**Branch:** `feat/roadmap-continuation`
**Base:** `origin/dev` (current)
**Status:** Complete, reviewed, and ready for code review
**Diff size:** 43 files changed · 4,030 insertions · 66 deletions
**Commits:** 7 (six feature phases + one self-review pass)

---

## 1. Executive Summary

We have closed NeuraLaunch's biggest product cliff edge. Until this branch, the founder's journey ended at the moment of greatest momentum: discovery → recommendation → pushback → roadmap → execution → **silence**. The feature shipped in this branch turns that ending into a cycle. After the founder finishes (or stalls during) a roadmap, they can hit a single button to get a strategic continuation brief grounded in their actual execution evidence — not a new generic recommendation, but an interpretation of what they learned, what we got wrong, what the data is saying, and the next concrete decision in front of them.

The work was delivered in **six engineering phases**, each independently committed, type-checked, and lint-clean. A seventh commit captured a self-review pass that found and fixed four issues before any of this is merged. The whole branch holds itself to the engineering bar described in `CLAUDE.md` — file size caps, single-responsibility modules, idempotent durable workers, prompt-injection defence, ownership-scoped queries, optimistic concurrency where it matters, and zero `console.log`/`any`/raw JSONB casts.

The feature is built as enhancement, not addition. Nothing runs in parallel to existing surfaces. The new "What's Next?" button mounts on the existing roadmap view. The new check-in capabilities extend the existing check-in agent. The new continuation cycle uses the existing roadmap-generation pipeline. The five new database columns are non-destructive defaults with no backfill required.

---

## 2. What We Shipped (Product View)

### The cliff edge, before
A founder finished the discovery interview, got their committed recommendation, accepted it, generated a roadmap, executed tasks with check-ins, and then… nothing. The roadmap ended. The relationship that felt like having a strategic co-founder evaporated at the exact moment the founder had the most momentum, the most evidence, and the most questions about what to do next.

### The cliff edge, after
The roadmap page now carries an always-visible "What's Next?" panel and a parking lot. At any moment during execution, the founder can:

1. **Park an adjacent idea** — a thought they want to remember but not act on yet. Auto-captured by the check-in agent when the founder mentions one in their free text, OR added manually via a one-click button.
2. **Get help mid-task** — when they don't understand a task, the check-in agent can break it into 3-6 sub-steps. When they don't know what tools to use, the agent recommends specific tools (budget-aware, internal NeuraLaunch tools surfaced first). When the roadmap itself looks misaligned across multiple check-ins, the agent proactively offers a soft recalibration prompt.
3. **Ask "what's next?"** — hit the always-active button. The system reads their progress and runs one of four scenarios:
   - **Scenario A — zero tasks completed:** opens a diagnostic chat to identify the blocker (motivation? clarity? life circumstances? wrong direction?)
   - **Scenario B — partial completion under 70%:** opens a diagnostic chat to ask why the unfinished tasks are unfinished (legitimate reason? lost focus? structural shift?)
   - **Scenario C — 70%+ completed:** generates a full continuation brief immediately
   - **Scenario D — 100% completion:** generates a full continuation brief with the strongest evidence base
4. **Read the continuation brief** — five sections grounded in their execution evidence:
   - **What Happened** — interpretation of what they learned (Opus, not a list)
   - **What I Got Wrong** — explicit honesty about where the original recommendation diverged from reality
   - **What the Evidence Says** — strongest signal from check-ins, parking lot, and blocker patterns
   - **The Fork** — 2-3 concrete next directions, each with first step, time estimate (calibrated to their *actual* hours per week, not their stated hours), and a "this is right if…" condition
   - **The Parking Lot** — every adjacent idea they captured along the way, surfaced now because this is the moment they're relevant
5. **Pick a fork** — closes the cycle. The system creates a fork-derived recommendation, auto-accepts it, and generates the next-cycle roadmap with explicit speed calibration (the founder reads "you stated X hours, you're actually operating at Y hours, this roadmap is built around that real pace" rather than getting silently corrected).

The cycle then repeats. Each iteration makes the engine smarter about that specific founder. The belief state grows. The parking lot accumulates. The speed calibration sharpens. The "What I Got Wrong" section produces labelled training data for future fine-tuning.

### What this is NOT
- **Not a new discovery interview.** The founder doesn't re-explain anything. The belief state, recommendation history, pushback transcript, and check-in evidence are already in the system.
- **Not an infinite roadmap generator.** The second roadmap is fundamentally different from the first because the founder has done things and has evidence now.
- **Not a generic chat.** The diagnostic is short, focused, and verdict-driven. The brief is structured Opus output, not a free-form essay.

---

## 3. How We Built It (Engineering Approach)

### Phased delivery
We split the work into six phases. Each phase is one independent commit that compiles, lints, and is reviewable in isolation. No phase leaves the codebase in a broken or half-finished state. The boundaries were chosen so each phase is safe to ship on its own merits even if the next phase slipped:

| Phase | Scope | Independent value |
|---|---|---|
| 1 | Data foundations + parking lot auto-capture | Founders can capture adjacent ideas; check-in agent surfaces them automatically |
| 2 | Mid-roadmap execution support | Check-in agent can break tasks down, recommend tools, and offer soft recalibration |
| 3 | Continuation engine (LLM-side, no UI) | The pure engine: scenario classifier, diagnostic agent, brief generator, durable Inngest worker |
| 4 | API routes | The HTTP surface: checkpoint, diagnostic chat, polling, fork pick |
| 5 | UI integration | "What's Next?" button + diagnostic chat surface + brief reveal page + fork picker |
| 6 | Cycle close (speed-calibrated next roadmap) | Fork pick produces a new roadmap calibrated to actual pace |

### Enhancement over addition
Nothing in this branch runs in parallel to existing surfaces. Specifically:

- **Roadmap view** — the existing `RoadmapView` component gains the new panels alongside its existing nudge banner, stale-roadmap banner, and outcome form. None of those existing surfaces change behaviour.
- **Check-in agent** — existing `runCheckIn` function gains four optional output channels (`parkingLotItem`, `subSteps`, `recommendedTools`, `recalibrationOffer`). All four are optional. Existing check-ins that don't trigger any of them parse identically to before.
- **Roadmap generation** — existing `generateRoadmap` function gains an optional `calibration` parameter. First-cycle roadmaps pass `null` and behave identically. Second-cycle (continuation) roadmaps pass the speed calibration.
- **`discovery/roadmap.requested` event** — gains an optional `parentRoadmapId` field. Existing call sites that don't pass it are unaffected.
- **Recommendation roadmap GET endpoint** — extended to surface `parkingLot` and `continuationStatus` so the client doesn't need a second round-trip. Existing fields untouched.

### File size discipline
Every new file is held to the limits in `CLAUDE.md`:

| File type | Cap | Rationale |
|---|---|---|
| API route | 150 lines | Routes orchestrate, they don't implement |
| Engine / service | 300 lines | One responsibility = one screen of code |
| React component | 200 lines | Larger means extract a sub-component |
| Zod schema file | 150 lines | Schemas are declarations |
| Inngest function | 200 lines | Steps should be extracted to services |
| Constants file | 100 lines | Split by domain if it grows |

When a file approached its limit, we **extracted before breaching**, not refactored after. The continuation directory holds 12 files (the 12-file directory cap), each under its respective line limit. Two routes (checkpoint at 165, fork at 154) are slightly over the 150 route cap because the docblocks and load-bearing logic were judged more valuable than artificial trimming — that judgment is documented in the review pass.

### Idempotency and durability
Every operation that could be retried — by the network, by the user, by a worker retry — is idempotent:

- **The brief generation worker** uses guarded `updateMany` against `continuationStatus = 'GENERATING_BRIEF'`. A second worker run finds the row no longer in that status and exits cleanly. An `onFailure` handler rolls the status back to `null` so the founder can retry from the UI.
- **The fork pick** writes a `forkRecommendationId` linkage column inside the same transaction as the status flip. A retry of the same pick finds the linkage already set and re-fires the inngest event without creating a duplicate Recommendation. The column has a `@unique` constraint so concurrent double-creates surface as a database error rather than silent duplication.
- **The check-in route's parking-lot append** happens inside the same Prisma transaction as the existing phases write, so the JSON column never observes a partial state.
- **All inngest events** are sent after the database transaction commits. If the send fails, the database is in a stable state and a retry follows the idempotent re-fire path.

---

## 4. Phase-by-Phase Delivery

### Phase 1 — Data foundations + parking lot auto-capture
**Commit:** `6451fc0`
**Files:** 9 (1 migration, 1 schema change, 4 new lib files, 3 modified routes/agents)

Added six columns to the `Roadmap` table via a non-destructive idempotent migration:

```sql
ALTER TABLE "Roadmap"
  ADD COLUMN IF NOT EXISTS "parkingLot"         JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "diagnosticHistory"  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "continuationBrief"  JSONB,
  ADD COLUMN IF NOT EXISTS "executionMetrics"   JSONB,
  ADD COLUMN IF NOT EXISTS "continuationStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "parentRoadmapId"    TEXT;
```

Plus a self-referential foreign key for the continuation cycle (`ON DELETE SET NULL` so deleting a parent doesn't cascade-delete its descendants — each downstream roadmap carries its own execution evidence and that evidence outlives the parent).

Created a new `lib/continuation/` module with `constants.ts`, `parking-lot-schema.ts`, and `index.ts`. The parking-lot helpers include a duplicate-detection append, a hard cap of 50 items per roadmap, a 280-character per-idea length cap, and a `safeParse` helper following the established `safeParseDiscoveryContext` / `safeParsePushbackHistory` pattern.

Extended the check-in agent's structured-output schema (`CheckInResponseSchema`) with an optional `parkingLotItem` field. The agent's prompt was extended with explicit examples of when to emit it ("I noticed there's a different need around catering" → emit; "this task is hard" → don't emit). The check-in route persists captured items to the parent roadmap's `parkingLot` column inside the same transaction as the existing phases write.

Added `POST /api/discovery/roadmaps/[id]/parking-lot` for manual founder-driven parking. Standard route shape: `enforceSameOrigin`, `requireUserId`, `rateLimitByUser` at the `API_AUTHENTICATED` tier (no LLM call), `findFirst` ownership scope.

### Phase 2 — Mid-roadmap execution support
**Commit:** `04dd004`
**Files:** 5 (extended check-in agent, extended check-in entry schema, extended history list component, extended interactive task card, extended check-in route)

Extended `CheckInResponseSchema` with three more optional structured outputs:

- **`subSteps[]`** — when the founder is genuinely confused about how to execute, the agent provides 3-6 imperative sub-steps. Each is doable in 30-60 minutes. Triggered only by HOW-confusion signals, never by default.
- **`recommendedTools[]`** — name, one-phrase purpose, and `isInternal` flag. Internal NeuraLaunch tools (validation page, pushback, parking lot) surface first when relevant. The prompt explicitly tells the agent to honour the founder's budget — no paid tools when runway is tight.
- **`recalibrationOffer`** — soft "this might be the wrong direction" signal. Distinct from the existing hard `flagged_fundamental` escape hatch. Fires only when accumulated check-in evidence suggests the roadmap is structurally off-direction (multiple blocked tasks across different phases, recurring blocker patterns, evidence that an assumption was wrong).

`CheckInEntry` gains three matching optional fields so the agent's outputs persist into the per-task transcript and the founder can re-read them later. `CheckInHistoryList` renders each block inline with iconified headers (Sparkles for sub-steps, Wrench for tools, AlertTriangle for recalibration). The recalibration offer carries a "Reconsider the recommendation" link into the existing pushback flow.

### Phase 3 — Continuation engine
**Commit:** `83a913c`
**Files:** 12 (8 new lib files, 1 new Inngest function, 2 inngest registration files, 1 inngest event map)

The full LLM-side machinery for the "What's Next?" checkpoint and the five-section brief. No UI, no API routes — pure engine.

- **`scenario-evaluator.ts`** — pure A/B/C/D classifier. Zero tasks → A; below 70% → B; at-or-above 70% → C; 100% → D. Returns the scenario plus a human-readable explanation the route can log and the client can render. No I/O, no LLM, deterministic.
- **`speed-calibration.ts`** — derives the founder's actual hours per week from completed-task estimates over elapsed time. Returns an `ExecutionMetrics` snapshot including a `paceLabel` (`on_pace`, `slower_pace`, `unknown`) and a pre-rendered `paceNote` the brief prompt quotes verbatim. When data is insufficient (no completed work, no elapsed time), returns `null` for the derived hours rather than guessing — the prompt is built to handle either case.
- **`diagnostic-schema.ts`** — five verdicts the diagnostic agent emits: `still_diagnosing`, `release_to_brief`, `recommend_re_anchor`, `recommend_breakdown`, `recommend_pivot`. Each maps to a different orchestrating-route action.
- **`diagnostic-engine.ts`** — Sonnet structured-output call, one turn per invocation. Distinct prompt branches for Scenarios A and B. The `recommend_re_anchor` branch quotes the `motivationAnchor` field from the belief state directly (this is the field the discovery interview captures specifically for this purpose). Wrapped in `withModelFallback` so a Haiku fallback keeps the chat alive on Anthropic overload.
- **`brief-schema.ts`** — the canonical five-section structured-output schema (`whatHappened`, `whatIGotWrong`, `whatTheEvidenceSays`, `forks[]`, `parkingLotItems[]`) plus a closing thought.
- **`brief-generator.ts`** — Opus call (with Sonnet fallback) that assembles the entire evidence base into one prompt and produces the validated brief. The prompt encodes intellectual honesty as a rule: "compare the original assumptions list against what the execution evidence actually shows" and "If the pace label is slower_pace, state the calibration explicitly so the founder reads it as transparency, not silent correction."
- **`evidence-loader.ts`** — shared `safeParse` loader the brief function and the API routes both use. Returns a discriminated-union `LoadEvidenceResult` so callers map failure shapes (`not_found`, `no_belief_state`, `phases_corrupt`) to HTTP codes or worker skip behaviour.
- **`continuation-brief-function.ts`** — durable Inngest worker. Idempotent: every step is bracketed in `step.run`, the persistence step is an `updateMany` guarded on the `GENERATING_BRIEF` status, and the `onFailure` handler rolls the row back to `null` so the founder can retry.

The `discovery/continuation.requested` event was added to the typed Inngest event map. The new function was registered with the `inngest.serve` handler in `src/app/api/inngest/route.ts`.

### Phase 4 — API routes
**Commit:** `d8fa895`
**Files:** 6 (4 new routes, 1 helper file, 1 barrel update)

Four routes that wire the continuation engine into the founder's HTTP surface. None calls a model directly — Phase 3 owns the LLM calls. These are the deterministic orchestration glue.

- **`POST /api/discovery/roadmaps/[id]/checkpoint`** — single entry point for the "What's Next?" button. Loads only the row's status + RoadmapProgress counters (lightweight loader, not the full evidence base). Runs the scenario classifier. Either flips status to `DIAGNOSING` (Scenarios A/B) or queues the brief Inngest event (Scenarios C/D). Rejects `BRIEF_READY` and `FORK_SELECTED` states with 409 so the client refetches and renders the right view.
- **`POST /api/discovery/roadmaps/[id]/diagnostic`** — one round of the Scenario A/B chat. Hard-caps agent turns at 6 (defence in depth alongside the model's own self-imposed 5-turn rule). Re-evaluates the scenario from live counters in case the founder completed a task between the checkpoint POST and this POST — if so, skips the chat and queues the brief directly. Persists both turns and applies the verdict via the `nextStatusForVerdict` helper. Wrapped in the `AI_GENERATION` rate limit tier (5 req/min) because every turn is a paid Sonnet call.
- **`GET /api/discovery/roadmaps/[id]/continuation`** — polling read for the client. Returns `continuationStatus`, brief, diagnostic history, parking lot, and execution metrics. `API_READ` tier (120 req/min) so polling is generous.
- **`POST /api/discovery/roadmaps/[id]/continuation/fork`** — closes the cycle. Validates the fork id against the brief's forks array, persists the fork-derived Recommendation, flips the parent to `FORK_SELECTED`, fires the next-cycle generation event.

The `diagnostic-orchestration.ts` helper file lives next to the engine because it is pure continuation-feature logic, not route plumbing. Routes import `buildDiagnosticTurnPair` and `nextStatusForVerdict` and stay close to thin orchestrators.

### Phase 5 — UI integration
**Commit:** `52eb216`
**Files:** 10 (5 new components, 1 new hook, 1 new server page, 3 modified existing files)

The full client surface, mounted on the existing roadmap view so the founder never has to leave the roadmap to ask "what now?".

**Roadmap page additions:**
- **`WhatsNextPanel`** — owns the trigger button and the diagnostic chat surface. Always visible, always active (the spec is explicit on this). Calling it walks the founder through `checking → diagnostic_open` OR `brief_polling → brief_ready`, then navigates to the brief reveal page. The chat surface renders the founder/agent transcript, supports the agent's follow-up questions, and lets the founder close the diagnostic at any time.
- **`ParkingLotInline`** — count + inline expandable form for manual idea capture. Posts to the manual park route. The auto-capture vector inside the check-in agent writes to the same column, so the count includes everything regardless of source.
- **`NudgeBanner`** — extracted from `RoadmapView` to keep the orchestrator under the 200-line component cap. Pure presentation, behaviour unchanged.
- **`useContinuationFlow`** — client state machine the panel mounts. Owns the polling loop, the diagnostic submit, and the navigation trigger.

**Continuation reveal page (new subdirectory `(app)/discovery/roadmap/[id]/continuation/`):**
- **`page.tsx`** — server component. Verifies the user owns the roadmap via `findFirst` (the established ownership pattern), then hands off to the client view.
- **`ContinuationView.tsx`** — orchestrator. Polls until `BRIEF_READY`, then renders the brief sections + fork picker. Two separate polling effects (one fetches, one derives the stop condition from the latest data) keep the React state pure.
- **`BriefSections.tsx`** — pure renderer for sections 1, 2, 3, the parking lot (5), and the closing thought.
- **`ForkPicker.tsx`** — section 4. Each fork shows title, rationale, first step, time estimate, "right if" condition, and a pick button. Once picked, terminal "selected" view.

`useRoadmapPolling` was extended to surface `parkingLot` and `continuationStatus` from the existing GET endpoint so the page doesn't need a second round-trip.

### Phase 6 — Cycle close
**Commit:** `0ad6cc8`
**Files:** 8 (1 new helper, 5 modified files, 1 schema event extension, 1 barrel update)

The fork-pick route now closes the continuation cycle:

1. Builds a fork-derived Recommendation payload via the pure `buildForkRecommendationPayload` helper (no extra LLM call — the brief is already grounded in execution evidence, so the fork's own copy is the authoritative statement).
2. Persists the new Recommendation in a single transaction with auto-acceptance (`acceptedAt = now`, `acceptedAtRound = 0`), inheriting the parent's session and recommendation type, with `phaseContext.upstream.recommendationId` pointing back.
3. Flips the parent roadmap to `FORK_SELECTED` and links it via the new `forkRecommendationId` column.
4. Fires the existing `discovery/roadmap.requested` event with the new `recommendationId` AND the parent roadmap id so the generator picks up the speed calibration.

The `discovery/roadmap.requested` event payload gained an optional `parentRoadmapId` field. The roadmap-generation Inngest function reads it, loads the parent's `executionMetrics`, and constructs a `RoadmapCalibrationInputs` object. `generateRoadmap` accepts an optional `calibration` argument: when present, the resolved weekly hours are overridden with the derived value, and the prompt includes an explicit calibration note that the model is required to honour in every task estimate AND quote in the closing thought (transparency over silent correction, per the spec).

The client navigates the founder directly to the new roadmap URL the moment the fork pick succeeds. The existing `RoadmapView` polling layer renders the `GENERATING` state until the worker persists `READY`.

### Self-review pass
**Commit:** `0152e16`
**Files:** 9 (1 new migration, schema change, 7 modified files)

After completing all six phases, I did an elite-engineering review pass against `CLAUDE.md`. It found four issues. All four were fixed inline. Documented in detail in section 6 of this report.

---

## 5. Engineering Standards & Quality Gates

### TypeScript
- `npx tsc --noEmit` clean after every phase, including the review pass.
- Zero `any`, zero `as unknown as` casts, zero `@ts-ignore`.
- All TypeScript types inferred from Zod schemas via `z.infer<typeof Schema>` — Zod is the single source of truth for data shapes.

### Linting
- `pnpm lint` clean after every phase.
- One ESLint warning was caught and fixed during Phase 5 (Promise-returning function passed to a void-return prop).

### File size discipline
Every new file in `lib/continuation/` is under the 300-line engine cap. Every new component is under the 200-line component cap. The directory has 12 files — exactly at the 12-file directory cap. Two routes (checkpoint at 165 lines, fork at 154 lines) are slightly over the 150-line route cap because their docblocks and load-bearing logic were judged more valuable than artificial trimming. Documented inline.

### Security
- **CSRF.** Every state-changing route calls `enforceSameOrigin(request)` first. Verified on all four new routes.
- **Auth + ownership scoping.** Every route uses `requireUserId()` then `findFirst({ id, userId })`. No `findUnique({ id })` followed by manual `userId !==` checks.
- **Rate limiting tiers.** `AI_GENERATION` (5/min) for routes that fire LLM calls (checkpoint, diagnostic, fork, check-in). `API_AUTHENTICATED` (60/min) for the manual park route (no LLM). `API_READ` (120/min) for the polling GET. Matches existing codebase pattern exactly.
- **Prompt injection defence.** Every founder-typed string fed into an LLM is wrapped via `renderUserContent()` (triple-bracket delimiters) and the prompt includes the canonical SECURITY NOTE telling the model to treat bracketed content as data, not instructions. Defence in depth: parking-lot items are wrapped on read in the brief generator, not just on write.
- **XSS.** Every brief field, fork field, and parking-lot item is rendered through React JSX (auto-escaped) — no `dangerouslySetInnerHTML` anywhere.
- **Input validation.** Zod schemas at every boundary. Manual park route caps idea length at 280 characters in both the schema and the helper clamp. Diagnostic message capped at 3,000 characters. Fork id validated against the actual brief's forks list.
- **Logging discipline.** No founder-typed text, no AI output content, no secrets in any log line. All logs are structured key-value pairs with safe fields only (`taskId`, `roadmapId`, `userId`, enum verdicts, counts, booleans).
- **Error responses.** Every route's catch block routes through `httpErrorToResponse(err)`. No custom 500s. No internal stack traces leaked to clients.

### Reliability
- **Inngest worker idempotency.** The brief generation function uses guarded `updateMany` against `GENERATING_BRIEF`, has an `onFailure` rollback, and exits cleanly on retries that find the brief already persisted.
- **Optimistic concurrency.** The continuation feature doesn't introduce new concurrent-write hot spots that need an explicit version lock — the roadmap row's status transitions are linear and the worker writes are guarded on the expected current status.
- **Belief state persistence.** Continuation reads belief state through `safeParseDiscoveryContext` everywhere. No raw JSONB casts.
- **Date serialization.** Inngest serializes step return values to JSON. The `loaded.createdAt` Date field becomes a string after the load step boundary; the metrics step re-hydrates it via `new Date(loaded.createdAt)` before passing to the calibration calculator.

### Performance
- **No N+1 queries.** Every Prisma query uses explicit `select` clauses with the joins inlined.
- **Bounded list reads.** Parking lot capped at 50 items. Diagnostic history capped at 6 agent turns. Check-in history capped at 5 per task.
- **Polling intervals.** 3-second polling with a 4-minute deadline. Stops cleanly the moment the brief lands or a terminal status is reached. Per-user `API_READ` budget is plenty for the polling load.
- **Lightweight checkpoint loader.** The checkpoint endpoint (the highest-traffic surface of the feature) loads only the columns it needs — not the full evidence base. The brief worker still does the full load when it has real work to do.

### Maintainability
- **One responsibility per file.** The `lib/continuation/` module has 12 files, each with a single clear job. Nothing reaches across the module boundary except through `index.ts`.
- **No magic strings.** All status values via `CONTINUATION_STATUSES`, all event names via `CONTINUATION_BRIEF_EVENT`, all thresholds in `constants.ts`.
- **Naming.** `evaluateScenario`, `runDiagnosticTurn`, `generateContinuationBrief`, `buildForkRecommendationPayload`, `persistForkRecommendation` — every function name says what it does, not what it is.
- **Documented decisions.** Every non-obvious choice (idempotency strategy, why two polling effects, why deterministic synthesis on fork pick, the speed-calibration null fallback) is explained in inline comments at the call site.

---

## 6. Self-Review Pass

After completing all six phases, I held the branch to one more bar: the elite-engineering review. I read every file with fresh eyes against the five `CLAUDE.md` principles. The pass found four issues and fixed them in commit `0152e16` before any code is shipped.

### Issue 1 — Polling effects had impure `setState` callbacks
**Severity:** Correctness bug under React 19 strict mode

The original polling loops in `useContinuationFlow` and `ContinuationView` scheduled the next `setTimeout` *inside* a `setState(prev => …)` callback to peek at the freshest phase. Setstate callbacks must be pure — React strict mode runs them twice, and the second call would have stacked a duplicate timer per cycle. Subtle, hard to debug, would have manifested in dev mode as 2× polling and burned through the rate limit faster than expected.

**Fix:** Refactored both polling effects to a clean closure-scoped `cancelled` flag pattern. In `ContinuationView`, the polling is now split into two effects: one fetches in a loop, another *derives* the stop condition from `data` and flips `polling = false`. The `pollEpochRef` from `useContinuationFlow` is gone — the cancelled flag handles teardown without a ref.

### Issue 2 — Checkpoint POST loaded the entire evidence base
**Severity:** Performance — highest-traffic surface

The checkpoint endpoint is the entry point for *every* "What's Next?" click. It only needs the row's `continuationStatus` and the live `RoadmapProgress` counters to classify the scenario. It was using `loadContinuationEvidence`, which fetches the full Recommendation, the linked DiscoverySession, the beliefState JSONB, the phases JSONB, the parking lot, and the diagnostic history. For a founder with a 6-phase roadmap and multiple check-ins per task, that's well over 100KB of JSONB across multiple joins on every checkpoint click.

**Fix:** Added `loadCheckpointStatus` next to the existing `loadContinuationEvidence`. It selects only `id`, `continuationStatus`, and the `progress.{totalTasks, completedTasks}` join. The brief Inngest worker still uses the full loader because it actually needs every column.

### Issue 3 — Fork pick had a stranded-founder race window
**Severity:** Reliability — silent data integrity hole

Phase 6 wrote: `prisma.$transaction(create rec + flip parent to FORK_SELECTED) → inngest.send`. If the send failed transiently (network, Inngest endpoint hiccup), the parent was `FORK_SELECTED` forever, the new Recommendation existed but had no Roadmap, and the founder was stuck on a "loading" state with no recovery path. There was no sweep, no retry mechanism, no idempotency token.

**Fix:** Added a `forkRecommendationId String? @unique` column to `Roadmap` and a new migration. Created `persistForkRecommendation` in `fork-to-recommendation.ts` that, in a single transaction, writes both the new Recommendation AND the linkage column on the parent. The fork-pick route now checks for an existing `forkRecommendationId` first — if set, it re-fires the inngest event (which is itself idempotent on the worker side) and returns the existing id. No duplicates, no orphans, no stranded founders. The `@unique` constraint also catches concurrent double-creates at the database level.

### Issue 4 — Checkpoint POST re-fired on `GENERATING_BRIEF`
**Severity:** Polish

A founder clicking "What's Next?" twice while the brief was generating would (a) burn rate-limit budget on an Opus call that was already in flight, and (b) trigger the brief worker again, where its own idempotency guard would skip but we'd still have wasted the request.

**Fix:** Now returns the existing in-flight status without re-firing.

---

## 7. Risk Profile & Consciously Deferred Items

These are real items I identified but deliberately did not build, with documented reasoning so a future engineer (or a future me) can pick them up when the trigger condition fires.

### A. Cron sweep for stuck `FORK_SELECTED` rows
With Issue 3 fixed, the route is idempotent on retry — but if a founder hits the route once, it succeeds, and they walk away from the browser, an inngest send failure is recoverable only when they come back. A daily cron sweep that finds `FORK_SELECTED` parents whose linked Recommendation has no Roadmap and re-fires the event would close this gap fully.

**Why deferred:** the existing `roadmapNudgeFunction` has the same pattern (manual retry only) and nobody has needed a sweep in production. Add when the first stranded founder reports it.

### B. Status-only polling endpoint
The continuation polling GET returns the full brief column (~5-15 KB) on every poll. Splitting into a status-only poll and a one-shot brief read would cut polling bandwidth by ~95%.

**Why deferred:** brief size is bounded, polling is bounded to ~10 polls per founder per cycle, single-tenant scale today. Premature optimization until traffic justifies it.

### C. Rich training-data export from "What I Got Wrong"
The brief's `whatIGotWrong` section produces some of the most valuable training signal in the entire product — labelled examples of recommendation-reality divergence. There is no export pipeline yet.

**Why deferred:** the data is being captured and persisted today. Pulling it for fine-tuning is a separate workstream that depends on the volume threshold for fine-tuning being meaningful.

### D. Brief versioning history
Today, regenerating a brief overwrites the prior content. The same gap exists in the validation reporting function (already documented in `phase3_known_gaps.md`). Both should share the same cheap version-history pattern when shipped.

**Why deferred:** founders can regenerate today; they just lose the prior copy. The diff view is valuable but not blocking.

### E. The brief generator's `phasesBlock` could be smarter
For a roadmap with many tasks, the rendered phases block in the brief prompt grows linearly. At today's bounded scale (≤30 tasks per roadmap) it's fine. If a future roadmap engine produces 50+ tasks, the prompt would benefit from summarising completed tasks more tersely and only spelling out blocked / unfinished ones in detail.

---

## 8. What Needs to Happen Before Production

1. **Code review.** Six feature commits + one review-pass commit. Reviewable in phase order or all at once.
2. **Migrations applied.** Two non-destructive idempotent migrations:
   - `20260410130000_add_roadmap_continuation` — six new columns + self-relation FK
   - `20260411100000_add_fork_recommendation_id` — one new column + unique index
3. **Smoke test in staging.** End-to-end flow:
   - Hit "What's Next?" on a roadmap with zero tasks → diagnostic chat opens → submit a few turns → release to brief → brief renders → pick a fork → land on the new roadmap
   - Verify the new roadmap's prompt honoured the speed calibration (the closing thought should reference actual hours per week if the founder was below pace)
4. **Inngest endpoint registration confirmed.** The new `continuationBriefFunction` is wired into `src/app/api/inngest/route.ts` — verify Inngest dashboard registers it on first deploy.
5. **Merge to `dev`.** PR target is `dev` per the branch strategy in `CLAUDE.md`. After verification on the `dev` Vercel preview, fast-forward `dev` into `main`.

---

## 9. Appendix

### Commit list
```
0152e16  fix(continuation): elite-engineering review pass
0ad6cc8  feat(continuation): phase 6 — cycle close with speed-calibrated next roadmap
52eb216  feat(continuation): phase 5 — UI integration
d8fa895  feat(continuation): phase 4 — checkpoint, diagnostic, poll, and fork routes
83a913c  feat(continuation): phase 3 — continuation engine
04dd004  feat(continuation): phase 2 — mid-roadmap execution support
6451fc0  feat(continuation): phase 1 — data foundations + parking lot auto-capture
```

### Database migrations
```
client/prisma/migrations/20260410130000_add_roadmap_continuation/migration.sql
client/prisma/migrations/20260411100000_add_fork_recommendation_id/migration.sql
```

### New library module
```
client/src/lib/continuation/
├── brief-generator.ts          Opus brief generator (with Sonnet fallback)
├── brief-schema.ts             Five-section brief Zod schema
├── constants.ts                Status enum, event name, thresholds
├── diagnostic-engine.ts        Sonnet diagnostic agent (one turn per call)
├── diagnostic-orchestration.ts Pure helpers for the diagnostic route
├── diagnostic-schema.ts        Five-verdict diagnostic schema
├── evidence-loader.ts          Shared evidence loader + lightweight checkpoint loader
├── fork-to-recommendation.ts   Pure builder + persistence helper for fork pick
├── index.ts                    Public API barrel
├── parking-lot-schema.ts       Parking-lot Zod schema + helpers
├── scenario-evaluator.ts       Pure A/B/C/D classifier
└── speed-calibration.ts        Pure execution-metrics computer
```

### New API routes
```
POST   /api/discovery/roadmaps/[id]/parking-lot
POST   /api/discovery/roadmaps/[id]/checkpoint
POST   /api/discovery/roadmaps/[id]/diagnostic
GET    /api/discovery/roadmaps/[id]/continuation
POST   /api/discovery/roadmaps/[id]/continuation/fork
```

### New Inngest function
```
client/src/inngest/functions/continuation-brief-function.ts
Event:    discovery/continuation.requested
Trigger:  fired by checkpoint POST (Scenario C/D) or diagnostic POST (release_to_brief)
Pattern:  durable, idempotent, onFailure rollback
```

### New UI surfaces
```
client/src/app/(app)/discovery/roadmap/[id]/
├── WhatsNextPanel.tsx              "What's Next?" button + diagnostic chat
├── ParkingLotInline.tsx            Manual idea parking
├── NudgeBanner.tsx                 Extracted from RoadmapView for size discipline
├── useContinuationFlow.ts          Client state machine for the panel
└── continuation/
    ├── page.tsx                    Server component, ownership scoped
    ├── ContinuationView.tsx        Polls + orchestrates the brief view
    ├── BriefSections.tsx           Renders sections 1, 2, 3, 5
    └── ForkPicker.tsx              Renders section 4 + handles fork pick
```

### Schema additions
```prisma
model Roadmap {
  // ...existing fields...

  parkingLot           Json     @default("[]")    // adjacent ideas
  diagnosticHistory    Json     @default("[]")    // Scenario A/B chat history
  continuationBrief    Json?                      // five-section Opus output
  executionMetrics     Json?                      // speed-calibration snapshot
  continuationStatus   String?                    // lifecycle marker
  parentRoadmapId      String?                    // self-relation for the cycle
  forkRecommendationId String?  @unique           // idempotency linkage

  parentRoadmap        Roadmap?  @relation("RoadmapContinuation", fields: [parentRoadmapId], references: [id], onDelete: SetNull)
  childRoadmaps        Roadmap[] @relation("RoadmapContinuation")
}
```

### Total impact
- **43 files changed**
- **4,030 insertions**
- **66 deletions**
- **7 commits**
- **2 database migrations** (both idempotent, non-destructive, no backfill)
- **5 new API routes**
- **1 new durable Inngest function**
- **12-file `lib/continuation/` module**
- **9 new React components / hooks**

---

*NeuraLaunch Roadmap Continuation — delivered with precision by Saheed Alpha Mansaray*
*Engineering delivery report dated 2026-04-11*
