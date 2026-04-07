# Codebase Cleanup — Working Context

> **Read this first** if conversation memory was reset. Everything you
> need to resume the cleanup work is in this file or linked from it.
> Do not start any new edits until you have read this entire document.

## Where we are

The user (Saheed) finished testing Phase 3 and Concerns 1–5 from
[AGENT_ARCHITECTURE_REVIEW.md](AGENT_ARCHITECTURE_REVIEW.md) and asked
for a multi-stage codebase cleanup followed by a full bulletproofing
pass. The architecture review has zero open items. The two deferred
items (Roadmap Adjustment Layer and Cross-Phase Orchestration) are
marked in-code with their production-data trigger thresholds.

The user's exact words for the goal: *"I want this codebase to look
like a codebase written by the best minds in Software Engineering In
Silicon Valley… if you tell an expert this were not written by human
expert, they should beyond all reasonable doubts argue that that's a
lie they can never believe."*

## Branch state and workflow (CRITICAL — different from before)

| Branch | HEAD as of this writing | Role |
|---|---|---|
| `main` | `b12f491` | Production. Untouched until the entire cleanup is done. |
| `dev` | `3c51150` | Integration target. Every cleanup commit merges here first. |
| `chore/codebase-cleanup-and-bulletproofing` | `25eb9e9` | Where the work happens. |

**Workflow rule the user established:**
> "Now that we are doing this massive work, all changes need to be
> merged to dev first and at the end we merge to main, the reverse
> of what we have been doing."

Concrete sequence per commit:
1. Work on `chore/codebase-cleanup-and-bulletproofing`
2. Push the branch
3. Merge into `dev` (fast-forward when possible, `--no-ff` otherwise)
4. Push `dev`
5. **Do NOT touch `main`** until the entire cleanup is complete

The CLAUDE.md "Git Workflow" section still describes the old
PR-to-dev-then-PR-to-main flow. That section is technically the
official policy, but the user has explicitly authorised the
direct-merge approach for this work.

## The five stages and the user's approvals

**Q1 (cleanup vs refactor scope):** Confirmed **broad** — delete
dead code AND standardise everything that's currently inconsistent
AND fix every unsafe pattern. Cleanup IS the senior-architect work.

**Q2 (test coverage exclusion):** Confirmed **remove the no-tests
rule**. Tests are now part of Definition of Done. Already done in
commit `25eb9e9` (CLAUDE.md updated). The user explicitly said
*"tests will be the last thing after all the work."* The order is
locked: dead code → schema → patterns → type safety → docs → tests.

**Q3 (commit strategy):**
- Stage 1, 2, 3, 5: many small commits, each one focused
- Stage 4 (type safety pass): a single PR with the full pattern change

### Stage 1 — Dead code purge
Delete dead models, dead routes, dead components, dead dependencies,
dead files. Each category gets its own commit. Reversible until merged.

### Stage 2 — Schema migration cleanup
Drop the dead tables and columns identified in Stage 1. One model per
commit so any individual deletion can be reverted.

### Stage 3 — Pattern standardisation
- Every JSON column read site uses a `safeParseX` helper (mirror the
  `safeParsePushbackHistory` pattern from `pushback-engine.ts`).
- Every route handler uses the same shape:
  `try → enforceSameOrigin → requireUserId → rateLimitByUser → … → httpErrorToResponse`
- Every `logger.error` call passes a real `Error` object so stack
  traces are preserved.
- Every `findUnique({id, userId})` becomes `findFirst({id, userId})`.
- Mechanical changes via grep + targeted edits.

### Stage 4 — Type safety pass (single PR)
- Audit every `as unknown as` cast.
- Audit every `@ts-ignore` / `@ts-expect-error` comment.
- Audit every implicit `any`.
- Replace with the right pattern. Most JSON-column casts are
  resolved by the Stage 3 helpers; the remainder need narrowed types.

### Stage 5 — Documentation pass
- Write `ARCHITECTURE.md` (data flow between phases)
- Write `RUNBOOK.md` (production incident playbook)
- Write/update orientation `README.md`
- Update CLAUDE.md if anything has drifted

### Stage 6 — Tests (LAST, after cleanup is fully done)
Per the priority hierarchy now in CLAUDE.md:
1. Hard data invariants (consent gating, etc.)
2. Security boundaries (CSRF, rate limits, ownership)
3. Concurrency / idempotency (pushback locks, atomic writes)
4. Pure helpers and parsers (Zod, anonymisation, taskId derivation)
5. Fallback and resilience paths (provider chain, backoff)

Stack: Vitest (already a devDependency). Vercel AI SDK
`MockLanguageModelV2` for LLM-touching tests so no real API calls.

### Stage 7 — Bulletproofing passes (security, scalability, performance,
maintainability, reliability/fault tolerance)
This is the user's stated end goal. It only happens after Stages 1–6.
Each one is a focused pass; do not start until cleanup is genuinely
complete.

## Stage 1 progress so far — partial dead code catalogue

**Schema model reference counts** (run via `grep -rln "prisma.X." src/`):

| Model | Live refs | Status |
|---|---|---|
| `user` | 3 | LIVE |
| `userPreferences` | 0 | **DEAD** |
| `account` | 1 | LIVE (used by profile page) |
| `session` (NextAuth) | 0 | **Borderline** — NextAuth may use it via the Prisma adapter without going through `prisma.session.*`. Verify before deleting. |
| `verificationToken` | 0 | **Borderline** — same as `session` |
| `conversation` | 4 | LIVE |
| `message` | 4 | LIVE |
| `cofounderMessage` | 0 | **DEAD** |
| `tag` | 1 | LIVE (`/api/trends/route.ts`) |
| `tagsOnConversations` | 1 | LIVE (`/api/trends/route.ts`) |
| `landingPage` | 0 | **DEAD** (replaced by `validationPage`) |
| `emailSignup` | 0 | **DEAD** |
| `pageView` | 0 | **DEAD** |
| `task` | 0 | **DEAD** (old Phase 5 sprint stuff) |
| `taskOutput` | 0 | **DEAD** |
| `validationHub` | 0 | **DEAD** |
| `achievement` | 0 | **DEAD** |
| `sprint` | 0 | **DEAD** |
| `taskReminder` | 0 | **DEAD** |
| `aiMemory` | 0 | **DEAD** |
| `landingPageFeedback` | 0 | **DEAD** |
| `featureSmokeTest` | 0 | **DEAD** |
| `projectContext` | 0 | **DEAD** |
| `agentTask` | 0 | **DEAD** |
| `agentExecution` | 0 | **DEAD** |
| `executionWave` | 0 | **DEAD** |
| `criticalFailure` | 0 | **DEAD** |
| `agentMemory` | 0 | **DEAD** |
| `monitoringSnapshot` | 0 | **DEAD** |
| `issueFixAttempt` | 0 | **DEAD** |
| `humanReviewRequest` | 0 | **DEAD** |
| `agentThought` | 0 | **DEAD** |
| `discoverySession` | 7 | LIVE |
| `recommendation` | 15 | LIVE |
| `roadmap` | 7 | LIVE |
| `roadmapProgress` | 2 | LIVE |
| `recommendationOutcome` | 2 | LIVE |
| `deployment` | 0 | **DEAD** |
| `validationPage` | 12 | LIVE |
| `validationSnapshot` | 1 | LIVE |
| `validationReport` | 2 | LIVE |
| `validationEvent` | 3 | LIVE |

**Dead routes/dirs flagged so far** (need verification before deletion):
- `/api/trends/route.ts` — actually LIVE (uses `tag` + `tagsOnConversations`).
  Question for the user: is this still part of the product? Looks like a
  legacy "trends snapshot" feature.

**Sidebar / UI references to verify before deleting Conversation tail:**
- `/chat/[conversationId]/page.tsx` — LIVE (transcript view)
- Sidebar conversation list — LIVE
- `/api/conversations/route.ts` and `/api/conversations/[conversationId]/route.ts` — LIVE

## Outstanding work to produce the catalogue (where I was when interrupted)

I need to finish surveying these before producing the deletion list:

1. **`/api/trends/route.ts`** — read it fully and decide. Possibly a
   carve-out: keep the route, delete `Tag` + `TagsOnConversations` only
   if the trends route is itself dead.
2. **NextAuth Session + VerificationToken models** — confirm whether
   the NextAuth Prisma adapter requires them as table existence even
   without explicit `prisma.session.*` calls. (It does. They stay.)
3. **`/api/conversations/route.ts` and `/api/conversations/[conversationId]/route.ts`**
   — read both fully, confirm what they touch, decide whether they
   stay or fold into the discovery routes.
4. **`scripts/fix-prisma-pnpm.js`** — read, verify still needed.
5. **`mcp-servers/`** at the repo root — read `package.json`, verify
   nothing in `client/` references it.
6. **`.env.mcp.example`** — delete unless documented.
7. **`/temp/readonly`** references — check if any code reads from
   that path. (It's a readonly area used by the IDE for tool output;
   no code should reference it.)
8. **`@sentry/cli`, `puppeteer`, `cpu-features`, `ssh2`, `protobufjs`**
   in `client/package.json` — confirm none are referenced.
9. **`/api/discovery/assumption-check/route.ts`** — referenced in
   the discovery flow? Check.
10. **`prisma/seed.ts`** — exists?
11. **Old `/projects`, `/sandbox`, `/sprint`, `/user/github-status`
    routes** — confirmed deleted? Last cleanup said yes but worth
    re-checking.
12. **The `pushback-engine.ts` `RecommendationPatchSchema` Zod object**
    — note from earlier review: when patch field has invalid
    `recommendationType`, `mergeRecommendationPatch` silently drops
    it. This is correct, just flagging.

## Key files and patterns to remember

### The "good shape" for a route handler (Stage 3 will standardise on this):

```ts
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'route-key', RATE_LIMITS.AI_GENERATION);
    const { id } = await params;

    let body: unknown;
    try { body = await request.json(); } catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const row = await prisma.thing.findFirst({
      where: { id, userId },
      select: { /* … */ },
    });
    if (!row) throw new HttpError(404, 'Not found');

    // … work …

    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
```

### The "good shape" for a JSON column read (Stage 3 will create helpers like this):

```ts
// In the engine file:
export const ThingSchema = z.array(ThingTurnSchema);
export function safeParseThing(value: unknown): Thing[] {
  const parsed = ThingSchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}

// At the read site:
const turns = safeParseThing(row.thingHistory);
// NEVER: const turns = (row.thingHistory ?? []) as unknown as Thing[];
```

### The "good shape" for a logger.error call:

```ts
// CORRECT:
log.error(
  'Something failed',
  err instanceof Error ? err : new Error(String(err)),
);

// WRONG (loses stack):
log.error('Something failed', { error: String(err) });
log.error('Something failed', err);  // depends on logger overloads
```

## What NOT to delete (load-bearing things that look dead)

- **`Session` and `VerificationToken` Prisma models** — NextAuth
  Prisma adapter requires the tables exist even without explicit
  `prisma.session.*` calls. Schema-only references via the adapter.
- **`@next-auth/prisma-adapter` if present** — same reason.
- **`@sentry/nextjs`** — referenced in `next.config.ts` even if no
  source files import it. Check before deleting.
- **`cpu-features`, `ssh2`** — transitive deps of `puppeteer`. If
  `puppeteer` is dead they go too; if not, leave them.

## When you resume after compaction

1. Read this file completely.
2. Read [AGENT_ARCHITECTURE_REVIEW.md](AGENT_ARCHITECTURE_REVIEW.md)
   so you remember which concerns are closed.
3. Read [PRODUCTION_TEST_CHECKLIST.md](PRODUCTION_TEST_CHECKLIST.md)
   so you know what is in production and what is testable.
4. Verify the branch state with `git branch --show-current` and
   `git log --oneline -5`. You should be on
   `chore/codebase-cleanup-and-bulletproofing` at HEAD `25eb9e9` or
   later.
5. Resume the dead code catalogue from item 1 in the
   "Outstanding work" list above.
6. Produce the full deletion list as a markdown table.
7. Show it to the user. Wait for approval. Do not delete anything
   until the user explicitly approves the list.
8. Then start Stage 1 deletions, one category per commit, merging
   each into `dev` after the user reviews.

## The three things that must not break during cleanup

1. **The hard data invariant**: `RecommendationOutcome` rows where
   `consentedToTraining = false` must NEVER have a non-null
   `anonymisedRecord`. Any cleanup that touches the consent code
   path must preserve this. Test 10f in the production checklist
   verifies this in production.
2. **The pushback optimistic concurrency lock**: `Recommendation.pushbackVersion`
   is the row-level lock for concurrent pushback writes. Removing
   it would silently corrupt history.
3. **The fallback chain**: Sonnet → Haiku → Gemini Flash for
   question generation. The chain is in
   `src/lib/ai/question-stream-fallback.ts`. The chain itself is
   not dead code — it is critical resilience infrastructure.

## Reminders about user style

- The user prefers terse, direct responses with clear takes.
- The user wants explicit recommendations on every open question,
  not "what do you think?"
- The user has explicitly said multiple times: do things one at a
  time, deliberation before action, no shortcuts.
- The user reads and reasons about the code; the user will catch
  shortcuts if you take them.
- The user has a strong sense of where the gaps are. When the user
  disagrees with a take, the user is usually right.
- The user has named the entire system NeuraLaunch. The product
  voice is honest, specific, never generic.

---

*Written 2026-04-07. Compacted-context bridge. If you find this file
out of date, fix it before continuing the cleanup.*
