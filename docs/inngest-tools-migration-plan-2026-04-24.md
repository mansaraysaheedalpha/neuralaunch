# Inngest Tools Migration — Delivery Plan

**Started:** 2026-04-24
**Status:** Planning → ready to execute
**Initiator:** Production reliability — synchronous LLM tool calls keep
hitting Vercel's 300s ceiling and 504-ing. The user explicitly rejected
"cut the step budget" as a permanent fix and authorised the full
Inngest migration with push notifications + step-progress UI.

This doc is the **canonical context handoff** in case the conversation
compacts mid-execution. A fresh Claude reading only this file should be
able to pick up at the next unfinished todo.

---

## Goal

Move every long-running server-side LLM call out of the synchronous
serverless route handler and into a durable Inngest function. Result:
no more 300s timeouts, no more "coin flip" reliability, no more
silently-truncated work. The route handler returns immediately with a
`jobId`; the client polls a status endpoint and renders step-by-step
progress; Inngest fires a push notification on completion regardless
of whether the user is still on the page.

The user's exact framing: "this is about reliability of the system not
crashing in production under any circumstance."

---

## Scope decisions (locked-in answers from user)

1. **Migrate everything long-running, not just tools.** Any route that
   makes an LLM call with `maxDuration ≥ 120s` is in scope. Short
   conversational turns (Coach roleplay per turn, Composer context
   exchange, Packager context exchange) stay synchronous — they're fast
   and low-risk.
2. **Push notifications for both Execute and Compound tiers.** No tier
   gate. Existing `sendPushToUser()` helper already respects per-user
   `nudgesEnabled` preference and registered device tokens, so wiring
   it in covers both tiers transparently.
3. **Polling cadence: 3s when page is foregrounded, 30s when
   backgrounded, hard stop at 6 minutes.** (The user accepted this as
   recommended.)
4. **Step-by-step progress visualisation modeled after the
   recommendation generation UX.** The recommendation flow already
   uses a `synthesisStep` field on `DiscoverySession` that the client
   polls and renders as a progress ladder. Same pattern here, scoped
   per tool job.

## Migration inventory

### Already in Inngest (no work needed)

- `discoverySessionFunction` — synthesis pipeline
- `roadmapGenerationFunction` — generates the execution roadmap
- `pushbackAlternativeFunction` — alternative recommendation on the
  closing pushback round
- `continuationBriefFunction` — post-roadmap continuation brief
- `validationLifecycleFunction` + `validationReportingFunction` —
  validation page lifecycle + reporting
- `roadmapNudgeFunction` — daily nudge sweep
- `lifecycleTransitionFunction` — venture lifecycle transitions
- `usageAnomalyDetectionFunction` — fraud/abuse detection
- `paddleReconciliationFunction` — billing reconciliation
- `backfillRoadmapTaskIdsFunction` — one-shot data backfill

### To migrate (in scope for this work)

| # | Route | Current `maxDuration` | Why migrate |
|---|---|---|---|
| 1 | `/api/discovery/roadmaps/[id]/research/execute` | 300 | Confirmed 504s in production (2026-04-23, 2026-04-24) |
| 2 | `/api/discovery/roadmaps/[id]/research/followup` | 300 | Same architecture as execute, same risk |
| 3 | `/api/discovery/roadmaps/[id]/coach/prepare` | 300 | Research-tool integration, can hit ceiling |
| 4 | `/api/discovery/roadmaps/[id]/coach/debrief` | 300 | Long structured emission |
| 5 | `/api/discovery/roadmaps/[id]/composer/generate` | 300 | Two-phase + research tools |
| 6 | `/api/discovery/roadmaps/[id]/composer/regenerate` | 300 | Single-message regeneration but uses tools |
| 7 | `/api/discovery/roadmaps/[id]/packager/generate` | 300 | Research tools + structured output |
| 8 | `/api/discovery/roadmaps/[id]/packager/adjust` | 300 | Can use research tools |

Plus the **task-launched variants** of each (under
`/tasks/[taskId]/`). 16 routes total to refactor.

### Stays synchronous (out of scope, fast enough)

- `/api/discovery/roadmaps/[id]/research/plan` — 30s, fast plan
  generation
- `/api/discovery/roadmaps/[id]/coach/setup` — short conversational
  turn
- `/api/discovery/roadmaps/[id]/coach/roleplay` — per-turn, fast
- `/api/discovery/roadmaps/[id]/composer/mark-sent` — 10s, just a
  DB write
- `/api/discovery/roadmaps/[id]/diagnostic` — short conversational
  turn
- All session-list and single-session GET endpoints

---

## Architecture

### Job lifecycle

```
[client] POST /api/.../tool/execute    →  202 { jobId, sessionId }
                                                    │
[server] inngest.send('tool.execution.requested')   │
                                                    ▼
[inngest worker]
  step.run('mark-queued')    → ToolJob.stage = 'queued'
  step.run('load-context')   → ToolJob.stage = 'context_loaded'
  step.run('phase1-research') → ToolJob.stage = 'researching'
  step.run('phase2-emit')    → ToolJob.stage = 'emitting'
  step.run('persist-result') → ToolJob.stage = 'persisting'
                              → roadmap.toolSessions write
  step.run('notify-user')    → sendPushToUser(...)
                              → ToolJob.stage = 'complete'

[client] GET /api/.../tool/jobs/[jobId]/status (polling)
   → { stage: 'researching', startedAt, ... }
   → ...eventually { stage: 'complete', sessionId }
   → fetch single-session GET to load result
```

### New Prisma model: ToolJob

```prisma
model ToolJob {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  roadmapId   String
  toolType    String   // 'research_execute' | 'research_followup' |
                      // 'composer_generate' | etc.
  sessionId   String   // The roadmap.toolSessions entry being built
  taskId      String?  // Set for task-launched variants
  stage       String   // 'queued' | 'context_loaded' | 'researching' |
                      //  'emitting' | 'persisting' | 'complete' | 'failed'
  errorMessage String?
  startedAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  completedAt DateTime?

  @@index([userId, stage])
  @@index([roadmapId])
  @@index([sessionId])
}
```

This is the **single source of truth for step progress** that powers
the polling endpoint and the in-app banner.

### New helper: tool-job library

`client/src/lib/tool-jobs/` containing:

- `index.ts` — barrel export
- `schemas.ts` — `ToolJobStage` enum, ToolJobSchema, ToolJobUpdateSchema
- `helpers.ts` — `createToolJob()`, `updateToolJobStage()`,
  `failToolJob()`, `completeToolJob()`. Each does the Prisma write +
  emits a structured log line. **Never throws** — caller passes errors
  through but the job-status update itself is best-effort.
- `notifications.ts` — `notifyToolJobComplete(job)` — sends the push,
  reusing existing `sendPushToUser()` from `lib/push/send-push.ts`.
  Composes the right title/body per tool type.

### New API routes

- `GET /api/discovery/roadmaps/[id]/tool-jobs/[jobId]/status`
  - Returns `{ stage, sessionId, errorMessage?, startedAt,
    updatedAt, completedAt? }`
  - `findFirst({ where: { id: jobId, userId } })` ownership scope
  - `RATE_LIMITS.API_READ` (120/min — well above polling load)
- `GET /api/discovery/roadmaps/[id]/tool-jobs?stage=running`
  - Lists in-flight jobs for the global "background work in progress"
    banner. Cap 20.

### New Inngest events

```ts
// Add to NeuraLaunchEvents in src/inngest/client.ts

'tool/research-execute.requested': {
  data: { jobId: string; userId: string; roadmapId: string;
          sessionId: string; planText: string };
};
'tool/research-followup.requested': {
  data: { jobId: string; userId: string; roadmapId: string;
          sessionId: string; query: string };
};
'tool/composer-generate.requested': {
  data: { jobId: string; userId: string; roadmapId: string;
          sessionId: string; context: ComposerContext;
          mode: ComposerMode; channel: ComposerChannel };
};
// ... and so on for each migrated route
```

### New Inngest functions

One function per migrated route, all in
`client/src/inngest/functions/tools/`. Each:

1. Reads job + input from event data
2. Calls `markStage('context_loaded')`
3. Loads context (tier check, ownership check, recommendation
   read, etc.)
4. Calls `markStage('researching')`
5. Invokes the existing engine function (`runResearchExecution`,
   `runComposerGeneration`, etc.)
6. Calls `markStage('emitting')` (when phase 1 returns and phase 2
   begins) — engines need a small refactor to accept an optional
   `onPhaseTransition` callback so they can report between phases
7. Calls `markStage('persisting')` and writes to
   `roadmap.toolSessions`
8. Calls `notifyToolJobComplete(job)` to fire push
9. Calls `markStage('complete')`

Errors anywhere → `failToolJob(jobId, errorMessage)` and
`markStage('failed')`. The push notification on failure is a
"something went wrong, tap to retry" message.

### Refactored route handlers

Each migrated POST route shrinks to:

```ts
// Validate request, ownership, tier, cycle quota
// Create ToolJob row in 'queued' state
// Fire the Inngest event
// Return 202 { jobId, sessionId } — done in < 1 second
```

The same `runX()` engine functions stay untouched — the Inngest
function calls them in `step.run` blocks.

### Client polling hook

`client/src/lib/tool-jobs/use-tool-job.ts`:

```ts
useToolJob(jobId: string | null): {
  stage: ToolJobStage | null;
  errorMessage: string | null;
  result: ToolResult | null; // populated on stage === 'complete'
  isPolling: boolean;
};
```

Internally:
- SWR with conditional polling: 3s when `document.visibilityState === 'visible'`, 30s when hidden
- Stops polling on terminal states (`complete`, `failed`)
- Stops polling after 6 minutes regardless (long-tail safety)
- On `complete`, fetches the single-session GET to load result, exposes via `result`

### Client UI: step-progress ladder

Mimics the discovery synthesis flow's progress display. Rendered by
`client/src/components/tool-jobs/ToolJobProgress.tsx`:

- 5-step ladder showing: Queued → Loading context → Researching →
  Writing report → Done
- Active step animated, completed steps checkmarked, pending steps
  greyed
- Error state shows the error message + a "Try again" button that
  re-fires the request

### Client UI: global "background work" banner

Rendered by `client/src/components/tool-jobs/BackgroundJobsBanner.tsx`,
mounted in the app shell. Shows when any user job is in
`stage in ('queued', 'context_loaded', 'researching', 'emitting')`.
Click jumps to the tool's progress page. Disappears on completion of
all running jobs.

---

## Order of execution (waves)

### Wave 1 — Infrastructure + Research migration (proof of concept)

Justifies all the abstractions before applying to 7 more routes.

1. Add `ToolJob` Prisma model + migration
2. Build `lib/tool-jobs/` helpers (`createToolJob`, `updateToolJobStage`,
   `failToolJob`, `completeToolJob`, `notifyToolJobComplete`)
3. Add status GET endpoint
4. Add `useToolJob` hook + `ToolJobProgress` component
5. Add Inngest events for `tool/research-execute.requested` and
   `tool/research-followup.requested` to `NeuraLaunchEvents`
6. Build `inngest/functions/tools/research-execute-job.ts` +
   `research-followup-job.ts`
7. Refactor `/api/discovery/roadmaps/[id]/research/execute` and
   `/followup` to fire Inngest events + return 202 immediately
8. Update both task-launched variants the same way
9. Update standalone Research page to use the new polling/progress UX
10. Test end-to-end with the Amara persona

### Wave 2 — Composer + Packager + Coach migrations

Same pattern as Wave 1 applied to the other six routes (and their
task-launched variants).

### Wave 3 — Polish

- Global background-jobs banner
- Failure-retry button on the progress UI
- Mobile push integration (uses same `sendPushToUser`)

### Wave 4 — Cleanup

- Remove the `maxDuration = 300` from migrated routes (drop to
  `maxDuration = 30` since they're just queueing now)
- Update CLAUDE.md with the new pattern + reference doc
- Remove the B8 backlog item (now done)

---

## Files to create (Wave 1 only)

```
client/prisma/schema.prisma                           # Add ToolJob model
client/prisma/migrations/[next]/migration.sql         # Generated migration
client/src/lib/tool-jobs/index.ts                     # Barrel
client/src/lib/tool-jobs/schemas.ts                   # Zod + types
client/src/lib/tool-jobs/helpers.ts                   # CRUD + state transitions
client/src/lib/tool-jobs/notifications.ts             # Push wiring
client/src/lib/tool-jobs/use-tool-job.ts              # Client polling hook
client/src/components/tool-jobs/ToolJobProgress.tsx   # Progress ladder
client/src/inngest/functions/tools/research-execute-job.ts
client/src/inngest/functions/tools/research-followup-job.ts
client/src/app/api/discovery/roadmaps/[id]/tool-jobs/[jobId]/status/route.ts
client/src/app/api/discovery/roadmaps/[id]/tool-jobs/route.ts  # List
```

## Files to modify (Wave 1 only)

```
client/src/inngest/client.ts                          # Add 2 new events
client/src/inngest/functions/index.ts                 # Export new functions
client/src/app/api/inngest/route.ts                   # Register new functions
client/src/app/api/discovery/roadmaps/[id]/research/execute/route.ts
client/src/app/api/discovery/roadmaps/[id]/research/followup/route.ts
client/src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/research/execute/route.ts
client/src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/research/followup/route.ts
client/src/app/(app)/tools/research/page.tsx          # Wire useToolJob
client/src/app/(app)/discovery/roadmap/[id]/research/useResearchFlow.ts
client/src/app/(app)/discovery/roadmap/[id]/research/ResearchFlow.tsx
```

---

## Pass criteria (Wave 1)

1. Founder fires research → page shows step-progress ladder advancing
   through 5 stages → completes successfully → result loads
2. Founder fires research → navigates to /tools (or any other page)
   → after ~60s, push notification arrives → result is available in
   the Recent research sidebar when they return
3. Research request that previously 504'd (heavy 25-step query) now
   completes successfully because there's no 300s ceiling
4. Failure path: simulate engine throw → ToolJob marked 'failed' →
   error surfaces in the progress UI → "Try again" button re-fires
   correctly
5. Polling stops on terminal states (no infinite SWR loop)
6. Polling adapts to tab visibility (3s active, 30s hidden)
7. Hard stop at 6 minutes if the job genuinely hangs

---

## Open questions (none — all locked)

The user answered all four scoping questions in their message of
2026-04-24:

1. Q: Just Research or all long-running? → **All long-running, not
   just tools** ("this is about reliability of the system not crashing
   in production under any circumstance")
2. Q: Push for Compound only or both? → **Both Execute AND Compound**
3. Q: Polling cadence? → **Accepted my recommendation (3s/30s/6min)**
4. Q: ~1 day effort OK? → **No problems at all**
5. Q: Step-progress visualisation? → **Yes, like recommendation
   generation**

---

## Memory items (for future Claude)

- The user is testing in production at `startupvalidator.app`
- Existing Inngest functions are good reference patterns —
  particularly `discoverySessionFunction` (which already does the
  synthesisStep stages this work mirrors)
- Push helper is `sendPushToUser(userId, title, body, data?)` from
  `lib/push/send-push.ts` — already respects `nudgesEnabled`
- Research engine is `runResearchExecution()` from
  `lib/roadmap/research-tool/execution-engine.ts` — already split into
  Phase 1 (tool loop, Opus) + Phase 2 (emission, Sonnet)
- Don't bypass `withModelFallback` — every LLM call inside the new
  Inngest functions still wraps in it
- Don't use `.int()` on numeric fields in any new Output.object schemas
  (per the rule shipped in efa48d3 today)
- New routes follow the standard CSRF + rate-limit + ownership pattern
  from CLAUDE.md
- The ResearchHistoryPanel + CoachHistoryPanel + ComposerHistoryPanel +
  PackagerHistoryPanel are already in place — they need to learn to
  show "in progress" status for any session backed by an in-flight
  ToolJob (Wave 3 polish)

---

*Plan written 2026-04-24 ahead of context compaction. Execute in order;
each wave is committable independently.*
