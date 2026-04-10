# NeuraLaunch — Discovery Engine Technical Guide

> How the interview engine, synthesis pipeline, and pushback system
> actually work, end to end. Written for the engineer who needs to
> modify, debug, or extend these systems.

---

## 1. The Complete Flow

```
Founder opens /discovery
         │
         ▼
┌─────────────────────┐
│ Session Creation     │  POST /api/discovery/sessions
│ - Conversation row   │  Creates DiscoverySession + Conversation
│ - Redis state seed   │  Seeds InterviewState in Upstash Redis
│ - Concern 5 check    │  Checks for pending outcome prompts
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Interview Loop       │  POST /api/discovery/sessions/[id]/turn
│ (repeats per turn)   │  Each turn: safety → extract → advance → stream
└─────────┬───────────┘
          │  (canSynthesise returns true)
          ▼
┌─────────────────────┐
│ Reflection Stream    │  Streamed directly to the client
│ (3-5 sentences)      │  While Inngest runs synthesis in background
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Inngest: Synthesis   │  discovery/synthesis.requested
│ Step 1: Summarise    │  Sonnet — distill context to facts
│ Step 2: Eliminate    │  Sonnet — identify and reject alternatives
│ Step 3: Research     │  Tavily — 3 web queries for market data
│ Step 4: Synthesise   │  Opus — final structured recommendation
│ Step 5: Persist      │  Upsert to Recommendation table
│ Step 6: Warm roadmap │  Fire roadmap generation event
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Recommendation Page  │  /discovery/recommendation
│ - Full recommendation│  Summary, path, steps, risks, assumptions
│ - Pushback chat      │  Available until acceptance
│ - Accept button      │  Sets acceptedAt, triggers roadmap
│ - Downstream tools   │  Roadmap + validation (post-accept)
└─────────┬───────────┘
          │  (founder pushes back)
          ▼
┌─────────────────────┐
│ Pushback Engine      │  POST /api/discovery/recommendations/[id]/pushback
│ Call 1: Decision     │  Opus — mode + action + message
│ Call 2: Patch (if    │  Opus — full updated recommendation
│   action=refine or   │  (only fires on commit turns)
│   replace)           │
│ Optimistic lock      │  pushbackVersion prevents concurrent writes
└─────────────────────┘
```

---

## 2. Session Creation

**Route:** `POST /api/discovery/sessions`
**File:** `src/app/api/discovery/sessions/route.ts`

When a founder clicks "Start Discovery," the route:

1. Authenticates via NextAuth
2. Rate-limits at AI_GENERATION tier
3. **Concern 5 check** — queries for any prior recommendation with
   a partially-complete roadmap that hasn't received an outcome
   attestation. If found, returns `pendingOutcomeRecommendationId`
   instead of creating a new session. The client shows the outcome
   modal; the founder submits or skips, then re-POSTs with
   `acknowledgePendingOutcome: true`.
4. Creates a `Conversation` + `DiscoverySession` atomically in a
   Prisma transaction
5. Seeds the `InterviewState` in Redis via `saveSession()`

The `InterviewState` starts with an empty `DiscoveryContext` (all
14 fields at confidence 0) and `phase: 'ORIENTATION'`.

---

## 3. The Interview Loop

**Route:** `POST /api/discovery/sessions/[id]/turn`
**File:** `src/app/api/discovery/sessions/[sessionId]/turn/route.ts`

Every message the founder sends goes through this route. The
processing pipeline per turn:

### 3.1 Safety Gate (first)

**File:** `src/lib/discovery/safety-gate.ts`

Runs on EVERY message. Uses Haiku (fastest, cheapest) with Sonnet
fallback. Checks for criminal intent, harmful tool requests,
exploitation, and social engineering across the conversation
history. If triggered: session status → TERMINATED, Redis killed,
403 returned with `sessionTerminated: true`. No re-entry ever.

### 3.2 Context Extraction

**File:** `src/lib/discovery/context-extractor.ts`

One LLM call (Sonnet) that does two things simultaneously:

1. **Classifies** the message: answer, offtopic, frustrated,
   clarification, or synthesis_request
2. **Extracts ALL belief state dimensions** mentioned in the
   message — not just the active field

This is the core architectural fix from the evaluation findings.
Before: the extractor only captured the single field being asked
about. Now: if the founder says "I'm a solo accountant in Lagos
with ₦5M saved," the extractor captures situation, teamSize,
geographicMarket, AND availableBudget in one call.

The extraction schema (`ExtractionResultSchema`) returns:
- `inputType` — the classification
- `extractions[]` — array of `{ field, value, confidence }`
- `contradicts` — true if the active field contradicts a prior
  high-confidence value

### 3.3 Input Type Routing

Based on `inputType`, the turn route branches:

| inputType | Behavior |
|---|---|
| `offtopic` | Stream a brief meta-response, re-invite to continue |
| `frustrated` | Stream empathetic response acknowledging the feeling |
| `clarification` | Confirm or correct the founder's interpretation |
| `synthesis_request` | Trigger synthesis immediately (founder is done) |
| `answer` + contradiction | Stream a gentle clarification request |
| `answer` + no extraction | Re-ask (miss), or skip after 2 consecutive misses |
| `answer` + extraction | Apply updates, advance state, generate next question |

### 3.4 State Advancement

**File:** `src/lib/discovery/interview-engine.ts`

`applyUpdate()` merges all extracted fields into the belief state
(higher confidence wins), marks all extracted fields as "covered"
in `askedFields`, increments counters, and calls `advance()`.

`advance()` determines the next field to ask about:

1. Hard ceiling check (`MAX_TOTAL_QUESTIONS`)
2. Synthesis readiness check (`canSynthesise()`)
3. Psychological probe injection (one-time, if motivational blocker
   detected)
4. Select next field from current phase's candidates, excluding
   already-asked fields
5. Phase transition if all current-phase fields are covered

### 3.5 Question Generation

**File:** `src/lib/discovery/question-generator.ts`

`generateQuestion()` streams a question via the fallback chain:
Sonnet → Haiku → Gemini Flash. The question prompt includes:
- Current phase and field to ask about
- All known context (wrapped in security delimiters)
- List of already-covered dimensions (so the model doesn't repeat)
- Thread escalation instruction (follow up on competitor mentions)
- Audience-type-specific system prompt

### 3.6 Question Selector

**File:** `src/lib/discovery/question-selector.ts`

`selectNextField()` scores each candidate field by expected
information gain:

```
score = weight × audience_boost × (1 - current_confidence)
```

Fields with high weight and low confidence score highest. Fields
above `MIN_FIELD_CONFIDENCE` score 0 (already known). The field
with the highest score is asked next. Returns `null` when all
candidates are sufficiently known → triggers phase transition.

### 3.7 Synthesis Trigger

Synthesis is triggered when EITHER:
- `canSynthesise()` returns true (required fields above threshold
  AND overall completeness ratio met)
- The founder sends a `synthesis_request` message
- `MAX_TOTAL_QUESTIONS` is reached

When triggered, the turn route:
1. Marks the session COMPLETE in Postgres
2. Fires `discovery/synthesis.requested` via Inngest
3. Streams a reflection (3-5 sentences mirroring the founder's
   situation) directly to the client

---

## 4. The Belief State

**File:** `src/lib/discovery/context-schema.ts`

The `DiscoveryContext` has 14 fields across 4 groups:

### ORIENTATION — who is this person?
- `situation` — current situation in their own words
- `background` — relevant experience and skills
- `whatTriedBefore` — what they have already attempted (array)

### GOAL_CLARITY — what do they actually want?
- `primaryGoal` — the single most important thing
- `successDefinition` — how they would know they succeeded
- `timeHorizon` — their realistic timeline

### CONSTRAINT_MAP — what do they have to work with?
- `availableTimePerWeek` — hours per week
- `availableBudget` — financial resources
- `teamSize` — solo | small_team | established_team
- `technicalAbility` — none | basic | intermediate | strong
- `geographicMarket` — primary market or location

### CONVICTION — how serious are they?
- `commitmentLevel` — exploring | committed | all_in
- `biggestConcern` — what they are most afraid of
- `whyNow` — why they are doing this at this moment

Each field carries: `value` (typed), `confidence` (0-1), and
`extractedAt` (ISO timestamp). An empty context has all values null
and all confidences 0.

### Reading the belief state

Every read site MUST use `safeParseDiscoveryContext()` — never
cast the JSONB column directly. The safeParse returns an empty
context on parse failure so callers never crash on corrupt data.

---

## 5. The Synthesis Pipeline

**File:** `src/inngest/functions/discovery-session-function.ts`
**Engine:** `src/lib/discovery/synthesis-engine.ts`
**Research:** `src/lib/discovery/research-engine.ts`

The Inngest function runs 6 steps:

### Step 1: Load interview state from Redis/Postgres

Reads the completed `InterviewState` and extracts the belief state,
audience type, and session ID.

### Step 2: Summarise context (Sonnet)

`summariseContext()` — takes the raw belief state fields and
produces a 3-5 sentence factual summary. No advice, only facts.
Uses the raw Anthropic SDK (not Vercel AI SDK) with
`withModelFallback` for Haiku fallback on overload.

### Step 3: Eliminate alternatives (Sonnet)

`eliminateAlternatives()` — takes the summary and identifies the
top 3 possible directions. For each: states WHY it does or does not
fit. Ends with "The strongest fit is: [direction] because [reason]."

### Step 4: Research (Tavily)

`runResearch()` — fires up to 3 targeted web search queries based
on the context and the direction identified in Step 3. Queries are
constructed from the belief state fields (market, goal, background).
Fails open — if Tavily is unavailable, synthesis proceeds without
research. Research findings are passed as a block into the final
synthesis prompt with a security note that the block is external
data, not instructions.

### Step 5: Final synthesis (Opus)

`runFinalSynthesis()` — the most important LLM call in the system.
Opus receives: the summary, the analysis, the audience context
block (audience-type-specific framing), and the research findings.
Produces a structured `Recommendation` via `generateObject` against
`RecommendationSchema`.

The prompt enforces:
- Exactly ONE path (no hedging, no menus)
- Every claim references specific context details
- Honest risks and assumptions (not reassuring)
- `whatWouldMakeThisWrong` genuinely challenges the recommendation
- `recommendationType` is classified honestly (build_software,
  build_service, sales_motion, process_change, hire_or_outsource,
  further_research, other)
- 1-3 rejected alternatives with specific reasons

### Step 6: Persist + warm roadmap

The recommendation is upserted to the `Recommendation` table keyed
on `sessionId` (idempotent). Then `discovery/roadmap.requested` is
fired as a speculative warm-up so the roadmap is often ready by the
time the founder clicks accept.

---

## 6. The Recommendation Schema

**File:** `src/lib/discovery/recommendation-schema.ts`

```
RecommendationSchema {
  recommendationType    enum (7 values)
  summary               string (2-3 sentences, the complete conclusion)
  path                  string (the one recommended direction)
  reasoning             string (why this fits this person)
  firstThreeSteps       string[] (2-4 steps)
  timeToFirstResult     string
  risks                 { risk, mitigation }[] (2-5)
  assumptions           string[] (2-6, only load-bearing ones)
  whatWouldMakeThisWrong string
  alternativeRejected   { alternative, whyNotForThem }[] (1-3)
}
```

The `recommendationType` drives downstream UI gating:
- `build_software` → unlocks the validation landing page
- All other types → validation page hidden, different Phase 3
  tools will apply (per the toolkit decision)

---

## 7. The Pushback System

**Route:** `POST /api/discovery/recommendations/[id]/pushback`
**Engine:** `src/lib/discovery/pushback-engine.ts`

### 7.1 Design Philosophy

The pushback system is NOT a chat. It is a structured adversarial
dialogue where the agent defends, refines, or replaces the
recommendation based on the strength of the founder's objection.

Hard rules:
1. NEVER capitulate — changing because the founder pushed, not
   because a real flaw was surfaced, destroys trust
2. NEVER refuse to engage — "let's just go with the original" is
   not an answer
3. On round 2+ of the same objection: do NOT repeat the same
   defense — surface a more concrete fact or refine

### 7.2 The Two-Call Architecture

The pushback was originally a single LLM call with the full
`PushbackResponseSchema` (decision + optional patch). Production
hit "Grammar compilation timed out" because the schema had 9
optional fields with nested objects that blew Opus's grammar
compiler budget.

Fix: split into two calls.

**Call 1 — Decision (always fires):**
Opus receives the belief state, the current recommendation, the
pushback conversation history, and the founder's new message.
Returns:
- `mode` — analytical | fear | lack_of_belief
- `action` — continue_dialogue | defend | refine | replace
- `converging` — boolean (is the conversation moving toward
  resolution?)
- `message` — the agent's response (up to 6000 chars, server-side
  truncated)

**Call 2 — Patch (only fires on commit):**
When action is `refine` or `replace`, a second Opus call generates
the full updated recommendation using `RecommendationSchema` (the
same schema synthesis uses). This eliminates the grammar timeout
because RecommendationSchema is fully required fields with no
optional nesting.

### 7.3 Mode-Specific Behavior

**Analytical mode:** The founder has a specific factual concern
(budget wrong, step not executable). The agent probes the concern,
determines validity, defends if invalid, refines if valid.

**Fear mode:** The founder is not objecting — they are doubting.
The agent names the fear, validates it, then grounds the response
in the founder's OWN context from the belief state. Not generic
encouragement — the founder's own words reflected back as evidence.

**Lack of belief mode:** The founder understands the recommendation
but can't commit. The agent draws on the founder's stated purpose
and reflects it back with conviction.

### 7.4 Concurrency Control

The `Recommendation.pushbackVersion` column is an optimistic lock.
Every pushback write uses `updateMany` with a WHERE clause on the
current version. If another request raced between read and write,
the update affects 0 rows → 409 Conflict → client refetches.

### 7.5 Version History

Every commit (refine or replace) appends a snapshot of the
pre-update state to `Recommendation.versions[]` (JSONB array).
The data is preserved but no UI renders the history yet (deferred
to the pushback version-history UI in the Phase 3 toolkit vision).

### 7.6 Round Caps

- **Soft warn** (round 4): If the agent detects the conversation
  is circling (converging=false), it injects a re-frame: "What
  would it take for you to feel confident enough to move forward?"
- **Hard cap** (round 7): The route builds a closing message
  (not from the model), fires `discovery/pushback.alternative.requested`
  via Inngest, and returns `closing: true`. The Inngest function
  generates a fresh alternative recommendation using the full
  synthesis pipeline but grounded in the pushback conversation.

### 7.7 Roadmap Staleness

When a pushback refine or replace commits after a roadmap has
already been generated, the route marks the roadmap as STALE.
The roadmap viewer shows a banner prompting the founder to
regenerate. The validation page CTA is hidden until the roadmap
is regenerated and the founder re-accepts.

---

## 8. The Fallback Chain

**File:** `src/lib/ai/question-stream-fallback.ts`

All streaming question/response generators go through:

```
Sonnet → (2s backoff) → Sonnet retry
       → Haiku  → (2s backoff) → Haiku retry
       → Gemini Flash → (2s backoff) → Gemini retry
```

`maxRetries: 0` on each `streamText` call disables the AI SDK's
internal retry. Our chain owns retry semantics. Total worst case:
~64 seconds across 3 providers.

**File:** `src/lib/ai/with-model-fallback.ts`

All `generateObject` calls use `withModelFallback()`:

```
Primary model → on overload → Fallback model (single retry)
```

Overload detection: `AI_RetryError`, `AI_APICallError`, status 529,
or message matching `/overloaded/i`.

---

## 9. The Session Store

**File:** `src/lib/discovery/session-store.ts`

Redis is the cache, Postgres is the source of truth. `getSession()`
tries Redis first; on miss OR exception, rehydrates from the
`DiscoverySession` row in Postgres and re-warms Redis.

The 15-minute sliding TTL is a contract: every successful Redis
read resets the TTL. A founder who pauses for >15 minutes loses
the Redis entry but NOT the session — rehydration from Postgres
is transparent and automatic.

---

## 10. Audience Detection

**File:** `src/lib/discovery/context-extractor.ts`

`detectAudienceType()` classifies the founder into one of 5 types
after the 2nd exchange. The classification influences:
- Field importance weights in `selectNextField()` (different
  audience types get different field boost multipliers)
- The audience-specific framing block in the synthesis prompt
- The audience-specific roadmap rules in the roadmap engine

Types:
- LOST_GRADUATE — no direction, build momentum through action
- STUCK_FOUNDER — has tried, stalled, needs a different structure
- ESTABLISHED_OWNER — has a business, needs strategic leverage
- ASPIRING_BUILDER — clear idea, needs to validate and execute
- MID_JOURNEY_PROFESSIONAL — employed, managing a transition

---

## 11. Key Constants

**File:** `src/lib/discovery/constants.ts`

| Constant | Value | Purpose |
|---|---|---|
| `MAX_TOTAL_QUESTIONS` | 15 | Hard ceiling — never ask more |
| `MIN_FIELD_CONFIDENCE` | 0.5 | Below this, the field is "unknown" |
| `SYNTHESIS_READINESS_RATIO` | 0.65 | Overall completeness needed for synthesis |
| `SESSION_TTL_SECONDS` | 900 | 15-minute Redis TTL |
| `QUESTION_MAX_TOKENS` | 1000 | Streaming response cap |
| `MODELS.INTERVIEW` | claude-sonnet-4-6 | Question generation, extraction |
| `MODELS.SYNTHESIS` | claude-opus-4-6 | Final recommendation, pushback |
| `MODELS.INTERVIEW_FALLBACK_1` | claude-haiku-4-5 | First fallback |
| `MODELS.INTERVIEW_FALLBACK_2` | gemini-2.5-flash | Second fallback |

---

## 12. Hard Data Invariants

Three invariants that must NEVER break:

1. **Consent gate:** `RecommendationOutcome` rows where
   `consentedToTraining = false` must NEVER have a non-null
   `anonymisedRecord`. The write path enforces this — the
   `anonymisedRecord` variable is set from server state before the
   single create call.

2. **Pushback optimistic lock:** `Recommendation.pushbackVersion`
   is the row-level lock for concurrent pushback writes. Removing
   it would silently corrupt history.

3. **Fallback chain:** Sonnet → Haiku → Gemini Flash for question
   generation. The chain is critical resilience infrastructure —
   when Anthropic is overloaded, the founder's interview continues
   on a different provider.

---

*Written April 10, 2026. Covers the system as built after the
seven-stage cleanup, five-pass bulletproofing, and evaluation
findings fixes.*
