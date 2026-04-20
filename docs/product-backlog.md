# NeuraLaunch — Product Backlog

Items captured during production testing that are real, scoped, and
worth doing — but not urgent enough to block the current stabilization
pass. Listed newest-first. When an item is picked up for execution,
move its status to "In progress" and then strike through / remove when
delivered with a link to the PR or delivery report.

---

## B1 — Multi-provider AI fallback chain across all LLM call sites

**Status:** Backlog
**Category:** Reliability
**Size:** Medium (~1-2 days)
**Owner:** —

### Why

`withModelFallback()` at [lib/ai/with-model-fallback.ts](../client/src/lib/ai/with-model-fallback.ts) currently chains two models from the same provider (Anthropic: Opus → Sonnet). When Anthropic has a regional issue or hits a deterministic failure mode (e.g. the [2026-04-20 pushback incident](./payment-system-prod-readiness-final-delivery-report.md) where both Opus and Sonnet emitted truncated JSON on the same input), the whole agent pipeline fails.

Adding OpenAI and Google Gemini as additional fallback providers substantially reduces the probability of all models failing simultaneously. The probability of three independent vendor outages at once is effectively zero.

### Scope

1. Extend `withModelFallback` from a 2-tier `{ primary, fallback }` config to an N-tier chain: `{ chain: ModelEntry[] }` where each entry carries `{ modelId, provider }`.
2. Install `@ai-sdk/openai` (not yet a dep; `@ai-sdk/google` is already installed via `pnpm-lock.yaml`).
3. Add `OPENAI_API_KEY` validation to `lib/env.ts` alongside the existing `GOOGLE_AI_API_KEY`. Both remain optional (app boots without them; the chain shortens when a key is absent).
4. Apply the N-tier chain to every LLM call site. Candidate order per call site:
   - **Synthesis (recommendation generation):** Opus → Sonnet → GPT-4o → Gemini 2.5 Pro.
   - **Pushback reasoning (Phase 1A):** Opus → Sonnet → GPT-4o → Gemini 2.5 Pro.
   - **Pushback emit (Phase 1B):** Sonnet → Opus → GPT-4o → Gemini 2.5 Flash.
   - **Interview question generation (streaming):** Sonnet → Haiku → GPT-4o → Gemini 2.5 Flash. (Already uses Gemini as 2nd fallback via `question-stream-fallback.ts` — audit and bring into the unified chain.)
   - **Check-in agent, Coach, Composer, Packager, Research, Continuation:** individual chains tuned to each call's cost sensitivity.
5. Update CLAUDE.md §"AI Engine Standards" to reflect the new canonical wrap and remove the Anthropic-only assumptions.

### Non-goals

- Rewriting any agent's prompts. Schema + rendered prompts should flow through the chain unchanged.
- Changing Anthropic prompt caching behaviour. The caching headers only apply to Anthropic calls; OpenAI/Gemini fallbacks will run without cache hits (acceptable because the fallback path is by definition rare).

### Risks to manage

- **Schema compatibility.** Zod schemas that work with Anthropic's structured-output mode may need `.describe()` tweaks for OpenAI's strict mode or Gemini's grammar compiler. Test each chain end-to-end with a deliberately-induced primary failure.
- **Cost control.** Three fallback tiers means a slow-and-silent chain that quietly spends more when the primary is flaky. Instrument `withModelFallback` to increment a metric on every fallback hop so we can alert when the rate crosses a threshold.
- **Quality regression.** Gemini 2.5 Pro is a different model with a different training signal. An emergency fallback that produces a technically valid but qualitatively worse recommendation is better than a 500 — but it needs to be logged and reviewable. Persist the `modelUsed` value on the resulting row (we already do this for streamed messages via `Message.modelUsed`; extend to Recommendation and PushbackResponse rows).

### Dependencies

- [commit `6dea256`](../client/src/lib/discovery/pushback-engine.ts) split pushback into Phase 1A (reasoning) and Phase 1B (emit). This item slots that chain into the new N-tier wrapper.
- Requires `pnpm add @ai-sdk/openai` (user will run — don't auto-install).

---

## B2 — Surface standalone Research Tool outputs inside agent context

**Status:** Backlog
**Category:** Product capability
**Size:** Medium (~1 day)
**Owner:** —

### Why

Today the four standalone tools write their outputs to `Roadmap.toolSessions` and `Roadmap.researchLog`. Those outputs **never flow back into any downstream agent's context**:

- Pushback agent sees only belief state + recommendation + pushback history.
- Check-in agent sees only the current task's context.
- Roadmap-generation agent sees only the recommendation.
- Continuation brief agent sees only roadmap execution metrics + cycle summaries.

So when a founder uses the standalone Research Tool to produce a detailed report on their market, then runs a pushback round where the insights from that report are directly relevant — the pushback agent has no idea the research exists. The founder has to restate the research in the pushback message manually, and even then the agent has to re-research to verify.

The "build enough context about the user" observation from the 2026-04-20 pushback testing session: the research the user explicitly asked the system to do (by using the standalone tool) isn't remembered by the agents that come next.

### Scope

1. **Read path:** extend the context builders used by pushback, check-in, roadmap, and continuation to read `Roadmap.toolSessions` (completed sessions only) and summarise the key findings into a block that slots into the existing prompt prefix.
2. **Summarisation:** each tool session carries a lot of text (a Research Tool report can be 2-5k tokens). Raw inclusion would blow context budgets. Add a `ToolSessionSummary` column on the session (or compute-on-demand) that distills each session to 200-400 tokens: what question was asked, the top 3-5 findings, the cited sources. Generate the summary once per session completion, not per agent call.
3. **Agent prompts:** add a new block "RESEARCH THE FOUNDER HAS ALREADY COMMISSIONED" to the pushback, check-in, roadmap, and continuation prompts. Block is empty when no tool sessions exist.
4. **Per-session freshness flag:** some sessions may become stale if months pass. Mark sessions older than X days as "stale" in the summary so the agent can choose whether to re-research.
5. **Budget bookkeeping:** the extra prompt block consumes input tokens. Audit the total prompt length per agent call after the change and tune the summary token budget if the total lands over a reasonable threshold (say 30k input tokens).

### Non-goals

- No write path from agents back into the tool sessions. Agents consume tool output; they don't modify it.
- No cross-venture memory for Execute-tier users (Execute is capped at 1 active venture, so the tool-session pool is naturally scoped). Compound users with 3 ventures get richer context automatically.

### Risks to manage

- **Prompt bloat.** A founder who uses the Research Tool heavily might produce 10+ tool sessions per venture. The summary-of-summaries approach (top 5 most recent, older ones elided with a pointer to the full session) keeps this bounded.
- **Privacy.** Tool session content reflects the founder's specific market research. If it's fed to every agent call, a bug leaking across users would be much higher-impact. Scope all tool-session reads by `userId` + `roadmapId` strictly.
- **Agent overconfidence.** An agent given a pre-researched answer may stop researching when it should. Prompt guidance must tell the agent to treat tool-session summaries as *one input*, not the ground truth — and to verify claims via its own research tools when the stakes justify it.

### Dependencies

- No code prereqs. This is a new context-wiring feature standing alone.

---

## B3 — Synthesis timeout watchdog + retry UX

**Status:** Backlog (flagged during 2026-04-19 stuck-session incident)
**Category:** Reliability / UX
**Size:** Small (~0.5 day)
**Owner:** —

### Why

If the Inngest synthesis job fails silently (function crashes, retries exhausted, or simply never fires), the client polls `synthesisStep` indefinitely. The founder stares at the ThinkingPanel animation with no timeout and no escape hatch. The [2026-04-19 production incident](./payment-system-prod-readiness-final-delivery-report.md) had the job fail to fire at all because of the dead-path bug (now fixed in [`a865a97`](../client/src/app/api/discovery/sessions/%5BsessionId%5D/turn/route.ts)), but the class of failure will recur for other reasons — Anthropic outages, bugs in future inngest-function refactors, Redis-session TTL expiry mid-synthesis.

### Scope

1. Client-side: if `synthesisStep` hasn't advanced in > 3 minutes, show a "this is taking longer than expected — retry?" escape hatch above the ThinkingPanel.
2. Retry button POSTs to a new `/api/discovery/sessions/[id]/retry-synthesis` route that re-fires the `discovery/synthesis.requested` Inngest event. Idempotent (the function's step.run blocks are all upsert-keyed).
3. Server-side: add a dead-session detector to the existing daily nudge sweep. Any `DiscoverySession` with `status='ACTIVE'`, `completedAt=null`, `synthesisStep` non-null, and `updatedAt` older than 15 minutes gets logged for human review.

### Non-goals

- No automatic retry. A stuck synthesis job that auto-retries on a timer could rack up cost if the root cause is deterministic. Human-in-the-loop confirmation via the escape hatch is the right shape.

### Dependencies

- None.

---

## B4 — Pricing page: "Most Popular" badge driven by real data

**Status:** Backlog
**Category:** Marketing / polish
**Size:** Tiny (~30 min when triggered)
**Owner:** —

### Why

Current Execute badge reads "Recommended" (editorial, defensible pre-data). When the business crosses a threshold (say 30+ paying subscribers AND Execute leading), it should flip to "Most popular" — an honest popularity claim becomes defensible at that point.

### Scope

1. Add `computeExecuteIsMostPopular()` to `lib/paddle/founding-members.ts` returning `true` when both conditions hold: `SELECT COUNT(*) FROM Subscription WHERE tier IN ('execute','compound')` > 30 AND `COUNT(tier='execute') > COUNT(tier='compound')`.
2. Pass the computed boolean into the landing page's Pricing server component.
3. `PricingSection` uses it to flip the badge text.

### Non-goals

- No dashboard / admin toggle. The flip is fully data-driven.

### Dependencies

- None — Paddle integration already ships the underlying data.

---

## Review cadence

Scan this document monthly or when a production incident adds a new item. Items can be deleted outright if they've been superseded; items that ship should be rewritten in the delivery report format instead of left here stale.

*Last reviewed: 2026-04-20*
