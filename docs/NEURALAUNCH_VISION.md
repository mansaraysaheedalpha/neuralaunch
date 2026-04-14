# NeuraLaunch — System Vision Document

> Derived exclusively from the codebase as of 2026-04-13.
> No marketing language, no aspirational features.
> Only what exists in the source code today.

---

## 1. What NeuraLaunch Is

NeuraLaunch is an AI-powered growth engine that takes a person from a vague idea or stalled situation to a launched product. The founder begins with a structured AI interview that builds a belief state about their goals, constraints, skills, and motivations. That belief state feeds a synthesis pipeline (Claude Opus) that produces a single, opinionated recommendation — not a menu of options, but one committed direction with explicit assumptions and alternatives rejected. The founder can push back on the recommendation in a multi-round adversarial conversation. Once accepted, the recommendation becomes an execution roadmap of phased tasks with per-task check-ins, diagnostic chats, and a suite of AI tools (research, conversation coaching, outreach composition). When the roadmap is substantially complete or stalled, a continuation system evaluates what happened, generates a five-section brief, and offers the founder a fork choice to begin the next cycle.

The product serves five audience types: lost graduates exploring their first direction, stuck founders whose previous attempt stalled, established business owners looking to expand, aspiring builders with an idea but no execution path, and mid-journey professionals balancing a career with a side project. The system adapts its tone, question priority, roadmap rules, and distribution channel recommendations to each audience type.

NeuraLaunch is built as a Next.js 15 application (App Router) with PostgreSQL (Neon) for persistence, Upstash Redis for session caching, Inngest for durable background functions, and Claude (Anthropic) as the primary AI provider via the Vercel AI SDK v5. The entire system is designed by two people and held to the engineering standards of a senior team at a world-class technology company.

---

## 2. The Founder Journey

### 2.1 Entry

The founder arrives at the public landing page (`/`) and clicks "Start Your Discovery." If unauthenticated, they are redirected to `/signin` (NextAuth v5 with Google and GitHub OAuth). On first authenticated visit to `/discovery`, the system checks for incomplete sessions (active, 1+ questions, last turn between 60 seconds and 72 hours ago) and offers resumption. It also checks for a prior roadmap with a pending outcome attestation — if found, the OutcomeForm modal blocks new session creation until the founder reports what happened with their previous recommendation.

### 2.2 Phase 1 — Discovery Interview

The interview is a structured AI conversation that builds a 15-field belief state (the `DiscoveryContext`). Fields are grouped into four phases:

- **Orientation** (up to 4 questions): situation, background, whatTriedBefore
- **Goal Clarity** (up to 5 questions): primaryGoal, successDefinition, timeHorizon
- **Constraint Map** (up to 6 questions): availableTimePerWeek, availableBudget, teamSize, technicalAbility, geographicMarket
- **Conviction** (up to 3 questions): commitmentLevel, biggestConcern, whyNow, motivationAnchor

The interview engine is a pure state machine (`interview-engine.ts`). On each founder message:

1. A **safety gate** (Haiku) classifies the message for harmful content. Block-severity terminates the session permanently.
2. A **context extractor** (Sonnet via `withModelFallback`) classifies the input type (answer, off-topic, frustrated, clarification, synthesis request) and extracts updates to ALL mentioned belief state fields in a single call (multi-field extraction).
3. Special handlers fire for non-answer inputs: meta responses for off-topic, empathetic responses for frustration, contradiction surfacing for conflicting data, and pricing follow-ups when pricing model changes are detected.
4. **Audience detection** runs silently after the 2nd and 7th exchanges, classifying the founder into one of the five audience types.
5. An optional **pre-research pass** (Sonnet with Exa/Tavily tools) runs before the question generator, injecting real-world context into the next question without adding streaming latency.
6. A **question selector** scores remaining fields by information gain (field weight x audience boost x confidence gap) and picks the highest-gain field.
7. A **question generator** (streamed via the multi-provider fallback chain) produces the next question. Special question types include psych probes (fires once when psychological blockers are detected in the belief state) and follow-up threads (when the founder raises an off-script topic like a competitor or market condition).

The interview has a hard ceiling of 15 total questions. Synthesis fires when the overall weighted completeness reaches 80% AND no critical field (weight >= 0.8) has zero confidence. Before the recommendation appears, a 3-5 sentence reflection streams to the founder, summarising their situation.

### 2.3 Synthesis

Synthesis runs as a durable Inngest function (`discovery-session-function`) with three sequential steps:

1. **Summarise context** (Sonnet) — distills the belief state into 3-5 factual sentences.
2. **Eliminate alternatives** (Sonnet) — identifies the top 3 directions, systematically eliminates all but one.
3. **Final synthesis** (Opus with research tools in-loop) — produces a structured `Recommendation` validated against `RecommendationSchema`: summary, recommendationType, path, reasoning, firstThreeSteps, timeToFirstResult, risks with mitigations, load-bearing assumptions, whatWouldMakeThisWrong, and alternativesRejected.

The recommendation is persisted via upsert (idempotent for Inngest retries). The UI polls with exponential backoff (3s to 30s) and shows a four-step ThinkingPanel progress indicator. A 5-minute timeout protects against hung synthesis.

### 2.4 Recommendation Hub

The founder sees their recommendation at `/discovery/recommendation` with collapsible sections for every field. Each assumption has a flag button that streams a 2-3 sentence explanation of how that assumption being false changes the recommendation, with an optional clarification follow-up.

Two paths forward:

- **Accept** ("This is my path — build my roadmap") — sets `acceptedAt`, triggers roadmap generation.
- **Push back** — opens the pushback chat (see Section 10).

After acceptance, the hub shows links to the roadmap and (for eligible recommendation types) a "Build Validation Page" button.

### 2.5 Phase 2 — Execution Roadmap

The roadmap is generated by Sonnet as a structured `Roadmap`: 2-6 phases, each with up to 5 tasks. Each task has a title, description, rationale, time estimate, success criteria, optional resources, and optional `suggestedTools` (currently: `conversation_coach`, `outreach_composer`, `research_tool`). The generator receives the full belief state, audience-specific rules, and (on continuation cycles) speed calibration from the previous roadmap's execution metrics.

The roadmap page (`/discovery/roadmap/[id]`) renders phases as collapsible blocks. Each task is an interactive card with status management, check-in forms, diagnostic chat, and embedded tool launchers.

### 2.6 Phase 3 — Validation

For `build_software` recommendations, the founder can generate a validation landing page. The page generator (Sonnet) produces content validated against `ValidationPageContentSchema`: headline, problem/solution statements, feature cards (mapped from roadmap tasks), CTA signup form, entry and exit surveys, and SEO metadata. Three layout variants exist: product, service, and marketplace — selected by regex on the recommendation path and audience type.

The page is published to `/lp/[slug]` with a distribution brief (3 AI-selected channels with audience-specific guidance). Public visitors generate analytics events (page views, scroll depth, exit intent, feature clicks, CTA signups, survey responses) collected via a hardened public beacon endpoint. A cron-driven reporting pipeline (every 6 hours) aggregates metrics, interprets them via Sonnet (Step 1: `ValidationInterpretation`), and when thresholds are met (50+ visitors, 5+ feature clicks, 3+ survey responses), generates a build brief via Opus (Step 2: `ValidationReport` with signal strength, confirmed/rejected features, survey insights, and next action).

### 2.7 Continuation Cycle

When the founder clicks "What's Next?" on their roadmap, the system evaluates progress:

- **Scenario A** (0 tasks complete) → diagnostic chat (blocker inquiry)
- **Scenario B** (< 70% complete) → diagnostic chat (incomplete-reason inquiry)
- **Scenario C** (>= 70% complete) → straight to brief generation
- **Scenario D** (100% complete) → straight to brief generation

The diagnostic chat (Sonnet, up to 10 turns) probes what happened and releases to brief generation when it has enough signal. The brief (Opus with research tools) produces five sections: what happened, what I got wrong, what the evidence says, fork options (2-4 alternative next directions), and parking lot items. The founder picks a fork, which creates a new Recommendation (auto-accepted) and triggers a new roadmap generation — beginning the next execution cycle with speed calibration from the previous one.

---

## 3. The Agent Architecture

### 3.1 Model Allocation

| Agent | Primary Model | Fallback Model | Pattern |
|---|---|---|---|
| Safety gate | Haiku | Sonnet | `generateObject` |
| Context extractor | Sonnet | Haiku | `generateObject` |
| Audience detector | Sonnet | Haiku | `generateObject` |
| Question generator | Sonnet → Haiku → Gemini Flash | (chain) | `streamText` |
| Response generators (5 types) | Sonnet → Haiku → Gemini Flash | (chain) | `streamText` |
| Interview pre-research | Sonnet | Haiku | `generateText` + tools |
| Synthesis steps 1-2 | Sonnet | Haiku | Anthropic SDK direct |
| Synthesis step 3 (final) | Opus | Sonnet | `generateText` + tools + `Output.object` |
| Pushback conversation | Opus | (none) | `generateText` + tools + `Output.object` |
| Pushback patch (refine/replace) | Opus | (none) | `generateObject` |
| Alternative synthesis | Opus | Sonnet | `generateText` + tools + `Output.object` |
| Roadmap generator | Sonnet | Haiku | `generateObject` |
| Check-in agent | Sonnet | Haiku | `generateText` + tools + `Output.object` |
| Task diagnostic | Sonnet | Haiku | `generateObject` |
| Conversation arc summariser | Haiku | (none) | Anthropic SDK direct |
| Coach setup | Sonnet | Haiku | `generateObject` |
| Coach preparation | Opus | Sonnet | `generateText` + tools + `Output.object` |
| Coach roleplay | Sonnet | Haiku | `generateObject` |
| Coach debrief | Haiku | Haiku | `generateObject` |
| Composer context | Sonnet | Haiku | `generateObject` |
| Composer generation | Sonnet | Haiku | `generateText` + tools + `Output.object` |
| Composer regeneration | Sonnet | Haiku | `generateObject` |
| Research plan | Sonnet | Haiku | `generateObject` |
| Research execution | Opus | Sonnet | `generateText` + tools + `Output.object` |
| Research follow-up | Sonnet | Haiku | `generateText` + tools + `Output.object` |
| Diagnostic turn | Sonnet | Haiku | `generateObject` |
| Continuation brief | Opus | Sonnet | `generateText` + tools + `Output.object` |
| Validation interpreter | Sonnet | Haiku | `generateObject` |
| Validation page generator | Sonnet | Haiku | `generateObject` |
| Distribution brief generator | Sonnet | (none, 3-attempt retry) | `generateObject` |
| Build brief generator | Opus | (none) | `generateObject` |
| Assumption check | Sonnet | (none) | `streamText` |

### 3.2 Fallback Patterns

- **`withModelFallback`** — wraps any `generateObject` or `generateText` call. On Anthropic overload (status 529, `AI_RetryError`, `AI_APICallError`, `AI_NoObjectGeneratedError`, or `/overload/i` in error message), immediately retries with the fallback model. Non-overload errors rethrow.
- **`streamQuestionWithFallback`** — three-provider chain: Anthropic Sonnet → Anthropic Haiku → Google Gemini Flash (if `GOOGLE_AI_API_KEY` configured). Two attempts per provider with 2-second backoff. Mid-stream failure after first chunk surfaces the cut to the client (no Frankenstein output). Non-retryable 4xx errors break to the next provider immediately. `maxRetries: 0` disables the AI SDK's internal retry.
- **Distribution brief generator** — no `withModelFallback`, instead a 3-attempt loop retrying when Zod validation fails on channel uniqueness.
- **Build brief generator and pushback engine** — Opus only, no fallback. Synthesis failure surfaces to the user.

### 3.3 Prompt Injection Defence

Every agent that embeds user-typed content follows the same protocol:

1. User content is wrapped via `renderUserContent(value)` which calls `sanitizeForPrompt()` (strips control chars, zero-width chars, breaks markdown fences and `]]]` delimiters, collapses whitespace, truncates to 600 chars default) then wraps in `[[[...]]]` triple-bracket delimiters.
2. Every prompt includes the canonical SECURITY NOTE instructing the model to treat triple-bracketed content as raw data, never as instructions.
3. LLM-generated content that is re-embedded into subsequent prompts (e.g., recommendation fields fed into the pushback prompt) goes through `sanitizeForPrompt()` separately.

---

## 4. The Data Model

### 4.1 Core Entities

**User** — OAuth identity (Google, GitHub). Fields: `trainingConsent` (boolean), `trainingConsentAt` (nullable timestamp). Relations cascade to all owned entities.

**Conversation** — A chat thread. One-to-one with `DiscoverySession` (nullable). Contains `Message` rows (role + content + optional `modelUsed`). Indexed on `[userId, createdAt]`.

**DiscoverySession** — The interview state machine. Status enum: `ACTIVE | COMPLETE | EXPIRED | TERMINATED`. Core fields: `phase`, `questionCount`, `questionsInPhase`, `activeField`, `audienceType`, `askedFields` (JSON string array), `pricingProbed`, `psychConstraintProbed`, `lastTurnAt`, `synthesisStep` (real-time progress: loading → summarising → evaluating → synthesising). `beliefState` (JSON) is the typed `DiscoveryContext`. `researchLog` (JSON) is the append-only research audit trail.

**Recommendation** — The synthesis output. Stores all structured fields as top-level columns (`summary`, `path`, `reasoning`, `firstThreeSteps`, `timeToFirstResult`, `risks`, `assumptions`, `whatWouldMakeThisWrong`, `alternativeRejected`). Pushback state: `pushbackHistory` (JSON PushbackTurn array), `pushbackVersion` (optimistic concurrency lock), `versions` (snapshot array). Acceptance: `acceptedAt`, `acceptedAtRound`, `unacceptCount`. Self-relation: `alternativeRecommendationId` for round-7 alternative. `recommendationType`: one of `build_software | build_service | sales_motion | process_change | hire_or_outsource | further_research | other`. `validationOutcome` mirrors the validation report's signal strength.

**Roadmap** — The execution plan. Status enum: `GENERATING | READY | FAILED | STALE`. `phases` (JSON) is the structured `RoadmapPhase[]`. Extensions: `parkingLot` (JSON), `diagnosticHistory` (JSON), `continuationBrief` (JSON), `executionMetrics` (JSON), `toolSessions` (JSON array of coach/composer/research sessions). `continuationStatus`: `CHECKING | DIAGNOSING | GENERATING_BRIEF | BRIEF_READY | FORK_SELECTED`. Self-relation: `parentRoadmapId` for continuation lineage. `forkRecommendationId` links to the next-cycle recommendation.

**RoadmapProgress** — One-to-one with Roadmap. Counters: `totalTasks`, `completedTasks`, `blockedTasks`, `currentPhase`. Nudge state: `nudgePending`, `nudgeLastSentAt`, `staleTaskTitle`. Outcome prompt: `outcomePromptPending`, `outcomePromptSkippedAt`. Indexed on `[nudgePending]` and `[lastActivityAt]` for cron efficiency.

**RecommendationOutcome** — Founder's retrospective attestation. `outcomeType`: `full_success | partial_success | direction_correct_execution_different | did_not_work`. `freeText` (prompt varies by type), `weakPhases` (string array), `consentedToTraining` (captured at submission, read-only). `anonymisedRecord` (JSON, null when consent is false, 24-month TTL enforced by lifecycle cron).

**ValidationPage** — Landing page for market validation. Status: `DRAFT | LIVE | ARCHIVED`. `content` (JSON `ValidationPageContentSchema`), `distributionBrief` (JSON, 3 channels), `channelsCompleted` (string array). `layoutVariant`: `product | service | marketplace`.

**ValidationSnapshot** — Point-in-time metrics aggregate. Created by the reporting cron. Contains visitor counts, CTA conversion rate, feature clicks, survey responses, traffic sources, scroll depth, and optional `interpretation` (JSON, Sonnet Step 1 output).

**ValidationReport** — Opus Step 2 output. `signalStrength`: `strong | moderate | weak | negative`. Confirmed/rejected features, survey insights, build brief, next action, disconfirmed assumptions (negative signal only), pivot options. `usedForMvp` flag (blocked for negative signal).

**ValidationEvent** — Raw analytics beacon events. Types: `page_view | scroll_depth | exit_intent | feature_click | cta_signup | survey_response`. `visitorId` is a salted SHA-256 (not PII-reversible). Indexed on `[validationPageId, eventType]` and `[validationPageId, createdAt]`.

### 4.2 JSONB Schemas

**DiscoveryContext** — 15 belief fields, each wrapped in `{ value: T | null, confidence: number (0-1), extractedAt: ISO | null }`. Fields: situation, background, whatTriedBefore (string[]), primaryGoal, successDefinition, timeHorizon, availableTimePerWeek, availableBudget, teamSize (enum: solo/small_team/established_team), technicalAbility (enum: none/basic/intermediate/strong), geographicMarket, commitmentLevel (enum: exploring/committed/all_in), biggestConcern, whyNow, motivationAnchor.

**StoredRoadmapTask** — extends the generated `RoadmapTask` with: `status` (not_started/in_progress/completed/blocked), `startedAt`, `completedAt`, `checkInHistory` (CheckInEntry[]), `conversationArc` (string, Haiku summary), `coachSession`, `composerSession`, `researchSession` (each a tool session object).

**CheckInEntry** — one round: `id`, `timestamp`, `category` (completed/blocked/unexpected/question), `freeText`, `agentResponse`, `agentAction` (acknowledged/adjusted_next_step/adjusted_roadmap), `round` (0 for diagnostic, 1-5 for check-ins), `source` (founder/success_criteria_confirmed/task_diagnostic), optional `proposedChanges`, `subSteps`, `recommendedTools`, `recalibrationOffer`.

**PushbackTurn** — discriminated union. User: `{ role, content, round, timestamp }`. Agent: `{ role, content, round, mode, action, converging, timestamp }`.

**ContinuationBrief** — five sections: `whatHappened`, `whatIGotWrong`, `whatTheEvidenceSays`, `forks` (2-4, each with id/title/rationale/firstStep/timeEstimate/rightIfCondition), `parkingLotItems`, `closingThought`.

**ParkingLotItem** — `{ id, idea, surfacedAt, surfacedFrom (checkin/manual/interview/pushback), taskContext }`.

**CoachSession** — `{ id, tool: 'conversation_coach', setup, preparation?, rolePlayHistory?, debrief?, channel, createdAt, updatedAt }`.

**ComposerSession** — `{ id, tool: 'outreach_composer', context, mode (single/batch/sequence), channel, output?, sentMessages?, createdAt, updatedAt }`.

**ResearchSession** — `{ id, tool: 'research_tool', query, plan?, report?, followUps?, createdAt, updatedAt }`.

**ResearchLogEntry** — `{ query, agent, tool?, resultSummary?, timestamp, answer?, sources?, success? }`. Append-only, capped at 100 per column.

---

## 5. The Internal Tools

### 5.1 Conversation Coach

**Purpose:** Prepares the founder for a high-stakes conversation (investor pitch, partnership ask, customer call, co-founder negotiation) by generating a preparation package and running an interactive role-play rehearsal.

**Access:** From a task card (when `suggestedTools` includes `conversation_coach`) or standalone at `/tools/conversation-coach`.

**Four stages:**

1. **Setup** (Sonnet, up to 3 exchanges) — Collects: who the conversation is with, relationship, objective, fear, and channel (WhatsApp/in-person/email/LinkedIn). Task-card launch pre-fills context and skips redundant questions.

2. **Preparation** (Opus with research tools) — The highest-value call in the Coach. Produces: channel-native opening script (exact copy-paste text), 2-3 key asks with rationale, 3-4 anticipated objections with responses grounded in belief state fields, fallback positions (minimum acceptable outcomes), and a post-conversation checklist with optional Composer handoff (`suggestedTool: 'outreach_composer'` with pre-loaded context). Research tools probe the other party's company before generating the script.

3. **Role-play** (Sonnet, up to 10 turns) — Interactive back-and-forth where the agent plays the other party in character, with channel-native tone. The character pushes back proportionally (not artificially easy). Warning at turn 8, hard cap at 10.

4. **Debrief** (Haiku) — Lightweight synthesis: what went well, what to watch for, optionally revised opening script or additional objection (only if the rehearsal surfaced genuinely new material).

**Persistence:** Task-level sessions are stored in `task.coachSession`. Roadmap-level (standalone) sessions are stored in `roadmap.toolSessions` array. Research log entries are appended to `roadmap.researchLog`.

**Cross-tool handoff:** Coach → Composer via `postConversationChecklist[].suggestedTool` with pre-loaded `composerContext`.

### 5.2 Outreach Composer

**Purpose:** Generates ready-to-send outreach messages for a specific recipient, a batch of similar recipients, or a timed sequence.

**Access:** From a task card (when `suggestedTools` includes `outreach_composer`) or standalone at `/tools/outreach-composer`.

**Three modes:**
- **Single** — one message, copy-paste ready, no placeholders.
- **Batch** — 5-10 variations with varying hooks and personalisation angles, each with `recipientPlaceholder` and `personalisationHook`.
- **Sequence** — exactly 3 messages (Day 1/5/14) with `sendTiming` and `escalationNote`.

**Three channels** (written only, no in-person): WhatsApp, email, LinkedIn. Per-channel format rules enforced in the prompt (e.g., LinkedIn connection requests ≤ 300 chars, email requires subject line).

**Three operations:**

1. **Context collection** (Sonnet, up to 2 exchanges) — Collects: target description, relationship, goal, channel, mode. Mode inferred from language ("10 restaurant owners" → batch, "someone who didn't respond" → sequence). Optional `coachHandoffContext` from a prior Coach session.

2. **Generation** (Sonnet with research tools) — Produces `ComposerOutput.messages[]`, each with body, optional subject, annotation ("why this works"), and optional `suggestedTool: 'conversation_coach'` with pre-loaded Coach context for messages where the logical next step is a live conversation.

3. **Regeneration** (Sonnet, no tools) — Single-message variation with a founder-supplied instruction. Capped at 2 regenerations per message.

**Mark-as-sent:** Pure data write appending `{ messageId, sentAt }` to the session's `sentMessages` array.

**Cross-tool handoff:** Composer → Coach via `message.suggestedTool` with pre-loaded `coachContext`.

### 5.3 Research Tool

**Purpose:** Deep, structured research on a specific question — finding businesses, people, competitors, regulations, tools, or data points relevant to a roadmap task or general inquiry.

**Access:** From a task card (when `suggestedTools` includes `research_tool`) or standalone at `/tools/research`.

**Three steps:**

1. **Plan** (Sonnet) — Takes the founder's query and produces a research plan (1-6 sentences scaling to complexity) with an honest time estimate. Geographic scope stated explicitly. No tool-name mentions (founder doesn't care about internals).

2. **Execution** (Opus with 25-step budget) — The largest step budget in the system. Fires multiple search rounds, evaluates gaps, runs targeted follow-ups. Produces a `ResearchReport`: summary, structured findings (each typed as business/person/competitor/datapoint/regulation/tool/insight, with contact info, source URL, and confidence level), sources with relevance annotations, roadmapConnections (ties findings to founder's specific situation), and suggestedNextSteps (with cross-tool handoffs to Coach, Composer, or the reserved `service_packager`).

3. **Follow-up** (Sonnet, 10-step budget, up to 5 rounds) — Targeted additional research building on the existing report. Produces new findings only, no repeats.

**Finding types:** business, person, competitor, datapoint, regulation, tool, insight.

**Confidence levels:** verified (multiple/authoritative sources), likely (consistent evidence), unverified (single source, possibly outdated).

**Persistence:** Task-level sessions in `task.researchSession`. Roadmap-level sessions in `roadmap.toolSessions`. Research log entries appended to `roadmap.researchLog`.

---

## 6. The Roadmap Generator and Tool Choreography

The roadmap generator (`roadmap-engine.ts`) receives the recommendation, belief state, audience type, and optional speed calibration. It resolves weekly hours from the belief state (keyword map → range regex → single number → default 10). Audience-specific rules shape the roadmap:

- **Lost graduate** — momentum first, visible output within 2 weeks.
- **Stuck founder** — break the pattern, structural difference from what stalled them.
- **Established owner** — leverage existing assets, no starting from zero.
- **Aspiring builder** — Phase 1 ends with a real customer conversation; gates on validation before build.
- **Mid-journey professional** — every task fits stated hours, no full-time-only tasks.

### Tool Choreography

The generator prompt includes an INTERNAL TOOLS section naming all three tools (`research_tool`, `conversation_coach`, `outreach_composer`) and four TOOL CHOREOGRAPHY EXAMPLES showing multi-tool workflows written directly into task descriptions. Examples:

1. Competitor analysis (research → coach for partnership pitch → composer for follow-up email)
2. Customer discovery (research for targets → coach for interview prep → composer for outreach)
3. Market validation (research for landscape → composer for survey distribution)
4. Partnership outreach (research for partners → composer for initial contact → coach for meeting prep)

The generator outputs `suggestedTools` on each task, and the task card UI renders the corresponding tool buttons. The check-in agent is aware of completed tool sessions (coach, composer, research) on the current task and references them in its responses.

---

## 7. The Check-in System

### 7.1 Per-Task Check-ins

Each task supports up to 5 check-in rounds (hard cap: `CHECKIN_HARD_CAP_ROUND = 5`). The founder selects a category (completed, blocked, unexpected, question) and provides free text. The check-in agent (Sonnet with optional research tools) returns a structured `CheckInResponse`:

- **`action`**: `acknowledged` (simple acknowledgement), `adjusted_next_step` (suggests changes to the current or next task), or `adjusted_roadmap` (reserved, not currently used).
- **`message`**: up to 2000 chars, specific to the founder's context.
- **`proposedChanges`**: task adjustment suggestions (new title, description, or success criteria with rationale).
- **`parkingLotItem`**: verbatim adjacent idea captured from the founder's message.
- **`subSteps`**: 3-6 imperative sub-steps when the founder is confused about HOW to execute.
- **`recommendedTools`**: 1-4 tools (both internal NeuraLaunch tools and external tools) when tooling is the gap.
- **`recalibrationOffer`**: only emitted when accumulated evidence suggests the overall direction is wrong. Gated externally: requires ≥ 40% task coverage (tasks with at least one check-in / total tasks).

### 7.2 Check-in Sources

- `founder` — manual check-in from the form.
- `success_criteria_confirmed` — auto-generated when founder clicks "It went as planned" (uses the task's success criteria as the free text).
- `task_diagnostic` — entries from the task-level diagnostic chat.

### 7.3 Task Diagnostic Chat

Triggered by "Get help with this task" on any task card. Up to 10 turns (Sonnet). Three verdicts: `still_helping` (asks a follow-up), `resolved` (problem solved), `escalate_to_roadmap` (the problem is bigger than the task — suggests "What's Next?"). At the 10-turn cap, runs an inconclusive synthesis (Haiku) and shows a summary. Diagnostic entries are stored in the task's `checkInHistory` with `source: 'task_diagnostic'` and `round: 0`.

### 7.4 Conversation Arc Summariser

At round 5 (hard cap) or when a task is completed with 2+ check-in entries, a fire-and-forget Haiku call produces a one-sentence narrative arc: how the founder's understanding evolved, what shifted, what the turning point was. Stored in `task.conversationArc`. Fed into the continuation brief generator as structured evidence.

### 7.5 Nudge Cron

The `roadmapNudgeFunction` runs daily at 14:00 UTC. For each `RoadmapProgress` row where `nudgePending=false` and `nudgeLastSentAt` is null or >7 days ago:

1. Loads roadmap phases and finds the first in-progress task whose elapsed time exceeds its `timeEstimate`.
2. If stale: sets `nudgePending=true`, `nudgeLastSentAt=now`, `staleTaskTitle`.
3. The UI renders a `NudgeBanner` when `nudgePending=true`, showing "You were working on '[title]'. How did it went?"

The cron also flags `outcomePromptPending=true` on progress rows with ≥50% completion, >30 days inactive, no existing outcome, and not previously skipped.

### 7.6 Progress Tracking

Every status change and check-in atomically updates both the `Roadmap.phases` JSON and the `RoadmapProgress` counters (upsert). The progress row drives the nudge cron, the "What's Next?" scenario evaluator, and the sidebar's roadmap badge.

---

## 8. The Continuation System

### 8.1 Entry Point

The "What's Next?" button on the roadmap fires `POST /api/discovery/roadmaps/[id]/checkpoint`. The checkpoint route:

1. Loads lightweight progress counters via `loadCheckpointStatus`.
2. Calls `evaluateScenario` — a pure deterministic function:
   - **A** (0 complete): needs diagnostic (blocker inquiry)
   - **B** (< 70% complete): needs diagnostic (incomplete reason)
   - **C** (≥ 70% complete): skip to brief
   - **D** (100% complete): skip to brief (strongest evidence)
3. Scenarios A/B → sets `continuationStatus = DIAGNOSING`. C/D → sets `GENERATING_BRIEF` and fires the `discovery/continuation.requested` Inngest event.

### 8.2 Diagnostic Conversation

For Scenarios A and B, a multi-turn chat (Sonnet, up to 10 turns) probes what happened. Verdicts per turn: `still_diagnosing`, `release_to_brief` (enough signal to generate a brief), `recommend_re_anchor`, `recommend_breakdown`, `recommend_pivot`, `inconclusive`. On `release_to_brief`, the route flips status to `GENERATING_BRIEF` and fires the Inngest event. At the 10-turn cap, an inconclusive synthesis (Haiku) provides three resolution options. The diagnostic re-evaluates the scenario mid-session — if progress changes the scenario to C/D, it skips straight to brief.

### 8.3 Brief Generation

The `continuationBriefFunction` (Inngest, Opus with 8-step research budget):

1. **Load evidence** — full evidence base via `loadContinuationEvidence`: recommendation, belief state, phases with all check-in history, parking lot, diagnostic history, and `checkinCoverage` (proportion of tasks with at least one check-in).
2. **Compute execution metrics** — `computeExecutionMetrics` derives pace from actual task timing: `statedWeeklyHours` vs `derivedWeeklyHours`, `paceLabel` (on_pace/slower_pace/unknown), `paceNote` (human-readable calibration sentence).
3. **Generate brief** — Opus with research tools. Evidence fed to the prompt includes: belief digest, motivation anchor, original recommendation (path, summary, reasoning, assumptions), per-task execution record with statuses and check-in counts, structured check-in signals (recalibration offers, adjusted next steps, sub-step needs, tool needs, conversation arcs), execution metrics, parking lot, and diagnostic history.
4. **Persist** — serializable transaction: merges research log, guards on `continuationStatus = GENERATING_BRIEF` (prevents concurrent writes), sets brief + metrics + status `BRIEF_READY`.

### 8.4 Fork Selection

The founder picks one fork from the brief. `POST /api/discovery/roadmaps/[id]/continuation/fork`:

1. Validates the fork ID against the brief.
2. `persistForkRecommendation` — transaction: creates a new `Recommendation` row (auto-accepted at round 0, summary/assumptions/risks derived deterministically from the fork + brief, alternativesRejected = the other forks), sets `forkRecommendationId` on parent roadmap, flips status to `FORK_SELECTED`.
3. Fires `discovery/roadmap.requested` — the new roadmap generation includes `parentRoadmapId` so the generator can load speed calibration.

### 8.5 Parking Lot

Adjacent ideas surfaced during execution. Sources: check-in agent capture (automatic), manual "Park an idea" button, interview (reserved), pushback (reserved). Capped at 50 items per roadmap. Duplicate detection by idea text. Items carry `surfacedFrom` provenance and optional `taskContext`. Rendered in the continuation brief.

---

## 9. The Research Substrate

### 9.1 Architecture

Two named search providers are registered as AI SDK tools:

- **`exa_search`** — semantic/similarity search ("things like X"). Uses Exa SDK with `contents.text.maxCharacters: 800`. Input: `{ query, numResults: 1-10 }`.
- **`tavily_search`** — factual search ("facts about X"). Uses Tavily SDK with `searchDepth: 'advanced'`, `maxResults: 5`, `includeAnswer: true`. Input: `{ query }`.

Both tools are conditionally registered: if the API key for a provider is not set, that tool is omitted entirely from the tool set (the model never sees a tool it cannot call). `getResearchToolGuidance()` returns the appropriate prompt copy based on which providers are configured (both/exa-only/tavily-only/neither).

### 9.2 Agent-Chooses Architecture

The model decides when and how to use research tools. Each `generateText` call with tools uses `stopWhen: stepCountIs(N)` to cap the number of tool-use steps. The model can interleave multiple searches, evaluate results, and search again within its budget.

### 9.3 Per-Agent Step Budgets

| Agent | Steps | Description |
|---|---|---|
| interview | 5 | Light pre-research before questions |
| recommendation | 10 | Deep synthesis research |
| pushback | 5 | Targeted evidence gathering |
| checkin | 4 | Lightweight market/vendor checks |
| continuation | 8 | Evidence-informed brief |
| composer | 8 | Recipient/industry research |
| research-execution | 25 | Deep multi-round investigation |
| research-followup | 10 | Targeted additional research |

### 9.4 Per-Call Accumulator Pattern

Every call site that uses research tools passes a mutable `ResearchLogEntry[]` accumulator. Each successful tool execution pushes an entry with `{ query, agent, tool, resultSummary, timestamp, answer, sources, success }`. Failed calls return error text to the model but do NOT push to the accumulator. After the call completes, the accumulator is appended to the relevant JSONB column (`DiscoverySession.researchLog`, `Recommendation.researchLog`, or `Roadmap.researchLog`). Capped at 100 entries per column via `appendResearchLog`.

### 9.5 Transport Layer

Both providers have: 30-second per-query timeout, 2 max attempts with 500ms linear backoff. Exa results capped at `numResults` hits. Tavily results capped at 5 hits with `includeAnswer: true`. Rendered summaries are capped at 4000 chars (`MAX_FINDINGS_CHARS`) and wrapped in provider-specific formats.

---

## 10. The Pushback System

### 10.1 Flow

After seeing the recommendation, the founder can push back in a chat interface (PushbackChat). Each round:

1. The founder sends a message challenging the recommendation.
2. The pushback engine (Opus with research tools, 5-step budget) returns a structured response with `mode`, `action`, `converging`, and `message`.

### 10.2 Modes

The agent classifies each turn into one of three pushback modes:

- **`analytical`** — the founder raises factual/strategic objections. The agent defends with evidence or acknowledges the gap.
- **`fear`** — the founder expresses anxiety, doubt, or emotional resistance. The agent acknowledges the fear, provides counter-evidence, and reframes.
- **`lack_of_belief`** — the founder doesn't believe they can execute. The agent addresses the specific capability gap.

### 10.3 Actions

- **`continue_dialogue`** — the conversation continues; the agent responds without changing the recommendation.
- **`defend`** — the agent explicitly defends the recommendation against the challenge.
- **`refine`** — the agent acknowledges a valid point and patches the recommendation. A second Opus call (`generateObject`) produces a full updated `Recommendation`, which is merged via `mergeRecommendationPatch`. If a roadmap exists, it is marked `STALE`.
- **`replace`** — the agent concedes the recommendation was wrong and produces a full replacement via the same two-call architecture.
- **`closing`** — constructed manually at round 7 (not by the model). Hard-coded template message.

### 10.4 Round Management

- Rounds 1-6: normal pushback conversation.
- Round 4 (soft warning): injected into the agent prompt as a re-frame suggestion.
- Round 7 (hard cap): no Opus call. Delivers `buildClosingMessage()` and fires `discovery/pushback.alternative.requested` Inngest event. The alternative synthesis function runs asynchronously: classifies the dominant pushback mode across all turns, builds a constrained analysis directing Opus to avoid the original recommendation's path, and produces a second Recommendation linked via `alternativeRecommendationId`.

### 10.5 Optimistic Concurrency

The pushback route uses `pushbackVersion` as an optimistic lock. Each write increments the version; a 409 is returned on race conditions. This prevents concurrent pushback submissions from corrupting the history.

### 10.6 Recalibration Evidence

When the check-in agent emits a `recalibrationOffer` (gated on ≥ 40% task coverage), that evidence is available to the continuation brief generator. The structured signals extraction in `brief-renderers.ts` walks all check-in entries and surfaces recalibration offers by task, adjusted-next-step actions, sub-step needs, and tool needs.

---

## 11. Security Architecture

### 11.1 Authentication

NextAuth v5 with Prisma adapter. Two OAuth providers: Google and GitHub (both with `allowDangerousEmailAccountLinking`). Mobile app uses a Bearer token bridge (`mobile-auth.ts`): the same `Session` table, same entropy (32 bytes, base64url), 30-day expiry. `requireUserId()` checks NextAuth cookie session first, falls back to Bearer token.

### 11.2 CSRF Protection

Every state-changing route calls `enforceSameOrigin(request)` as its first line. Defence strategy: checks `Sec-Fetch-Site` header first (unforgeable, set by the browser); falls back to `Origin` header hostname comparison against `NEXT_PUBLIC_APP_URL`. Throws `HttpError(403)` on mismatch.

### 11.3 Rate Limiting

Six tiers:

| Tier | Limit | Window | Usage |
|---|---|---|---|
| `AI_GENERATION` | 5 | 60s | Routes that fire LLM calls |
| `DISCOVERY_TURN` | 30 | 300s | Interview turn route |
| `API_AUTHENTICATED` | 60 | 60s | State-changing writes |
| `API_READ` | 120 | 60s | Polling reads |
| `AUTH` | 5 | 900s | Authentication endpoints |
| `PUBLIC` | 30 | 60s | Public endpoints |

Implementation: sliding window in Upstash Redis (production), in-memory Map (development). IP identification trust order: `x-vercel-forwarded-for` (unforgeable, Vercel edge-only) → `x-forwarded-for` (only if exactly 1 IP) → `x-real-ip`.

The public analytics endpoint (`/api/lp/analytics`) has an additional per-`(ip, slug)` secondary cap of 30/min and a 16KB body size limit.

### 11.4 Ownership Scoping

Every database read that returns user data uses `findFirst({ id, userId })` — the single-query pattern that prevents existence-leak between 404 and 401. Never `findUnique({ id })` followed by manual `userId !==` check.

### 11.5 Prompt Injection Defence

See Section 3.3. The `renderUserContent` / `sanitizeForPrompt` / SECURITY NOTE pattern is applied uniformly across all agents.

### 11.6 Input Sanitisation

Two layers: `sanitize.ts` for HTML/URL/file contexts (XSS prevention), and `server-helpers.ts` for prompt contexts (injection prevention). Every API route validates and sanitises input at the boundary via Zod before it reaches any service.

### 11.7 Error Handling

`httpErrorToResponse(err)` maps `HttpError` instances to JSON responses with the correct status code. Unknown errors are logged with full stack traces (for debugging) and return a generic 500 to the client (for security). Internal error messages are never exposed.

### 11.8 Content Security Policy

Applied via middleware on every request. `script-src` includes `unsafe-inline` and `unsafe-eval` (documented trade-off). `frame-ancestors 'self'` permits the validation page iframe. Strict-Transport-Security applied in production only (1 year, includeSubDomains, preload).

### 11.9 Data Privacy

Training consent is opt-in per user. Consent grant: stamps `trainingConsentAt`. Consent revocation: clears timestamp AND nulls `anonymisedRecord` on ALL existing `RecommendationOutcome` rows (retroactive deletion). Hard invariant: `consentedToTraining=false ⇒ anonymisedRecord=null`. Anonymisation is best-effort lexical (email, phone, name patterns → `[redacted]`; locations → country bucket). 24-month TTL enforced by `validationLifecycleFunction` cron.

---

## 12. Infrastructure

### 12.1 Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 15.5.x (App Router) |
| Language | TypeScript | 5.x (strict) |
| Styling | Tailwind CSS | 4.x |
| Components | shadcn/ui | v4 |
| Animation | Motion | v12 (`motion/react`) |
| AI SDK | Vercel AI SDK | v5.0 |
| AI Provider | Anthropic | Claude 4.6 (Sonnet/Opus/Haiku) |
| Secondary AI | Google | Gemini Flash (streaming fallback only) |
| Orchestration | Inngest | v4 |
| Validation | Zod | v4 |
| ORM | Prisma | 6.6.x |
| Session Cache | Upstash Redis | Edge-compatible |
| Auth | NextAuth | v5 beta |
| Database | PostgreSQL | Neon (pgvector) |
| Research | Exa, Tavily | Latest SDKs |
| Package Manager | pnpm | Exclusive (npm/yarn forbidden) |

### 12.2 Deployment

Vercel auto-deploys: `main` → production, `dev` → preview. The application validates all required environment variables at startup via `env.ts` and refuses to start if any are missing.

### 12.3 Inngest Functions

Eight registered functions:

1. **`discovery-synthesis`** — triggered by `discovery/synthesis.requested`. 3-step synthesis pipeline + recommendation persistence + roadmap warm-up. Retries: 2, timeout: 10m.
2. **`discovery-roadmap-generation`** — triggered by `discovery/roadmap.requested`. Generates and persists roadmap. On failure: sets status to `FAILED`. Retries: 2, timeout: 5m.
3. **`pushback-alternative-synthesis`** — triggered by `discovery/pushback.alternative.requested`. Generates alternative recommendation from pushback evidence. Retries: 2, timeout: 10m.
4. **`roadmap-nudge-sweep`** — cron `0 14 * * *` (daily 14:00 UTC). Flags stale tasks and outcome prompts. Retries: 2.
5. **`validation-reporting-scheduler`** — cron every 6 hours. Fan-out: sends one report event per LIVE page. Retries: 2.
6. **`validation-page-reporting`** — triggered by `validation/report.requested`. Collects metrics, interprets, optionally generates build brief. Concurrency: 5. Retries: 2.
7. **`validation-page-lifecycle`** — cron `0 3 * * *` (daily 03:00 UTC) + event trigger. Archives stale drafts (72h) and expired live pages (30 days). Purges old archived events (90 days). Purges expired training records (24 months). Retries: 2.
8. **`continuation-brief-generation`** — triggered by `discovery/continuation.requested`. Full evidence load + execution metrics + Opus brief + persist. On failure: rolls status back to null. Retries: 2, timeout: 10m.

### 12.4 Caching

Upstash Redis serves two roles:

1. **Discovery session hot cache** — sliding 15-minute TTL. `getSession` reads Redis first; on miss or exception, falls back to Postgres and re-warms Redis. `saveSession` writes to Redis only (Postgres is written separately by the turn route).
2. **Rate limiting** — sliding-window counters per user/IP/route combination.

Redis is optional: the application degrades gracefully when Redis is unavailable (Postgres fallback for sessions, in-memory Map for rate limiting).

### 12.5 Resilience Patterns

- **Model fallback** — `withModelFallback` (overload detection → immediate retry with cheaper model) and `streamQuestionWithFallback` (3-provider chain with per-provider retry).
- **Fail-open research** — interview pre-research, conversation arc summariser, and parking lot capture all catch errors and return empty/null (the feature degrades, the flow continues).
- **Idempotent Inngest functions** — all use `upsert` keyed on natural unique constraints. Running the same function twice produces the same outcome.
- **Optimistic concurrency** — pushback uses `pushbackVersion` as a lock. Continuation brief uses `updateMany` guarded on `continuationStatus = GENERATING_BRIEF`.
- **Graceful session recovery** — Redis miss triggers Postgres read + Redis re-warm. Newer fields use nullish coalescing to handle stale Redis shapes.

---

## 13. API Surface

### Discovery — Sessions

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/discovery/sessions` | AI_GENERATION | Create new discovery session |
| DELETE | `/api/discovery/sessions/[sessionId]` | API_AUTHENTICATED | Discard incomplete session |
| POST | `/api/discovery/sessions/[sessionId]/turn` | DISCOVERY_TURN | Submit interview turn (streaming) |
| GET | `/api/discovery/sessions/[sessionId]/resume` | API_AUTHENTICATED | Load session for resumption |
| GET | `/api/discovery/sessions/[sessionId]/recommendation` | API_READ | Poll for synthesis result |

### Discovery — Recommendations

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/discovery/recommendations/[id]/accept` | API_AUTHENTICATED | Accept recommendation |
| DELETE | `/api/discovery/recommendations/[id]/accept` | API_AUTHENTICATED | Un-accept recommendation |
| POST | `/api/discovery/recommendations/[id]/pushback` | AI_GENERATION | Submit pushback turn |
| POST | `/api/discovery/recommendations/[id]/roadmap` | AI_GENERATION | Trigger roadmap generation |
| GET | `/api/discovery/recommendations/[id]/roadmap` | API_READ | Poll roadmap status/data |
| POST | `/api/discovery/recommendations/[id]/validation-page` | AI_GENERATION | Generate validation page |
| GET | `/api/discovery/recommendations/[id]/validation-page` | (none) | Check validation page existence |
| POST | `/api/discovery/recommendations/[id]/outcome` | API_AUTHENTICATED | Submit outcome attestation |
| DELETE | `/api/discovery/recommendations/[id]/outcome` | API_AUTHENTICATED | Skip outcome prompt |

### Discovery — Assumption Check

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/discovery/assumption-check` | AI_GENERATION | Stream assumption impact (streaming) |

### Roadmaps — Core

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET | `/api/discovery/roadmaps/has-any` | API_READ | Check if user has any roadmap |
| PATCH | `/api/discovery/roadmaps/[id]/tasks/[taskId]/status` | API_AUTHENTICATED | Update task status |
| POST | `/api/discovery/roadmaps/[id]/tasks/[taskId]/checkin` | AI_GENERATION | Submit task check-in |
| POST | `/api/discovery/roadmaps/[id]/tasks/[taskId]/diagnostic` | AI_GENERATION | Task diagnostic chat turn |
| POST | `/api/discovery/roadmaps/[id]/parking-lot` | API_AUTHENTICATED | Park an adjacent idea |

### Roadmaps — Continuation

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/discovery/roadmaps/[id]/checkpoint` | AI_GENERATION | Start "What's Next?" flow |
| GET | `/api/discovery/roadmaps/[id]/continuation` | API_READ | Poll continuation state |
| POST | `/api/discovery/roadmaps/[id]/continuation/fork` | AI_GENERATION | Pick a fork |
| POST | `/api/discovery/roadmaps/[id]/diagnostic` | AI_GENERATION | Roadmap diagnostic chat turn |

### Roadmaps — Conversation Coach (roadmap-level)

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/discovery/roadmaps/[id]/coach/setup` | AI_GENERATION | Coach setup exchange |
| POST | `/api/discovery/roadmaps/[id]/coach/prepare` | AI_GENERATION | Generate preparation package |
| POST | `/api/discovery/roadmaps/[id]/coach/roleplay` | AI_GENERATION | Role-play turn |
| POST | `/api/discovery/roadmaps/[id]/coach/debrief` | AI_GENERATION | Generate debrief |

### Roadmaps — Conversation Coach (task-level)

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `.../tasks/[taskId]/coach/setup` | AI_GENERATION | Coach setup exchange |
| POST | `.../tasks/[taskId]/coach/prepare` | AI_GENERATION | Generate preparation package |
| POST | `.../tasks/[taskId]/coach/roleplay` | AI_GENERATION | Role-play turn |
| POST | `.../tasks/[taskId]/coach/debrief` | AI_GENERATION | Generate debrief |

### Roadmaps — Outreach Composer (roadmap-level)

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/discovery/roadmaps/[id]/composer/generate` | AI_GENERATION | Context exchange or generate messages |
| POST | `/api/discovery/roadmaps/[id]/composer/mark-sent` | API_AUTHENTICATED | Mark message as sent |
| POST | `/api/discovery/roadmaps/[id]/composer/regenerate` | AI_GENERATION | Regenerate one message variation |

### Roadmaps — Outreach Composer (task-level)

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `.../tasks/[taskId]/composer/generate` | AI_GENERATION | Context exchange or generate messages |
| POST | `.../tasks/[taskId]/composer/mark-sent` | API_AUTHENTICATED | Mark message as sent |
| POST | `.../tasks/[taskId]/composer/regenerate` | AI_GENERATION | Regenerate one message variation |

### Roadmaps — Research Tool (roadmap-level)

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/discovery/roadmaps/[id]/research/plan` | AI_GENERATION | Generate research plan |
| POST | `/api/discovery/roadmaps/[id]/research/execute` | AI_GENERATION | Execute research (up to 5 min) |
| POST | `/api/discovery/roadmaps/[id]/research/followup` | AI_GENERATION | Follow-up research round |

### Roadmaps — Research Tool (task-level)

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `.../tasks/[taskId]/research/plan` | AI_GENERATION | Generate research plan |
| POST | `.../tasks/[taskId]/research/execute` | AI_GENERATION | Execute research |
| POST | `.../tasks/[taskId]/research/followup` | AI_GENERATION | Follow-up research round |

### Validation

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/discovery/validation/[pageId]/publish` | AI_GENERATION | Publish page (generates distribution brief) |
| POST | `/api/discovery/validation/[pageId]/channel` | API_AUTHENTICATED | Toggle channel completion |
| POST | `/api/discovery/validation/[pageId]/report` | API_AUTHENTICATED | Toggle usedForMvp flag |

### Public

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/lp/analytics` | IP: 60/min + 30/min per (ip,slug) | Analytics beacon for validation pages |
| GET | `/api/health` | IP: 60/min | Database health check |

### Auth

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET/POST | `/api/auth/[...nextauth]` | (NextAuth internal) | OAuth flows |
| GET | `/api/auth/mobile/[provider]` | (none) | Start mobile OAuth |
| GET | `/api/auth/mobile/callback` | (none) | Mobile OAuth callback |
| GET | `/api/auth/mobile/session` | (none) | Validate mobile Bearer token |

### Conversations

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET | `/api/conversations` | API_READ | List conversations (sidebar) |
| DELETE | `/api/conversations/[conversationId]` | API_AUTHENTICATED | Delete conversation |

### User

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET | `/api/user/training-consent` | (none) | Read training consent state |
| PATCH | `/api/user/training-consent` | API_AUTHENTICATED | Toggle training consent |

### Infrastructure

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET/POST/PUT | `/api/inngest` | (Inngest signing key) | Inngest function manifest and webhooks |

---

## Notes on Partial or Reserved Features

1. **`adjusted_roadmap` check-in action** — defined in the enum but not currently produced by the check-in agent. Reserved for future roadmap-level adjustments from within a check-in.
2. **`service_packager` tool** — referenced in `ResearchTool.suggestedNextSteps` as a cross-tool handoff target but does not exist as an implemented tool.
3. **`interview` and `pushback` parking lot sources** — defined in the enum but not currently used by any code path. Only `checkin` and `manual` sources produce parking lot items today.
4. **Validation page eligibility** — only `build_software` recommendation types are eligible for validation pages (controlled by `VALIDATION_PAGE_ELIGIBLE_TYPES` set).
5. **`about/page.tsx` tech stack** — lists Google Gemini, OpenAI GPT-4, and Framer Motion, reflecting the pre-cleanup architecture. The current stack uses Anthropic Claude, Vercel AI SDK, and `motion/react`.
6. **`framer-motion` imports** — `LandingHeader.tsx`, `HeroBackgroundGradient.tsx`, `HeroForegroundGrid.tsx`, `HeroForegroundStreaks.tsx`, and `about/page.tsx` still import from the deprecated `framer-motion` instead of `motion/react`.
7. **`/generate` route reference** — `LandingHeader.tsx` links "Go to App" to `/generate`, which no longer exists. The correct route is `/discovery`.
8. **`chatStore.ts`** — Zustand store predating the current architecture. `useDiscoverySession` manages all active chat state in local React state.
9. **`distribution-generator.ts` and `build-brief-generator.ts`** — these two call sites do not use `withModelFallback`, making them the only LLM calls without the fallback wrapper.
10. **Mobile app** — OAuth endpoints exist (`/api/auth/mobile/*`) and Bearer token session management is implemented, with a React Native mobile directory at `/mobile`. The mobile auth bridge uses the same NextAuth `Session` table.

---

*Derived from the NeuraLaunch codebase by systematic file-by-file analysis.*
*Generated: 2026-04-13*
