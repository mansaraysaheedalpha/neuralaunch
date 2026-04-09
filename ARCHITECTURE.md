# NeuraLaunch — Architecture

> How the system actually flows. Read `CLAUDE.md` first for the
> engineering standards every file in this repo is held to. This
> document describes the current state of the codebase after the
> Phase 3 cleanup; nothing here is aspirational.

---

## 1. Top of stack

NeuraLaunch is a Next.js 15 application backed by Postgres
(via Prisma 6), Upstash Redis for ephemeral session state, and
Inngest v4 for durable background work. It walks a founder through
three phases — **Discovery** (interview that produces a single
committed recommendation), **Roadmap** (phased execution plan), and
**Validation** (a public landing page plus an analytics-driven
build brief). It does not host built products, it does not run
agent swarms, and it does not execute user-supplied code in any
sandbox — that machinery was deleted in the Phase 3 cleanup.
All AI calls go through the Vercel AI SDK v5 with Claude 4.6
(Sonnet for execution, Opus for synthesis) plus a Gemini 2.5
Flash fallback tier on the question-generation hot path.

---

## 2. Repository layout

Only the directories that matter to runtime behaviour are listed.

```
client/src/
├── app/
│   ├── (app)/discovery/        # Authenticated discovery UI
│   │   ├── DiscoveryChatClient.tsx
│   │   ├── recommendation/     # Recommendation reveal + pushback UI
│   │   ├── roadmap/            # Roadmap viewer + check-ins
│   │   └── validation/         # Validation page editor
│   ├── api/discovery/          # Discovery / roadmap / validation routes
│   │   ├── sessions/           # Interview chat + streaming
│   │   ├── recommendations/    # Reveal, pushback, accept, outcome
│   │   ├── roadmaps/           # Roadmap reads + task check-ins
│   │   └── validation/         # Validation page CRUD + trigger
│   ├── api/lp/analytics/       # Public landing page event capture
│   ├── lp/[slug]/              # Public landing page renderer
│   └── auth/, signin/          # NextAuth surfaces
├── inngest/
│   ├── client.ts               # Event payload type map (single source)
│   └── functions/              # Durable workers (one per file)
├── lib/
│   ├── ai/                     # Provider chains, fallback wrappers
│   ├── discovery/              # Interview engine, synthesis, pushback
│   ├── roadmap/                # Roadmap engine, check-in agent
│   ├── validation/             # Page generator, interpreter, briefs
│   ├── outcome/                # Anonymisation + consent gating
│   ├── phase-context.ts        # Phase numbering + builder
│   ├── api-error.ts            # HttpError + httpErrorToResponse
│   ├── rate-limit.ts           # Per-user / per-route limiters
│   ├── logger.ts               # Structured logger (Sentry-aware)
│   ├── env.ts                  # Validated env at startup
│   ├── prisma.ts, redis.ts     # Singletons
│   └── sanitize.ts             # Prompt-injection delimiters etc
└── components/                 # Shadcn-based UI
```

---

## 3. The three phases — data flow at a glance

```
        ┌─────────────────────────┐
        │  Phase 1: Discovery     │
        │  /discovery             │
        │  DiscoverySession +     │
        │  Recommendation         │
        └──────────┬──────────────┘
                   │ acceptedAt
                   ▼
        ┌─────────────────────────┐
        │  Phase 2: Roadmap       │
        │  /discovery/roadmap     │
        │  Roadmap +              │
        │  RoadmapProgress        │
        └──────────┬──────────────┘
                   │ recommendationType
                   │ === build_software
                   ▼
        ┌─────────────────────────┐
        │  Phase 3: Validation    │
        │  /lp/[slug]             │
        │  ValidationPage +       │
        │  Snapshot/Report/Event  │
        └─────────────────────────┘
```

Each box hangs off the same `Recommendation` row. Phase outputs
also write `phaseContext` metadata (see section 7) so a future
orchestration layer can walk the dependency graph backwards.

---

## 4. Phase 1 — Discovery

**Entry point:** `src/app/(app)/discovery/page.tsx` →
`DiscoveryChatClient.tsx`. The client streams from
`src/app/api/discovery/sessions/.../route.ts`.

**Prisma models:** `DiscoverySession`, `Recommendation`,
`RecommendationOutcome`.

**Inngest functions:**
`src/inngest/functions/discovery-session-function.ts`,
`src/inngest/functions/pushback-alternative-function.ts`.

### Interview state machine

The engine lives in `src/lib/discovery/interview-engine.ts` and
runs through five phases declared in `constants.ts`:
`ORIENTATION → GOAL_CLARITY → CONSTRAINT_MAP → CONVICTION →
SYNTHESIS`. Per-field caps (`MAX_QUESTIONS_PER_PHASE`) and a
total cap (`MAX_TOTAL_QUESTIONS = 15`) prevent runaway sessions.
`question-selector.ts` uses an information-gain heuristic
(`MIN_EXPECTED_GAIN_TO_CONTINUE = 0.05`) to decide when asking
the next question is no longer worth the round trip.

State persists in two tiers:

1. **Upstash Redis** with a sliding 15-minute TTL
   (`SESSION_TTL_SECONDS`). Read/written through
   `src/lib/discovery/session-store.ts`.
2. **Postgres `DiscoverySession`** as the durable fallback. Every
   meaningful state write also persists here so a Redis miss
   (TTL expiry, regional outage, key eviction) does not lose
   the founder's progress.

`teeDiscoveryStream` mirrors the in-flight token stream into
Redis so a reconnecting client can resume mid-question.

### Belief state — `DiscoveryContext`

Defined in `src/lib/discovery/context-schema.ts`. Every field is
a `beliefField` carrying a `value`, a `confidence` in `[0,1]`,
and an `extractedAt` timestamp. A field counts as "known" only
once `MIN_FIELD_CONFIDENCE = 0.65` is reached, and the engine
will only allow synthesis once `SYNTHESIS_READINESS_RATIO = 0.80`
of required fields are known (`assumption-guard.ts:canSynthesise`).

Every read of the JSON column goes through
`safeParseDiscoveryContext`. Direct casts are forbidden — see
section 7 ("toJsonValue / safeParse helpers").

### Synthesis flow

When `canSynthesise()` returns true (or the founder explicitly
asks for it), the route fires `discovery/synthesis.requested`.
`discoverySessionFunction` runs the pipeline as Inngest steps so
every stage is durable and individually retryable:

```
load belief state
   │
   ▼
summariseContext       (Sonnet, fast)
   │
   ▼
eliminateAlternatives  (Sonnet — kills weak paths)
   │
   ▼
runResearch            (targeted web research)
   │
   ▼
runFinalSynthesis      (Opus, extended thinking)
   │
   ▼
persist Recommendation
   │
   ▼
emit discovery/roadmap.requested  (warm-up)
```

The output is validated against `RecommendationSchema`
(`recommendation-schema.ts`) before it touches the database. The
schema enforces a single committed `summary`, exactly three
`firstThreeSteps`, an `alternativeRejected` block, an explicit
`assumptions` array, and a `whatWouldMakeThisWrong` field.

### `recommendationType` and downstream gating

Synthesis classifies the action shape into one of seven values
declared in `RECOMMENDATION_TYPES`:

| Value | Meaning | Downstream |
|---|---|---|
| `build_software` | Build a software product | Validation page CTA shown |
| `build_service` | Productised service / consulting | No validation page (yet) |
| `sales_motion` | Already has product, sell it | No validation page |
| `process_change` | Behavioural / operational fix | No validation page |
| `hire_or_outsource` | Capacity bottleneck | No validation page |
| `further_research` | Not enough data yet | No validation page |
| `other` | Catch-all | No validation page |

`VALIDATION_PAGE_ELIGIBLE_TYPES` is the single set the UI and the
API both check. Defence in depth: the validation-page route
re-checks the type server-side and refuses to provision a page
for ineligible recommendations.

### Pushback engine (Concern 1 + 2)

`src/lib/discovery/pushback-engine.ts`. The founder can challenge
any recommendation. Configuration in `PUSHBACK_CONFIG`:
`SOFT_WARN_ROUND = 4` (re-frame fires only if the model
self-reports a stalled dialogue) and `HARD_CAP_ROUND = 7` (the
agent's response on this round is the closing move — there is
no eighth turn). Every pushback turn produces one of five
structured actions: `continue_dialogue`, `defend`, `refine`,
`replace`, `closing`.

Concurrency is enforced through `Recommendation.pushbackVersion`,
an integer optimistic lock. Every write uses
`updateMany({ where: { id, pushbackVersion: previousVersion } })`
and treats a `count: 0` result as a contention failure. **Removing
this field would silently corrupt history** (see section 9).

On the closing turn, the route fires
`discovery/pushback.alternative.requested`.
`pushbackAlternativeFunction` reads the entire pushback transcript
and synthesises a constrained alternative recommendation, linked
back to the original via `alternativeRecommendationId`.

### Acceptance flow

`POST /api/discovery/recommendations/[id]/accept` writes
`acceptedAt` and `acceptedAtRound`. Acceptance is the gate for
the roadmap UI, but **roadmap generation itself is decoupled**:
the synthesis function emits `discovery/roadmap.requested` as a
warm-up immediately after writing the Recommendation, so by the
time the founder accepts, the roadmap is usually already on disk.
Acceptance is idempotent and can be revoked, but revoking does
not invalidate an already-generated roadmap.

### Concern 5 — outcome capture

`POST /api/discovery/recommendations/[id]/outcome` writes a
`RecommendationOutcome` row. The user picks an outcome category
and explicitly toggles `consentedToTraining`. Anonymisation runs
in `src/lib/outcome/`, which strips PII and produces an
`anonymisedRecord` JSON blob — but **only if consent is true**.
This is the hard data invariant in section 9.

---

## 5. Phase 2 — Roadmap

**Entry point:** `src/app/(app)/discovery/roadmap/`. Read API at
`/api/discovery/roadmaps/[id]`.

**Prisma models:** `Roadmap`, `RoadmapProgress`.

**Inngest functions:**
`src/inngest/functions/roadmap-generation-function.ts`,
`src/inngest/functions/roadmap-nudge-function.ts`.

### Generation

`roadmapGenerationFunction` consumes
`discovery/roadmap.requested`. The function is fully idempotent:
if a roadmap already exists for the recommendation it returns
without producing a duplicate. The roadmap engine
(`src/lib/roadmap/roadmap-engine.ts`) calls Sonnet with a Zod
schema (`roadmap-schema.ts`) describing phased tasks and
exit criteria, then persists the result and creates the matching
`RoadmapProgress` row with `completedTasks = 0`, `blockedTasks = 0`,
and `totalTasks` derived from the generated task list.

`completedTasks` / `blockedTasks` / `totalTasks` are kept in sync
inside the same Prisma transaction as every check-in write.
Reading them out of band is safe because they are never updated
without the underlying tasks JSON being updated in the same
statement.

### Check-ins (Concern 4)

`POST /api/discovery/roadmaps/[id]/tasks/[taskId]/checkin`
runs the check-in agent in `src/lib/roadmap/checkin-agent.ts`.
The agent receives the prior check-in history for the task plus
a free-text update from the founder, and emits a structured
response with one of these `agentAction` values: acknowledge a
completion, ask a follow-up, propose changes to the next step,
or escalate. Every entry is appended to `checkInHistory` on the
task within the roadmap JSON; `RoadmapProgress` counters are
updated in the same transaction.

The `proposedChanges` payload is **surfaced as readable text only**.
The accept/reject mutation editor (the "Roadmap Adjustment Layer")
is deliberately deferred — see section 8.

### Nudge cron

`roadmapNudgeFunction` runs on a schedule, finds tasks marked as
in-progress with no recent activity, and prompts the founder for
an outcome update. Same path also surfaces the outcome capture
flow when a roadmap reaches its final task.

### STALE state via late pushback

A founder can return to the recommendation after the roadmap has
been generated and push back. If the pushback agent's action is
`refine`, the resulting Recommendation update marks the existing
roadmap as stale via the `phaseContext.upstream` link, so the
roadmap UI surfaces a "regenerate" affordance. The roadmap row
itself is not deleted — staleness is metadata.

---

## 6. Phase 3 — Validation

**Entry points:**
- Authenticated editor at `src/app/(app)/discovery/validation/`
- Provisioning at `src/app/api/discovery/recommendations/[id]/validation-page/`
- CRUD at `src/app/api/discovery/validation/`
- Public renderer at `src/app/lp/[slug]/`
- Public analytics at `src/app/api/lp/analytics/`

**Prisma models:** `ValidationPage`, `ValidationSnapshot`,
`ValidationReport`, `ValidationEvent`.

**Inngest functions:**
`src/inngest/functions/validation-reporting-function.ts`,
`src/inngest/functions/validation-lifecycle-function.ts`.

### Eligibility gate

The validation surface only exists for recommendations whose
`recommendationType` is in `VALIDATION_PAGE_ELIGIBLE_TYPES`
(currently just `build_software`). The gate is enforced in three
places: the UI hides the CTA, the provisioning route rejects
ineligible recommendations with a 400, and the page generator
refuses to run.

### Lifecycle: `DRAFT → LIVE → ARCHIVED`

Lifecycle thresholds live in `src/lib/validation/constants.ts`:

- `VALIDATION_PAGE_CONFIG.DRAFT_EXPIRY_HOURS = 72` — drafts not
  published within 72 hours are auto-archived.
- `VALIDATION_PAGE_CONFIG.MAX_ACTIVE_DAYS = 30` — LIVE pages with
  no build brief generated in 30 days are archived.
- `validationLifecycleFunction` runs daily and applies both
  sweeps. It also purges old `ValidationEvent` rows on archived
  pages so the analytics table does not grow unbounded.

### Page generation pipeline

1. **Build brief generator** (`build-brief-generator.ts`) — Opus,
   produces the structured page content from the parent
   Recommendation.
2. **Distribution generator** (`distribution-generator.ts`) — picks
   `DISTRIBUTION_BRIEF_CONFIG.CHANNEL_COUNT` channels (default 3)
   that meet the `MIN_GROUP_SIZE_FOR_RECOMMENDATION` threshold.
3. **Page generator** (`page-generator.ts`) — selects one of the
   three controlled `LAYOUT_VARIANTS` (`product`, `service`,
   `marketplace`) and assembles the rendered page.

The variant is chosen by the engine, never the user — consistent
structure is what makes cross-page analytics meaningful.

### Public rendering and analytics

`/lp/[slug]/page.tsx` renders the page server-side and is the
only public surface that does not require auth. Client-side
events (visit, scroll depth, feature interest click, survey
response) post to `/api/lp/analytics`, which validates the
payload against a Zod schema, applies CSRF / origin checks, and
inserts a `ValidationEvent` row.

### Reporting

`validationReportingFunction` consumes
`validation/report.requested`. With no `pageId` it processes
every LIVE page (cron mode); with a `pageId` it forces a single
report (on-demand mode). Each run:

1. Loads recent events into `metrics-collector.ts`.
2. Writes a `ValidationSnapshot` of the raw counters.
3. If thresholds in `VALIDATION_SYNTHESIS_THRESHOLDS` are met
   (`MIN_VISITORS_FOR_BRIEF = 50`,
   `MIN_FEATURE_CLICKS_FOR_BRIEF = 5`,
   `MIN_SURVEY_RESPONSES_FOR_SYNTHESIS = 3`), runs the
   `interpreter.ts` agent and writes a `ValidationReport` with a
   `signalStrength` enum.
4. Writes that `signalStrength` back to the parent
   `Recommendation.validationOutcome` (Concern 3 substrate).

If `DAYS_BEFORE_LOW_TRAFFIC_WARNING = 4` passes without hitting
visitor thresholds, the next-action recommendation flips from
"wait for data" to "your traffic strategy needs attention".

---

## 7. Cross-cutting infrastructure

### Auth — NextAuth v5

Server-side sessions only, configured in `src/app/auth/`. The
Prisma adapter requires the `Session`, `Account`, and
`VerificationToken` tables to exist even though no application
code calls `prisma.session.*` directly. Those models look dead in
a grep but are load-bearing — leave them.

### Inngest events

`src/inngest/client.ts` is the single source of truth for event
payload shapes. Every event is declared with a typed `data`
field; runtime sends are checked against this map. The literal
event-name strings live next to their consumers
(`PUSHBACK_ALTERNATIVE_EVENT`, `VALIDATION_REPORTING_EVENT`,
`VALIDATION_LIFECYCLE_EVENT`, `ROADMAP_EVENT`) so call sites
import the constant rather than typing the string twice.

### Logging and error response

`src/lib/logger.ts` is the only logger. Use `log.error(msg, err)`
with a real `Error` instance so stack traces survive — passing
a string loses them. `httpErrorToResponse` in
`src/lib/api-error.ts` is the single error sink for every API
route: it converts `HttpError` instances into safe client
responses, logs the original error server-side via `log.error`,
and forwards to Sentry. Internal stack traces never reach the
client.

### Rate limiting

`src/lib/rate-limit.ts`. `rateLimitByUser(userId, key, config)`
is mandatory on every AI-touching route. Rate limits are
declared in a single `RATE_LIMITS` map; routes pass the relevant
preset (`AI_GENERATION`, `READ`, etc).

### `safeParseX` and `toJsonValue` helpers

Prisma JSON columns return `unknown` at the type level. Casting
them is forbidden because schema drift, corrupt rows, or null
values produce silent runtime crashes. Every JSON read instead
goes through a `safeParseX` helper that runs the matching Zod
schema and returns either the parsed value or an empty default
(`safeParseDiscoveryContext`, `safeParsePushbackHistory`,
`safeParsePhaseContext`, etc). Writes go through `toJsonValue`,
which strips `undefined` and narrows the value to the
`Prisma.JsonValue` type so the compiler accepts it without a
cast.

### Question generation fallback chain

`src/lib/ai/question-stream-fallback.ts`. The interview hot path
calls Sonnet first; on timeout, overload, or transport failure
it falls back to Claude Haiku 4.5 (different Anthropic
infrastructure), and if that also fails, to Gemini 2.5 Flash
(different vendor entirely, same Vercel AI SDK interface). The
chain is **not dead code** — it is the resilience layer that
keeps interviews alive during partial provider outages, and is
called out as a hard invariant in section 9. Synthesis
deliberately does not fall back: if Opus fails the synthesis
surfaces the failure rather than silently producing a weaker
recommendation.

### Sentry

`@sentry/nextjs` is wired through `next.config.ts` and the
`instrumentation*.ts` entry points. The logger forwards errors
to Sentry automatically; routes do not call Sentry directly.

### `phaseContext`

`src/lib/phase-context.ts` declares `PHASES` (the canonical
phase numbering) and a small builder. Every phase output row
(`Recommendation`, `Roadmap`, `ValidationPage`, `ValidationReport`)
has a `phaseContext Json?` column carrying its phase number plus
a list of upstream rows it consumed. The module is intentionally
behaviour-free — it is the substrate the future cross-phase
orchestration layer (Concern 3, deferred) will read to walk the
dependency graph backwards.

---

## 8. Concerns 1–5 status

See `docs/AGENT_ARCHITECTURE_REVIEW.md` for the full text of each
concern.

| # | Concern | Status |
|---|---|---|
| 1 | Mutable recommendations / pushback | **Shipped.** Pushback engine, soft warn at round 4, hard cap at round 7, alternative synthesis on closing turn. |
| 2 | Roadmap gated behind acceptance | **Shipped.** `acceptedAt` gates the UI; warm-up event keeps generation latency near zero. |
| 3 | Phase coordination | **Substrate only.** `phaseContext` columns and `validationOutcome` written; the orchestration layer itself is deferred. |
| 4 | Two-track ongoing support / check-ins | **Shipped (read-only adjustments).** Check-in agent runs; the accept/reject editor for proposed roadmap changes is deferred. |
| 5 | Outcome capture for training | **Shipped.** `RecommendationOutcome` + consented anonymisation. |

Two items are deliberately deferred until production data
justifies the build:

- **Roadmap Adjustment Layer** (Concern 4) —
  `src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/checkin/route.ts`.
  Trigger to build: 15+ `adjusted_next_step` check-in entries
  logged in production. At that point the actual `proposedChanges`
  shapes inform the editor design.
- **Cross-Phase Orchestration Layer** (Concern 3) —
  `src/inngest/functions/validation-reporting-function.ts`.
  Trigger to build: 20+ completed validation reports across real
  founder sessions. Build it only if Phase-3-vs-Phase-2
  contradictions appear in 30%+ of cases; otherwise the manual
  pushback path is sufficient.

---

## 9. Hard data invariants

These three rules must never break. A failing test on any of
them indicates a serious bug, not a flaky test.

1. **Outcome consent gating.** A `RecommendationOutcome` row with
   `consentedToTraining = false` must NEVER carry a non-null
   `anonymisedRecord`. Anonymisation only runs when consent is
   true at submission time; a daily lifecycle sweep additionally
   nulls `anonymisedRecord` after the 24-month TTL while leaving
   `consentedToTraining` intact.
2. **Pushback optimistic lock.**
   `Recommendation.pushbackVersion` is the row-level lock for
   concurrent pushback writes. Every write site uses
   `updateMany({ where: { id, pushbackVersion: previousVersion } })`
   and treats `count: 0` as contention. Removing the field, or
   switching to `update`, would silently corrupt history.
3. **Question generation fallback chain.** Sonnet → Haiku →
   Gemini Flash in `src/lib/ai/question-stream-fallback.ts`. The
   chain is critical resilience infrastructure. Removing a tier,
   or swapping in a same-vendor model for the bottom tier,
   defeats the point — a regional Anthropic outage must not be
   able to take both tiers down.

---

## 10. Deliberate non-features

Things that are absent on purpose. New code must not reintroduce
them.

- **No Pages Router.** App Router only. Anything under `app/` is
  authoritative; `pages/` does not exist.
- **No `useEffect` for data fetching.** Server Components fetch
  data; the client `use()` hook consumes promises. The Discovery
  chat client streams via the AI SDK hooks, not via ad-hoc
  effects.
- **No `framer-motion`.** Motion v12 only, imported from
  `motion/react`. Any PR that imports `framer-motion` is wrong.
- **No client-side LLM calls.** All Anthropic / Google calls
  happen server-side, behind authenticated, rate-limited routes
  or Inngest functions. API keys never leave the server.
- **No mocking-as-default in tests.** Per the CLAUDE.md priority
  hierarchy, the test suite targets hard invariants and security
  boundaries first. Snapshot tests of LLM prompts are explicitly
  out of scope. LLM-touching tests use Vercel AI SDK
  `MockLanguageModelV2` so no real network calls are made — that
  is the only mocking allowed by default.
- **No backwards-compatibility shims for the deleted Phase 2
  agent system.** The old multi-agent wave executor, the
  Docker-sandbox command tool, the `agentTask` / `agentExecution`
  / `executionWave` / `agentMemory` / `criticalFailure` models,
  and the Phase 5 sprint machinery were all deleted in the
  cleanup. Nothing is left behind to "ease migration" — that
  code is gone, its tables are gone, and its routes are gone.

---

*NeuraLaunch — Architecture document last updated: 2026-04-07*
