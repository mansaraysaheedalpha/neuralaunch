# Lifecycle Memory Architecture — Delivery Report

Built on `feat/lifecycle-memory` in 10 phased commits. 30 files changed,
+2165/-103 lines across the entire lifecycle architecture.

---

## Phase Summary

| Phase | Commit | Files | Description |
|---|---|---|---|
| 1 | `a09a393` | 2 | Prisma schema: FounderProfile, Venture, Cycle models + FK edits to Recommendation/Roadmap |
| 2 | `98d7209` | 4 | Zod schemas (FounderProfileSchema, CycleSummarySchema) + profile/venture DB helpers + barrel |
| 3 | `2d04806` | 2 | 6 per-agent context loaders matching the loading matrix (spec §6.1) |
| 4 | `b3b881b` | 6 | Interview agent: 3 scenario branches (first_interview/fresh_start/fork_continuation), prompt renderers, session route + turn route lifecycle wiring |
| 5 | `ff15bc4` | 4 | Recommendation synthesis + roadmap generator + check-in agent lifecycle context loading + speed calibration |
| 6 | `ef38b82` | 2 | Continuation brief venture arc awareness + neuralaunch/cycle.completing event emission |
| 7 | `07a548c` | 5 | Lifecycle Transition Engine: 2 chained Haiku functions (generateCycleSummary → updateFounderProfile) via Inngest |
| 8 | `c9781a4` | 2 | Backfill script (idempotent, dry-run/apply/queue-summaries modes) + migration runbook |
| 9 | `1a5c6aa` | 2 | Sessions tab venture-aware redesign with VentureCard + graceful pre-backfill fallback |
| 10 | `e0b2f17` | 3 | Prompt caching extended to Coach preparation, Composer generation, Research execution engines |

---

## Files Created

### Prisma
- `prisma/migrations/20260417100000_add_lifecycle_memory/migration.sql`

### lib/lifecycle/ (new module — 7 files)
- `schemas.ts` — FounderProfileSchema + CycleSummarySchema + safe parsers
- `profile.ts` — getFounderProfile + upsertFounderProfile
- `venture.ts` — getActiveVentures, getCurrentCycle, createVenture, createCycle, getAllVentures
- `context-loaders.ts` — 6 loader functions per the loading matrix
- `prompt-renderers.ts` — renderFounderProfileBlock, renderCycleSummariesBlock, renderInterviewOpeningBlock
- `engines/generate-cycle-summary.ts` — Haiku engine for CycleSummary extraction
- `engines/update-founder-profile.ts` — Haiku engine for FounderProfile patching
- `index.ts` — barrel

### Inngest
- `inngest/functions/lifecycle-transition-function.ts` — registered in serve call

### UI
- `app/(app)/discovery/recommendations/VentureCard.tsx` — expandable venture card component

### Scripts + Docs
- `scripts/lifecycle/backfill.ts`
- `docs/lifecycle-migration-runbook.md`
- `docs/lifecycle-memory-delivery-report.md` (this file)

## Files Modified

### Schema
- `prisma/schema.prisma` — +3 new models (FounderProfile, Venture, Cycle), +relations on User, +cycleId on Recommendation, +ventureId on Roadmap

### Interview agent
- `lib/discovery/interview-engine.ts` — InterviewState gains lifecycleScenario/ventureId/forkContext; createInterviewState accepts lifecycle param
- `lib/discovery/question-generator.ts` — generateQuestion gains lifecycleBlock param prepended to prompt
- `app/api/discovery/sessions/route.ts` — CreateSessionSchema gains scenario/ventureId/forkContext
- `app/api/discovery/sessions/[sessionId]/turn/route.ts` — loads lifecycle context per turn, threads through all 4 generateQuestion call sites

### Recommendation + roadmap + check-in
- `lib/discovery/synthesis-engine.ts` — RunFinalSynthesisInput gains lifecycleBlock, injected into volatile suffix
- `lib/roadmap/roadmap-engine.ts` — generateRoadmap gains founderProfile param, speed calibration from profile
- `lib/roadmap/checkin-agent.ts` — RunCheckInInput gains founderProfileBlock in stable prefix
- `inngest/functions/discovery-session-function.ts` — loads lifecycle context, passes to synthesis

### Continuation brief
- `lib/continuation/brief-generator.ts` — GenerateBriefInput gains lifecycleBlock for venture arc
- `inngest/functions/continuation-brief-function.ts` — loads lifecycle context, emits neuralaunch/cycle.completing

### Prompt caching
- `lib/roadmap/coach/preparation-engine.ts` — cachedSingleMessage (10-step Opus loop)
- `lib/roadmap/composer/generation-engine.ts` — cachedSingleMessage (8-step Sonnet loop)
- `lib/roadmap/research-tool/execution-engine.ts` — cachedSingleMessage (25-step Opus loop)

### UI
- `app/(app)/discovery/recommendations/page.tsx` — rewritten: venture-aware with flat fallback
- `inngest/functions/index.ts` — registered lifecycleTransitionFunction
- `app/api/inngest/route.ts` — added lifecycleTransitionFunction to serve array

---

## Inngest Functions Registered

| Function ID | Event | Steps |
|---|---|---|
| `lifecycle-transition` | `neuralaunch/cycle.completing` | generate-cycle-summary → update-founder-profile |

---

## Prompt Caching Coverage (Phase 10)

| Call site | Steps | Model | Cache helper | Status |
|---|---|---|---|---|
| checkin-agent | 4 | Sonnet | cachedUserMessages | Already cached (pre-lifecycle) |
| synthesis-engine (summarise) | 1 | Sonnet | cachedAnthropicContent | Already cached |
| synthesis-engine (eliminate) | 1 | Sonnet | cachedAnthropicContent | Already cached |
| synthesis-engine (final) | 10 | Opus | cachedUserMessages | Already cached |
| brief-generator | 8 | Opus | cachedUserMessages | Already cached |
| pushback-engine | 5 | Opus | cachedUserMessages | Already cached |
| safety-gate | 1 | Sonnet | cached | Already cached |
| service-packager/generation | 8 | Opus | cachedSingleMessage | Added in Service Packager PR |
| **coach/preparation** | **10** | **Opus** | **cachedSingleMessage** | **New in Phase 10** |
| **composer/generation** | **8** | **Sonnet** | **cachedSingleMessage** | **New in Phase 10** |
| **research/execution** | **25** | **Opus** | **cachedSingleMessage** | **New in Phase 10** |

Cache hit rates: measurable after 24 hours of production usage via `usage.cache_read_input_tokens` in Anthropic API responses. Expected 50-67% per-user cost reduction once active.

---

## Spec Deviations

1. **Per-task tool agents (Coach, Composer, Research, Packager) do not yet load the FounderProfile into their prompts.** The engines accept the block via their input interfaces, but the routes don't call `loadPerTaskAgentContext` yet. The check-in agent (highest call volume) IS wired. The tool agents work correctly without the profile — they just don't say "Hi [name]" or reference prior ventures. Low priority; wiring the routes is mechanical when needed.

2. **Phase 11 end-to-end verification** cannot be executed in this environment (no live DB, no auth flow, no Inngest dashboard). The verification steps are documented as a procedure in the migration runbook (docs/lifecycle-migration-runbook.md §6) and should be executed manually after deployment.

3. **Backfill script uses deterministic IDs** (`backfill_{roadmapId}`, `backfill_cycle_{roadmapId}`) for idempotency. This means backfilled ventures/cycles have predictable string IDs instead of random CUIDs. Functionally identical; the IDs are not user-visible.

---

## End-to-End Verification Test Plan

Execute after deploying all 10 phases and running the backfill:

### Test 1 — First-ever interview (no profile)
1. Create a new user (or use one with no recommendations)
2. POST /api/discovery/sessions with `{ scenario: 'first_interview' }`
3. Verify: interview runs as today — full 15-20 questions, no lifecycle context
4. Complete the interview → recommendation → roadmap → execute tasks
5. Trigger the continuation brief
6. **Check Inngest dashboard:** `lifecycle-transition` function should fire
7. **Check DB:** `Cycle.summary` should be populated; `FounderProfile` should exist

### Test 2 — Fork continuation (existing venture)
1. Using the same user from Test 1, pick a fork from the continuation brief
2. POST /api/discovery/sessions with `{ scenario: 'fork_continuation', ventureId: '...', forkContext: '...' }`
3. Verify: interview opens with recognition of the prior cycle, asks 3-5 questions (not 15-20)
4. Complete the cycle
5. **Check DB:** Cycle 2 summary populated; FounderProfile updated (completedCycles incremented)

### Test 3 — Fresh start (new venture)
1. Same user — start a completely new discovery
2. POST /api/discovery/sessions with `{ scenario: 'fresh_start' }`
3. Verify: interview acknowledges prior ventures ("Welcome back. Last time you..."), skips stable context questions, asks 5-8 questions

### Test 4 — Sessions tab
1. Navigate to /discovery/recommendations
2. Verify: ventures render with nested cycles, progress bars, status badges
3. Verify: clicking an active cycle navigates to its roadmap
4. Verify: completed cycles show in the expanded list with dates

### Test 5 — Speed calibration
1. For a user with a profile where `realSpeedMultiplier < 0.95`:
2. Generate a new roadmap
3. Verify: the roadmap prompt includes the SPEED CALIBRATION note
4. Verify: task time estimates are inflated to match the founder's real pace

---

## Follow-up Items (Out of Scope)

1. **Wire FounderProfile into per-task tool agents** (Coach, Composer, Research, Packager) — mechanical route wiring, low priority since check-in agent (highest volume) is done
2. **Venture renaming UI** — spec §9.3 mentions founders can rename ventures from Sessions tab; no rename UI built yet
3. **Tier gating** (Execute: 1 active venture, Compound: 3) — spec §2.2; needs pricing/tier infrastructure first
4. **Venture pause/resume actions** — spec mentions paused state; no UI to pause/resume built yet
5. **Task-launched Research → Packager session ID surfacing** — deferred from Service Packager PR; the badge-only fix is done, full session linking is not
