# Validation Tool — Architectural Integration Audit

**Date:** 2026-04-20
**Branch:** `audit/validation-tool-integration`
**Scope:** Map how the four roadmap-integrated tools work, contrast with the Validation Tool, and produce a concrete implementation plan to bring validation into the same model.
**Status:** Audit + design only — no code changes.

This document is the spec for a follow-up implementation prompt. It is written to be self-sufficient: every claim carries a `file:line` reference, every recommendation is paired with concrete file changes, and the implementation plan is decomposed into commit-sized steps.

---

## Section 1 — How the four tools are integrated today

### 1.1 Side-by-side comparison

| Dimension | Conversation Coach | Outreach Composer | Research Tool | Service Packager |
|---|---|---|---|---|
| Canonical tool ID | `'conversation_coach'` ([coach/constants.ts:20](../client/src/lib/roadmap/coach/constants.ts#L20)) | `'outreach_composer'` ([composer/constants.ts:24](../client/src/lib/roadmap/composer/constants.ts#L24)) | `'research_tool'` ([research-tool/constants.ts:6](../client/src/lib/roadmap/research-tool/constants.ts#L6)) | `'service_packager'` ([service-packager/constants.ts:11](../client/src/lib/roadmap/service-packager/constants.ts#L11)) |
| Roadmap-generator awareness | Listed in [roadmap-engine.ts:216](../client/src/lib/roadmap/roadmap-engine.ts#L216) | Listed at line 217 | Listed at line 215 | Listed at line 218 |
| Task-binding storage | `task.suggestedTools: string[]` JSON field on each `RoadmapTask` (validated by [api-types/src/roadmap.ts:27-29](../packages/api-types/src/roadmap.ts#L27-L29)) | same | same | same |
| Standalone API (roadmap-level) | `[id]/coach/{setup,prepare,roleplay,debrief}` (4 routes) | `[id]/composer/{generate,regenerate,mark-sent}` (3) | `[id]/research/{plan,execute,followup}` (3) | `[id]/packager/{generate,adjust}` + `sessions` GET (3) |
| Task-scoped API | `[id]/tasks/[taskId]/coach/{setup,prepare,roleplay,debrief}` (4) | `[id]/tasks/[taskId]/composer/{generate,regenerate,mark-sent}` (3) | `[id]/tasks/[taskId]/research/{plan,execute,followup}` (3) | `[id]/tasks/[taskId]/packager/{generate,adjust}` (2) |
| Engine entry point | `coach/setup-engine.ts`, `coach/preparation-engine.ts`, etc. | `composer/generation-engine.ts` | `research-tool/execution-engine.ts` (25-step Opus loop) | `service-packager/generation-engine.ts` (8-step Opus) |
| Task context input shape | `taskContext?: string \| null`, `taskTitle?: string \| null` ([coach/setup-engine.ts:57-58](../client/src/lib/roadmap/coach/setup-engine.ts#L57-L58)) | `taskContext?` field on `OutreachContextSchema` | task description embedded in research plan via prompt | `taskContext?` field on `ServiceContextSchema` |
| Output Zod schema | `CoachSessionSchema` ([coach/schemas.ts:136-147](../client/src/lib/roadmap/coach/schemas.ts#L136-L147)) | `ComposerSessionSchema` ([composer/schemas.ts:100-114](../client/src/lib/roadmap/composer/schemas.ts#L100-L114)) | `ResearchSessionSchema` ([research-tool/schemas.ts:103-113](../client/src/lib/roadmap/research-tool/schemas.ts#L103-L113)) | `PackagerSessionSchema` ([service-packager/schemas.ts:113-122](../client/src/lib/roadmap/service-packager/schemas.ts#L113-L122)) |
| Discriminator literal | `tool: z.literal('conversation_coach')` | `tool: z.literal('outreach_composer')` | `tool: z.literal('research_tool')` | `tool: z.literal('service_packager')` |
| Task-level output storage | `task.coachSession` (JSON object on the task) | `task.composerSession` | `task.researchSession` | `task.packagerSession` |
| Standalone output storage | One element of `roadmap.toolSessions[]` array (mixed-tool, validated by `ToolSessionsArraySchema` ([coach/schemas.ts:158-163](../client/src/lib/roadmap/coach/schemas.ts#L158-L163))) | same | same | same |
| UI launcher button on task card | `<ConversationCoachButton>` + `<CoachFlow>` modal + `<CoachSessionReview>` review card ([TaskToolLaunchers.tsx:66-72](../client/src/app/(app)/discovery/roadmap/[id]/TaskToolLaunchers.tsx#L66-L72)) | analogous Composer trio | analogous Research trio | analogous Packager trio |
| Tier gate at route | `requireTierOrThrow(userId, 'execute')` — applies to all roadmap-level + task-scoped variants of all four tools | same | same | same |

### 1.2 How it actually flows

**a. Roadmap generator awareness — prompt-only.**
There is no in-code "tool registry." The roadmap engine's awareness of these four tools lives entirely in the prompt at [roadmap-engine.ts:211-244](../client/src/lib/roadmap/roadmap-engine.ts#L211-L244):

```
INTERNAL TOOLS AVAILABLE TO THE FOUNDER:

Available tools:
- research_tool: …
- conversation_coach: …
- outreach_composer: …
- service_packager: …

TOOL CHOREOGRAPHY RULES:
1. When multiple tools are suggested on a single task, the task description MUST specify the order …
…

TOOL CHOREOGRAPHY EXAMPLES:
[5 worked examples showing how to compose tools on tasks]
```

**b. Binding decision — pure LLM reasoning.**
The model emits each task with an optional `suggestedTools: string[]` field (see [api-types/src/roadmap.ts:27-29](../packages/api-types/src/roadmap.ts#L27-L29) — the field is typed as `z.array(z.string()).optional()`, deliberately NOT a `z.enum()`, so adding a new tool ID requires no schema migration). There is no post-hoc classifier and no rules engine. The five worked examples in the prompt do all the steering.

**c. UI surfacing — hardcoded button roster.**
[TaskToolLaunchers.tsx:55-87](../client/src/app/(app)/discovery/roadmap/[id]/TaskToolLaunchers.tsx#L55-L87) hardcodes the four tool IDs in two places:

```tsx
const anyToolSuggested = (suggestedTools ?? []).some(
  t => t === 'conversation_coach' || t === 'outreach_composer' ||
       t === 'research_tool'      || t === 'service_packager',
);
```

…followed by four near-identical `<ToolButton>` + `<ToolFlow>` + `<ToolSessionReview>` blocks, each branching on `coachSession`, `composerSession`, `researchSession`, `packagerSession` (lines 45-48). Adding a fifth tool means: append the ID to the `anyToolSuggested` check, add a fifth conditional block.

**d. Task context flow — engine input fields.**
When launched from a task, the task-scoped route reads the task from `roadmap.phases` JSON and threads task title + description into the engine's `taskContext` / `taskTitle` parameters. Example: [coach/setup-engine.ts:84-127](../client/src/lib/roadmap/coach/setup-engine.ts#L84-L127) renders a `TASK CONTEXT (the founder launched from this task card)` block into the system prompt and adjusts behaviour with `'- The founder launched from a task card. Do NOT re-ask…'`. The standalone route omits these fields and the engine asks the four-question setup itself.

**e. Output storage split.**
- **Task-scoped** outputs land on the task JSON: `phases[].tasks[].{coachSession,composerSession,researchSession,packagerSession}`.
- **Standalone** outputs land in `roadmap.toolSessions[]` (a JSON array of mixed-tool entries discriminated by their `tool` literal).

### 1.3 Inconsistencies worth flagging (prior-art cleanup, not in scope here)

1. **Per-tool task fields vs. uniform `task.toolSessions[]`.** Four discrete fields force [TaskToolLaunchers.tsx:45-48](../client/src/app/(app)/discovery/roadmap/[id]/TaskToolLaunchers.tsx#L45-L48) to read four different keys. A single `task.toolSessions[]` mirroring the roadmap-level shape would let the launcher iterate. **Adding validation as a fifth field worsens this.**
2. **Route count mismatch.** Coach has 4 sub-routes, Composer 3, Research 3, Packager 2. Each pair (standalone + task-scoped) is duplicated — ~14 standalone + ~14 task-scoped = ~28 routes that share ~80% of their boilerplate. A shared handler would reduce the surface considerably.
3. **No tool metadata registry.** Tool IDs, display names, tier requirements, and supported handoff targets are hardcoded across constants files. A `TOOL_REGISTRY: Record<ToolId, ToolMeta>` would let the launcher, the prompt, and any future tool-discovery API derive from one source.

These three are out of scope for the validation-integration work but are worth a follow-up branch.

---

## Section 2 — How the Validation Tool is integrated today

### 2.1 Entry point lives on the recommendation page

[RecommendationReveal.tsx:360-391](../client/src/app/(app)/discovery/recommendation/RecommendationReveal.tsx#L360-L391) renders the validation CTA only when:

```ts
roadmapReady && isAccepted && validationPageApplicable
```

…where `validationPageApplicable` (defined around [line 125](../client/src/app/(app)/discovery/recommendation/RecommendationReveal.tsx#L125)) is:

```ts
r.recommendationType !== null
  && VALIDATION_PAGE_ELIGIBLE_TYPES.has(r.recommendationType)
  && validationSignalStrength !== 'negative'
```

Click handler `handleCreateValidationPage()` at [line 193](../client/src/app/(app)/discovery/recommendation/RecommendationReveal.tsx#L193) POSTs to `/api/discovery/recommendations/[id]/validation-page`.

### 2.2 Gates

| Gate | Location | Effect |
|---|---|---|
| Recommendation-type whitelist | `VALIDATION_PAGE_ELIGIBLE_TYPES = new Set([RECOMMENDATION_TYPES.BUILD_SOFTWARE])` ([discovery/constants.ts:107-108](../client/src/lib/discovery/constants.ts#L107-L108)) | Only `BUILD_SOFTWARE` recommendations are eligible. Enforced in two places: the UI at [RecommendationReveal.tsx:125](../client/src/app/(app)/discovery/recommendation/RecommendationReveal.tsx#L125) and server-side defence-in-depth at [validation-page/route.ts:75](../client/src/app/api/discovery/recommendations/[id]/validation-page/route.ts#L75). |
| Compound tier | `requireTierOrThrow(userId, 'compound')` at [validation-page/route.ts:38](../client/src/app/api/discovery/recommendations/[id]/validation-page/route.ts#L38) (also on GET at line 186) | Validation is Compound-only. |
| Roadmap must be READY | Three guards at [validation-page/route.ts:90-105](../client/src/app/api/discovery/recommendations/[id]/validation-page/route.ts#L90-L105) | Reject when `!roadmap` (409 "accept the recommendation first"), `roadmap.status === 'STALE'` (409), or status not READY (409 "still being generated"). |
| Prior negative signal | Guard at [validation-page/route.ts:79-81](../client/src/app/api/discovery/recommendations/[id]/validation-page/route.ts#L79-L81) | Blocks regeneration once a negative ValidationReport exists — forces a new discovery session. |

### 2.3 API routes inventory

| Route | Method | Tier gate | Purpose | Output |
|---|---|---|---|---|
| `/api/discovery/recommendations/[id]/validation-page` | POST | compound + AI_GENERATION | Generate or regenerate from recommendation; calls `generateValidationPage()` (Opus) | `ValidationPage` row |
| `/api/discovery/recommendations/[id]/validation-page` | GET | compound | Fetch existing page metadata (`{page: null \| {id, slug, status}}`) | read-only |
| `/api/discovery/validation/[pageId]/publish` | POST | compound + AI_GENERATION | Transition DRAFT → LIVE; calls `generateDistributionBrief()` (Opus) | `ValidationPage.distributionBrief`, `publishedAt`, `status='LIVE'` |
| `/api/discovery/validation/[pageId]/channel` | POST | API_AUTHENTICATED | Toggle a sharing-channel completion checkbox | `ValidationPage.channelsCompleted[]` |
| `/api/discovery/validation/[pageId]/report` | POST | API_AUTHENTICATED | Toggle the `usedForMvp` MVP-handoff flag | `ValidationReport.usedForMvp` |

### 2.4 Schema

`ValidationPage` (schema.prisma:964-996):
- `id`, `userId`, `recommendationId @unique`, `slug @unique`
- `status` (DRAFT/LIVE/ARCHIVED), `content` (JSON), `layoutVariant`, `phaseContext` (JSON)
- `distributionBrief` (JSON), `channelsCompleted: String[]`, `publishedAt`, `archivedAt`
- Relations: `snapshots[]`, `report?`, `validationEvents[]`, `recommendation`

**No `taskId` field. ValidationPage is exclusively recommendation-bound.**

`ValidationSnapshot` (schema.prisma:1011-1036) — periodic visitor/CTA aggregation per page.
`ValidationReport` (schema.prisma:1045-1073) — the AI-generated interpretation: `signalStrength`, `confirmedFeatures`, `disconfirmedAssumptions`, `pivotOptions`, `usedForMvp`.

### 2.5 Public render + analytics

- Public page: `/lp/[slug]` ([app/lp/[slug]/page.tsx](../client/src/app/lp/[slug]/page.tsx)) renders LIVE pages to anonymous visitors via `ValidationPageProduct | ValidationPageService | ValidationPageMarketplace` based on `layoutVariant`. DRAFT pages are owner-only.
- Analytics beacon: `POST /api/lp/analytics` accepts a discriminated-union of events (`page_view`, `exit_intent`, `scroll_depth`, `feature_click`, `cta_signup`, `survey_response`). Visitor identity is `'v_' + base64url(SHA-256(salt + IP + UA)).slice(0,16)` — non-reversible. Hardened with per-IP 60/min global + per-IP-slug 30/min limits.

### 2.6 Continuation-brief integration

[continuation/validation-signal.ts:39-117](../client/src/lib/continuation/validation-signal.ts#L39-L117) implements `loadValidationSignal(ventureId)`:

1. Walks `Venture → Cycle → Recommendation → ValidationPage` (via the `recommendationId` join).
2. Collects every `ValidationPage` belonging to the venture's cycles.
3. Reads the most recent `ValidationSnapshot` per page (visitors, unique visitors, CTA conversion).
4. Reads `ValidationReport.signalStrength`.
5. Returns a single `ValidationSignal` (`strong | moderate | weak | negative | absent`) plus aggregated `keyMetrics[]` and `patterns[]`.

The brief generator renders this block into the Opus prompt with explicit instructions to quote specific numbers and never invent data when the signal is `absent`.

**The loader walks via `Recommendation` only.** Adding `taskId` to ValidationPage will not break this loader (the recommendation join still resolves), but if validation pages can also exist in a task-only relationship in the future, the loader needs a corresponding pivot — flagged in §3.5.

### 2.7 Confirmed gaps vs. the four tools

| Verified absence | Where |
|---|---|
| ✗ No task-level validation routes exist | `find … -path '*tasks/[taskId]/validation*'` returns empty |
| ✗ Roadmap generator never told about validation | The only "validation" mention in [roadmap-engine.ts](../client/src/lib/roadmap/roadmap-engine.ts) is at line 75 — domain-level "customer validation" in the ASPIRING_BUILDER audience rule. The ValidationPage feature is invisible to the model. |
| ✗ Task UI cannot launch validation | [TaskToolLaunchers.tsx:55-87](../client/src/app/(app)/discovery/roadmap/[id]/TaskToolLaunchers.tsx#L55-L87) renders only the four existing tools. No validation launcher. |
| ✗ Validation discovery is recommendation-type-driven, not task-context-driven | Two-tier whitelist: `VALIDATION_PAGE_ELIGIBLE_TYPES.has(BUILD_SOFTWARE)` controls visibility entirely. |

---

## Section 3 — The integration gap

### 3.1 Roadmap-generator changes

**File:** [client/src/lib/roadmap/roadmap-engine.ts](../client/src/lib/roadmap/roadmap-engine.ts) lines ~211-244 (the `INTERNAL TOOLS AVAILABLE TO THE FOUNDER` section).

Required change: insert a fifth tool description into the `Available tools:` list and add 1-2 new `TOOL CHOREOGRAPHY EXAMPLES` showing a task that binds to validation, possibly composed with `outreach_composer` (sending the page link to prospects).

Additionally, **the prompt becomes tier-aware** (per §4 recommendation 2): when generating a roadmap for a non-Compound user, the validation tool must NOT appear in the available list. The cleanest implementation is to compose the tool block at runtime from a `TOOLS_AVAILABLE_FOR_TIER(tier)` helper instead of a hardcoded prompt fragment. Tier already reaches the engine indirectly via the user — `generateRoadmap()` doesn't currently take a tier argument; we'll need to thread it in from the Inngest function that invokes it.

### 3.2 Task-to-tool binding

**File:** [packages/api-types/src/roadmap.ts:27-29](../packages/api-types/src/roadmap.ts#L27-L29).

Required change: **none for the schema.** `suggestedTools` is `z.array(z.string()).optional()` — adding `'validation'` (or `'validation_page'`) to the model's vocabulary is a prompt change, not a schema migration. Update the field's `.describe()` copy to mention validation alongside the existing tools.

### 3.3 Task UI

**File:** [client/src/app/(app)/discovery/roadmap/[id]/TaskToolLaunchers.tsx](../client/src/app/(app)/discovery/roadmap/[id]/TaskToolLaunchers.tsx).

Required changes:
1. Append `'validation'` to the `anyToolSuggested` check at [lines 55-57](../client/src/app/(app)/discovery/roadmap/[id]/TaskToolLaunchers.tsx#L55-L57).
2. Add a fifth conditional block (after Packager) rendering `<ValidationButton>` + `<ValidationFlow>` + `<ValidationSessionReview>`. Each is a new component (the existing four set the pattern). The "Flow" can be lighter than the others — validation creation is a single Opus call, not a multi-step state machine.
3. Read a fifth task field, `task.validationSession?` (or whatever the task-scoped binding is named — see §3.5), to drive the post-creation review card.

### 3.4 Validation API routes

Required additions:

| New route | Purpose |
|---|---|
| `POST /api/discovery/roadmaps/[id]/tasks/[taskId]/validation-page` | Task-scoped equivalent of the existing recommendation-scoped create. Resolves the task from `roadmap.phases`, threads task title + description into `generateValidationPage()` as `taskContext` (and optionally `taskTitle`), associates the resulting `ValidationPage` to the task. |
| `GET /api/discovery/roadmaps/[id]/tasks/[taskId]/validation-page` | Task-scoped fetch — returns the `ValidationPage` already associated with this task (or null). Mirrors the existing recommendation-scoped GET. |

The standalone publish/channel/report routes (`/api/discovery/validation/[pageId]/...`) DO NOT need duplication — they already address pages by `pageId`, which is venture-bound regardless of whether the page was created via the recommendation path or the task path. Same for the analytics beacon and the public renderer.

The existing recommendation-scoped routes stay in place for the standalone `/tools` access path.

### 3.5 ValidationPage schema

**File:** [client/prisma/schema.prisma](../client/prisma/schema.prisma) (the `ValidationPage` model around lines 964-996).

Required schema change — make `recommendationId` optional and add `taskId`:

```prisma
model ValidationPage {
  id                String              @id @default(cuid())
  userId            String
  user              User                @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Was: recommendationId String @unique
  // Becomes: optional, no longer @unique
  recommendationId  String?
  recommendation    Recommendation?     @relation(fields: [recommendationId], references: [id], onDelete: SetNull)

  // NEW: optional task association for task-bound creation
  taskId            String?             // logical task id within roadmap.phases JSON
  roadmapId         String?
  roadmap           Roadmap?            @relation(fields: [roadmapId], references: [id], onDelete: SetNull)

  // … existing fields unchanged …

  @@unique([recommendationId])  // KEEP — one validation page per recommendation
  @@unique([roadmapId, taskId]) // NEW — one validation page per task
  @@index([taskId])
}
```

**Important nuance:** tasks live inside `Roadmap.phases` JSON (no separate Task table). The `taskId` here is the application-level `id` minted by the roadmap engine for each task — we'll need to ensure roadmap tasks carry stable IDs (they currently do not — `RoadmapTaskSchema` has no `id` field). Two options:

- **Option A (recommended):** add `id: z.string()` to `RoadmapTaskSchema` and have the roadmap engine generate a deterministic id (e.g. `phase{N}-task{M}` or a `cuid()`). Stable id supports task-bound validation, future task-bound features, and is generally good schema hygiene. Migration: backfill existing roadmaps.
- **Option B:** key validation pages by `(roadmapId, phaseIndex, taskIndex)` triple. Avoids schema change but is fragile under roadmap regeneration.

Option A is the right call. Backfill is one Inngest run.

The continuation-brief loader at [validation-signal.ts:39-117](../client/src/lib/continuation/validation-signal.ts#L39-L117) currently joins via `Recommendation`. After the change, it must also walk `Roadmap → ValidationPage` via the new `roadmapId` link to pick up task-bound pages. One additional `findMany` keyed on `roadmap.id` covers it.

---

## Section 4 — Design questions and recommendations

### 4.1 Standalone access — KEEP, but remove the recommendation-page button

**Recommendation:** keep `/tools/validation` (or wherever standalone validation lives in the `/tools` hub) consistent with how Coach / Composer / Research / Packager are accessible standalone. **Remove the validation CTA from the recommendation page** ([RecommendationReveal.tsx:360-391](../client/src/app/(app)/discovery/recommendation/RecommendationReveal.tsx#L360-L391)).

**Rationale:** the recommendation-page button is the problematic surface — it implies validation is a universal step-zero for every BUILD_SOFTWARE recommendation. Standalone access from `/tools` is honest about what the tool is (a thing the founder might reach for) without front-loading it as the next step.

**Note:** there is no existing `/tools/validation` page. The current standalone-tools roster on `/tools` is the four tools listed at [tools/page.tsx:20-53](../client/src/app/(app)/tools/page.tsx#L20-L53). A fifth tile + a `/tools/validation` page is part of the implementation plan.

### 4.2 Tier gating — tier-aware roadmap generator

**Recommendation:** **yes** — when generating a roadmap for a non-Compound user, the roadmap engine must NOT include validation in its `Available tools:` block. Execute users continue to receive the four existing tools; validation remains a Compound differentiator.

**Implementation:** add a `tier: Tier` parameter to `generateRoadmap()` ([roadmap-engine.ts:113-120](../client/src/lib/roadmap/roadmap-engine.ts#L113-L120)) and compose the tool block from a `tierAvailableTools(tier)` helper. Caller (likely [inngest/functions/roadmap-generation-function.ts](../client/src/inngest/functions/roadmap-generation-function.ts)) reads the user's current Subscription tier and passes it through.

This also means the task UI launcher (`TaskToolLaunchers.tsx`) must defensively NOT render the validation button if the user's tier dropped to Execute after the roadmap was generated (e.g. they downgraded between roadmap generation and now). The session-tier read at the page level already gives us this — pass `viewerTier` into `TaskToolLaunchers` and gate the fifth block.

### 4.3 Recommendation-type constraint — relax

**Recommendation:** **yes, retire `VALIDATION_PAGE_ELIGIBLE_TYPES` as a gating mechanism.** Let the roadmap generator's reasoning decide when validation is task-relevant based on context. A productized service venture might genuinely benefit from a validation page for a specific service offering; the prompt's worked examples can steer the model.

**Concrete change:** the constant set at [discovery/constants.ts:107-108](../client/src/lib/discovery/constants.ts#L107-L108) can be deleted along with both its usage sites:
- [RecommendationReveal.tsx:125](../client/src/app/(app)/discovery/recommendation/RecommendationReveal.tsx#L125) — being removed alongside the button (§4.4).
- [validation-page/route.ts:75](../client/src/app/api/discovery/recommendations/[id]/validation-page/route.ts#L75) — server-side defence-in-depth. Leave the file in place for legacy / standalone path but remove the `recommendationType` whitelist check.

The roadmap generator's prompt should still describe WHEN validation is appropriate (early-stage demand testing of an unbuilt offering with measurable signals — page views, email signups, feature interest clicks). The model decides per-task.

### 4.4 Recommendation page UI — remove the button

**Recommendation:** **the button goes away. Nothing replaces it.** The recommendation page's only post-acceptance CTA is "view your execution roadmap." If the roadmap generator decides validation belongs on a task, it appears as a task-bound tool. Cleaner, more honest.

**Files to edit:**
- [RecommendationReveal.tsx](../client/src/app/(app)/discovery/recommendation/RecommendationReveal.tsx): delete the `validationPageApplicable` derivation (~line 125), the `handleCreateValidationPage` handler (~line 193), and the conditional render block (lines 360-391). Also delete the `validationSignalStrength` prop wiring if it's no longer used elsewhere on the component.
- The `signalStrength === 'negative'` "you've already validated and the answer was no" block is part of the same render — if it's worth keeping as a separate banner, lift it into its own component before deleting the validation CTA. Otherwise drop it together (the TierTransition / ValidationReport history is still surfaced elsewhere).

### 4.5 Continuation-brief integration — verify, then extend

**Recommendation:** the existing loader at [validation-signal.ts:39-117](../client/src/lib/continuation/validation-signal.ts#L39-L117) currently joins `ValidationPage` via the `Recommendation` table. Once `ValidationPage.recommendationId` becomes optional and a `roadmapId` is added, the loader must also pull pages by `roadmap.ventureId`:

```ts
// Today (essentially):
const pages = await prisma.validationPage.findMany({
  where: { recommendation: { cycle: { ventureId } } },
  …
});

// After:
const pages = await prisma.validationPage.findMany({
  where: {
    OR: [
      { recommendation: { cycle: { ventureId } } },
      { roadmap:        { ventureId } },
    ],
  },
  …
});
```

The aggregated `ValidationSignal` shape and downstream prompt rendering DO NOT change. The brief generator continues to consume `signalStrength`, `keyMetrics`, `patterns` exactly as today.

### 4.6 Migration — grandfather as recommendation-bound

**Existing pages:** every current `ValidationPage` row was created via the recommendation-page button, has a non-null `recommendationId`, and has no `roadmapId`/`taskId`.

**Recommendation:** **grandfather them as standalone (recommendation-bound, not task-bound).** They keep their `recommendationId` (no schema break — the field is preserved, just made optional going forward). They never gain a `taskId`. They appear in the venture's continuation signal exactly as today via the recommendation join.

**Why not retroactively associate to "the roadmap's most relevant task":**
- That requires an LLM call per existing page to identify the right task (cost + complexity for ambiguous gain).
- The `usedForMvp` flag and the existing distribution brief are already keyed off the page; nothing downstream needs the task association.
- Going forward, every NEW page either gets created task-bound (from a task card) or recommendation-bound (from `/tools/validation` standalone) — both paths coexist without surprise.

Migration script is a no-op data-wise; the schema migration just relaxes the unique constraint and adds the new optional columns + the new `(roadmapId, taskId)` composite unique. Existing rows satisfy the new constraints trivially.

---

## Section 5 — Implementation plan

12 commits, ordered. Each is independently reviewable. Tests called out per step (Vitest where the codebase already has coverage; manual UI for surface-level changes).

### Step 1 — Add `id` to `RoadmapTaskSchema`

- **Files:** [packages/api-types/src/roadmap.ts](../packages/api-types/src/roadmap.ts) — add `id: z.string()` to `RoadmapTaskSchema`. Update the field's `.describe()` to explain the engine generates these.
- **Engine update:** [client/src/lib/roadmap/roadmap-engine.ts](../client/src/lib/roadmap/roadmap-engine.ts) — after `generateText` returns, post-process the validated output to assign `id` to every task (e.g. `${phase.phase}-${taskIndex}` or a `cuid()`). The model SHOULD NOT be asked to mint these — let the engine do it deterministically so re-runs of the same roadmap give the same IDs.
- **Backfill:** new Inngest function `backfillRoadmapTaskIds` (one-shot) that walks every `Roadmap`, parses `phases`, mints IDs for tasks missing one, writes back. Idempotent.
- **Testing:** Vitest unit test on the engine ensuring every emitted task has `id`. Spot-check the backfill on a sandbox row.
- **Risk:** **low.** Pure data add, schema is JSON so no migration. Existing UI doesn't read task IDs today so no client breakage.

**Commit:** `feat(roadmap): add stable task ids to RoadmapTaskSchema`

### Step 2 — `ValidationPage` schema migration

- **Files:** [client/prisma/schema.prisma](../client/prisma/schema.prisma).
- **Changes:**
  - Make `recommendationId` optional (`String?`, drop the bare `@unique`, add `@@unique([recommendationId])` to keep one-page-per-recommendation when present).
  - Add `taskId String?` and `roadmapId String?` plus the `roadmap` relation.
  - Add `@@unique([roadmapId, taskId])` and `@@index([taskId])`.
- **Migration:** new SQL migration `add_task_binding_to_validation_page`. Existing rows have `taskId = null`, `roadmapId = null` — schema constraints satisfied trivially.
- **Testing:** apply migration in dev; verify existing rows still queryable; verify `prisma generate` produces the right TS types.
- **Risk:** **medium.** Prisma migration on a production-shaped table — apply in staging first. The existing unique constraint relaxation is safe; the new composite unique is empty until task-bound creation lands.

**Commit:** `feat(validation): add optional task/roadmap binding to ValidationPage schema`

### Step 3 — Add `'validation'` tool ID + tier-aware tool list helper

- **Files:**
  - New `client/src/lib/roadmap/validation/constants.ts` exporting `VALIDATION_TOOL_ID = 'validation'`.
  - New `client/src/lib/roadmap/available-tools.ts` exporting `tierAvailableTools(tier: Tier): ToolMeta[]` returning the four for Execute and the five for Compound.
  - Update [roadmap-engine.ts:113-120](../client/src/lib/roadmap/roadmap-engine.ts#L113-L120) — `generateRoadmap` accepts `tier: Tier`. Build the `Available tools:` section from `tierAvailableTools(tier)`.
- **Caller:** [inngest/functions/roadmap-generation-function.ts](../client/src/inngest/functions/roadmap-generation-function.ts) — read the user's tier from Subscription before invoking the engine; thread it in.
- **Testing:** Vitest unit on `tierAvailableTools` (Free → empty? Execute → 4 ids? Compound → 5 ids?). Snapshot-style test on the engine's prompt assembly to confirm the validation tool description appears for Compound and not for Execute.
- **Risk:** **low.** No DB change; behaviour change limited to roadmap generation calls.

**Commit:** `feat(roadmap): tier-aware available-tools list with validation registered`

### Step 4 — Update the roadmap generator prompt + worked examples

- **Files:** [roadmap-engine.ts:211-244](../client/src/lib/roadmap/roadmap-engine.ts#L211-L244).
- **Changes:**
  - Add the validation tool's description string to the `Available tools:` block (composed from the helper).
  - Add 1-2 new `TOOL CHOREOGRAPHY EXAMPLES` showing validation in context (e.g. a task that uses Research → Validation Page → Outreach Composer to drive traffic).
- **Testing:** generate a few roadmaps in sandbox with both Execute and Compound users; confirm validation appears as a `suggestedTools` element in tasks where it's relevant for Compound and never for Execute.
- **Risk:** **medium.** Prompt edits can shift output in unexpected ways. Run a few sandbox roadmaps and eyeball.

**Commit:** `feat(roadmap): teach the generator about the validation tool`

### Step 5 — Task-scoped validation API routes

- **Files (new):**
  - `client/src/app/api/discovery/roadmaps/[id]/tasks/[taskId]/validation-page/route.ts` (POST + GET).
- **Implementation:**
  - POST mirrors the existing recommendation-scoped create at [validation-page/route.ts](../client/src/app/api/discovery/recommendations/[id]/validation-page/route.ts), but resolves the task by walking `roadmap.phases` JSON for the matching `taskId` (now stable from Step 1). Threads `taskTitle` + `taskDescription` into `generateValidationPage()` as task context. Stores `roadmapId` + `taskId` on the ValidationPage row, leaves `recommendationId` null.
  - Re-uses `assertVentureNotArchivedByRoadmap(userId, roadmapId)` (existing helper).
  - Same Compound tier gate, same AI_GENERATION rate limit.
  - GET is the symmetric fetch.
- **Testing:** Vitest on route handler — Compound user fetches, ownership scope verified. Manual: hit POST from a sandbox account, verify a row lands with `roadmapId/taskId` set and `recommendationId` null.
- **Risk:** **low-medium.** Route plumbing; the engine call surface is unchanged.

**Commit:** `feat(validation): task-scoped POST/GET validation-page routes`

### Step 6 — Update `generateValidationPage` to accept task context

- **Files:** `client/src/lib/validation/page-generator.ts` (current entry point).
- **Changes:** add optional `taskContext?: string` and `taskTitle?: string` parameters. When present, include a `TASK CONTEXT` block in the prompt (mirroring how the four existing tools do this). Page content output shape unchanged.
- **Testing:** Vitest snapshot test — same recommendation, with vs without task context, produces materially different pages (the task-context one references the task).
- **Risk:** **low.** Pure prompt addition; no schema impact.

**Commit:** `feat(validation): thread task context into page generation prompt`

### Step 7 — Task UI launcher: add the validation button

- **Files:** [TaskToolLaunchers.tsx](../client/src/app/(app)/discovery/roadmap/[id]/TaskToolLaunchers.tsx).
- **Changes:**
  - Add `'validation'` to the `anyToolSuggested` check (lines 55-57).
  - Add a fifth conditional block: `<ValidationButton>`, `<ValidationFlow>`, `<ValidationSessionReview>`. Three new components.
  - Read the existing task's associated `ValidationPage` (needs an upstream loader on the roadmap page — pass it as a prop alongside the existing `coachSession` etc).
  - Defensively gate render on `viewerTier === 'compound'` even if `suggestedTools` includes `'validation'` (in case tier dropped post-generation).
- **Testing:** manual UI — create a Compound roadmap with a validation-suggested task, confirm the button renders, opens a flow, creates a page.
- **Risk:** **medium.** UI surface change; needs design polish for the Flow modal (the four existing tools have multi-step flows; validation is one Opus call — keep the modal simple).

**Commit:** `feat(roadmap-ui): launch validation page from task cards`

### Step 8 — `/tools/validation` standalone page + tools-hub tile

- **Files:**
  - [client/src/app/(app)/tools/page.tsx](../client/src/app/(app)/tools/page.tsx) lines 20-53 — append the validation tile to the `TOOLS` array. Tier note: this tile must be Compound-only — either filter the array or render a Compound-required upgrade prompt for Execute users on the validation tile specifically.
  - New `client/src/app/(app)/tools/validation/page.tsx` mirroring the existing standalone tool pages. Ties to the existing recommendation-scoped routes when the user has accepted a recommendation; if they have multiple recommendations, surface a picker (similar to other standalone tools' picker patterns).
- **Testing:** manual — Compound user visits `/tools`, sees five tiles, clicks Validation, lands on the standalone page.
- **Risk:** **low.** New page; doesn't touch any existing path.

**Commit:** `feat(tools): standalone validation tile in /tools hub`

### Step 9 — Remove the recommendation-page validation button

- **Files:** [RecommendationReveal.tsx](../client/src/app/(app)/discovery/recommendation/RecommendationReveal.tsx).
- **Changes:**
  - Delete the validation CTA render block (lines 360-391).
  - Delete `handleCreateValidationPage` handler (~line 193).
  - Delete `validationPageApplicable` derivation (~line 125).
  - Decide: keep the negative-signal banner ("you've already validated and the answer was no") as its own component, or drop it. Current value is small without the create-button context — recommend dropping; the continuation flow already handles negative-signal cases.
  - Drop the `VALIDATION_PAGE_ELIGIBLE_TYPES` import from this file.
- **Testing:** manual — accept a BUILD_SOFTWARE recommendation as a Compound user, verify no validation CTA appears on the recommendation page; verify the standalone access still works.
- **Risk:** **low.** Pure deletion. Existing pages remain accessible via Settings → past recommendations / `/discovery/validation` listing.

**Commit:** `chore(recommendation): remove pre-roadmap validation CTA`

### Step 10 — Retire `VALIDATION_PAGE_ELIGIBLE_TYPES` server-side

- **Files:**
  - [client/src/app/api/discovery/recommendations/[id]/validation-page/route.ts:75](../client/src/app/api/discovery/recommendations/[id]/validation-page/route.ts#L75) — delete the recommendation-type whitelist check. Keep the Compound tier gate, the roadmap-READY check, and the prior-negative-signal check.
  - [client/src/lib/discovery/constants.ts:107-108](../client/src/lib/discovery/constants.ts#L107-L108) — delete `VALIDATION_PAGE_ELIGIBLE_TYPES`.
- **Testing:** manual — Compound user with a non-BUILD_SOFTWARE recommendation can now create a validation page from `/tools/validation`. (Pre-change this would 409.)
- **Risk:** **low.** No client now relies on the constant; the gate was the only enforcement.

**Commit:** `feat(validation): drop recommendation-type whitelist`

### Step 11 — Continuation-brief loader: add roadmap-pivot

- **Files:** [client/src/lib/continuation/validation-signal.ts:39-117](../client/src/lib/continuation/validation-signal.ts#L39-L117).
- **Changes:** the `findMany` call adds an `OR` arm joining `roadmap.ventureId` so task-bound pages are included alongside recommendation-bound pages. Aggregation logic unchanged.
- **Testing:** Vitest unit — synth a venture with one recommendation-bound and one task-bound page, run the loader, confirm both appear in the signal.
- **Risk:** **low.** Read-side only; brief generation downstream untouched.

**Commit:** `fix(continuation): pull task-bound validation pages into venture signal`

### Step 12 — Documentation update

- **Files:**
  - [docs/neuralaunch-pricing-spec.md](docs/neuralaunch-pricing-spec.md) §1.3 — soften the "Live validation landing pages" Compound bullet from "available after recommendation acceptance" to "available task-bound during execution and standalone from /tools."
  - [docs/payment-system-prod-readiness-final-delivery-report.md](docs/payment-system-prod-readiness-final-delivery-report.md) — append a note that validation is now task-bound.
  - This audit report itself stays as the design-of-record; no edits needed.
- **Testing:** N/A.
- **Risk:** **none.**

**Commit:** `docs(validation): document the task-bound integration model`

### Suggested PR ordering

Steps 1-2 (schema) → Step 3 (helper) → Steps 4-6 (engine + routes) → Steps 7-8 (UI surfaces) → Steps 9-10 (cleanup) → Steps 11-12 (downstream + docs). Steps 1-3 must merge before Steps 4-7. Steps 9-10 can land last as a single cleanup commit if desired.

---

## Section 6 — What this does NOT change

Explicitly out of scope:

- **Public page rendering.** [client/src/app/lp/[slug]/page.tsx](../client/src/app/lp/[slug]/page.tsx) and the layout-variant components (`ValidationPageProduct | ValidationPageService | ValidationPageMarketplace`) untouched. The slug → page lookup is unchanged.
- **Analytics beacon.** [client/src/app/api/lp/analytics/route.ts](../client/src/app/api/lp/analytics/route.ts), the salted-hash visitor identity, the IP rate limits, the discriminated event union — all unchanged. The beacon is keyed on `slug`, indifferent to whether the page was task-bound or recommendation-bound at creation.
- **`ValidationSnapshot` and `ValidationReport` schemas.** No field changes. The fields they carry (visitor count, unique visitors, CTA conversion, signal strength, build brief, pivot options, `usedForMvp`) are unaffected.
- **Continuation-brief AI prompt.** Only the loader's join changes (Section 5 Step 11). The aggregated `ValidationSignal` shape and the brief generator's prompt rendering are unchanged.
- **Tier gating mechanics.** Validation remains Compound-only. The mechanism evolves (the roadmap generator now decides per-task whether validation is relevant for a Compound user, instead of a recommendation-type whitelist deciding visibility), but the tier itself is unchanged.
- **Existing pricing-spec entitlements table.** "Validation landing page + build brief" stays a Compound row in [§1.3 of the pricing spec](./neuralaunch-pricing-spec.md). Only the surfacing model changes — the entitlement does not.
- **Publish, channel, and report routes.** The `/api/discovery/validation/[pageId]/{publish,channel,report}` routes continue to address pages by `pageId` and don't care about the creation path. Zero changes there.

---

**End of audit.**
