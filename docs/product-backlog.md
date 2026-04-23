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

## B6 — Structured pushback cycles (multi-cycle conversation on a single recommendation)

**Status:** Backlog (conditional — revisit only if raised caps in `15aa427` still produce cap-hits mid-convergence)
**Category:** Product capability
**Size:** Medium (~1 day)
**Owner:** —

### Why

Commit `15aa427` raised the pushback round cap to 10 (Execute) / 15 (Compound) after a production test showed the old 7-round cap cutting off productive conversations mid-convergence. The bumped caps likely resolve the typical "long productive back-and-forth" case.

If the new cap is ALSO hit mid-convergence, the architectural answer isn't "raise the cap again" — it's structured cycles. Each cycle caps at N rounds, and when a cycle ends the founder can choose: accept the current refined version, wait for the alternative synthesis, OR start a new cycle with the current refined version as the baseline. Converging conversations keep going; stuck conversations still cap.

### Scope

1. **Schema:** new `pushbackCycles Json @default("[]")` on `Recommendation`, shape `{ cycleNumber, turns, completedAt }[]`. Keep `pushbackHistory` as the current-cycle working set (cleared on cycle rollover). Add `currentPushbackCycle Int @default(1)`.
2. **Route:** new `POST /api/discovery/recommendations/[id]/pushback/new-cycle` — snapshots `pushbackHistory` into `pushbackCycles`, clears `pushbackHistory`, increments `currentPushbackCycle`. Idempotent via `currentPushbackCycle` optimistic concurrency.
3. **UI:** `PushbackChat` at cap shows a "Continue in cycle 2" button alongside the existing "accept" and "wait for alternative" options. New button posts to the new-cycle endpoint and refetches history.
4. **Version panel:** existing `VersionHistoryPanel` (from `c28dd52`) reads `pushbackCycles` so the founder sees the full arc — *"Cycle 1: 10 rounds → refined to v2. Cycle 2: 3 rounds so far."*
5. **Cap on cycles:** Execute = 2 cycles (effective 20 rounds), Compound = 3 cycles (effective 45 rounds). Alternative-synthesis triggers on the final cycle's cap, not the first.

### Non-goals

- No microtransaction "buy more cycles" — economics don't work at micropayment prices (see the analysis in commit `15aa427`'s thread).
- No per-cycle research accumulator partitioning — the existing research log is append-only and works across cycles.

### Risks to manage

- **Complexity vs. just raising the cap.** Only ship this if the 10/15 caps land users mid-convergence repeatedly. Feature bloat otherwise.
- **Cost ceiling.** Execute's effective 20-round worst case ≈ $20 of AI spend per recommendation. Compound's 45-round worst case ≈ $45. Still within tier margins, but worth monitoring.

### Dependencies

- `15aa427` (tier-aware caps) must be live long enough to collect signal on whether 10/15 is sufficient before this item's scope is worth the complexity.

---

## B7 — Sweep `maxOutputTokens` across all `generateText + Output.object` sites

**Status:** Backlog
**Category:** Reliability
**Size:** Small (~1 hour)
**Owner:** —

### Why

The AI SDK's default `maxOutputTokens` is 4096. Every `generateText` call that emits a structured object via `Output.object` is at risk of mid-JSON truncation when the output (plus the model's chain-of-thought) exceeds this limit. Production 500s from pushback (`6dea256`) and research-execute (`e90845c`) both fell to this class of failure.

The remaining call sites with the same pattern, none of which have an explicit `maxOutputTokens`:

| Engine | File | Risk |
|---|---|---|
| `coach:debrief` | [debrief-engine.ts:70](../client/src/lib/roadmap/coach/debrief-engine.ts#L70) | Low — small schema |
| `coach:preparation` | [preparation-engine.ts:149](../client/src/lib/roadmap/coach/preparation-engine.ts#L149) | **Medium** — multi-step prep package, uses research tools |
| `coach:roleplay` | [roleplay-engine.ts:98](../client/src/lib/roadmap/coach/roleplay-engine.ts#L98) | Low |
| `coach:setup` | [setup-engine.ts:99](../client/src/lib/roadmap/coach/setup-engine.ts#L99) | Low |
| `composer:context` | [context-engine.ts:112](../client/src/lib/roadmap/composer/context-engine.ts#L112) | Low |
| `composer:generate` | [generation-engine.ts:185](../client/src/lib/roadmap/composer/generation-engine.ts#L185) | **Medium** — multi-mode drafts, uses research tools |
| `composer:regenerate` | [regeneration-engine.ts:63](../client/src/lib/roadmap/composer/regeneration-engine.ts#L63) | Low |
| `service-packager:*` | `src/lib/roadmap/service-packager/*` | **Medium** — long structured output, uses research tools |
| `checkin-agent` | `src/lib/roadmap/checkin-agent.ts` | Medium |
| `continuation:brief-generator` | `src/lib/continuation/*` | **High** — largest structured output in the system |

### Scope

Add `maxOutputTokens: 16_384` (or schema-appropriate) to every site above. Match the pattern used in the research-execute fix (`e90845c`): inline with a short comment explaining why the explicit cap exists.

### Non-goals

- No architectural refactor (two-phase tool-loop + emit). That belongs in a separate backlog item if any specific site shows the failure class after this sweep.
- No schema changes. The output sizes are what they are — we just need to give the models room to emit them.

### Risks to manage

- **Cost ceiling vs. hallucination spirals.** 16k output tokens at Opus rates ≈ $0.80 per call in the worst case. Bounds the blast radius of a truly broken model output without inviting unbounded spend.

### Dependencies

- Nothing. Pure additive change across 10 files.

---

## B8 — Move research-execute into Inngest

**Status:** Backlog (proactive — current route works but operates close to the 300s ceiling)
**Category:** Reliability / product capability
**Size:** Medium (~1 day)
**Owner:** —

### Why

`POST /api/discovery/roadmaps/[id]/research/execute` runs the deep Opus research tool loop + Phase 2 structured emission. Current shape with the full 25-step budget succeeds reliably after the two-phase split landed in [`39c2cd0`](../client/src/lib/roadmap/research-tool/execution-engine.ts), but an Opus tool step can cost 15-25s wall clock (inference + search provider latency), so a full 25-step session lands in the 4-6 minute range — comfortably under the route's `maxDuration = 300` ceiling in typical runs, brushing it in the worst case.

The architectural answer for any research session that legitimately needs to exceed the serverless ceiling is to stop running long LLM tool loops inside a serverless request handler. Inngest functions have no serverless-timeout ceiling, are durable across step boundaries, auto-retry on transient failures, and let us surface progress to the client via event streams. Moving research-execute to Inngest unlocks:

1. Freedom to raise the spec's top-end (25 → 40+ steps) for genuinely deep competitive analysis without risking timeouts.
2. Graceful handling of Anthropic rate limits and transient errors via `step.run`.
3. A progress-streaming UX (findings arrive as they're discovered, not as a single "done" blob).
4. Shared function infrastructure with synthesis / continuation / roadmap-generation, which are already Inngest-backed for the same reasons.

### Scope

1. New Inngest function `researchExecutionFunction` in `src/inngest/functions/research/execution.ts`, listening on `discovery/research.execution.requested`.
2. Split the existing `runResearchExecution` engine into Inngest-composable steps:
   - `step.run('research:phase1-loop', ...)` — the tool loop (bounded but larger budget).
   - `step.run('research:phase2-emit', ...)` — structured emission.
   - `step.run('research:persist', ...)` — Prisma upsert of the report.
3. The existing execute route becomes a thin event-firer: validate the request, fire `discovery/research.execution.requested`, return `202 Accepted` with a `jobId`.
4. New polling route `GET /api/discovery/roadmaps/[id]/research/execute/status?jobId=...` the client polls for progress. Events: `queued → researching → emitting → complete | failed`.
5. Client flow update in `useResearchFlow.ts`: on submit, store `jobId`, poll every 2s, render incremental progress (finding count) until `complete`, then fetch the final report.
6. Raise `RESEARCH_BUDGETS['research-execution'].steps` back to 25 once the Inngest migration is live.

### Non-goals

- No change to the Research Tool's schema, prompt, or findings shape.
- No change to the follow-up route. Follow-up is scoped narrower and fits comfortably in 300s on its own.

### Risks to manage

- **Client UX regression during the deploy window.** The route shape changes from "synchronous 1-5 minute wait" to "fire-and-poll". Feature-flag the new path via `env.INNGEST_RESEARCH_ENABLED` so we can toggle back if the polling UX has a bug.
- **Inngest step token budget.** Each `step.run` captures its input in Inngest's state store. The full research transcript is large (2-5k tokens of prompt + 25 steps of tool output). Confirm the state store can hold it without truncation; if not, write intermediate state to Redis and pass only keys through `step.run`.
- **Idempotency.** Inngest auto-retries on failure. Keep the persistence `step.run` idempotent by keying on `{ roadmapId, sessionId }` and using `upsert`.

### Dependencies

- Nothing architecturally blocking. Existing Inngest infrastructure (synthesis, continuation, roadmap-gen) is the template.

---

## B9 — Raise Prisma connection pool ceiling for Vercel serverless

**Status:** Backlog (flagged during 2026-04-21 production timeout)
**Category:** Reliability
**Size:** Tiny (~10 minutes — env change + Vercel redeploy)
**Owner:** —

### Why

Production logs on 2026-04-21 surfaced:

```
[prisma] Database connection failed: Timed out fetching a new connection from the connection pool.
(Current connection pool timeout: 10, connection limit: 5)
```

Prisma's default pool size per serverless instance is `num_physical_cpus * 2 + 1` — on Vercel's serverless runtime that resolves to ~5 connections. When many concurrent requests hit long-running routes (research-execute, pushback, synthesis — all of which hold short-lived Prisma connections during setup/tier-check/persistence while a long AI call runs in between), the pool exhausts and subsequent queries time out at the 10s default.

This is an env-variable tuning change, not a code change. The fix is to append `?connection_limit=20&pool_timeout=30` (or Neon-pooler-appropriate values) to the `DATABASE_URL` on Vercel.

### Scope

1. On Vercel (production + preview env):
   - If using Neon's direct URL: append `?connection_limit=20&pool_timeout=30`.
   - If using Neon's pooled URL (PgBouncer `-pooler`): append `?connection_limit=50&pool_timeout=30&pgbouncer=true`. The higher limit is safe because PgBouncer multiplexes client connections onto a smaller pool of server connections.
2. Redeploy — Vercel rebuilds serverless functions with the new URL.
3. Verify in Neon dashboard that the peak concurrent connection count stays well under the account's ceiling.

### Non-goals

- No code change to `src/lib/prisma.ts`. Prisma reads connection-pool config from URL query params, not from client options.
- No separate Prisma client for long-running jobs. Neon pooler + a higher `connection_limit` fixes both short and long routes uniformly.

### Risks to manage

- **Account-level ceiling.** Neon's free tier caps total concurrent connections per project. If we set client-side `connection_limit=50` × many concurrent serverless instances, we can blow the account cap and start getting Neon-level 429s. Confirm the account tier's connection ceiling before picking a value.
- **Prisma's `pgbouncer=true` mode.** Disables prepared statements (required under PgBouncer transaction pooling). This is already the correct shape for serverless; just document it.

### Dependencies

- None. Purely an env-var change on Vercel.

---

## B10 — Composer "Mark as sent" → follow-up reply-chase nudge

**Status:** Backlog (conditional — revisit after founder-usage data confirms they actually mark messages sent)
**Category:** Product capability
**Size:** Medium (~1-2 days)
**Owner:** —

### Why

The "Mark as sent" button on every Composer message card exists today but has **zero downstream effect**. Clicking it appends `{ messageId, sentAt }` to `session.sentMessages` and flips the UI. Nothing else in the product reads that array. No follow-up nudges, no reply tracking, no dashboard. The founder gets a checkbox for their own feelings — which is a fine placebo but not a feature.

The value of knowing a message was sent is reply-chasing: "You sent 'X' to Sarah on Monday — did she reply? If not, here's the follow-up angle to try." Without this, founders send once and drift away from the thread; our roadmap says "the first reply is worth more than the pitch" and we leave that value on the floor.

### Scope

1. **Daily Inngest cron** `composer-reply-chase-sweep`, runs alongside the existing nudge function. Scans `roadmap.toolSessions` for composer sessions where `sentMessages[*].sentAt` is >= 3 days ago AND no follow-up has been sent for that message yet.
2. **New field** `composerSession.sentMessages[*].followedUpAt: string | null`. Lets the sweep mark a message as already-chased so it doesn't nudge twice.
3. **In-app banner** on the standalone Composer page when any session has a sent-but-unfollowed-up message. Copy: "You sent 'Hi Sarah…' to Sarah Wanjiru 3 days ago. Want to draft a follow-up?" One button: "Draft a follow-up →" which opens a new Composer generation seeded with the original message + "following up 3 days later" instruction.
4. **Respect the existing nudge cadence** — `nudgesEnabled: false` users don't get the banner. Reuse the same User preference.

### Non-goals

- No automatic follow-up send. Founder-initiated only.
- No inbound-reply parsing. We don't have an email / WhatsApp integration for reads or replies, so this nudge is time-based, not state-based.

### Dependencies

- B11 (outreach tracker) overlaps with this work. If we build B11 first, this nudge piggybacks on the tracker's data model for almost free.

---

## B11 — Outreach tracker (sent messages + reply capture + conversion view)

**Status:** Backlog
**Category:** Product capability
**Size:** Large (~1 week)
**Owner:** —

### Why

Composer generates dozens of messages per founder per month at Execute scale — and every message disappears into WhatsApp / email / LinkedIn with zero product-side tracking. Founders have no view of "I sent 14 messages this week, got 4 replies, 2 turned into meetings." That's the fundamental metric of outreach-driven growth and we offer no surface for it.

An outreach tracker closes the loop: `draft → sent → reply? → outcome → insight`. Combined with the B10 reply-chase nudge, it turns the Composer from a one-shot drafting tool into a sales pipeline for pre-revenue founders.

### Scope

1. **Schema:** extend `composerSession.sentMessages[*]` with `repliedAt`, `replyCategory` ('positive' | 'neutral' | 'negative' | 'no_reply'), `outcome` ('meeting_booked' | 'pilot_agreed' | 'declined' | 'pending'), `notes`.
2. **Mark-as-sent UI:** stays. After clicking sent, a new lightweight "Got a reply?" prompt appears after 24 hours prompting the founder to log the reply status (one click from the Composer page).
3. **Outreach dashboard:** new page at `/tools/outreach-composer/tracker`. Lists all sent messages across all sessions, grouped by status, sortable by date. Each row: recipient, channel, sent date, reply category (if any), outcome. Conversion rates at the top: "27 sent · 11 replies · 4 meetings · 15% meeting conversion."
4. **Handoff to Coach** from any tracked message: "Prepare for the follow-up conversation →" (uses the existing Composer → Coach handoff, enhanced with reply context: "they replied with X, objected about Y, help me close").
5. **Privacy:** per-session retention rules stay — the tracker doesn't create a separate long-lived table. All data lives on `roadmap.toolSessions` as today.

### Non-goals

- No email / WhatsApp / LinkedIn integration for real reply parsing. Founder manually logs the reply. That stays the case until we have a proper CRM-level integration, which is a much bigger scope.
- No prospect CRM. The tracker is scoped to messages the founder drafted in OUR Composer; it doesn't ingest external conversations.

### Risks to manage

- **Abandonment risk** — founders who stop logging replies break the data model. Make the reply-logging truly one-click ("replied? y/n/no-reply") and let founders skip without penalty.
- **Privacy optics** — tracker displays recipient names and message bodies. Scope every read strictly to the founder's own userId; no cross-founder visibility ever.

### Dependencies

- B10 slots in naturally as Stage 1 of this tracker. If B11 goes first, B10 is a ~1-day addition on top.

---

## Review cadence

Scan this document monthly or when a production incident adds a new item. Items can be deleted outright if they've been superseded; items that ship should be rewritten in the delivery report format instead of left here stale.

*Last reviewed: 2026-04-21 (B8 + B9 added after the research-execute timeout + Prisma pool-exhaustion incident)*
