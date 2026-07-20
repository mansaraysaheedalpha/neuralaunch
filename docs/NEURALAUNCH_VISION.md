# NeuraLaunch — System Vision Document

> Derived exclusively from the codebase as of 2026-05-25.
> No marketing language, no aspirational features.
> Only what exists in the source code today.
>
> Most recent ship: commit `9ade9f9` — Stage 5 (No Idea archetype) UI:
> pre-synthesis review, durable Inngest worker, polling, legacy
> augmentations. Migration `20260524000000_add_ideation_stage5_job`
> applied in CI; awaiting production deploy.

---

## 1. What NeuraLaunch Is

NeuraLaunch is an AI-powered growth engine that takes a person from a vague idea, a stalled situation, or no idea at all to a launched product. The system organises a founder's journey around two long-lived containers: a `Venture` (one direction the founder is pursuing) and one or more `Cycle` rows inside it (one execution loop: recommendation → roadmap → optional validation). Inside any cycle the three core phases run: Phase 1 Discovery (an AI interview that produces a single committed `Recommendation`), Phase 2 Roadmap (a phased execution plan with check-ins and four founder-facing tools), Phase 3 Validation (a public landing page with analytics and an Opus-interpreted report — eligible only for `build_software` recommendations).

There are now two parallel entry archetypes into Phase 1:

- **Legacy Discovery** — a 15-field belief-state interview that adapts to one of five inferred audience types and ends in a synthesised single recommendation.
- **No Idea** — a six-stage ideation pipeline (Stages 0-5) for founders who arrive without an idea. The pipeline produces a ranked shortlist of five evaluated opportunities; Stage 5 synthesises the chosen one into a normal `Recommendation` row (with the four reserve opportunities snapshotted for downstream forks) and the founder rejoins the legacy roadmap/validation pipeline.

When a cycle ends, the continuation engine produces a five-section brief with fork options that begin the next cycle. When the founder Marks Complete on a venture, the Transformation Report engine produces an Opus narrative across the whole arc; consented reports can be reviewed by a moderator and published to a public `/stories` archive.

Billing runs on Paddle v4 with three tiers (Free / Execute / Compound). Tier caps active and paused ventures, gates the per-call quota on the four tools, gates voice-mode transcription, and controls cross-venture memory loading for the agents. NeuraLaunch is built as a Next.js 16.2 application (App Router) with PostgreSQL (Neon) for persistence, Upstash Redis for session caching, Inngest v4 for durable background functions, and Anthropic Claude as the primary AI provider via the Vercel AI SDK v5. A standalone Expo / React Native app (`mobile/`) consumes the same API surface and shares Zod schemas + enum constants via the `packages/*` workspace.

NeuraLaunch is built by two people and held to the engineering standards of a senior team at a world-class technology company.

---

## 2. The Founder Journey

### 2.1 Entry

The founder arrives at the public landing page (`/`) and clicks into Discovery. If unauthenticated, they are redirected to `/signin` (NextAuth v5 with Google and GitHub OAuth, plus a mobile Bearer-token bridge). On first authenticated visit to `/discovery`, the system checks for incomplete sessions (active, 1+ questions, last turn between 60 seconds and 72 hours ago) and offers resumption. It also checks for a prior recommendation with a pending outcome attestation — if found, the OutcomeForm modal blocks new session creation until the founder reports what happened.

If the `NEXT_PUBLIC_NO_IDEA_ENABLED` feature flag is set, the `ArchetypePicker` is shown first. The founder explicitly picks one of: legacy fresh-start, no-idea ideation, or fork-continuation. The audience-detection classifier is skipped when the founder makes an explicit pick (`audienceTypeLocked`).

### 2.2 Phase 1a — Legacy Discovery Interview

The interview is a structured AI conversation that builds a 15-field belief state (the `DiscoveryContext`). Fields are grouped into four phases:

- **Orientation** (up to 4 questions): situation, background, whatTriedBefore
- **Goal Clarity** (up to 5 questions): primaryGoal, successDefinition, timeHorizon
- **Constraint Map** (up to 6 questions): availableTimePerWeek, availableBudget, teamSize, technicalAbility, geographicMarket
- **Conviction** (up to 3 questions): commitmentLevel, biggestConcern, whyNow, motivationAnchor

`MAX_TOTAL_QUESTIONS = 15` is the hard ceiling. `MIN_FIELD_CONFIDENCE = 0.65`. `SYNTHESIS_READINESS_RATIO = 0.80`. The interview engine (`src/lib/discovery/interview-engine.ts`) runs a state machine on each founder message:

1. A **safety gate** (`safety-gate.ts`, Haiku primary, Sonnet fallback) classifies the message for harmful content. Block-severity terminates the session permanently (`status = TERMINATED`); the boundary is re-evaluated per-message so refusals cannot be socially-engineered around.
2. A **context extractor** (`context-extractor.ts`, Sonnet via `withModelFallback`) classifies input type (answer / off-topic / frustrated / clarification / synthesis_request) AND extracts updates to all mentioned belief-state fields AND detects follow-up opportunities — in a single `generateText` + `Output.object` call.
3. Special handlers fire for non-answer inputs: meta responses for off-topic, empathetic responses for frustration, contradiction surfacing for conflicting data, pricing follow-ups when pricing model changes are detected.
4. **Audience detection** runs silently at Q4 and optionally re-runs at Q7 if confidence ≥ 0.7. Replaced by an explicit pick when the archetype picker is enabled.
5. An optional **B1 pre-research pass** (Sonnet with Tavily + Exa tools, 5-step budget) runs before question generation, injecting real-world context into the next question without adding streaming latency.
6. A **question selector** scores remaining fields by information gain (field weight × audience boost × confidence gap) and picks the highest-gain field.
7. A **question generator** (streamed via the multi-provider fallback chain) produces the next question. Special question types include psych probes and follow-up threads (when the founder raises an off-script topic).

Synthesis fires when overall weighted completeness reaches 80% AND no critical field (weight ≥ 0.8) has zero confidence. Before the recommendation appears, a 3-5 sentence reflection streams to the founder. The synthesis-transition response sets `X-Synthesis-Transition: true` so the client can pivot UI.

### 2.3 Phase 1b — No Idea Ideation Pipeline (Stages 0-5)

Triggered when the founder picks the No Idea archetype. Persistence uses one `IdeationStageRun` row per `(sessionId, stageNumber)` with `status` discriminating `authoring | output_ready | committed`. The same row reverts from `committed` → `authoring` on `/edit` (the prior document is preserved inside `output.priorCommittedSnapshot` so `/discard-edit` restores it). See § 11 for stage-by-stage details. Stage 5 produces a normal `Recommendation` row via a separate `IdeationStage5Job` worker; the founder then rejoins the legacy acceptance + roadmap flow.

### 2.4 Synthesis (legacy path)

Synthesis runs as a durable Inngest function (`discoverySessionFunction`) with `retries: 2`, `timeouts.start: '10m'`:

1. **Load belief state** — Postgres rehydrate if Redis missed.
2. **`summariseContext`** — Sonnet, cached prefix. Distills the belief state into 3-5 factual sentences.
3. **`eliminateAlternatives`** — Sonnet, cached prefix. Identifies the top 3 directions and systematically eliminates all but one.
4. **Load lifecycle context block** — `FounderProfile` + cycle summaries + cross-venture summaries (Compound only).
5. **`runFinalSynthesis`** — two-phase split (CLAUDE.md non-negotiable):
   - **Phase 1A:** Opus 4.6 with Tavily + Exa research tools, free-form text output, `RESEARCH_BUDGETS.recommendation = 10` steps. The model researches and reasons across every Recommendation field.
   - **Phase 1B:** Sonnet, `output: Output.object({ schema: RecommendationSchema })`, NO tools, NO `stopWhen`. Single concern: format Phase 1A's reasoning into valid JSON.
   - Combining `tools` + `Output.object` + `stopWhen` in a single call is documented in CLAUDE.md as the malformed-row bug class — confirmed in two prod incidents (synthesis 2026-05-18, pushback 2026-04-20). A `validateRecommendationOrThrow` guard fails closed on empty fields the schema would otherwise accept.
6. **Persist Recommendation** — transactional idempotent upsert against the partial unique `(sessionId WHERE parentRecommendationId IS NULL)`.
7. **Cleanup Redis session.**

The UI polls with exponential backoff (3s → 30s) and shows a four-step ThinkingPanel progress indicator driven by `synthesisStep`.

### 2.5 Recommendation Hub

The founder sees their recommendation at `/discovery/recommendation` with collapsible sections for every field. Each assumption has a flag button that streams a 2-3 sentence explanation of how that assumption being false changes the recommendation (`/api/discovery/assumption-check`). For No Idea recommendations the hub renders Stage-5 augmentations (chosen vs reserves; commit `056c61f` surfaces reserves in the continuation brief).

Two paths forward:

- **Accept** ("This is my path — build my roadmap") — sets `acceptedAt`, `acceptedAtRound`. Fires `discovery/roadmap.requested` only on explicit click; the speculative roadmap warm-up that used to live in synthesis was removed.
- **Push back** — opens the pushback chat (see § 10).

### 2.6 Phase 2 — Execution Roadmap

The roadmap engine (`src/lib/roadmap/roadmap-engine.ts`) calls Sonnet with `RoadmapSchema` and the full belief state, audience-specific rules, and (on continuation cycles) `executionMetrics` from the parent roadmap for speed calibration. Output: 2-6 phases, each with up to 5 tasks. Each task has a title, description, rationale, time estimate, success criteria, optional resources, and optional `suggestedTools` (`research_tool | conversation_coach | outreach_composer | service_packager`).

The Inngest function `roadmapGenerationFunction` is idempotent (skip if a roadmap already exists for the recommendation) and writes `Roadmap` + `RoadmapProgress` in one transaction. The roadmap page renders phases as collapsible blocks; each task is an interactive card with status management, check-in form, diagnostic chat, and embedded tool launchers.

### 2.7 Phase 3 — Validation

For `build_software` recommendations, the founder can generate a validation landing page. The page generator (`src/lib/validation/page-generator.ts`, Sonnet) produces content validated against the validation schema set: headline, problem/solution statements, feature cards (mapped from roadmap tasks), CTA signup form, entry and exit surveys, SEO metadata. Three layout variants exist: product, service, marketplace. Pages bind via one of three keys: `recommendationId`, `(roadmapId, taskId)`, or fully standalone — enforced by partial unique indexes.

The page is published to `/lp/[slug]` with a distribution brief (3 AI-selected channels, audience-specific guidance). Public visitors generate analytics events (page views, scroll depth, exit intent, feature clicks, CTA signups, survey responses) collected via the hardened public beacon endpoint. A cron-driven reporting pipeline aggregates metrics, interprets them via Sonnet (Step 1: `ValidationInterpretation`), and when thresholds are met generates a build brief via Opus (Step 2: `ValidationReport` with signal strength, confirmed/rejected features, survey insights, next action, optional disconfirmedAssumptions and pivotOptions for negative signal).

### 2.8 Continuation Cycle

The "What's Next?" button fires `POST /api/discovery/roadmaps/[id]/checkpoint`. `evaluateScenario` is a pure deterministic function:

- **A** (0 tasks complete) → needs diagnostic (blocker inquiry)
- **B** (< 70% complete) → needs diagnostic (incomplete reason)
- **C** (≥ 70% complete) → skip to brief
- **D** (100% complete) → skip to brief

The diagnostic chat (Sonnet, up to 10 turns) probes what happened. On `release_to_brief`, the Inngest event fires. The brief (`continuationBriefFunction`, Opus with `RESEARCH_BUDGETS.continuation = 8` steps) produces five sections: what happened, what I got wrong, what the evidence says, fork options (2-4), parking lot items, closing thought. For No Idea recommendations the brief now augments the forks with the four reserve opportunities snapshotted at Stage 5 commit (`Recommendation.ideationReserveOpportunities`, commit `056c61f`).

Picking a fork creates a new `Recommendation` (auto-accepted), links it back via `forkRecommendationId`, sets `continuationStatus = FORK_SELECTED`, and triggers a new roadmap generation with `parentRoadmapId` so the engine can read execution metrics from the previous cycle.

---

## 3. The Agent Architecture

### 3.1 Model Allocation

Models are pinned in `src/lib/discovery/constants.ts` (`MODELS`). Stage 1-5 ideation re-exports the same map. Transformation Report pins Opus 4.7 directly at its call site. Every structured-output call site uses `withModelFallback`; every streaming question/response call site uses `streamQuestionWithFallback`.

| Agent | Primary Model | Fallback Model | Pattern |
|---|---|---|---|
| Safety gate | Haiku 4.5 | Sonnet 4.6 | `generateText` + `Output.object` |
| Context extractor | Sonnet 4.6 | Haiku 4.5 | `generateText` + `Output.object` |
| Audience detector | Sonnet 4.6 | Haiku 4.5 | `generateText` + `Output.object` |
| Question generator | Sonnet → Haiku → Gemini 2.5 Flash | (3-tier chain) | `streamText` |
| Response generators (5 types) | Sonnet → Haiku → Gemini 2.5 Flash | (3-tier chain) | `streamText` |
| Interview pre-research (B1) | Sonnet | Haiku | `generateText` + tools |
| Synthesis: summariseContext | Sonnet | Haiku | Anthropic SDK direct (cached) |
| Synthesis: eliminateAlternatives | Sonnet | Haiku | Anthropic SDK direct (cached) |
| Synthesis: Phase 1A reasoning | Opus 4.6 | Sonnet 4.6 | `generateText` + tools (text output) |
| Synthesis: Phase 1B emission | Sonnet | Haiku | `generateText` + `Output.object` (no tools) |
| Pushback: Phase 1A reasoning | Opus 4.6 | Sonnet | `generateText` + tools (text output) |
| Pushback: Phase 1B emission | Sonnet | Haiku | `generateText` + `Output.object` (no tools) |
| Pushback: Phase 2 rewrite (refine/replace) | Opus | Sonnet | `generateText` + `Output.object` |
| Alternative synthesis (round HARD_CAP) | Opus | Sonnet | `generateText` + tools + `Output.object` (legacy shape — verify) |
| Roadmap generator | Sonnet | Haiku | `generateText` + `Output.object` |
| Check-in agent | Sonnet | Haiku | `generateText` + tools + `Output.object` |
| Task diagnostic | Sonnet | Haiku | `generateText` + `Output.object` |
| Conversation arc summariser | Haiku | (none, fire-and-forget) | Anthropic SDK direct |
| Coach: setup | Sonnet | Haiku | `generateText` + `Output.object` |
| Coach: preparation (ToolJob worker) | Opus | Sonnet | `generateText` + tools + `Output.object` |
| Coach: roleplay | Sonnet | Haiku | `generateText` + `Output.object` |
| Coach: debrief | Haiku | Haiku | `generateText` + `Output.object` |
| Composer: context | Sonnet | Haiku | `generateText` + `Output.object` |
| Composer: generation (ToolJob worker) | Sonnet | Haiku | `generateText` + tools + `Output.object` |
| Composer: regeneration | Sonnet | Haiku | `generateText` + `Output.object` |
| Packager: context | Sonnet | Haiku | `generateText` + `Output.object` |
| Packager: generation (ToolJob worker) | Sonnet | Haiku | `generateText` + tools + `Output.object` |
| Packager: adjustment (ToolJob worker) | Sonnet | Haiku | `generateText` + `Output.object` |
| Research: plan | Sonnet | Haiku | `generateText` + `Output.object` |
| Research: execution (ToolJob worker) | Opus | Sonnet | `generateText` + tools + `Output.object` |
| Research: follow-up (ToolJob worker) | Sonnet | Haiku | `generateText` + tools + `Output.object` |
| Continuation diagnostic | Sonnet | Haiku | `generateText` + `Output.object` |
| Continuation brief | Opus | Sonnet | `generateText` + tools + `Output.object` |
| Validation interpreter | Sonnet | Haiku | `generateText` + `Output.object` |
| Validation page generator | Sonnet | Haiku | `generateText` + `Output.object` |
| Distribution brief generator | Sonnet | (3-attempt retry, no withModelFallback) | `generateText` + `Output.object` |
| Build brief generator | Opus | Sonnet | `generateText` + `Output.object` |
| Assumption check | Sonnet | (none) | `streamText` |
| Conversation title (Inngest) | Haiku | Haiku | `generateText` + `Output.object` |
| Pause-reason agent | Sonnet | Haiku | `generateText` + `Output.object` |
| Ideation Stage 1: extractor | Sonnet | Haiku | `generateText` + `Output.object` |
| Ideation Stage 1: composer | Sonnet | Haiku | `generateText` + `Output.object` |
| Ideation Stage 2: extractor | Sonnet | Haiku | `generateText` + `Output.object` |
| Ideation Stage 2: composer | Sonnet | Haiku | `generateText` + `Output.object` |
| Ideation Stage 2: expected profile agent | Sonnet | Haiku | `generateText` + tools + `Output.object` |
| Ideation Stage 2: expected-profile pushback | Sonnet | Haiku | `generateText` + `Output.object` |
| Ideation Stage 3: pain-scout agent | Sonnet | Haiku | `generateText` + tools + `Output.object` |
| Ideation Stage 3: pain extractor / composer | Sonnet | Haiku | `generateText` + `Output.object` |
| Ideation Stage 3: score pushback | Sonnet | Haiku | `generateText` + `Output.object` |
| Ideation Stage 4: Layer A research agent | Sonnet | Haiku | `generateText` + tools + `Output.object` |
| Ideation Stage 4: Layer B script agent | Sonnet | Haiku | `generateText` + `Output.object` |
| Ideation Stage 4: vision extractor | Sonnet (vision) | Haiku (vision) | `generateText` + `Output.object` |
| Ideation Stage 4: verdict synthesizer | Sonnet | Haiku | `generateText` + `Output.object` |
| Ideation Stage 4: verdict pushback | Sonnet | Haiku | `generateText` + `Output.object` |
| Ideation Stage 5: synthesis bridge Phase 1A | Opus 4.6 | Sonnet | `generateText` + tools (text output) |
| Ideation Stage 5: synthesis bridge Phase 1B | Sonnet | Haiku | `generateText` + `Output.object` (no tools) |
| Transformation report: narrative | Opus 4.7 | Opus 4.6 | `generateText` + `Output.object` |
| Transformation report: redaction detector | Opus 4.6 | Sonnet | `generateText` + `Output.object` |

Note: the codebase migrated off `generateObject` to `generateText` + `Output.object({ schema })` in commit `91b1abb`. The previous version of this document listed many call sites as `generateObject`; that pattern no longer exists.

### 3.2 Fallback Patterns

- **`withModelFallback`** (`src/lib/ai/with-model-fallback.ts`) — single immediate retry against a smaller fallback model on Anthropic overload (status 529, `AI_RetryError`, `AI_APICallError`, `AI_NoObjectGeneratedError`, or "overload" message). Non-overload errors rethrow.
- **`streamQuestionWithFallback`** (`src/lib/ai/question-stream-fallback.ts`) — three-provider chain: Anthropic Sonnet → Anthropic Haiku → Google Gemini 2.5 Flash. Two attempts per provider with 2-second backoff. Mid-stream failure after first chunk surfaces the cut to the client. `maxRetries: 0` disables the AI SDK's internal retry — the chain owns retry semantics.
- **Distribution brief generator** — no `withModelFallback`; instead, a 3-attempt loop retrying when Zod validation fails on channel uniqueness.
- **Pushback Phase 1A and Phase 2** — Opus only, Sonnet fallback; opaque to the client on hard failure.

### 3.3 Prompt Injection Defence

Every agent that embeds user-typed content follows the same protocol:

1. User content is wrapped via `renderUserContent(value)` (in `src/lib/validation/server-helpers.ts`) which calls `sanitizeForPrompt()` (strips control chars, zero-width chars, breaks markdown fences and `]]]` delimiters, collapses whitespace, truncates to default 600 chars) then wraps in `[[[...]]]` triple-bracket delimiters.
2. Every prompt includes the canonical SECURITY NOTE instructing the model to treat triple-bracketed content as raw data, never as instructions.
3. LLM-generated content that is re-embedded into subsequent prompts (recommendation fields fed into pushback, cycle summaries fed into next-cycle interview) goes through `sanitizeForPrompt()` separately. Lifecycle prompt renderers (`renderInterviewOpeningBlock`, `renderFounderProfileBlock`, `renderCycleSummariesBlock`, `renderCrossVentureBlock`) apply the same wrapping so prior-cycle text is data, not instructions.

### 3.4 Prompt Caching

Anthropic prompt-cache helpers live in `src/lib/ai/prompt-cache.ts` (`cachedSystem`, `cachedUserMessages`, `cachedAnthropicContent`). Every call with a stable prefix ≥ 1024 tokens uses one of the helpers. Stable: rules, schema descriptions, belief-state renderings, roadmap outlines, recommendation blocks, prior turns. Volatile: latest message, current task, per-call classification verdicts. Maximum four cache breakpoints per request — almost every call in this codebase uses one.

---

## 4. The Data Model

### 4.1 Core Entities

**User** — OAuth identity. Fields: `trainingConsent`, `trainingConsentAt`, `aggregateAnalyticsConsent`, `aggregateAnalyticsConsentAt`, `nudgesEnabled`. Paddle linkage: `paddleCustomerId`, `tierUpdatedAt`, plus user-level tier history (`lastPaidTier`, `wasFoundingMember`, `firstSubscribedAt`). Relations cascade to all owned entities.

**Subscription** — One row per user with a Paddle subscription. Carries `tier` (`free | execute | compound`), `paddleSubscriptionId`, `paddleCustomerId`, `status`, `priceId`, `billingInterval`, `cancelAtPeriodEnd`, `currentPeriodEnd`, `isFoundingMember`. Source of truth for tier resolution at request time.

**TierTransition** — Append-only audit log of every billing-tier change. Required for chargeback dispute evidence. `fromTier`, `toTier`, `paddleEventType`, `paddleEventId` (unique-when-not-null), `occurredAt`.

**PushToken** — Expo push tokens per device. `platform: 'ios' | 'android' | 'web'`, `lastUsedAt` for sweep-out.

**Account / Session / VerificationToken** — Standard NextAuth tables. `Session.sessionToken` is also the mobile Bearer token.

**Conversation** — Chat thread with `messages[]` and an optional one-to-one `discoverySession`. Indexed `[userId, createdAt]`.

**Message** — `role`, `content`, `createdAt`, optional `modelUsed` (`anthropic-sonnet | anthropic-haiku | google-gemini-flash`), optional `inputMethod` (`voice` when transcribed via Deepgram).

### 4.2 Discovery Models

**DiscoverySession** — Status `ACTIVE | COMPLETE | EXPIRED | TERMINATED`. Core fields: `phase`, `questionCount`, `questionsInPhase`, `activeField`, `audienceType`, `askedFields` (JSON string array), `pricingProbed`, `psychConstraintProbed`, `lastTurnAt`, `synthesisStep`. `beliefState` (JSON) is the typed `DiscoveryContext`. `researchLog` (JSON) is the append-only research audit trail. Relation: `recommendations[]` (a session can produce both a primary AND a pushback hard-cap alternative). Indexes: `[userId, status, lastTurnAt(Desc)]` for resume-discovery query, others. Relation: `ideationRuns[]` for No Idea archetype.

**IdeationStageRun** — One row per `(sessionId, stageNumber)` where `stageNumber ∈ 0..5`. `status: 'authoring' | 'output_ready' | 'committed'`. `output` (JSON) discriminated by status (`Stage{N}AuthoringStateSchema` vs `*DocumentSchema`). `committedAt` set IFF `status='committed'` (invariant in app code). The edit flow reverts `committed`/`output_ready` → `authoring` and preserves the prior document in `output.priorCommittedSnapshot` so `/discard-edit` restores it. Cross-stage cascades preserve downstream stages via `output.cascadeSnapshot`. Unique constraint: `(sessionId, stageNumber)`.

**Recommendation** — Synthesis output. Fields stored as top-level columns (`summary`, `path`, `reasoning`, `firstThreeSteps`, `timeToFirstResult`, `risks`, `assumptions`, `whatWouldMakeThisWrong`, `alternativeRejected`). Pushback state: `pushbackHistory` (JSON `PushbackTurn[]`), `pushbackVersion` (optimistic lock — see § 11), `versions` (snapshot array). Acceptance: `acceptedAt`, `acceptedAtRound`, `unacceptCount`. Self-relation: `parentRecommendationId` (alternative → parent). Phase metadata: `phaseContext` (JSON). No Idea: `ideationReserveOpportunities` (JSON, the four reserves Stage 4 ranked but did not advance). `validationOutcome` mirrors the report's signal strength. `recommendationType`: one of `build_software | build_service | sales_motion | process_change | hire_or_outsource | further_research | other`. Lifecycle: `cycleId` (unique, links to the `Cycle` row).

**Roadmap** — Status `GENERATING | READY | FAILED | STALE`. `phases` (JSON `RoadmapPhase[]`). `closingThought`, `weeklyHours`, `totalWeeks`. Continuation extensions: `parkingLot`, `diagnosticHistory`, `continuationBrief`, `executionMetrics`, `continuationStatus` (`CHECKING | DIAGNOSING | GENERATING_BRIEF | BRIEF_READY | FORK_SELECTED`), `parentRoadmapId` (self-relation, `onDelete: SetNull`), `forkRecommendationId` (unique, links to the next-cycle recommendation). Standalone tool sessions in `toolSessions` (JSON array). Research log in `researchLog`. Lifecycle: `ventureId` cached for query convenience.

**RoadmapProgress** — One-to-one with Roadmap. Counters: `totalTasks`, `completedTasks`, `blockedTasks`, `currentPhase`. Activity: `lastActivityAt`. Nudge state: `nudgePending`, `nudgeLastSentAt`, `staleTaskTitle`. Outcome prompt: `outcomePromptPending`, `outcomePromptSkippedAt`. Indexed on `[nudgePending]`, `[lastActivityAt]`, `[outcomePromptPending]`.

**RecommendationOutcome** — Founder's retrospective attestation. `outcomeType: full_success | partial_success | direction_correct_execution_different | did_not_work`. `freeText`, `weakPhases`, `consentedToTraining` (captured at submission, read-only). `anonymisedRecord` (null when consent is false; 24-month TTL).

### 4.3 Validation Models

**ValidationPage** — Status `DRAFT | LIVE | ARCHIVED`. Bound via one of three keys: `recommendationId`, `(roadmapId, taskId)`, or fully standalone (both null). Partial unique indexes enforce uniqueness per binding shape. `slug` (unique), `layoutVariant` (`product | service | marketplace`), `content` (JSON), `distributionBrief` (JSON, 3 channels), `channelsCompleted` (string array). `phaseContext` for upstream tracing.

**ValidationSnapshot** — Point-in-time metrics aggregate. Visitor counts, CTA conversion rate, feature clicks, survey responses, traffic sources, scroll depth, optional `interpretation` (Sonnet Step 1 output). `market` field captured for cohort calibration.

**ValidationReport** — Opus Step 2 output. `signalStrength`: `strong | moderate | weak | negative`. Confirmed/rejected features, survey insights, build brief, next action, disconfirmed assumptions (negative only), pivot options. `usedForMvp` flag.

**ValidationEvent** — Raw analytics beacon events. Types: `page_view | scroll_depth | exit_intent | feature_click | cta_signup | survey_response`. `visitorId` is hashed.

### 4.4 Lifecycle Models

**FounderProfile** — One row per user. `profile` (JSON `FounderProfileSchema` — 4 sections: stableContext, currentSituation, behaviouralCalibration, journeyOverview, 500-1000 tokens). `skillInventory` (JSON, the 14×4 structured skill matrix from Stage 2). `lastUpdatedByCycleId`. Updated by `lifecycleTransitionFunction` at cycle boundaries.

**Venture** — `name`, `status: 'active' | 'paused' | 'completed'`, `currentCycleId`, `archivedAt` (soft-archive on tier downgrade), `pauseReason`, `pauseReasonMode` (`acknowledge | reframe | mirror | static | no_reason`), `pausedAt`. Indexes: `[userId, status]`, `[userId, archivedAt]`, `[userId, updatedAt(Desc)]`.

**Cycle** — `cycleNumber` (unique within venture), `status: 'in_progress' | 'completed' | 'abandoned'`, one-to-one `recommendation`, denormalised `roadmapId`. `summary` (JSON `CycleSummarySchema`) populated post-continuation. `selectedForkIndex`, `selectedForkSummary` record the fork picked to start the next cycle.

### 4.5 Transformation Models

**TransformationReport** — One per venture (unique). `stage: 'queued' | 'loading_data' | 'drafting' | 'detecting_redactions' | 'persisting' | 'complete' | 'failed'`. `content` (JSON, dynamic schema with optional sections + `customSections` + `sectionOrder`). `redactionCandidates`, `redactionEdits`. Publish lifecycle: `publishState: 'private' | 'pending_review' | 'public' | 'unpublished'`, `publicSlug`, `publishedAt`. Moderator: `reviewNotes`, `reviewedAt`, `outcomeLabel: 'shipped' | 'walked_away' | 'pivoted' | 'learning'`, `cardSummary` (JSON, marketing-strip snapshot).

### 4.6 Tool-Job Models

**ToolJob** — Durable execution row for long-running LLM tool calls. `toolType: 'research_execute' | 'research_followup' | 'composer_generate' | 'composer_regenerate' | 'coach_prepare' | 'coach_debrief' | 'packager_generate' | 'packager_adjust'`. `roadmapId`, `sessionId` (the pre-allocated `toolSessions[]` entry id), optional `taskId`. `stage: 'queued' | 'context_loaded' | 'researching' | 'emitting' | 'persisting' | 'complete' | 'failed'`. Unique constraint: `(sessionId, toolType)` prevents double-allocation.

**IdeationStage5Job** — Durable Stage 5 synthesis row. `sessionId`, `stage: 'queued' | 'loading_inputs' | 'synthesizing' | 'persisting' | 'succeeded' | 'failed'`, `recommendationId` populated on success. Lives separately from `ToolJob` because Stage 5 produces a `Recommendation` directly and has no `roadmapId`. Partial unique index in migration enforces one in-flight job per session.

### 4.7 JSONB Schemas (subset)

**DiscoveryContext** — 15 belief fields wrapped in `beliefField<T>({ value, confidence, extractedAt })`. Critical fields (weight ≥ 0.8): situation, primaryGoal, availableTimePerWeek, motivationAnchor.

**StoredRoadmapTask** — extends the generated `RoadmapTask` with: `status`, `startedAt`, `completedAt`, `checkInHistory`, `conversationArc` (Haiku summary), `coachSession`, `composerSession`, `researchSession`, `packagerSession` (each a tool session object).

**CheckInEntry** — `id`, `timestamp`, `category` (completed/blocked/unexpected/question), `freeText`, `agentResponse`, `agentAction` (acknowledge/ask_follow_up/propose_changes/escalate), `round` (0 for diagnostic, 1-5 for check-ins), `source` (founder/success_criteria_confirmed/task_diagnostic), optional `proposedChanges`, `subSteps`, `recommendedTools`, `recalibrationOffer`, `parkingLotItem`.

**PushbackTurn** — discriminated union. User: `{ role, content, round, timestamp }`. Agent: `{ role, content, round, mode, action, converging, timestamp }`.

**ContinuationBrief** — five sections: `whatHappened`, `whatIGotWrong`, `whatTheEvidenceSays`, `forks` (2-4 with id/title/rationale/firstStep/timeEstimate/rightIfCondition), `parkingLotItems`, `closingThought`.

**ParkingLotItem** — `{ id, idea, surfacedAt, surfacedFrom, taskContext }`.

**FounderProfileSchema** — stableContext, currentSituation, behaviouralCalibration, journeyOverview.

**CycleSummarySchema** — compressed L2 memory layer per cycle.

**ResearchLogEntry** — `{ query, agent, tool?, resultSummary?, timestamp, answer?, sources?, success? }`. Capped at `MAX_RESEARCH_LOG_ENTRIES = 100` per column.

**Stage1-5 Documents and Authoring States** — defined in `src/lib/ideation/stage{N}-*/schema.ts`. See § 11.

---

## 5. The Internal Tools

All four tools have shipped as durable **ToolJob workers**. The route shape is uniform: validate (auth, tier, quota, ownership) → `createToolJob({ userId, roadmapId, toolType, sessionId, taskId? })` → `sendToolJobEvent` → return `202` with `{ jobId, sessionId }`. The route owns no LLM calls. The Inngest worker runs the engine in `step.run` blocks (`context_loaded` → `researching` → `emitting` → `persisting`) and writes its result via `persistToolJobResult` in `src/lib/tool-jobs/persistence.ts`. That helper handles both standalone (`roadmap.toolSessions[]`) and task-launched (`task.<x>Session`) shapes through one entry point.

Short conversational calls (Coach setup, Coach roleplay turns, Composer/Packager context-collection exchanges, Composer single-message regeneration) stay synchronous because the founder needs an immediate reply for chat UX.

Per-billing-cycle quotas (`CYCLE_LIMITS` in `src/lib/rate-limit.ts`):

| Tool | Execute / cycle | Compound / cycle |
|---|---|---|
| Research Tool | 30 | 100 |
| Conversation Coach | 50 | 150 |
| Outreach Composer | 100 | 300 |
| Service Packager | 20 | 60 |

The Free tier does not have access to tools.

### 5.1 Conversation Coach

Engine: `src/lib/roadmap/coach/`. Four stages:

1. **Setup** (Sonnet, up to 3 exchanges) — Collects: who the conversation is with, relationship, objective, fear, and channel (WhatsApp / in-person / email / LinkedIn).
2. **Preparation** (Opus, ToolJob worker `coach-prepare-job.ts`) — Channel-native opening script (exact copy-paste text), 2-3 key asks, 3-4 anticipated objections with grounded responses, fallback positions, post-conversation checklist with optional Composer handoff.
3. **Roleplay** (Sonnet, up to 10 turns, synchronous) — Interactive back-and-forth where the agent plays the other party. Warning at turn 8, hard cap at 10.
4. **Debrief** (Haiku, ToolJob worker) — Lightweight synthesis.

Persistence: task-level in `task.coachSession`, standalone in `roadmap.toolSessions`. Cross-tool handoff: Coach → Composer via `postConversationChecklist[].suggestedTool`.

### 5.2 Outreach Composer

Engine: `src/lib/roadmap/composer/`. Three modes (single / batch / sequence), three channels (WhatsApp / email / LinkedIn). Three operations:

1. **Context collection** (Sonnet, up to 2 exchanges, synchronous) — Collects: target, relationship, goal, channel, mode. Optional `coachHandoffContext` from a prior Coach session.
2. **Generation** (Sonnet with research tools, ToolJob worker `composer-generate-job.ts`) — Produces `ComposerOutput.messages[]` with body, optional subject, annotation, and optional `suggestedTool: 'conversation_coach'`.
3. **Regeneration** (Sonnet, synchronous) — Single-message variation with founder-supplied instruction. Capped at 2 regenerations per message.

**Mark-as-sent** is a pure data write.

### 5.3 Research Tool

Engine: `src/lib/roadmap/research-tool/`. Three steps:

1. **Plan** (Sonnet, synchronous) — Takes the founder's query and produces a research plan (1-6 sentences) with honest time estimate. Geographic scope stated explicitly.
2. **Execution** (Opus, `RESEARCH_BUDGETS.research-execution = 25` steps, ToolJob worker `research-execute-job.ts`) — Multiple search rounds, evaluates gaps, runs targeted follow-ups. Produces a `ResearchReport`: summary, structured findings (typed: business / person / competitor / datapoint / regulation / tool / insight, with contact info, source URL, confidence level), sources with relevance annotations, roadmapConnections, suggestedNextSteps.
3. **Follow-up** (Sonnet, `RESEARCH_BUDGETS.research-followup = 10` steps, ToolJob worker `research-followup-job.ts`) — Targeted additional research. New findings only.

Confidence levels: verified / likely / unverified.

### 5.4 Service Packager

Engine: `src/lib/roadmap/service-packager/`. Three operations:

1. **Context** (Sonnet, synchronous) — Collects: service shape, pricing assumptions, market.
2. **Generation** (Sonnet with research tools, `RESEARCH_BUDGETS.service-packager = 8` steps, ToolJob worker `packager-generate-job.ts`) — Produces a `ServicePackage` with revenue scenarios.
3. **Adjustment** (Sonnet, ToolJob worker `packager-adjust-job.ts`) — Targeted edits with founder-supplied instruction.

`PackageRevenueScenarioSchema.clients` is declared as plain `z.number()` (with a post-parse transform clamp to non-negative integer) — see CLAUDE.md "Reliability" rule against `.int()` on Anthropic structured-output schemas.

---

## 6. The Roadmap Generator and Tool Choreography

The roadmap generator (`src/lib/roadmap/roadmap-engine.ts`) receives the recommendation, belief state, audience type, and optional speed calibration. It resolves weekly hours from the belief state (keyword map → range regex → single number → default 10). Audience-specific rules shape the roadmap:

- **Lost graduate** — momentum first, visible output within 2 weeks.
- **Stuck founder** — break the pattern, structural difference from what stalled them.
- **Established owner** — leverage existing assets, no starting from zero.
- **Aspiring builder** — Phase 1 ends with a real customer conversation; gates on validation before build.
- **Mid-journey professional** — every task fits stated hours, no full-time-only tasks.

### Tool Choreography

The generator prompt includes an INTERNAL TOOLS section naming all four tools (`research_tool`, `conversation_coach`, `outreach_composer`, `service_packager`) and TOOL CHOREOGRAPHY EXAMPLES showing multi-tool workflows written directly into task descriptions (research → coach → composer; research → composer for survey distribution; research → packager for pricing benchmarks; etc.).

The generator outputs `suggestedTools` on each task, and the task card UI renders the corresponding tool buttons. The check-in agent is aware of completed tool sessions on the current task (`checkin-tool-awareness.ts`) and references them in its responses.

---

## 7. The Check-in System

### 7.1 Per-Task Check-ins

Each task supports up to 5 check-in rounds. Categories: completed, blocked, unexpected, question. The check-in agent (Sonnet with optional research tools, `RESEARCH_BUDGETS.checkin = 4` steps) returns a structured `CheckInResponse`:

- **`agentAction`**: `acknowledge | ask_follow_up | propose_changes | escalate`.
- **`message`**: founder-specific.
- **`proposedChanges`**: task adjustment suggestions.
- **`parkingLotItem`**: verbatim adjacent idea captured from the founder's message.
- **`subSteps`**: 3-6 imperative sub-steps when the founder is confused about HOW to execute.
- **`recommendedTools`**: 1-4 tools (internal NeuraLaunch tools and external tools).
- **`recalibrationOffer`**: only when accumulated evidence suggests the direction is wrong. Gated externally: requires ≥ 40% task coverage.

### 7.2 Check-in Sources

- `founder` — manual check-in from the form.
- `success_criteria_confirmed` — auto-generated on "It went as planned".
- `task_diagnostic` — entries from the task-level diagnostic chat.

### 7.3 Task Diagnostic Chat

Triggered by "Get help with this task". Up to 10 turns (Sonnet). Three verdicts: `still_helping`, `resolved`, `escalate_to_roadmap`. At the cap, runs inconclusive synthesis (Haiku). Stored in `task.checkInHistory` with `source: 'task_diagnostic'`, `round: 0`.

### 7.4 Conversation Arc Summariser

At round 5 cap or when a task is completed with 2+ entries, a fire-and-forget Haiku call produces a one-sentence narrative arc and stores it in `task.conversationArc`. Fed into the continuation brief as structured evidence.

### 7.5 Roadmap-Level Diagnostic

The Continuation engine's diagnostic chat lives at `POST /api/discovery/roadmaps/[id]/diagnostic`. Verdicts include `still_diagnosing`, `release_to_brief`, `recommend_re_anchor`, `recommend_breakdown`, `recommend_pivot`, `inconclusive`.

### 7.6 Nudge Cron

`roadmapNudgeFunction` runs on a schedule. For each `RoadmapProgress` row where `nudgePending=false` and `nudgeLastSentAt` is null or sufficiently old: loads roadmap phases, finds the first in-progress task whose elapsed time exceeds its `timeEstimate`, sets `nudgePending=true`, `staleTaskTitle`. Skipped for paused/completed ventures. Skipped for users where `nudgesEnabled=false`. Also flags `outcomePromptPending=true` on progress rows with ≥50% completion, >30 days inactive, no existing outcome, and not previously skipped.

---

## 8. The Continuation System

### 8.1 Checkpoint

`POST /api/discovery/roadmaps/[id]/checkpoint`: loads lightweight progress counters, runs `evaluateScenario` (pure deterministic), sets `continuationStatus` accordingly, fires `discovery/continuation.requested` for scenarios C/D.

### 8.2 Diagnostic

For Scenarios A/B, the multi-turn chat (Sonnet, ≤ 10 turns) probes what happened. On `release_to_brief`, flips status to `GENERATING_BRIEF` and fires the Inngest event.

### 8.3 Brief Generation

`continuationBriefFunction` (Inngest, Opus, `RESEARCH_BUDGETS.continuation = 8` steps):

1. `loadContinuationEvidence` — full evidence base.
2. `computeExecutionMetrics` — pace from actual task timing (`statedWeeklyHours` vs `derivedWeeklyHours`, `paceLabel`, `paceNote`).
3. Opus call with structured signals: belief digest, motivation anchor, original recommendation, per-task execution record, recalibration offers, conversation arcs, parking lot, diagnostic history, plus (for No Idea recommendations) the four `ideationReserveOpportunities` snapshotted at Stage 5 commit.
4. Serializable-transaction persistence: merges research log, guards on `continuationStatus = GENERATING_BRIEF`, sets brief + metrics + status `BRIEF_READY`.

### 8.4 Fork Selection

`POST /api/discovery/roadmaps/[id]/continuation/fork`:

1. Validates fork ID against brief.
2. Creates new `Recommendation` (auto-accepted, summary/assumptions derived from fork + brief).
3. Sets `forkRecommendationId`, flips status to `FORK_SELECTED`.
4. Fires `discovery/roadmap.requested` with `parentRoadmapId` so the generator loads speed calibration.

### 8.5 Parking Lot

Sources: check-in agent capture (automatic), manual button, interview/pushback (reserved). Capped at 50 per roadmap. Duplicate detection by idea text.

---

## 9. The Research Substrate

### 9.1 Architecture

Three named search providers registered as AI SDK tools (`src/lib/research/`):

- **`exa_search`** — semantic/similarity search. Exa SDK, `contents.text.maxCharacters: 800`. Input: `{ query, numResults: 1-10 }`.
- **`tavily_search`** — factual search. Tavily SDK, `searchDepth: 'advanced'`, `maxResults: 5`, `includeAnswer: true`.
- **`community_pulse`** — composite community-signal fan-out used by Stage 3 Pain Scout and Stage 4 Layer A research. Implementation detail of the ideation pipeline.

Tools are conditionally registered: if a provider key is unset, that tool is omitted entirely. `getResearchToolGuidance()` returns the appropriate prompt copy based on which providers are configured.

### 9.2 Agent-Chooses Architecture

The model decides when and how to use research tools. Each `generateText` call with tools uses `stopWhen: stepCountIs(N)` to cap tool-use steps.

### 9.3 Per-Agent Step Budgets (`RESEARCH_BUDGETS`)

| Agent | Steps | Description |
|---|---|---|
| interview | 5 | Light pre-research before questions (B1) |
| recommendation | 10 | Deep synthesis research (Phase 1A) |
| pushback | 15 | Targeted evidence gathering (raised from 5 after 2026-04-20 starvation incident) |
| checkin | 4 | Lightweight market/vendor checks |
| continuation | 8 | Evidence-informed brief |
| composer | 8 | Recipient/industry research |
| research-execution | 25 | Deep multi-round investigation (Research Tool) |
| research-followup | 10 | Targeted additional research |
| service-packager | 8 | Market rate verification, competitor pricing |
| stage2-expected-profile | 3 | Skill demand verification |
| stage3-pain-scout | 8 | Community + web pain-signal scout |
| stage4-opportunity-research | 6 | Per-opportunity 4-dimension research (Layer A) |

### 9.4 Per-Call Accumulator Pattern

Every call site passes a mutable `ResearchLogEntry[]` accumulator. Each successful tool execution pushes an entry; failures return error text but do not push. After the call, the accumulator is appended to the relevant JSONB column (`DiscoverySession.researchLog`, `Recommendation.researchLog`, `Roadmap.researchLog`). Capped at 100 via `appendResearchLog`.

### 9.5 Transport Layer

Both providers: 30-second per-query timeout, 2 max attempts with 500ms linear backoff. Exa results capped at `numResults` hits. Tavily results capped at 5 with `includeAnswer: true`. Rendered summaries capped at `MAX_FINDINGS_CHARS = 4000`.

---

## 10. The Pushback System

### 10.1 Flow

After seeing the recommendation, the founder can push back in PushbackChat. Each round runs the two-phase pushback engine (`src/lib/discovery/pushback-engine.ts`):

- **Phase 1A — reasoning + research.** Opus + research tools, free-form text output, 15-step budget. Emits plain reasoning covering mode, action, converging boolean, and rebuttal message.
- **Phase 1B — structured emission.** Sonnet, `Output.object` against `PushbackResponseSchema`. Single concern: format Phase 1A's reasoning into valid JSON. Splitting fixed the 2026-04-20 round-4+ truncation incident.
- **Phase 2 — rewrite (optional).** Fires only on `action ∈ {refine, replace}`. Opus, full `RecommendationSchema`, max 16 k output tokens, merged through `mergeRecommendationPatch`.

### 10.2 Modes

`analytical | fear | lack_of_belief`.

### 10.3 Actions

`continue_dialogue | defend | refine | replace | closing`.

### 10.4 Round Management

Tier-aware: Execute = 10 rounds, Compound = 15 rounds. `SOFT_WARN_ROUND = 4` — server appends canonical re-frame phrase if model didn't honour the contract. `HARD_CAP_ROUND` triggers `pushbackAlternativeFunction` which synthesises a constrained alternative recommendation linked back via `parentRecommendationId`.

### 10.5 Optimistic Concurrency

`Recommendation.pushbackVersion` is an integer optimistic lock. Every pushback write uses `updateMany({ where: { id, pushbackVersion: prev } })` and treats `count: 0` as contention failure (returns 409). Hard invariant — removing this field would silently corrupt pushback history.

### 10.6 Recalibration Evidence

`recalibrationOffer` from the check-in agent (gated on ≥ 40% task coverage) becomes evidence for the continuation brief generator via `brief-renderers.ts`.

---

## 11. The Ideation Pipeline (No Idea Archetype)

Persistence: `IdeationStageRun` rows per `(sessionId, stageNumber)`. `output` is discriminated by `status` (`authoring | output_ready | committed`). The `committedAt` set IFF `status='committed'`.

### 11.1 Cross-Stage Cascade Machinery

`src/lib/ideation/stage-run-store/cross-stage-cascades.ts` implements a three-rule machine:

- **Edit:** when a committed prior stage transitions back to `authoring`, every downstream stage row's prior committed document is snapshotted into its `output.cascadeSnapshot`, the row reverts to `authoring`, and `requiresRederivation: true` flags the UI.
- **Discard edit:** when the founder cancels the edit, every downstream row's `cascadeSnapshot` is restored verbatim.
- **Commit (recommit):** when the founder recommits the edited prior stage, the `cascadeSnapshot` on every downstream row is cleared — the downstream stages stay in `authoring` with `requiresRederivation` still set so the founder is nudged to re-derive against the new prior document.

Lazy-create-next-stage-rows pattern: the commit route for Stage N lazy-creates the Stage N+1 row in `authoring` so the founder can immediately enter the next surface without a round-trip. Stage 4 → Stage 5 has the orphan-backfill fix in commit `d51375c`.

### 11.2 Stage 0 — Mindset

Commits directly without authoring. The founder is shown the framework and confirms readiness to proceed.

### 11.3 Stage 1 — Outcome Definition

`src/lib/ideation/stage1-outcome/`. Four dimensions (`DIM_KEYS = timeHorizon, financialGoal, riskTolerance, lifestylePreference`), each tracked as a `beliefField` (value + confidence + extractedAt). Per-message loop: extractor (Sonnet) classifies input AND extracts dimension updates AND emits `recommend` moves (logged into `recommendedActions[]`, capped at 25 with FIFO eviction of non-completed entries). Composer (Sonnet, 1500-token cap) produces the final `OutcomeDocument`. Gates: `MIN_OUTCOME_FIELD_CONFIDENCE = 0.65` per dimension AND mean ≥ `OUTCOME_READINESS_RATIO = 0.75`. Drift detection: `DRIFT_TURNS_THRESHOLD = 4` turns without a new dimension hitting confidence threshold biases the model toward `driftDetected: true`, triggering a soft-close prompt.

### 11.4 Stage 2 — Requirements

`src/lib/ideation/stage2-requirements/`. Structured 14×4 skill inventory (per founder + each teammate, stored on `FounderProfile.skillInventory` and snapshotted at commit). Teammate management via `POST /api/ideation/stage-runs/[id]/teammate`, per-skill-tier updates via `/skill-tier`. The expected-profile agent (Sonnet with `RESEARCH_BUDGETS.stage2-expected-profile = 3` steps) derives the Expected Profile from the committed Stage 1 OutcomeDocument; the founder can push back via `/expected-profile-pushback`. Composer produces a `RequirementsDocument` carrying the structured-blocker choice (`/structural-blocker-choice`). State: `Stage2AuthoringState | RequirementsDocument`, with `Stage2CascadeSnapshot` for the cascade restore path.

### 11.5 Stage 3 — Pain Inventory

`src/lib/ideation/stage3-opportunities/`. The Pain Scout agent (Sonnet, `RESEARCH_BUDGETS.stage3-pain-scout = 8` steps) fans out across the free-composite `community_pulse` tool + Tavily + Exa to surface candidate pain points from public community signals. Re-runs counted against `scoutRunCount` (max 5 per session). The founder adds personal pain points via `/founder-pain-point`, pushes back on scoring via `/pain-point-pushback`. Composer produces a `PainInventoryDocument` (the scored shortlist). Vendor policy is per the Pain Scout memory entry: no Reddit-direct, no scraping brokers, no paid community-monitoring SaaS without licence verification.

### 11.6 Stage 4 — Opportunity Evaluations

`src/lib/ideation/stage4-opportunities/`. Two-layer design:

- **Layer A — Agent research.** The founder fires `/derive-opportunity-research` per opportunity. The Layer A agent (Sonnet, `RESEARCH_BUDGETS.stage4-opportunity-research = 6` steps, `community_pulse` + Tavily + Exa) researches each opportunity across four dimensions: Market Reality / Customer Access / Will People Pay / Market Size. Session-wide ceiling is ~30 research steps (5 opportunities × 6 steps).
- **Layer B — Founder community engagement via screenshots.** The founder takes the agent's `engagement-script` (`/generate-engagement-script`), posts it on a real community (LinkedIn, X, Reddit, etc.), and uploads screenshots of the replies. S3 presigned upload via `/presign-response-upload`. The `community-response-pipeline` runs Claude vision (`vision-extractor`) to extract reply content from each screenshot, validates the founder typed the right post URL (`/community-response`), and aggregates the replies as Layer B evidence.

Verdict synthesizer combines Layer A + Layer B into an `OpportunityEvaluationsDocument`. Founder pushback via `/opportunity-pushback` and `/opportunity-verdict`. The composer produces the final ranked shortlist of 5 (1 chosen + 4 reserves).

### 11.7 Stage 5 — Handoff / Synthesis Bridge

`src/lib/ideation/stage5-handoff/`. The founder reviews the chosen opportunity and reserves on a pre-synthesis surface. On commit, the route creates an `IdeationStage5Job` row (`stage='queued'`) and fires `discovery/ideation/stage5.synthesize.requested`. The Inngest worker `stage5SynthesizeFunction` runs:

- **`loading_inputs`** — load committed Stage 1-4 documents + chosen snapshot + ranked reserves.
- **`synthesizing`** — `runStage5SynthesisBridge` renders Stage 1-4 evidence into the `summary` + `analysis` slots and delegates to `runFinalSynthesis` (same Phase 1A Opus reasoning + Phase 1B Sonnet emission used by the legacy path). Budget: `STAGE5_SYNTHESIS_RESEARCH_STEPS = 8`; output cap: `STAGE5_REASONING_MAX_TOKENS = 16384`, `STAGE5_EMIT_MAX_TOKENS = 16384`. `audienceType` is `null` (ideation predates the audience classifier).
- **`persisting`** — writes the `Recommendation` row with `ideationReserveOpportunities` populated (the four reserves snapshotted for the continuation brief).
- **`succeeded`** — `recommendationId` is populated for client navigation.

The founder client polls `/api/discovery/sessions/[id]/stage5/status` (3s foreground / 30s backgrounded) and is redirected to the legacy recommendation review surface on success. Cross-stage cascade (commit `c18b3b7`): editing Stage 1-4 invalidates the synthesised Recommendation; re-synthesis is unblocked by dropping the prior cascade-stale route guard.

Stage 5 lives separately from `ToolJob` because it produces a `Recommendation` directly and has no `roadmapId`. A partial unique index in migration `20260524000000_add_ideation_stage5_job` enforces at most one in-flight job per session (`WHERE stage NOT IN ('succeeded', 'failed')`).

---

## 12. The Venture / Cycle Model

### 12.1 Lifecycle

A founder may run several `Venture` rows over time. Each Venture has one or more `Cycle` rows (one attempt: recommendation + roadmap + optional validation). The currently-active Cycle is named on `Venture.currentCycleId`. Tier caps:

- **Free** — 0 active ventures (one-off recommendation only, no roadmap).
- **Execute** — 1 active venture, 2 paused.
- **Compound** — 3 active ventures, 4 paused.

### 12.2 Bootstrap

On accept of a `fresh_start` or `no_idea` recommendation, a `Venture` is created (auto-named from the recommendation) with one `Cycle` (cycleNumber 1) linked to the new Recommendation. `assertVentureLimitNotReached` enforces the tier cap at the session-creation route. A backfill ran in prod 2026-04-26 to retrofit Venture/Cycle rows onto legacy recommendations.

### 12.3 Pause Lockdown

`POST /api/discovery/ventures/[ventureId]/pause-reason` runs the pause-reason agent (`src/lib/ventures/pause-reason-engine.ts`): a conversational agent that responds to the founder's pause reason in one of five modes (`acknowledge | reframe | mirror | static | no_reason`). Setting a Venture to `paused` or `completed` puts the entire roadmap into read-only mode via `RoadmapWritabilityContext` (React context). The nudge cron freezes paused ventures so they aren't re-engaged. `pauseReason`, `pauseReasonMode`, `pausedAt` are persisted.

### 12.4 Archival

A tier downgrade that takes the user below their active-venture count keeps the most-recently-updated active and archives the rest (`archivedAt`). Archived ventures: remain readable, excluded from limit counts, 403 on new tool actions. An upgrade automatically unarchives newest-first up to the new cap.

### 12.5 Compound Hint

Compound-tier founders see an upgrade hint on `/discovery` when they have ≥1 paused venture and are on Execute. Signal recorded via `POST /api/user/compound-hint-signal`.

### 12.6 Cross-Venture Memory

`lib/lifecycle/`. `loadInterviewContext(userId, scenario, opts)` reads the right slice based on `lifecycleScenario`:

- `first_interview` — empty
- `fresh_start` — FounderProfile + cross-venture summaries (Compound only)
- `fork_continuation` — FounderProfile + current venture's cycle summaries + fork context
- `no_idea` — same as `fresh_start`

`renderInterviewOpeningBlock`, `renderFounderProfileBlock`, `renderCycleSummariesBlock`, `renderCrossVentureBlock` produce delimiter-wrapped opaque text suitable for direct injection into agent prompts (uses `renderUserContent`).

`lifecycleTransitionFunction` (Inngest) updates `FounderProfile` and writes `Cycle.summary` at cycle boundaries via two engines: `generate-cycle-summary.ts` and `update-founder-profile.ts`.

---

## 13. The Transformation Report

Once-per-venture personal narrative produced when the founder clicks Mark Complete on a venture.

**Model:** `TransformationReport` (one per venture, `@unique` on `ventureId`).

**Inngest function:** `transformationReportFunction`. Pipeline stages: `queued | loading_data | drafting | detecting_redactions | persisting | complete | failed`.

### 13.1 Pipeline

1. **`loading_data`** (`evidence-loader.ts`) — Reads the full venture history: belief states, recommendations, pushback, every check-in, every tool session, cycle summaries, FounderProfile behavioural calibration, validation signals.
2. **`drafting`** (`engine.ts`) — Opus 4.7 (`TRANSFORMATION_MODEL = 'claude-opus-4-7'`, fallback Opus 4.6) narrative synthesis against `TransformationReportSchema`. Dynamic schema: every default section is optional, `customSections` catches asymmetric findings, `sectionOrder` drives the rendered narrative flow. `MAX_OUTPUT_TOKENS = 8000`.
3. **`detecting_redactions`** — PII detector (Opus 4.6, Sonnet fallback) emits `redactionCandidates[]` (names, emails, phone numbers, financial specifics).
4. **`persisting`** — writes `content` and `redactionCandidates`.

### 13.2 Founder Review

The founder reviews redactions, edits replacements, and chooses to publish or keep private. `redactionEdits` (JSON `{ [candidateId]: { action, replacement? } }`) persists across saves.

### 13.3 Publish Flow

`publishState`: `private | pending_review | public | unpublished`. The founder transitions `private → pending_review`. A moderator at `/admin/stories/` (and `/api/admin/transformation/[reportId]`) reviews and either:

- Approves (`pending_review → public`, stamps `publicSlug`, `publishedAt`, `outcomeLabel: shipped | walked_away | pivoted | learning`, edits `cardSummary` for the marketing strip).
- Sends back (`pending_review → private`, attaches `reviewNotes` shown in the founder's private viewer banner).
- Declines silently (`pending_review → unpublished`, notes stay internal).

### 13.4 Public Archive

Public reads at `/stories/[publicSlug]` and `/stories` (index). The marketing strip surfaces card summaries with the moderator-stamped outcome label colour-coding. The archive is read-only; un-consented reports stay private to the founder.

---

## 14. The Billing / Tier System

Paddle v4 integration. Webhook at `/api/webhooks/paddle/route.ts` (signature-verified via `lib/paddle/`). Subscription state lands on `User.tier` derivation through `Subscription.tier` (`free | execute | compound`).

### 14.1 Price Map

Real Paddle sandbox price ids in `src/lib/paddle/tiers.ts`:

- **Execute** — $29/month, $279/year (regular); $19/month founding.
- **Compound** — $49/month, $470/year (regular); $29/month founding.
- **Free** — no priceId.

Production deployment requires regenerating ids in the Paddle production dashboard and replacing them in `tiers.ts` AND `founding-members.ts`.

### 14.2 Tier Caps

- `TIER_VENTURE_LIMITS`: free 0, execute 1, compound 3.
- `TIER_PAUSED_VENTURE_LIMITS`: free 0, execute 2, compound 4.
- `CYCLE_LIMITS` (per billing cycle): see § 5 table.
- Voice mode: tier-gated via `lib/voice/client-tier.ts`.
- Pushback rounds: Execute 10, Compound 15.

### 14.3 Reconciliation

`paddleReconciliationFunction` is the safety net for missed webhooks. `usageAnomalyDetectionFunction` flags abusive usage patterns for human review (does NOT auto-suspend). `tierTransitions[]` is the append-only audit log written by the webhook processor on every actual tier change.

### 14.4 Founding Members

Hidden prices injected only by the backend when the founding-slot counter confirms availability. `wasFoundingMember` on `User` locks the founding rate for life on re-subscription.

### 14.5 Account Deletion

`accountDeletionFunction` (Inngest). The deletion flow calls `cancelPaddleSubscriptionsForUser()` BEFORE the User row is deleted — `onDelete: Cascade` wipes the local Subscription row but Paddle keeps billing the customer's card otherwise.

---

## 15. Security Architecture

### 15.1 Authentication

NextAuth v5 (beta) with Prisma adapter. Two OAuth providers: Google and GitHub (`allowDangerousEmailAccountLinking`). Mobile app uses a Bearer token bridge (`mobile-auth.ts`): same `Session` table, same entropy (32 bytes, base64url), 30-day expiry. `requireUserId()` checks NextAuth cookie session first, falls back to Bearer token.

### 15.2 CSRF Protection

Every state-changing route calls `enforceSameOrigin(request)` as its first line. Defence strategy: checks `Sec-Fetch-Site` header first (unforgeable, set by the browser); falls back to `Origin` header hostname comparison against `NEXT_PUBLIC_APP_URL`. Throws `HttpError(403)` on mismatch.

### 15.3 Rate Limiting

Seven tiers (`src/lib/rate-limit.ts`):

| Tier | Limit | Window | Usage |
|---|---|---|---|
| `AI_GENERATION` | 5 | 60s | Routes that fire LLM calls |
| `DISCOVERY_TURN` | 30 | 300s | Interview turn route |
| `API_AUTHENTICATED` | 60 | 60s | State-changing writes |
| `API_READ` | 120 | 60s | Polling reads |
| `AUTH` | 5 | 900s | Authentication endpoints |
| `PUBLIC` | 30 | 60s | Public endpoints |
| `VOICE_TRANSCRIPTION` | 30 | 3600s | Per-user transcription cap |

Implementation: sliding window in Upstash Redis with atomic INCR-then-EXPIRE (avoids the race that would let 2× through on fresh keys). In-memory Map fallback for development. IP identification trust order: `x-vercel-forwarded-for` → `x-forwarded-for` (only if exactly 1 IP) → `x-real-ip`.

The public analytics endpoint (`/api/lp/analytics`) has an additional per-(ip, slug) secondary cap and a 16KB body size limit.

`CYCLE_LIMITS` enforces the per-billing-cycle quota on the four tools per tier — see § 5.

### 15.4 Ownership Scoping

Every database read that returns user data uses `findFirst({ where: { id, userId } })` — the single-query pattern that prevents existence-leak between 404 and 401. Direct `findUnique({ id })` followed by manual `userId !==` check is banned in review.

### 15.5 Prompt Injection Defence

See § 3.3. The `renderUserContent` / `sanitizeForPrompt` / SECURITY NOTE pattern is applied uniformly across all agents AND across all lifecycle-memory renderers.

### 15.6 Input Sanitisation

Two layers: `sanitize.ts` for HTML/URL/file contexts (XSS prevention), and `server-helpers.ts` for prompt contexts (injection prevention). Every API route validates and sanitises input at the boundary via Zod before it reaches any service.

### 15.7 Error Handling

`httpErrorToResponse(err)` maps `HttpError` instances to JSON responses with the correct status code. Unknown errors are logged with full stack traces (for debugging) and return a generic 500 to the client (for security). Custom 500 responses are banned.

### 15.8 Content Security Policy

Applied via middleware on every request. `script-src` includes `unsafe-inline` and `unsafe-eval` (documented trade-off). `frame-ancestors 'self'` permits the validation page iframe. Strict-Transport-Security applied in production only.

### 15.9 Data Privacy

Training consent is opt-in per user. Consent grant: stamps `trainingConsentAt`. Consent revocation: clears timestamp AND nulls `anonymisedRecord` on ALL existing `RecommendationOutcome` rows (retroactive deletion). Hard invariant #1 (§ 16): `consentedToTraining=false ⇒ anonymisedRecord=null`. Anonymisation is lexical (email, phone, name patterns → `[redacted]`; locations → country bucket). 24-month TTL enforced by `validationLifecycleFunction` cron.

Aggregate analytics consent (separate toggle): governs inclusion in non-identifiable aggregate computations. Revoking does NOT trigger retroactive deletion because aggregates cannot be unglued from a specific user.

### 15.10 Observability

Sentry for errors and traces (`@sentry/nextjs`). `lib/observability/` wraps every LLM call in `withAgentSpan` so spans carry model id, token usage, latency, audience type, and model-fallback events. Inngest queue spans (`withInngestQueueSpan`) tie the worker invocation back to the originating turn. `withDistributedTrace` propagates the trace context through the event bus.

---

## 16. Hard Data Invariants

These are real correctness invariants enforced by code or database constraints. Violations are data corruption, not policy questions.

1. **Outcome consent gating.** `RecommendationOutcome` rows with `consentedToTraining = false` MUST have `anonymisedRecord = null`. Enforced in `src/lib/outcome/anonymise.ts`; tested in `outcome-anonymise.test.ts`.
2. **Pushback optimistic lock.** Every pushback write uses `updateMany({ where: { id, pushbackVersion: prev } })` and treats `count: 0` as contention.
3. **Session rehydration on Redis miss.** `getSession()` MUST fall back to Postgres on Redis miss.
4. **Recommendation uniqueness.** The partial unique on `(sessionId WHERE parentRecommendationId IS NULL)` enforces "one primary recommendation per session." Synthesis upsert resolves idempotency through transactional findFirst-then-create-or-update.
5. **Ownership scoping on reads.** Every read returning user data uses `findFirst({ where: { id, userId } })`.
6. **IdeationStageRun status invariant.** `committedAt` set IFF `status='committed'` (app-enforced).
7. **Stage 5 single in-flight job.** Partial unique index on `IdeationStage5Job` (`WHERE stage NOT IN ('succeeded', 'failed')`).
8. **ToolJob single in-flight per session.** Unique constraint on `(sessionId, toolType)`.

---

## 17. Infrastructure

### 17.1 Tech Stack

Pinned in `CLAUDE.md` (authoritative). Versions confirmed from `client/package.json`:

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 16.2.4 (App Router; Turbopack default) |
| Language | TypeScript | 5.x (strict) |
| Styling | Tailwind CSS | 3.4.18 (NOT v4 — Turbopack/Oxide arbitrary-value scanner defect upstream) |
| Components | shadcn/ui | v4 |
| Animation | Motion | 12.23.x (`motion/react`) |
| AI SDK | Vercel AI SDK | 6.x (`generateText` + `Output.object`, `streamText`) |
| AI Provider | Anthropic | Claude 4.6 (Sonnet/Opus/Haiku) + Claude Opus 4.7 (Transformation only) |
| Secondary AI | Google | Gemini 2.5 Flash (streaming fallback only) |
| Orchestration | Inngest | 4.1.1 (pinned in pnpm overrides) |
| Validation | Zod | 4.1.12 (pinned in pnpm overrides) |
| ORM | Prisma | 6.19.0 |
| Session Cache | Upstash Redis | 1.37.x |
| Auth | NextAuth | v5 beta (5.0.0-beta.29) |
| Database | PostgreSQL (Neon) | with `pgvector` |
| Billing | Paddle | v4 (`@paddle/paddle-node-sdk` 3.7.0) |
| Research | Exa, Tavily | `exa-js` 2.11.x, `@tavily/core` 0.7.x |
| Object Storage | AWS S3 | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` 3.10.x (Stage 4 screenshot upload) |
| Voice | Deepgram | `@deepgram/sdk` 5.x (transcription) |
| Telemetry | Sentry | `@sentry/nextjs` 10.x |
| Package Manager | pnpm | exclusive (npm/yarn forbidden) |

### 17.2 Deployment

Vercel auto-deploys: `main` → production, `dev` → preview. `pnpm build` uses Turbopack by default; `pnpm dev:webpack` / `pnpm build:webpack` are rollback hatches. The application validates all required environment variables at startup via `env.ts` and refuses to start if any are missing.

### 17.3 Inngest Functions

22 registered functions exported from `src/inngest/functions/index.ts`:

Core pipeline:
1. **`discoverySessionFunction`** — synthesis pipeline for the legacy Discovery archetype.
2. **`conversationTitleFunction`** — Haiku 3-5 word sidebar titles.
3. **`roadmapGenerationFunction`** — phased plan generation.
4. **`continuationBriefFunction`** — Opus five-section brief.
5. **`pushbackAlternativeFunction`** — round-7 (tier-aware) alternative.
6. **`stage5SynthesizeFunction`** — Stage 5 synthesis bridge (No Idea → Recommendation).
7. **`backfillRoadmapTaskIdsFunction`** — backfill stable engine-minted task ids on legacy roadmaps.

Validation:
8. **`validationReportingFunction`** — per-page reporting (Sonnet interpret + Opus brief).
9. **`validationReportingSchedulerFunction`** — cron fan-out.
10. **`validationLifecycleFunction`** — DRAFT 72h sweep, LIVE 30-day expiry, event archive purge, training-record TTL.

Lifecycle / billing / cleanup:
11. **`lifecycleTransitionFunction`** — Venture/Cycle/profile transitions; writes `Cycle.summary`, updates `FounderProfile`.
12. **`paddleReconciliationFunction`** — webhook safety net.
13. **`usageAnomalyDetectionFunction`** — flag abusive tool-call patterns.
14. **`accountDeletionFunction`** — durable user deletion with Paddle cancellation first.
15. **`roadmapNudgeFunction`** — stale-task and outcome-prompt sweep.
16. **`stuckJobReconciliationFunction`** — reconciler for stuck ToolJob / Stage5Job rows.
17. **`transformationReportFunction`** — Opus 4.7 narrative + redaction detector.

Tool jobs (`tools/`):
18. **`researchExecuteJobFunction`** — Research Tool deep execution.
19. **`researchFollowupJobFunction`** — Research Tool follow-up.
20. **`packagerGenerateJobFunction`** — Service Packager generation.
21. **`packagerAdjustJobFunction`** — Service Packager adjustment.
22. **`composerGenerateJobFunction`** — Outreach Composer generation.
23. **`coachPrepareJobFunction`** — Coach preparation package.

(Count is 23 if `validationReportingSchedulerFunction` is counted separately from `validationReportingFunction`.)

### 17.4 Caching

Upstash Redis serves three roles:

1. **Discovery session hot cache** — sliding 15-minute TTL (`SESSION_TTL_SECONDS = 900`). `getSession` reads Redis first; on miss or exception, falls back to Postgres and re-warms.
2. **Rate limiting** — sliding-window counters per user/IP/route combination, atomic INCR-then-EXPIRE.
3. **Anthropic prompt-cache helpers** — server-side cache controlled via `cache_control: { type: 'ephemeral' }` providerOptions; helpers in `src/lib/ai/prompt-cache.ts` apply the right shape at the right minimum-token threshold.

Redis is optional: the application degrades gracefully (Postgres fallback for sessions, in-memory Map for rate limiting).

### 17.5 Resilience Patterns

- **Model fallback** — `withModelFallback` and `streamQuestionWithFallback`.
- **Fail-open research** — pre-research, conversation arc summariser, parking lot capture catch errors and return empty/null.
- **Idempotent Inngest functions** — all use `upsert` keyed on natural unique constraints. Roadmap-generation skips if a roadmap already exists.
- **Optimistic concurrency** — pushback `pushbackVersion`; continuation brief `updateMany` guarded on `continuationStatus = GENERATING_BRIEF`.
- **Graceful session recovery** — Redis miss → Postgres read + Redis re-warm. Nullish coalescing handles stale Redis shapes.
- **ToolJob durability** — long-running tool routes return 202 immediately; the worker absorbs serverless timeout risk. Client polls.

---

## 18. API Surface

115 route files registered under `client/src/app/api/`. Grouped below.

### Discovery — Sessions

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/discovery/sessions` | AI_GENERATION | Create new discovery session (handles legacy, No Idea, fork-continuation) |
| GET | `/api/discovery/sessions/[sessionId]` | API_READ | Load session metadata |
| DELETE | `/api/discovery/sessions/[sessionId]` | API_AUTHENTICATED | Discard incomplete session |
| POST | `/api/discovery/sessions/[sessionId]/turn` | DISCOVERY_TURN | Submit interview turn (streaming, 90s maxDuration) |
| GET | `/api/discovery/sessions/[sessionId]/resume` | API_AUTHENTICATED | Load session for resumption |
| GET | `/api/discovery/sessions/[sessionId]/recommendation` | API_READ | Poll for synthesis result |
| POST | `/api/discovery/sessions/[sessionId]/stage1-edit-probe` | AI_GENERATION | Stage 1 edit probe (No Idea) |
| POST | `/api/discovery/sessions/[sessionId]/stage1-opening` | AI_GENERATION | Stage 1 opening (No Idea) |
| POST | `/api/discovery/sessions/[sessionId]/stage5/synthesize` | AI_GENERATION | Trigger Stage 5 synthesis (returns 202 + jobId) |
| GET | `/api/discovery/sessions/[sessionId]/stage5/status` | API_READ | Poll Stage 5 job status |
| POST | `/api/discovery/no-idea/start` | AI_GENERATION | Start No Idea archetype session |
| GET | `/api/discovery/no-idea/[sessionId]` | API_READ | Load No Idea session state |

### Discovery — Recommendations

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET | `/api/discovery/recommendations` | API_READ | List recommendations |
| POST | `/api/discovery/recommendations/[id]/accept` | API_AUTHENTICATED | Accept recommendation |
| DELETE | `/api/discovery/recommendations/[id]/accept` | API_AUTHENTICATED | Un-accept |
| POST | `/api/discovery/recommendations/[id]/pushback` | AI_GENERATION | Submit pushback turn |
| POST | `/api/discovery/recommendations/[id]/roadmap` | AI_GENERATION | Trigger roadmap generation |
| GET | `/api/discovery/recommendations/[id]/roadmap` | API_READ | Poll roadmap status/data |
| POST | `/api/discovery/recommendations/[id]/validation-page` | AI_GENERATION | Generate validation page |
| GET | `/api/discovery/recommendations/[id]/validation-page` | (none) | Check existence |
| POST | `/api/discovery/recommendations/[id]/outcome` | API_AUTHENTICATED | Submit outcome attestation |
| DELETE | `/api/discovery/recommendations/[id]/outcome` | API_AUTHENTICATED | Skip outcome prompt |
| POST | `/api/discovery/assumption-check` | AI_GENERATION | Stream assumption impact |

### Discovery — Ventures

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET | `/api/discovery/ventures` | API_READ | List user ventures |
| PATCH | `/api/discovery/ventures/[ventureId]` | API_AUTHENTICATED | Rename / pause / complete |
| POST | `/api/discovery/ventures/[ventureId]/pause-reason` | AI_GENERATION | Pause-reason agent turn |
| POST | `/api/discovery/ventures/[ventureId]/transformation` | AI_GENERATION | Trigger Transformation Report on complete |
| POST | `/api/discovery/ventures/swap` | API_AUTHENTICATED | Swap active venture set within cap |

### Roadmaps — Core

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET | `/api/discovery/roadmaps/has-any` | API_READ | Check user has any roadmap |
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

### Roadmaps — Conversation Coach (roadmap-level and task-level)

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET | `/api/discovery/roadmaps/[id]/coach/sessions` | API_READ | List coach sessions |
| GET | `/api/discovery/roadmaps/[id]/coach/sessions/[sessionId]` | API_READ | Load coach session |
| POST | `/api/discovery/roadmaps/[id]/coach/setup` | AI_GENERATION | Coach setup exchange |
| POST | `/api/discovery/roadmaps/[id]/coach/prepare` | AI_GENERATION | Queue preparation ToolJob (202) |
| POST | `/api/discovery/roadmaps/[id]/coach/roleplay` | AI_GENERATION | Role-play turn |
| POST | `/api/discovery/roadmaps/[id]/coach/debrief` | AI_GENERATION | Queue debrief |
| GET | `/api/discovery/roadmaps/[id]/tasks/[taskId]/coach` | API_READ | Load task coach session |
| POST | `.../tasks/[taskId]/coach/setup` | AI_GENERATION | Coach setup (task) |
| POST | `.../tasks/[taskId]/coach/prepare` | AI_GENERATION | Queue preparation (task, 202) |
| POST | `.../tasks/[taskId]/coach/roleplay` | AI_GENERATION | Role-play turn (task) |
| POST | `.../tasks/[taskId]/coach/debrief` | AI_GENERATION | Queue debrief (task) |

### Roadmaps — Outreach Composer (roadmap-level and task-level)

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET | `/api/discovery/roadmaps/[id]/composer/sessions` | API_READ | List composer sessions |
| GET | `/api/discovery/roadmaps/[id]/composer/sessions/[sessionId]` | API_READ | Load composer session |
| POST | `/api/discovery/roadmaps/[id]/composer/generate` | AI_GENERATION | Queue generation ToolJob (202) |
| POST | `/api/discovery/roadmaps/[id]/composer/mark-sent` | API_AUTHENTICATED | Mark message as sent |
| POST | `/api/discovery/roadmaps/[id]/composer/regenerate` | AI_GENERATION | Regenerate one message variation |
| GET | `/api/discovery/roadmaps/[id]/tasks/[taskId]/composer` | API_READ | Load task composer session |
| POST | `.../tasks/[taskId]/composer/generate` | AI_GENERATION | Queue generation (task, 202) |
| POST | `.../tasks/[taskId]/composer/mark-sent` | API_AUTHENTICATED | Mark sent (task) |
| POST | `.../tasks/[taskId]/composer/regenerate` | AI_GENERATION | Regenerate (task) |

### Roadmaps — Research Tool (roadmap-level and task-level)

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET | `/api/discovery/roadmaps/[id]/research/sessions` | API_READ | List research sessions |
| GET | `/api/discovery/roadmaps/[id]/research/sessions/[sessionId]` | API_READ | Load research session |
| POST | `/api/discovery/roadmaps/[id]/research/plan` | AI_GENERATION | Generate research plan |
| POST | `/api/discovery/roadmaps/[id]/research/execute` | AI_GENERATION | Queue execution ToolJob (202) |
| POST | `/api/discovery/roadmaps/[id]/research/followup` | AI_GENERATION | Queue follow-up ToolJob (202) |
| POST | `.../tasks/[taskId]/research/plan` | AI_GENERATION | Plan (task) |
| POST | `.../tasks/[taskId]/research/execute` | AI_GENERATION | Queue execution (task, 202) |
| POST | `.../tasks/[taskId]/research/followup` | AI_GENERATION | Queue follow-up (task, 202) |

### Roadmaps — Service Packager (roadmap-level and task-level)

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET | `/api/discovery/roadmaps/[id]/packager/sessions` | API_READ | List packager sessions |
| GET | `/api/discovery/roadmaps/[id]/packager/sessions/[sessionId]` | API_READ | Load packager session |
| POST | `/api/discovery/roadmaps/[id]/packager/generate` | AI_GENERATION | Queue generation ToolJob (202) |
| POST | `/api/discovery/roadmaps/[id]/packager/adjust` | AI_GENERATION | Queue adjustment ToolJob (202) |
| GET | `/api/discovery/roadmaps/[id]/tasks/[taskId]/packager` | API_READ | Load task packager session |
| POST | `.../tasks/[taskId]/packager/generate` | AI_GENERATION | Queue generation (task, 202) |
| POST | `.../tasks/[taskId]/packager/adjust` | AI_GENERATION | Queue adjustment (task, 202) |

### Roadmaps — Tool Jobs

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET | `/api/discovery/roadmaps/[id]/tool-jobs/[jobId]/status` | API_READ | Poll tool job status (3s/30s) |
| GET | `/api/discovery/tool-jobs/active` | API_READ | Active jobs banner across user |

### Validation

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/discovery/validation/[pageId]/publish` | AI_GENERATION | Publish page (generates distribution brief) |
| POST | `/api/discovery/validation/[pageId]/channel` | API_AUTHENTICATED | Toggle channel completion |
| POST | `/api/discovery/validation/[pageId]/report` | API_AUTHENTICATED | Toggle usedForMvp flag |
| GET | `/api/discovery/validation/has-any` | API_READ | Check user has any validation page |
| POST | `/api/discovery/roadmaps/[id]/tasks/[taskId]/validation-page` | AI_GENERATION | Generate task-bound validation page |
| POST | `/api/tools/validation/generate` | AI_GENERATION | Standalone validation-page generation from tools surface |

### Ideation (No Idea archetype — Stages 1-4 surfaces)

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/ideation/stage-runs/[id]/commit` | API_AUTHENTICATED | Commit a stage (cascade-creates next stage) |
| POST | `/api/ideation/stage-runs/[id]/edit` | API_AUTHENTICATED | Revert stage to authoring (cascades downstream) |
| POST | `/api/ideation/stage-runs/[id]/discard-edit` | API_AUTHENTICATED | Restore prior committed doc (cascades) |
| POST | `/api/ideation/stage-runs/[id]/teammate` | API_AUTHENTICATED | Stage 2: teammate management |
| POST | `/api/ideation/stage-runs/[id]/skill-tier` | API_AUTHENTICATED | Stage 2: skill tier update |
| POST | `/api/ideation/stage-runs/[id]/derive-expected-profile` | AI_GENERATION | Stage 2: expected-profile agent |
| POST | `/api/ideation/stage-runs/[id]/expected-profile-pushback` | AI_GENERATION | Stage 2: pushback on expected profile |
| POST | `/api/ideation/stage-runs/[id]/structural-blocker-choice` | API_AUTHENTICATED | Stage 2: structural-blocker selection |
| POST | `/api/ideation/stage-runs/[id]/founder-pain-point` | API_AUTHENTICATED | Stage 3: add founder pain point |
| POST | `/api/ideation/stage-runs/[id]/pain-scout-run` | AI_GENERATION | Stage 3: run pain scout (composite community fan-out) |
| POST | `/api/ideation/stage-runs/[id]/pain-point-pushback` | AI_GENERATION | Stage 3: pushback on pain scoring |
| POST | `/api/ideation/stage-runs/[id]/derive-opportunity-research` | AI_GENERATION | Stage 4: Layer A research per opportunity |
| POST | `/api/ideation/stage-runs/[id]/generate-engagement-script` | AI_GENERATION | Stage 4: produce community engagement script |
| POST | `/api/ideation/stage-runs/[id]/presign-response-upload` | API_AUTHENTICATED | Stage 4: S3 presigned URL for screenshot |
| POST | `/api/ideation/stage-runs/[id]/community-response` | AI_GENERATION | Stage 4: ingest screenshots (Claude vision) |
| POST | `/api/ideation/stage-runs/[id]/opportunity-pushback` | AI_GENERATION | Stage 4: pushback on opportunity verdict |
| POST | `/api/ideation/stage-runs/[id]/opportunity-verdict` | AI_GENERATION | Stage 4: emit per-opportunity verdict |

### Transformation Report

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/discovery/ventures/[ventureId]/transformation` | AI_GENERATION | Trigger report on Mark Complete |
| GET/PATCH | `/api/admin/transformation/[reportId]` | API_AUTHENTICATED | Admin moderation (approve / send-back / decline) |

### Billing / Paddle

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/webhooks/paddle` | (Paddle signature) | Paddle webhook (subscription, transaction, adjustment events) |
| GET | `/api/user/billing-overview` | API_READ | Current tier, founding-member status, period end |
| GET | `/api/user/tier-history` | API_READ | TierTransition log |

### Conversations / User

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET | `/api/conversations` | API_READ | List conversations (sidebar) |
| DELETE | `/api/conversations/[conversationId]` | API_AUTHENTICATED | Delete conversation |
| GET / PATCH | `/api/user/training-consent` | (none / API_AUTHENTICATED) | Read / toggle training consent |
| GET / PATCH | `/api/user/aggregate-analytics-consent` | (none / API_AUTHENTICATED) | Read / toggle aggregate-analytics consent |
| GET | `/api/user/linked-providers` | API_READ | List OAuth providers linked |
| POST | `/api/user/delete-account` | API_AUTHENTICATED | Initiate account deletion (Paddle cancel + Inngest) |
| GET / PATCH | `/api/user/push-preferences` | (none / API_AUTHENTICATED) | Push preferences |
| POST / DELETE | `/api/user/push-token` | API_AUTHENTICATED | Register / revoke Expo push token |
| POST | `/api/user/compound-hint-signal` | API_AUTHENTICATED | Record Compound upgrade hint impression |
| GET | `/api/usage` | API_READ | Current cycle usage by tool |

### Voice / Public / Infra

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| POST | `/api/voice/transcribe` | VOICE_TRANSCRIPTION | Deepgram → Whisper transcription |
| POST | `/api/lp/analytics` | PUBLIC + per-(ip,slug) cap + 16KB body | Validation page analytics beacon (unauthenticated) |
| GET | `/api/health` | (none) | Database health check |
| GET/POST/PUT | `/api/inngest` | (Inngest signing key) | Inngest function manifest and webhooks |

### Auth (Web + Mobile)

| Method | Path | Rate Limit | Purpose |
|---|---|---|---|
| GET/POST | `/api/auth/[...nextauth]` | (NextAuth internal) | OAuth flows |
| GET | `/api/auth/mobile/[provider]` | (none) | Start mobile OAuth (Google / GitHub) |
| GET | `/api/auth/mobile/callback` | (none) | Mobile OAuth callback (issues Bearer token) |
| GET | `/api/auth/mobile/session` | (none) | Validate mobile Bearer token |

---

## 19. Mobile App

The Expo / React Native app (`mobile/`) is a standalone install (not a workspace member — EAS Build misdetects pnpm workspaces as yarn workspaces). Consumes `packages/api-types` and `packages/constants` via `link:../packages/*` relative symlinks. Mobile keeps its own `mobile/pnpm-lock.yaml`. A pre-install hook strips the root workspace file before EAS install.

### 19.1 Surfaces

`src/app/(tabs)/`: home, sessions, tools, settings.

`src/app/`: top-level routes for `discovery`, `recommendation`, `recommendations`, `roadmap`, `tools`, `validation`, plus `onboarding.tsx`, `sign-in.tsx`, `index.tsx`.

`src/app/tools/`: `coach.tsx`, `outreach.tsx`, `packager.tsx`, `research.tsx`, `validation.tsx`.

### 19.2 Services

`src/services/`: `api-client.ts` (Bearer-token-authenticated client against the same API surface as web), `auth.ts` (OAuth bridge), `notifications.ts`, `push.ts` (Expo push token registration), `onboarding.ts`, `voice.ts` (microphone capture → server transcription).

### 19.3 Auth Bridge

Mobile auth piggybacks on the same NextAuth `Session` table via short-lived bridge tokens. The mobile app stores the resulting Bearer token in secure storage and presents it on every request. `requireUserId()` on the server transparently accepts both cookie and Bearer auth.

---

## 20. Notes on Partial or Reserved Features

1. **`pushback` and `interview` parking-lot sources** — defined in the enum but not currently used by any code path. Only `checkin` and `manual` sources produce parking lot items today.
2. **Validation page eligibility** — only `build_software` recommendation types are eligible (the check is server-side; verify the canonical constant name in current code — historically `VALIDATION_PAGE_ELIGIBLE_TYPES`).
3. **`distribution-generator.ts` and `build-brief-generator.ts`** — These two call sites use a 3-attempt retry loop instead of `withModelFallback`. Distribution requires uniqueness validation between attempts; build brief is the highest-stakes call and surfaces failure explicitly.
4. **`framer-motion` imports** — Some legacy landing/marketing components historically imported from `framer-motion` instead of `motion/react`. Verify against current code; flagged in CLAUDE.md as a deprecated dependency.
5. **`/generate` route reference** — Any legacy "Go to App" link to `/generate` is stale. The correct route is `/discovery`.
6. **`about/page.tsx`** — May historically list Google Gemini, OpenAI GPT-4, and Framer Motion. Per CLAUDE.md, the current stack uses Anthropic Claude, Vercel AI SDK, and `motion/react`. (verify)
7. **Stage 5 migration deployment** — `20260524000000_add_ideation_stage5_job` applied in CI; production deploy pending as of 2026-05-25. The migration is the source of the partial unique constraint for in-flight Stage 5 jobs (Prisma cannot model partial uniques in `schema.prisma`).
8. **Stage 0 mindset surface** — Implemented as a commit-direct stage with no authoring loop. Treated as the entry confirmation for the No Idea archetype.
9. **`service_packager` cross-tool handoff in legacy `ResearchTool.suggestedNextSteps`** — Was historically reserved; the Service Packager has since shipped as a full tool, so the handoff is now live. (verify the legacy code references have been updated)
10. **Pause-reason mirror mode** — Triggers only when the founder shows a serial-pause history. `mirror` is one of five modes including `acknowledge`, `reframe`, `static` (fallback when LLM fails), and `no_reason` (founder skipped).
11. **Stage 5 cross-stage cascade** — Editing Stage 1-4 invalidates the synthesised Recommendation; commit `c18b3b7` dropped the cascade-stale route guard to permit re-synthesise.
12. **Public archive route surfaces** — `/stories/[slug]` and `/stories` index are served from the database against `TransformationReport.publishState='public'`. Admin moderation at `/admin/stories`. (Routes are app-level pages, not under `/api/`.)
13. **Free tier discovery cap** — `assertFreeDiscoverySessionLimit` enforces a lifetime cap for the free tier — verify the exact number in `lib/lifecycle/tier-limits.ts`.
14. **Mobile dependency pinning** — Mobile pins zod to the same version as the root override (4.1.12). `inngest` pin (4.1.1) is in root overrides only; mobile does not consume inngest.

---

*Derived from the NeuraLaunch codebase by systematic file-by-file analysis.*
*Generated: 2026-05-25.*
*Most recent ship at generation time: commit `9ade9f9` (Stage 5 UI — pre-synthesis review, polling, legacy augmentations).*
