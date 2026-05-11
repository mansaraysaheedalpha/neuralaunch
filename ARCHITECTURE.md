# NeuraLaunch — Architecture

> How the system actually flows. Read `CLAUDE.md` first for the
> engineering standards every file in this repo is held to. This
> document describes the **current** state of the codebase. Nothing
> here is aspirational. If you find drift between this document and
> the code, the code wins — and please update this file.
>
> Last refreshed: 2026-05-11.

---

## 1. Top of stack

NeuraLaunch is a Next.js 16.2 application backed by Postgres (via
Prisma 6.6) on Neon (`pgvector` enabled), Upstash Redis for ephemeral
session state, and Inngest v4 for durable background work. A standalone
Expo / React Native app (`mobile/`) consumes the same API surface and
shares Zod schemas + enum constants via the `packages/*` workspace.

All AI calls go through the Vercel AI SDK v5. Anthropic Claude 4.6 is
the primary model family (Sonnet for execution, Opus for synthesis);
Google Gemini 2.5 Flash is the third-tier fallback on the question
generation hot path via `@ai-sdk/google`. External research is mediated
through Tavily (factual answers) and Exa (semantic / neural search)
exposed as in-loop tools the agent picks between per query.

Auth runs on NextAuth v5 with server-side sessions. Billing is Paddle
v4 with `Tier`-aware gating across Free / Execute / Compound. Mobile
auth piggybacks on the same NextAuth session via short-lived bridge
tokens.

What the system **is not**: a code generator, an agent swarm, a sandbox
that runs founder-supplied code, or a marketplace. Those machineries
never existed or were deleted in earlier cleanup phases and are
explicitly out of scope.

---

## 2. Repository layout

Only directories that matter to runtime behaviour are listed.

```
neuralaunch/
├── client/                          # Next.js 16 application (the product)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (app)/discovery/     # Authenticated discovery + roadmap + validation UI
│   │   │   ├── api/discovery/       # Session + recommendation + roadmap + validation routes
│   │   │   ├── api/ideation/        # No-Idea archetype stage-run routes (Stages 0–5)
│   │   │   ├── api/transformation-reports/   # Once-per-venture narrative + review
│   │   │   ├── api/stories/         # Public archive of consented transformation reports
│   │   │   ├── api/billing/         # Paddle webhook + subscription state
│   │   │   ├── api/push/            # Device token registration + per-user push prefs
│   │   │   ├── api/auth/            # NextAuth + mobile bridge endpoints
│   │   │   ├── api/lp/analytics/    # Public landing-page event capture (rate-limited beacon)
│   │   │   ├── lp/[slug]/           # Public landing pages for build_software paths
│   │   │   ├── stories/             # Public read of redacted transformation narratives
│   │   │   └── admin/stories/       # Moderation surface for the public archive
│   │   ├── inngest/                 # Durable workers (one per file) + tools subfolder
│   │   ├── lib/                     # Engines, services, helpers (see § 3)
│   │   └── components/              # shadcn/ui-based React components
│   └── prisma/                      # Schema + migrations (canonical Prisma path)
├── mobile/                          # React Native (Expo) app — NOT a workspace member
│   └── ...                          # Standalone install; consumes packages/* via link:
├── packages/                        # Workspace packages shared by client + mobile
│   ├── api-types/                   # Zod schemas + inferred types (wire protocol)
│   └── constants/                   # Enum value lists + configuration limits
├── ARCHITECTURE.md                  # This file
├── RUNBOOK.md                       # On-call playbook for production incidents
└── CLAUDE.md                        # Engineering standards (mandatory reading)
```

### `client/src/lib/` — engine layer

| Module | Responsibility |
|---|---|
| `ai/` | Provider chains, fallback wrappers (`withModelFallback`, `streamQuestionWithFallback`), prompt-cache helpers, model id constants |
| `auth/` | NextAuth callbacks, mobile bridge token issuance |
| `billing/` | Paddle webhook handling, tier resolution, subscription state, usage caps |
| `continuation/` | Post-roadmap continuation brief generation (forks, parking lot) |
| `discovery/` | Interview engine, extractor, synthesis, pushback, safety gate, session store |
| `email/` | Transactional email rendering + send |
| `ideation/` | No-Idea archetype Stage 0–5 engines (currently Stage 0+1; Stages 2–5 in progress) |
| `legal/` | Cookie / privacy / ToS rendering helpers |
| `lifecycle/` | FounderProfile + Venture + Cycle context loaders + cross-venture summaries |
| `observability/` | Sentry instrumentation, agent spans, distributed tracing, queue spans |
| `outcome/` | RecommendationOutcome anonymisation + consent gating |
| `paddle/` | Paddle SDK wrapper, signature verification |
| `phase-context.ts` | Phase numbering + `phaseContext` JSONB builder |
| `push/` | Push notification dispatch (`sendPushToUser`, per-user prefs) |
| `research/` | Shared Tavily + Exa tooling exposed to every research-enabled agent |
| `roadmap/` | Roadmap engine, check-in agent, nudge selector |
| `tool-jobs/` | Durable ToolJob model: createToolJob, persistToolJobResult, status polling |
| `transformation/` | Transformation Report engine: opus narrative, redaction baseline + detector, publish flow |
| `validation/` | Landing page generator, interpretation, lifecycle, server helpers (CSRF, rate limits, error shaping) |
| `ventures/` | Venture / Cycle model accessors, pause-reason engine |
| `voice/` | Voice transcription helpers (tier-gated) |
| `env.ts`, `logger.ts`, `prisma.ts`, `redis.ts`, `rate-limit.ts` | Module singletons + structured logger + per-user/per-IP limiters |

### `client/src/inngest/functions/` — durable workers

```
account-deletion-function.ts
backfill-roadmap-task-ids-function.ts
continuation-brief-function.ts
conversation-title-function.ts
discovery-session-function.ts          # Synthesis pipeline (the discovery hot path)
lifecycle-transition-function.ts       # Venture/Cycle/profile transitions
paddle-reconciliation-function.ts
pushback-alternative-function.ts
roadmap-generation-function.ts
roadmap-nudge-function.ts
stuck-job-reconciliation.ts
transformation-report-function.ts
usage-anomaly-detection-function.ts
validation-lifecycle-function.ts
validation-reporting-function.ts
tools/
  ├── coach-prepare-job.ts
  ├── composer-generate-job.ts
  ├── packager-adjust-job.ts
  ├── packager-generate-job.ts
  ├── research-execute-job.ts
  └── research-followup-job.ts
```

Every function follows the canonical accept-and-queue shape: route
returns immediately with `jobId`; worker reads its event, runs the
engine inside `step.run` blocks, writes the result via the helpers in
`lib/tool-jobs/persistence.ts`. See CLAUDE.md "Reliability" § for the
ToolJob contract.

---

## 3. The product surface

NeuraLaunch is now a **multi-venture lifecycle**, not a single funnel.
A founder may run several `Venture` rows over time; each Venture has
one or more `Cycle` rows (recommendation + roadmap + validation
attempts); each Cycle hangs off a single `Recommendation`.

```
            FounderProfile (1)
                 │
                 │ owns
                 ▼
          ┌──── Venture (N) ─── status: active / paused / completed / archived
          │       │
          │       │ contains
          │       ▼
          │     Cycle (N) ──── current cycle attached to one Recommendation
          │       │
          │       │ wraps
          │       ▼
          │     Recommendation (1) ─── pushbackHistory, acceptedAt
          │       │
          │       ├── Roadmap (1) ─── RoadmapProgress (1)
          │       │     │
          │       │     └── per-task ToolSession[] (Research, Packager, Composer, Coach)
          │       │
          │       └── ValidationPage (0..1)  ── ValidationSnapshot + Report + Event
          │
          └── TransformationReport (0..1 per venture lifecycle, on Mark Complete)
                    │
                    └── public archive entry (if consented + reviewed + published)
```

The **three core phases** still exist inside any one cycle:

1. **Phase 1: Discovery** — interview → recommendation
2. **Phase 2: Roadmap** — phased execution plan + check-ins + tools
3. **Phase 3: Validation** — public landing page + analytics + report
   (only for `recommendationType === 'build_software'`)

But the **product container around them** is the Venture/Cycle pair,
which is what enables continuation forks, cross-venture memory,
transformation reports, and tier-gated venture caps.

The four **per-task Tools** (Research, Packager, Composer, Coach) hang
off the Roadmap layer — they run as durable ToolJobs and persist
ToolSessions either standalone on the roadmap or task-launched on a
specific task. See § 7.

---

## 4. Phase 1 — Discovery

**Entry point:** `src/app/(app)/discovery/page.tsx` →
`DiscoveryChatClient.tsx` (or the new `ArchetypePicker.tsx` when
`NEXT_PUBLIC_NO_IDEA_ENABLED=true`).

**Prisma models:** `DiscoverySession`, `Conversation`, `Message`,
`Recommendation`, `RecommendationOutcome`, `IdeationStageRun`.

**Inngest functions:** `discovery-session-function.ts` (synthesis),
`pushback-alternative-function.ts` (round-7 closing alternative),
`conversation-title-function.ts` (AI-summarised sidebar titles).

### 4.1 Session creation

`POST /api/discovery/sessions` does, in order:

1. `enforceSameOrigin` + `requireUserId` + `rateLimitByUser` (`AI_GENERATION`)
2. Zod-validate the body (`firstMessage` ≤ 12 000 chars, optional
   `scenario`, optional `ventureId` + `forkContext` for continuations,
   optional `preseededAudienceType`)
3. **Free-tier lifetime cap** via `assertFreeDiscoverySessionLimit`
4. **Venture cap** via `assertVentureLimitNotReached` for `fresh_start`
   and `no_idea` scenarios (paid tiers only; the cap is per-tier)
5. **Concern 5 (pending outcome)** — if the founder has a prior
   partially-complete roadmap without an outcome attestation, return
   200 with `pendingOutcomeRecommendationId` instead of creating a
   session. The client surfaces the outcome modal; the founder either
   submits or skips, then re-POSTs with `acknowledgePendingOutcome=true`
6. Single Prisma transaction creates `Conversation` + `DiscoverySession`
   (plus `IdeationStageRun(stage=0, status='committed')` and
   `IdeationStageRun(stage=1, status='authoring')` when scenario is
   `'no_idea'`)
7. Seed `InterviewState` in Upstash Redis with the appropriate
   lifecycle scenario + audience preseed
8. Fire `discovery/conversation.title.requested` Inngest event when a
   `firstMessage` is present (Haiku summarises it into a 3-5 word
   sidebar title)

### 4.2 Per-turn loop

`POST /api/discovery/sessions/[sessionId]/turn` runs `maxDuration = 90s`
to absorb the worst case of the model fallback chain. Each turn:

1. CSRF + auth + `DISCOVERY_TURN` rate limit
2. `getSession()` reads Redis with Postgres fallback on miss (15-min
   sliding TTL; Postgres is the source of truth; Redis miss → rehydrate
   + re-warm)
3. **Safety gate** on every message via `runSafetyGate` (Haiku primary,
   Sonnet fallback). On `severity: 'block'` the session is permanently
   `TERMINATED` and no further messages are accepted — the boundary is
   independent per message so a refusal on turn 1 cannot be socially
   engineered around on turn 2
4. Persist user `Message` (fire-and-forget; non-fatal)
5. Load lifecycle context fresh per turn (`FounderProfile`,
   `cycleSummaries`, `crossVentureSummaries` for Compound)
6. `extractContext` — a single Sonnet `generateText` + `Output.object`
   call does classification AND multi-field extraction AND follow-up
   detection in one shot. Multi-field is the critical fix: a founder
   who says "I'm a solo accountant in Lagos with ₦5M saved" populates
   four fields in one turn instead of one
7. Branch on `inputType`: `offtopic` / `frustrated` / `clarification` /
   `synthesis_request` / `answer`. Contradictions stream a clarification
   response. Empty extraction = one unclear retry, force-skip after 2
   consecutive misses
8. `applyUpdate` — confidence-merge incoming extractions, advance the
   phase machine, mark every extracted field as asked (including
   fields the founder volunteered unprompted)
9. **Audience classification** at Q4, optional reclassify at Q7 if
   confidence ≥ 0.7 — silent today, will be replaced by the
   explicit-pick archetype picker as the No-Idea track lands
10. **B1 pre-research** for the main question-generation path: a short
    non-streaming Sonnet call exposes Tavily + Exa as tools and decides
    whether to research the founder's prior message. Findings flow into
    the streaming question generator's `researchFindings` option —
    never dumped to the founder
11. Persist to Postgres (beliefState, askedFields, researchLog
    appended) + Redis (state)
12. Synthesis transition? Fire `discovery/synthesis.requested`, mark
    session `COMPLETE`, stream `generateReflection` with
    `X-Synthesis-Transition: true`
13. Otherwise: pricing-change one-shot, follow-up slot (topic-similarity
    dedup + 3-question cooldown), or main `generateQuestion`

### 4.3 Belief state — `DiscoveryContext`

Defined in `src/lib/discovery/context-schema.ts`. Fifteen fields
grouped by phase, each wrapped in `beliefField<T>({ value, confidence,
extractedAt })`. The 15th — `motivationAnchor` — captures the
founder's purpose (distinct from `whyNow` which is timing) and is
referenced by check-in nudges and continuation diagnostics.

A field counts as "known" only once `MIN_FIELD_CONFIDENCE = 0.65` is
reached. `canSynthesise()` requires **both**:

1. Overall weighted completeness ≥ `SYNTHESIS_READINESS_RATIO = 0.80`
2. No critical field (weight ≥ 0.8) at confidence 0

Hard ceiling: `MAX_TOTAL_QUESTIONS = 15`. Every JSON-column read uses
`safeParseDiscoveryContext`; direct casts are forbidden.

### 4.4 Synthesis pipeline

`discoverySessionFunction` (`retries: 2`, `timeouts.start: '10m'`) runs:

```
load belief state            (Postgres rehydrate if Redis missed)
   │
   ▼
summariseContext             (Sonnet, cached prefix)
   │
   ▼
eliminateAlternatives        (Sonnet, cached prefix)
   │
   ▼
load lifecycle context block (FounderProfile + cycle summaries +
                              cross-venture for Compound)
   │
   ▼
runFinalSynthesis            (Opus 4.6, in-loop research via Tavily +
                              Exa tools — RESEARCH_BUDGETS.recommendation
                              = 10 steps total; AI SDK tool loop picks
                              tool + query per call)
   │
   ▼
persist Recommendation       (tx-idempotent: findFirst against the
                              partial unique (sessionId WHERE
                              parentRecommendationId IS NULL), then
                              create-or-update)
   │
   ▼
cleanup Redis session
```

`Recommendation.researchLog` carries one entry per tool invocation:
`{ agent, tool, query, resultSummary, timestamp }`. The roadmap warm-up
that used to live here was **removed** — roadmap generation now fires
only when the founder explicitly clicks "Build my roadmap" on accept.

### 4.5 Pushback engine

`src/lib/discovery/pushback-engine.ts`. Two-phase model:

- **Phase 1A — reasoning + research.** Opus + research tools, free-form
  text output, `RESEARCH_BUDGETS.pushback = 5` steps. Emits plain
  reasoning covering mode (`analytical | fear | lack_of_belief`),
  action (`continue_dialogue | defend | refine | replace`),
  `converging` boolean, and rebuttal message.
- **Phase 1B — structured emission.** Sonnet, `Output.object` against
  `PushbackResponseSchema`. Single concern: format phase 1A's reasoning
  into valid JSON. Splitting the work fixed a round-4+ production
  incident where combining tools + structured output exhausted the step
  budget mid-emission.
- **Phase 2 — rewrite (optional).** Fires only on `action ∈
  {refine, replace}`. Opus, full `RecommendationSchema` output, cached
  prefix, max 16 k output tokens. Result is merged through
  `mergeRecommendationPatch` which validates against the canonical
  schema before persisting.

Round limits are tier-aware: Execute = 10, Compound = 15. Soft re-frame
fires at `SOFT_WARN_ROUND` when `converging: false`; server-side
appends the canonical phrase if the model didn't honour the contract.
`HARD_CAP_ROUND` triggers `pushbackAlternativeFunction`, which
synthesises a constrained alternative recommendation linked back via
`alternativeRecommendationId`.

Concurrency is enforced through `Recommendation.pushbackVersion`, an
integer optimistic lock. Every pushback write uses
`updateMany({ where: { id, pushbackVersion: previousVersion } })` and
treats `count: 0` as a contention failure. **Removing this field
would silently corrupt history.**

### 4.6 Acceptance + outcome

`POST /api/discovery/recommendations/[id]/accept` writes `acceptedAt`
and `acceptedAtRound`. Acceptance fires `discovery/roadmap.requested`
which produces the roadmap on-demand (no speculative warm-up).

`POST /api/discovery/recommendations/[id]/outcome` writes a
`RecommendationOutcome` row. The founder picks one outcome category and
toggles `consentedToTraining` explicitly. Anonymisation runs in
`src/lib/outcome/`; the `anonymisedRecord` field is populated **only
if consent is true**. This is hard invariant #1 in § 11.

### 4.7 No-Idea archetype (in progress)

A new ideation track for founders who arrive without an idea. Six
stages produce a ranked shortlist of five evaluated opportunities; the
top one is committed as a normal `Recommendation` and hands off into
the existing Phase 2 roadmap pipeline. The remaining four sit dormant
in the continuation-brief mechanism (§ 9.3) as forks for if validation
fails.

Persistence: `IdeationStageRun` (one row per `(sessionId, stageNumber)`)
with `status` discriminating between `Stage{N}AuthoringState` and
the final per-stage `*Document`. Routes at `/api/ideation/stage-runs/
[id]/commit` and `/edit`. Feature flag: `NEXT_PUBLIC_NO_IDEA_ENABLED`.

Stage 0 (mindset) and Stage 1 (Outcome Definition) are the current
delivery. Stages 2–5 are under design.

---

## 5. Phase 2 — Roadmap

**Entry point:** `src/app/(app)/discovery/roadmap/`. Read API at
`/api/discovery/roadmaps/[id]`.

**Prisma models:** `Roadmap`, `RoadmapProgress`.

**Inngest functions:** `roadmap-generation-function.ts`,
`roadmap-nudge-function.ts`, `stuck-job-reconciliation.ts`,
`backfill-roadmap-task-ids-function.ts`.

### 5.1 Generation

`roadmapGenerationFunction` consumes `discovery/roadmap.requested`. The
function is idempotent: if a roadmap already exists for the
recommendation it returns without producing a duplicate. The engine
(`src/lib/roadmap/roadmap-engine.ts`) calls Sonnet with
`RoadmapSchema`, persists the result, and creates the matching
`RoadmapProgress` row in the same transaction. `totalTasks`,
`completedTasks`, `blockedTasks`, `outcomePromptSkippedAt`, and
`venturePauseReason` are all derived in-transaction so reading them
out of band is safe.

### 5.2 Check-ins

`POST /api/discovery/roadmaps/[id]/tasks/[taskId]/checkin` runs the
check-in agent in `src/lib/roadmap/checkin-agent.ts`. The agent
receives the prior `checkInHistory` for the task plus a free-text
founder update, and emits one of `agentAction`: `acknowledge`,
`ask_follow_up`, `propose_changes`, `escalate`. The agent decides
whether to research mid-check-in via Tavily/Exa (`RESEARCH_BUDGETS.
checkin = 4` steps).

Every entry is appended to the task's `checkInHistory`; counters in
`RoadmapProgress` are updated in the same transaction.

### 5.3 Writability + pause lockdown

A Venture in `paused` or `completed` status puts the entire roadmap
into read-only mode via `RoadmapWritabilityContext` (React context
threaded through the tree). The pause cron also freezes the nudge
function so paused ventures don't get re-engaged. Compound-tier
founders see a "Compound upgrade hint" on `/discovery` when they have
≥1 paused venture and are on Execute tier.

`POST /api/discovery/ventures/[ventureId]/pause` runs the pause-reason
agent (`lib/ventures/pause-reason-engine.ts`) — a conversational agent
that responds to the founder's pause reason with one of three modes:
acknowledge, gentle reframe, or pattern-mirror (when the founder shows
a serial-pause history).

### 5.4 Nudge cron

`roadmapNudgeFunction` runs on a schedule, finds tasks stuck for ≥ N
days, and chooses one of: gentle nudge, motivation-anchor reminder
(uses the belief state's `motivationAnchor`), or escalation. Skipped
for paused ventures. Skipped for founders whose `nudgesEnabled` is
false.

### 5.5 Continuation brief

When the founder clicks **"What's Next"** on the Roadmap, the
continuation engine generates a brief (`continuation-brief-function.
ts`) tailored to one of four scenarios (zero / partial / 70%+ / 100%
task completion). The brief contains five sections: What Happened,
What I Got Wrong, What the Evidence Says, The Fork, The Parking Lot.
Forks let the founder pick a continuation path; the parking lot is a
JSONB array of deferred items that flow into the next venture's
context.

---

## 6. Phase 3 — Validation

**Entry point:** `src/app/(app)/discovery/validation/`. Public read at
`/lp/[slug]`. Analytics beacon at `/api/lp/analytics`.

**Prisma models:** `ValidationPage`, `ValidationSnapshot`,
`ValidationReport`, `ValidationEvent`.

**Inngest functions:** `validation-lifecycle-function.ts`,
`validation-reporting-function.ts`.

### 6.1 Eligibility

Only `recommendationType === 'build_software'` recommendations get a
validation page. `VALIDATION_PAGE_ELIGIBLE_TYPES` is the single set
the UI and API both check; the validation-page route re-checks
server-side and refuses to provision for ineligible recommendations.

### 6.2 Page generation

`POST /api/discovery/validation-pages` consumes the accepted
recommendation and generates a landing page through
`src/lib/validation/page-generator.ts`. The page renders publicly at
`/lp/[slug]`. Founder edits go through the validation editor in the
authenticated app.

### 6.3 Analytics + lifecycle

`/api/lp/analytics` is the only **unauthenticated** route in the
codebase. It is hardened with IP rate limiting, a body size cap, and
a `taskId` cross-check. Events are persisted to `ValidationEvent`.

`validation-lifecycle-function.ts` runs on a schedule and transitions
the page through lifecycle states based on traffic + time-on-page +
form submission rates. Below the qualitative gate, the page surfaces
a "low-traffic warning" so the founder knows not to over-read the
report.

### 6.4 Reporting

`validation-reporting-function.ts` consumes the lifecycle transition
and produces a `ValidationReport` — a structured doc naming
confirmed assumptions, disconfirmed assumptions, and the surrounding
evidence (snapshots, event counts, traffic source breakdown). The
interpreter handles strict-parse failures by returning the raw session
rather than dropping it.

---

## 7. Tools layer

Four founder-facing tools accelerate roadmap execution. Each runs as a
durable **ToolJob** (Inngest function in `inngest/functions/tools/`)
and persists results via the shared `lib/tool-jobs/persistence.ts`
helper, which handles both standalone (`roadmap.toolSessions[]`) and
task-launched (`task.<x>Session`) shapes through one entry point.

| Tool | Purpose | Worker file | Sub-models |
|---|---|---|---|
| **Research** | Long-form research session with founder follow-ups | `research-execute-job.ts`, `research-followup-job.ts` | `ResearchSession`, `ResearchFollowUp` |
| **Packager** | Productised-service offer + revenue scenarios | `packager-generate-job.ts`, `packager-adjust-job.ts` | `PackagerSession`, `PackagerScenario` |
| **Composer** | Outreach message drafts (cold-email, warm intros, etc.) | `composer-generate-job.ts` | `ComposerSession` |
| **Coach** | Conversation rehearsal (sales call, hard meeting, etc.) | `coach-prepare-job.ts` | `CoachSession` |

The accept-and-queue route shape:

```
validate (auth, tier, quota, ownership) →
  createToolJob({ userId, roadmapId, toolType, sessionId, taskId? }) →
  sendToolJobEvent(job.id, { name: 'tool/<x>.requested', data }) →
  return 202 with { jobId, sessionId }
```

The route owns **no** LLM calls. The worker runs the engine in
`step.run` blocks (`context_loaded` → `researching` → `emitting` →
`persisting`) and writes its result via `persistToolJobResult`.

The client polls `/api/discovery/roadmaps/[id]/tool-jobs/[jobId]/status`
via `useToolJob` (3s foreground / 30s backgrounded) and renders
`<ToolJobProgress>` until the worker writes the result. Short
conversational LLM calls (Coach roleplay turns, Composer/Packager
context exchange) stay synchronous because they need to feel immediate.

---

## 8. Lifecycle memory

`src/lib/lifecycle/` owns the cross-venture / cross-cycle memory layer
that lets agents reference what already happened.

### 8.1 `FounderProfile`

One row per user. Captures stable founder-level facts derived from past
interview belief states: their consistent voice, recurring constraints,
serial patterns. Updated lazily as cycles complete.

### 8.2 `Venture` + `Cycle`

`Venture` is the long-lived container (single product / direction);
`Cycle` is one attempt at it (one recommendation + roadmap + optional
validation). A venture in `paused` state freezes the cycle; a
`completed` venture has been Mark-Complete'd and may have a
`TransformationReport`. `archivedAt` hides it from the founder's
default view.

### 8.3 Context loaders + prompt renderers

`loadInterviewContext(userId, scenario, opts)` reads the right slice
based on `lifecycleScenario`:

- `first_interview` — empty
- `fresh_start` — FounderProfile + cross-venture summaries (Compound
  only)
- `fork_continuation` — FounderProfile + the current venture's cycle
  summaries + fork context
- `no_idea` — same as `fresh_start` (the No-Idea track starts a new
  venture)

`renderInterviewOpeningBlock`, `renderFounderProfileBlock`,
`renderCycleSummariesBlock`, `renderCrossVentureBlock` produce
delimiter-wrapped opaque text suitable for direct injection into agent
prompts. Every renderer uses `renderUserContent` so the model treats
prior-cycle text as DATA, not instructions — defence in depth against
indirect injection across the lifecycle boundary.

### 8.4 Cross-venture memory (Compound)

Compound tier reads cycle summaries from **all other** ventures owned
by the same user. The block is rendered after the within-venture
summary block. Free + Execute tiers receive the empty string at every
layer (loader returns `[]`, renderer returns `''`, prompt assembly
drops the empty block).

---

## 9. Transformation Report

Once-per-venture narrative produced when the founder clicks **Mark
Complete** on a venture.

**Prisma model:** `TransformationReport`.
**Inngest function:** `transformation-report-function.ts`.

The pipeline is durable + idempotent:

```
opus narrative draft (uses full venture history: belief state,
                      recommendation, roadmap progress, check-ins,
                      outcome, tool sessions)
   │
   ▼
redaction baseline    (PII detector + editor — names, emails,
                       phone numbers, financial specifics)
   │
   ▼
founder review        (founder can edit redactions, push back on
                       narrative framing, or request a redraft)
   │
   ▼
publish flow          (founder consent → public archive entry at
                       /stories/[slug] AND admin moderation queue
                       at /admin/stories)
```

The public archive is read-only and serves Discovery / Stories pages
from the database. Consent is per-report — un-consented reports stay
private to the founder.

---

## 10. Auth, billing, observability

### 10.1 Auth

NextAuth v5 (beta) with server-side sessions. Magic-link or OAuth on
the web; mobile auth issues a short-lived bridge token redeemable
through `/api/auth/mobile/session`. The mobile app stores the resulting
JWT in secure storage and presents it on every request.

### 10.2 Billing

Paddle v4. Webhook at `/api/billing/paddle/webhook` (signature-verified
via `lib/paddle/`). Subscription state lands on `User.tier` (`free` |
`execute` | `compound`) and `User.tierTransitions[]` history.
`paddle-reconciliation-function.ts` is the safety net for missed
webhooks. `usage-anomaly-detection-function.ts` catches abusive usage
patterns.

Tier gates appear at four layers:

- **Pricing/upgrade UI** for soft prompts
- **Server-side asserters** (`assertVentureLimitNotReached`,
  `assertFreeDiscoverySessionLimit`, etc.) at every state-changing
  route
- **Per-call quota** for LLM-intensive routes (some tools are
  Compound-only)
- **Voice mode** is tier-gated via `lib/voice/client-tier.ts`

### 10.3 Observability

Sentry covers errors + traces. `lib/observability/` wraps every LLM
call in an `withAgentSpan` so spans carry the model id, token usage,
latency, audience type, and any model-fallback events. Inngest queue
spans (`withInngestQueueSpan`) tie the worker invocation back to the
originating turn. `withDistributedTrace` propagates the trace context
through the event bus.

---

## 11. Hard data invariants

These are real correctness invariants enforced by code or database
constraints. Violations are data corruption, not policy questions.

1. **Outcome consent gating.** `RecommendationOutcome` rows with
   `consentedToTraining = false` MUST have `anonymisedRecord = null`.
   Enforced in `src/lib/outcome/anonymise.ts`; tested in
   `outcome-anonymise.test.ts`. A row with `consentedToTraining=false`
   AND non-null `anonymisedRecord` is a P0 incident — see RUNBOOK § 5g.
2. **Pushback optimistic lock.** Every pushback write uses
   `updateMany({ where: { id, pushbackVersion: prev } })` and treats
   `count: 0` as contention. Removing `pushbackVersion` would silently
   corrupt pushback history.
3. **Session rehydration on Redis miss.** `getSession()` MUST fall back
   to Postgres on Redis miss — a 15-minute idle pause cannot lose the
   founder's belief state. See `src/lib/discovery/session-store.ts`.
4. **Recommendation uniqueness.** The partial unique on
   `(sessionId WHERE parentRecommendationId IS NULL)` enforces "one
   primary recommendation per session." Synthesis upsert resolves
   idempotency through a transactional findFirst-then-create-or-update.
5. **Ownership scoping on reads.** Every read returning user data uses
   `findFirst({ where: { id, userId } })`, never `findUnique({ id })` +
   manual check. Prevents existence-leaks between 404 and 401.

---

## 12. Deliberate non-features

Things the system explicitly does not do, and the reasoning:

- **No code generation, no sandbox, no agent swarm.** Removed in
  earlier cleanup phases. NeuraLaunch helps the founder decide what
  to build and proves the demand — building the thing is the
  founder's job.
- **No infinite synthesis retries.** `MAX_TOTAL_QUESTIONS = 15` + the
  synthesis readiness guard are the contract; the engine never loops
  forever waiting for a clean answer.
- **No silent classification override on explicit choice.** When the
  archetype picker is enabled, the founder's self-pick wins; the
  `detectAudienceType` classifier is skipped (or its result is ignored
  via `audienceTypeLocked`).
- **No roadmap warm-up.** Removed because cycles invalidated by
  pushback wasted the work and the build-but-stale roadmap could leak
  through. Roadmap generation fires only on explicit accept.
- **No multi-recommendation output.** The synthesis contract is "ONE
  path, not two, not 'it depends'". The No-Idea track produces a
  ranked shortlist of five upstream of synthesis, but the artifact
  that lands in `Recommendation` is always one.

---

## 13. Where to read next

- **Engineering standards** — `CLAUDE.md`
- **On-call playbooks** — `RUNBOOK.md`
- **Source of truth for any specific subsystem** — read the code in
  the corresponding `lib/` module. The code is more reliable than any
  prose document including this one.

If you find drift between this document and the code, the code wins.
Please open a PR updating this file rather than leaving the drift.
