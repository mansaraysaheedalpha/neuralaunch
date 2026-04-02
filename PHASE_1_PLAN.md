# Phase 1 — Conversational Discovery Engine
## Master Build Plan

> **Reference this file at the start of every session.**
> Check off tasks as they complete. Never skip ahead.
> Branch: `feature/phase-1-discovery-engine`

---

## Principles (Non-negotiable on every task)
- **Reliability** — every external I/O is handled explicitly, no silent failures
- **Security** — all input validated at API boundary, no secrets in logs
- **Scalability** — streaming only, no buffered AI responses, rate limits on all AI routes
- **Maintainability** — max 300 lines/file, one responsibility per module, explicit types
- **Performance** — Server Components for data, `use()` hook for promises, no `useEffect` fetching

---

## Stack for Phase 1
| Tool | Version | Purpose |
|---|---|---|
| Vercel AI SDK | `ai@6` + `@ai-sdk/anthropic@3` | Streaming, `generateObject`, `streamText` |
| Anthropic | Claude Sonnet 4.6 | Interview questions, extraction |
| Anthropic | Claude Opus 4.6 | Final synthesis only |
| Inngest | v4.1.1 | Durable execution, `useAgent` streaming |
| Zod | v4.1.x | Belief state schema, all validation |
| Prisma | v6.19.0 | `DiscoverySession` + `Recommendation` models |
| Upstash Redis | latest | Session state, sliding 15-min TTL |
| Motion | v12 | `motion/react` import — recommendation reveal |
| shadcn/ui | v4 | Chat, Timeline, Stepper components |

---

## STAGE 0 — Foundation (Prerequisite Setup)

- [x] Read COMPREHENSIVE_RESEARCH.md + TOOL_RESEARCH.md
- [x] Write CLAUDE.md (engineering principles + file size limits)
- [x] Create dev branch, sync main → dev, push
- [x] Create `feature/phase-1-discovery-engine` from dev, push
- [x] Install `ai@6` + `@ai-sdk/anthropic@3`
- [x] Upgrade Inngest v3 → v4 (all 19 `createFunction` calls migrated)
- [ ] Fix pre-existing Prisma `Prisma` namespace import errors (affects 8 files)
- [ ] Run `pnpm tsc --noEmit` — get to zero Inngest/SDK errors, document remaining pre-existing errors
- [ ] Commit Stage 0 to feature branch

---

## STAGE 1 — Belief State Schema (Foundation of Phase 1)

> Files live in `client/src/lib/discovery/`
> Max 150 lines per schema file, 300 per engine file

- [ ] Create `client/src/lib/discovery/` directory structure with `index.ts` barrel
- [ ] Write `context-schema.ts` — Zod v4 `DiscoveryContextSchema` (belief state)
  - Fields: `situation`, `goal`, `constraints`, `conviction`, `triedBefore`, `completenessScore`
  - Each field: value + `confidence: number` (0–1)
  - Export: `DiscoveryContext` TypeScript type inferred from schema
- [ ] Write `constants.ts` — interview phase names, confidence thresholds, model IDs
- [ ] Write `recommendation-schema.ts` — Zod v4 `RecommendationSchema`
  - Fields: `path`, `reasoning`, `risks`, `assumptions`, `whatWouldMakeThisWrong`

---

## STAGE 2 — Interview Engine (State Machine)

- [ ] Write `interview-engine.ts` — TypeScript state machine
  - Phases: `ORIENTATION` → `GOAL_CLARITY` → `CONSTRAINT_MAP` → `CONVICTION` → `SYNTHESIS`
  - Each phase: entry condition, questions to resolve, exit condition
  - No LangGraph — pure TypeScript switch/transition logic
- [ ] Write `question-selector.ts` — information gain scoring
  - Scores each unknown field in `DiscoveryContext` by importance × missingness
  - Returns the highest-priority field to ask about next
  - Implements the `ReSpAct` assumption guard: never advances without filling required fields
- [ ] Write `assumption-guard.ts` — blocks synthesis if required fields below confidence threshold
  - Hard-coded thresholds per field (from constants.ts)
  - Returns list of fields still needed before synthesis is allowed

---

## STAGE 3 — Synthesis Engine (The Recommendation)

- [ ] Write `synthesis-engine.ts` — 3-step prompt chain
  - Step 1: Summarize gathered context (strip conversational noise)
  - Step 2: Map against recommendation space, eliminate alternatives
  - Step 3: Output ONE recommendation via `generateObject` with `RecommendationSchema`
  - Uses `claude-opus-4-6` with `thinking: { type: 'enabled', effort: 'high' }`
  - Explicitly forbidden from outputting multiple options or hedging language

---

## STAGE 4 — Database Models

- [ ] Add `DiscoverySession` model to `prisma/schema.prisma`
  - Fields: `id`, `userId`, `conversationId`, `phase`, `beliefState Json`, `questionHistory Json`, `isComplete`, `createdAt`, `updatedAt`
- [ ] Add `Recommendation` model to `prisma/schema.prisma`
  - Fields: `id`, `discoverySessionId`, `path`, `reasoning`, `risks`, `assumptions`, `whatWouldMakeThisWrong`, `createdAt`
- [ ] Run `pnpm prisma migrate dev --name add_discovery_session`
- [ ] Verify migration applied cleanly

---

## STAGE 5 — Session Continuity (Redis)

- [ ] Write `session-store.ts` in `client/src/lib/discovery/`
  - `getSession(sessionId)` — reads from Redis, falls back to DB
  - `saveSession(sessionId, context)` — writes to Redis with 15-min sliding TTL
  - `deleteSession(sessionId)` — cleanup on completion
  - Uses `@upstash/redis` HTTP client (Edge-compatible)

---

## STAGE 6 — API Route Rewrite

- [ ] Audit existing `client/src/app/api/chat/route.ts` — document what to preserve
- [ ] Rewrite `client/src/app/api/chat/route.ts` using Vercel AI SDK v6 `streamText`
  - Auth check first (NextAuth session)
  - Rate limiting (existing `rate-limit.ts`)
  - Load or create `DiscoverySession` from Redis/DB
  - Call `InterviewEngine` to determine next question
  - Stream response via `streamText` with `@ai-sdk/anthropic`
  - On each turn: extract entities via `generateObject`, update belief state, save session
  - When `AssumptionGuard` clears: trigger synthesis, save `Recommendation`
  - Max 150 lines — orchestration only, no implementation logic in route

---

## STAGE 7 — Inngest Function (Phase 1)

- [ ] Write `client/src/inngest/functions/discovery-session-function.ts`
  - Event: `discovery/session.synthesize`
  - Durable synthesis step — runs `SynthesisEngine` in a background Inngest step
  - Stores result to `Recommendation` table
  - Sends `discovery/session.complete` event when done
- [ ] Register new function in `client/src/app/api/inngest/route.ts`
- [ ] Add new event types to `client/src/inngest/client.ts` `AgentEvents` type

---

## STAGE 8 — Frontend: Discovery UI
> **Assigned to: new session (give user the prompt)**

- [ ] Prepare frontend session prompt for user (covers WS3 in strategic plan)
  - New `/generate` page (clean entry, no form, starts conversation)
  - `DiscoveryChat` component (Vercel AI SDK `useChat` hook)
  - `ContextProgress` component (what the system knows, fills live)
  - `ThinkingPanel` component (collapsible chain-of-thought)
  - `PhaseIndicator` component (which interview phase user is in)

---

## STAGE 9 — Frontend: Recommendation Reveal
> **Assigned to: new session (after Stage 8 is done)**

- [ ] Prepare recommendation reveal session prompt for user (covers WS4 in strategic plan)
  - `RecommendationReveal` component (Motion v12, animated reveal)
  - `ReasoningBreakdown` component (why this fits you specifically)
  - `RiskCallouts` component
  - `AssumptionDisclosure` component
  - `/recommendation/[id]` page (shareable URL)

---

## STAGE 10 — Integration & Verification

- [ ] Wire `DiscoverySession` to existing `Conversation` model (link foreign key)
- [ ] End-to-end test: arrive → be asked questions → receive one recommendation
- [ ] `pnpm tsc --noEmit` — zero errors
- [ ] `pnpm lint` — zero warnings
- [ ] `pnpm build` — successful production build
- [ ] Commit all Phase 1 work to `feature/phase-1-discovery-engine`
- [ ] Open PR: `feature/phase-1-discovery-engine` → `dev`

---

## Current Status

**Last completed:** Stage 0 — Inngest v4 migration (all 19 functions)
**Currently working on:** Stage 0 — Fix pre-existing Prisma import errors, then clean tsc run
**Next after current:** Stage 1 — Belief State Schema

---

## Notes & Decisions Log

| Date | Decision | Reason |
|---|---|---|
| 2026-04-02 | No LangGraph for interview engine | AIMessageChunk/AI type mismatch with Vercel AI SDK streaming |
| 2026-04-02 | Inngest v4 + useAgent for orchestration | Native durability + parts-based streaming, already in stack |
| 2026-04-02 | `ai@6` installed (not v5) | v6 is current latest; v5 was research document's reference point |
| 2026-04-02 | Opus 4.6 for synthesis only | Cost control — Sonnet 4.6 for all interview/extraction steps |
| 2026-04-02 | Pusher stays for Phase 1 | Ably migration is Phase 2+ concern |
