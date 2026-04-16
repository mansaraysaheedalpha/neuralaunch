# NeuraLaunch — Engineering Standards

> This document governs every line of code written in this repository.
> It is not aspirational. It is mandatory.

---

## Project Context

**NeuraLaunch** is an AI-powered growth engine that guides people from a vague idea or stalled situation to a launched product. It is built by two people with the precision and discipline expected of a senior engineering team at a world-class technology company.

**Repository layout:**
```
neuralaunch/
├── client/                 # Next.js 15 application (the product)
│   ├── src/app/            # App Router pages and API routes
│   ├── src/lib/            # Core business logic, engines, services
│   │   ├── ai/             # Provider fallback chain + shared AI helpers
│   │   ├── discovery/      # Phase 1 — interview, synthesis, pushback
│   │   ├── roadmap/        # Phase 2 — execution plan, check-ins, nudges
│   │   └── validation/     # Phase 3 — landing page, reporting, lifecycle
│   ├── src/components/     # React components (grouped by feature)
│   ├── src/inngest/        # Durable background functions + event type map
│   └── prisma/             # Database schema and migrations
├── mobile/                 # React Native (Expo) app — NOT a workspace member
│   └── (standalone install; consumes packages/* via link:)
├── packages/               # Workspace packages shared by client + mobile
│   ├── api-types/          # Zod schemas + inferred types (wire protocol)
│   └── constants/          # Enum value lists + configuration limits
├── ARCHITECTURE.md         # How the system actually flows
├── RUNBOOK.md              # On-call playbook for production incidents
└── CLAUDE.md               # This file — engineering standards (mandatory)
```

**Active branch strategy:**
- `main` — production. Vercel auto-deploys.
- `dev` — integration. Vercel auto-deploys to a preview URL.
- `feature/...` or `chore/...` — one branch per piece of work. Branched
  from `dev`. Merged into `dev` first, then `dev` is fast-forwarded
  into `main` once the change is verified.

**Current state:** Phases 1 (Discovery), 2 (Roadmap), and 3 (Validation)
are shipped to production and verified end-to-end. The codebase has
completed a full seven-stage cleanup and bulletproofing sequence:
dead code purge, schema migration, pattern standardisation, type safety,
documentation, maintainability (component splits), and five-pass
bulletproofing (security, scalability, performance, maintainability,
reliability). Read `ARCHITECTURE.md` when you need to understand how
the system flows, `RUNBOOK.md` when production is broken.

---

## Core Engineering Principles

Every decision — architecture, naming, structure, implementation — must satisfy all five of the following principles. When they conflict, use the order listed as the tiebreaker.

### 1. Reliability

The system must behave correctly under failure. Users trust NeuraLaunch with their ideas and time. Losing their session state, returning a hallucinated recommendation, or silently dropping data is a fundamental product failure.

- Every external I/O operation (AI calls, DB writes, Redis, third-party APIs) must handle failures explicitly. No silent catches.
- Inngest functions are the primary mechanism for durable execution. Any operation that cannot tolerate a serverless timeout must run inside an Inngest step.
- All AI-generated structured data must be validated through a Zod v4 schema before it touches the database or the client. Never trust raw LLM output.
- **Zod schemas for LLM output must NOT use `.max()` on string fields.** Anthropic's structured-output endpoint does not consistently enforce string-length constraints during generation — the model produces a longer string, the response is structurally valid JSON, and the AI SDK's post-hoc Zod parse rejects it as `AI_NoObjectGeneratedError`. Put length intent in the `.describe()` copy and enforce bounds via a `.transform()` post-clamp. See `ValidationInterpretationSchema` for the canonical shape.
- Use Prisma transactions for any operation that involves more than one write. Partial writes are data corruption.
- Upstash Redis is ephemeral. Never rely on it as the only store for state that must survive beyond the session TTL. Session reads (`getSession`) MUST fall back to Postgres on Redis miss — a 15-minute pause cannot lose the founder's interview state. See `src/lib/discovery/session-store.ts`.
- **Every `generateObject` call site must use `withModelFallback()`** from `src/lib/ai/with-model-fallback.ts`. This wraps the call with a single-retry fallback to a smaller model on Anthropic overload (`AI_RetryError`, `AI_APICallError`, or status 529). Never add a bare `generateObject` call without the fallback wrapper.
- **Every `streamText` call site must use `streamQuestionWithFallback()`** from `src/lib/ai/question-stream-fallback.ts` and pass `maxRetries: 0` to disable the AI SDK's internal retry (our chain owns retry semantics).

### 2. Security

NeuraLaunch handles personal information — people's frustrations, business ideas, financial situations, and goals. This data is sensitive. Treat it accordingly.

- Never log user message content, belief state data, or AI outputs at INFO level. Use DEBUG, and ensure DEBUG is off in production.
- All API routes must authenticate via NextAuth before executing any business logic. The only exception is `/api/lp/analytics` (public visitor beacon, hardened with IP rate limiting + body size cap + taskId cross-check).
- **Every state-changing API route must call `enforceSameOrigin(request)` as the first line of the handler.** This is the CSRF defence. See `src/lib/validation/server-helpers.ts`.
- **Every authenticated API route must call `rateLimitByUser()` or `rateLimitByIp()`.** Three tiers: `AI_GENERATION` (5/min) for routes that fire LLM calls, `API_AUTHENTICATED` (60/min) for state-changing writes, `API_READ` (120/min) for polling reads. See `RATE_LIMITS` in server-helpers.
- Validate and sanitize all user input at the API boundary using Zod before it reaches any service or agent. SQL injection, prompt injection, and XSS are not acceptable failure modes.
- **Prompt injection defence:** every LLM call that embeds user-typed content must wrap that content via `renderUserContent()` from `src/lib/validation/server-helpers.ts` (triple-bracket delimiters) and include the canonical SECURITY NOTE in the system/user prompt. Never interpolate raw user strings into prompt templates.
- Environment variables must be validated at startup via `src/lib/env.ts`. The application must refuse to start if required secrets are missing.
- **Never expose internal error messages to the client.** All route catch blocks must use `httpErrorToResponse(err)` from `src/lib/validation/server-helpers.ts`. This function logs non-HttpError instances with the full stack trace (for debugging) and returns a generic 500 to the client (for security). Never write a custom 500 response — use the central helper so every route gets automatic observability.
- Secrets (API keys, tokens) must never appear in logs, error messages, or response bodies.
- **Ownership scoping:** every database read that returns user data must use `prisma.X.findFirst({ where: { id, userId } })` — not `findUnique({ id })` followed by a manual `userId !==` check. The single-query pattern prevents existence-leak between 404 and 401 responses.

### 3. Scalability

The system must degrade gracefully under increased load, not collapse.

- All Inngest functions must be idempotent. Running the same function twice with the same input must produce the same outcome with no side effects. Use `upsert` keyed on the natural unique constraint (e.g., `sessionId` for Recommendation) rather than `create` so retries do not produce duplicate rows.
- Rate limiting is mandatory on **every** API route — see the Security section above for the three-tier system. Every LLM call has a cost; unbounded requests will bankrupt the project.
- Use streaming responses (Vercel AI SDK v5 `streamText`) for all real-time AI output. Never buffer a full AI response in memory before sending it.
- Database queries must use explicit `select` clauses. Never fetch entire records when only a subset of fields is needed.
- **All list endpoints must be bounded** with `take` or `cursor`. Never return an unbounded `findMany` that could grow without limit. Cap conversation lists at 100, recommendation lists at 50, validation page lists at 50.
- Add appropriate database indexes when introducing new query patterns. Check `prisma/schema.prisma` `@@index` directives. Every hot query predicate (sidebar, transcript, polling) must have a composite index.
- Session state in Redis uses a sliding 15-minute TTL. This is not a configuration — it is the contract.

### 4. Maintainability

The next engineer to open this file (which may be you in three months) must understand it immediately.

- **One responsibility per module.** A file that does three things should be three files.
- **Explicit over implicit.** Types must be declared. Zod schemas are the source of truth for data shapes — infer TypeScript types from them, never duplicate.
- **Name things for what they do, not what they are.** `InterviewEngine` not `ChatHandler`. `DiscoveryContext` not `Data`. `synthesizeRecommendation` not `processResponse`.
- Every Inngest function, agent, and API route must have a single, clearly named entry point with a JSDoc comment explaining what it does, what it receives, and what it returns.
- No magic numbers or magic strings in logic. Define constants with descriptive names in a `constants.ts` file within the relevant module.
- Do not leave dead code in the repository. If a feature is removed, remove all its code, types, routes, and database fields. Leave no stubs.
- Each Prisma migration must have a descriptive name (`add_discovery_session`, not `migration_20260402`).

### 5. Performance

Users are waiting. Every unnecessary millisecond is friction between a person and their recommendation.

- Use `React.Suspense` with meaningful fallbacks for all async components. Users must see something immediately.
- AI calls are the most expensive operation. Cache deterministic results (e.g., tech stack recommendations for a given category) in Redis with an appropriate TTL.
- Do not use `useEffect` to fetch data in React components. Use Server Components for data fetching. Use the `use()` hook for client-side promise consumption.
- Prisma queries that join multiple relations must be reviewed for N+1 patterns. Prefer `include` with explicit field selection over multiple sequential queries.
- Motion v12 (`motion/react`) handles all layout animations. Never use CSS transitions for elements that involve layout shifts — use `layout` prop instead.

---

## Tech Stack (Authoritative — Late 2026)

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js | 15.5.x | App Router only. No Pages Router. |
| Language | TypeScript | 5.x | Strict mode. No `any`. |
| Styling | Tailwind CSS | 4.x | Utility-first. No inline styles. |
| Components | shadcn/ui | v4 CLI | Chat, Timeline, Stepper blocks for AI UX. |
| Animation | Motion | v12 | Import from `motion/react`, not `framer-motion`. |
| AI SDK | Vercel AI SDK | v5.0 | `streamText`, `generateObject` with Zod schemas. |
| AI Provider | Anthropic | Claude 4.6 | Sonnet 4.6 for execution. Opus 4.6 for deep synthesis. |
| Orchestration | Inngest | v4 | `useAgent` hook for frontend streaming. |
| Validation | Zod | v4 | Use `z.toJSONSchema()` for tool definitions. |
| ORM | Prisma | 6.6.x | JSON fields for belief state. Middleware lints for agent queries. |
| Session Store | Upstash Redis | latest | `@upstash/redis` for Edge. Sliding 15-min TTL. |
| Auth | NextAuth | v5 beta | Server-side session only. |
| Database | PostgreSQL (Neon) | — | pgvector extension for vector search. |

**Deprecated — do not use:**
- `framer-motion` (replaced by `motion/react`)
- `budget_tokens` in Anthropic calls (replaced by Adaptive Thinking `effort` parameter)
- `useEffect` for data fetching (replaced by Server Components + `use()` for server, SWR for client)
- `Pusher` / `pusher-js` (removed — was the old Phase 2 real-time layer)
- `puppeteer` / `puppeteer-core` (removed — was the old sandbox agent)
- `openai` SDK (removed — all AI calls go through Anthropic or Google via Vercel AI SDK)
- `Math.random()` for IDs (use `crypto.randomUUID()`)
- `console.log` / `console.error` (use `src/lib/logger.ts`)
- `.max()` on Zod string fields in LLM output schemas (Anthropic doesn't enforce it — use `.transform()` post-clamp)
- `as unknown as` casts on JSON columns (use `safeParseX()` helpers for reads, `toJsonValue()` for writes)
- `findUnique({ id })` + manual `userId !==` check (use `findFirst({ id, userId })` — single-query ownership scope)

---

## Package Manager

**This project uses pnpm exclusively. Never npm. Never yarn.** This is not a preference — it is a hard correctness requirement.

The Prisma client needs a postinstall patch (`scripts/fix-prisma-pnpm.js`, declared as the `postinstall` hook in `client/package.json`) that compensates for how pnpm symlinks `.prisma`. Running `npm install` or `yarn install` produces a `node_modules` layout the patch cannot fix, and TypeScript starts failing to resolve generated Prisma types — a silent corruption that wastes hours to diagnose.

Concrete rules:

- **Install / add / remove dependencies:** `pnpm install`, `pnpm add <pkg>`, `pnpm remove <pkg>`. Never `npm i`, `npm install`, `npm ci`, `yarn`, or `yarn add`.
- **Run scripts:** `pnpm <script>` (e.g. `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test`). Use `pnpm exec <bin>` instead of `npx <bin>` whenever the binary is already a project devDependency — `npx` invocations are fine for one-off tools that aren't installed.
- **Monorepo shape:** the repo is a pnpm workspace. Members are `client` and `packages/*` (which currently contains `api-types` and `constants` — shared schemas and enum value lists consumed by both client and mobile). Mobile is **intentionally not a workspace member** — EAS Build misdetects pnpm workspaces as yarn workspaces, so mobile installs standalone with its own lockfile. Mobile consumes the shared packages via `link:../packages/*` relative symlinks, which work in both local dev and on EAS build workers (where the full monorepo is uploaded and a pre-install hook in `mobile/package.json` strips the root workspace file before install runs).
- **Lockfiles:** the root `pnpm-lock.yaml` is the single source of truth for the client workspace (client + packages/*). It is committed. Mobile keeps its own `mobile/pnpm-lock.yaml` (also committed) for the standalone install. `package-lock.json` and `yarn.lock` are gitignored so a stray `npm install` cannot reintroduce them. If you find a `package-lock.json` in the working tree, delete it — do not commit it, do not run `npm install` to "regenerate" it.
- **Adding client or package dependencies:** run `pnpm add <pkg>` from inside `client/` (or `packages/<name>/`), or equivalently `pnpm --filter <workspace-name> add <pkg>` from the repo root. The dep lands on the right `package.json` and the root `pnpm-lock.yaml` updates. Verify `pnpm-lock.yaml` at the repo root shows up in `git status` after the add — if only a `package.json` changed, something went wrong.
- **Adding mobile dependencies:** run `cd mobile && pnpm add <pkg> --ignore-workspace`. The `--ignore-workspace` flag is mandatory for mobile — without it pnpm writes to the root lockfile instead of `mobile/pnpm-lock.yaml`.
- **Shared packages:** any value that must match across client and mobile — Zod schemas for wire shapes, enum value lists, configuration limits — belongs in `packages/api-types` or `packages/constants`. The client uses `workspace:*` references to these packages; mobile uses `link:../packages/*`. **Do not duplicate enum values or domain types in both apps — import them.** `packages/api-types` declares `zod` as a peerDependency, so both client and mobile must pin compatible versions.
- **Pinned dependencies via pnpm overrides:** zod is pinned to exactly `4.1.12` in the root `package.json` overrides block (mobile pins the same version in its own package.json). inngest is pinned to `4.1.1`. The reason lives in `_pnpm_overrides_reason` at the top of the root `package.json` — read it there before bumping either. Unpinning without checking will reintroduce the JsonifyObject / workspace-package type-identity issue.
- **Documentation:** any code blocks, READMEs, or runbook entries showing install / build / test commands must use `pnpm`. The only exception is when documenting *why* npm is forbidden.
- **Claude Code permissions:** the project's `.claude/settings.local.json` allow-lists pnpm commands and explicitly denies `npm install`, `npm i`, `npm ci`, `npm run`, and `yarn` invocations. Do not edit the deny list to "just this once" run npm — if a tool truly needs npm, escalate to the user instead of bypassing the guard.

The reason is documented at `RUNBOOK.md` § "Never use npm install" and `README.md` line 80, both of which predate this section. This entry exists in CLAUDE.md so the rule is loaded into every Claude Code session by default.

---

## AI Integration Standards

### Claude API calls

```typescript
// CORRECT: Adaptive Thinking with effort parameter
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 8096,
  thinking: { type: 'enabled', effort: 'medium' }, // low | medium | high
  messages: [...],
});

// WRONG: Do not use budget_tokens — deprecated
// thinking: { type: 'enabled', budget_tokens: 5000 }
```

- Use `claude-sonnet-4-6` for: interview question generation, context extraction, structured output
- Use `claude-opus-4-6` for: final recommendation synthesis only (cost control)
- Extended thinking must be used for synthesis. For simple extraction, disable it.

### Vercel AI SDK v5

- Use `streamText` for all user-facing conversational responses
- Use `generateObject` with a Zod schema for all structured data extraction
- Tool definitions must be generated via `z.toJSONSchema()` — never handwrite JSON Schema
- The `useChat` hook is the only client-side hook for conversation state

### Prompt caching (Anthropic)

**Every Claude call with a stable prefix ≥ 1024 tokens MUST cache.** A cache
hit pays 0.1× the normal input-token price, cuts latency from >1s to ~100ms,
and is backwards-compatible (a miss renders identically to an uncached call).
Cached prompts stay warm for 5 minutes server-side — a perfect fit for
multi-turn interactions (discovery interview, pushback loop, check-in
conversations, coach rehearsal, diagnostic chat).

**Use the helpers in `src/lib/ai/prompt-cache.ts`. Never write `cache_control`
or `providerOptions.anthropic.cacheControl` inline — the helper applies the
right shape and the right minimum-token threshold.**

Choose the shape that matches the call:

```typescript
// CORRECT — Vercel AI SDK, two-message split (most common)
const { object } = await generateObject({
  model: aiSdkAnthropic(modelId),
  schema: MySchema,
  messages: cachedUserMessages(STABLE_RULES_AND_CONTEXT, VOLATILE_TURN),
});

// CORRECT — Vercel AI SDK with a system prompt (streaming questions etc.)
await streamText({
  model,
  system: cachedSystem(BIG_SYSTEM_RULES),
  messages: priorTurnsPlusCurrent,
});

// CORRECT — raw @anthropic-ai/sdk (synthesis-engine summarisation etc.)
await anthropicClient.messages.create({
  model,
  max_tokens: 1024,
  messages: [{ role: 'user', content: cachedAnthropicContent(STABLE, VOLATILE) }],
});

// WRONG — single concatenated message when a stable prefix exists
messages: [{ role: 'user', content: `${RULES}${CONTEXT}${USER_TURN}` }];

// WRONG — hand-rolled cache_control inline
providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } };
```

**What counts as stable:** rules / instructions, tool-use guidance, schema
descriptions, belief-state rendering, roadmap outlines (stable until task
status changes), recommendation blocks, prior conversation turns older than
the current one. **What counts as volatile:** the founder's latest message,
the specific task being checked in on this call, and any per-call
classification verdicts.

**Where the breakpoint goes:** at the END of the stable content, right before
the volatile suffix. Anthropic caches everything up to and including the
marker. Maximum four cache breakpoints per request — almost every call in
this codebase only needs one.

### Zod v4 schema patterns

```typescript
// CORRECT: Infer TypeScript types from Zod schemas
const DiscoveryContextSchema = z.object({ ... });
type DiscoveryContext = z.infer<typeof DiscoveryContextSchema>;

// WRONG: Duplicate types manually
// type DiscoveryContext = { ... }; // Don't do this
```

---

## AI Engine Standards

The old multi-agent BaseAgent system was removed in the cleanup. The
current architecture uses **engine functions** — standalone async
functions that take typed input, call `generateObject` or `streamText`
via the Vercel AI SDK, validate the output through a Zod schema, and
return a typed result. The orchestrating Inngest function or API route
persists the result; the engine never touches the database directly.

### Route handler shape (mandatory for every API route)

```typescript
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

### JSON column patterns

```typescript
// READING a JSON column — use a safeParse helper:
const context = safeParseDiscoveryContext(row.beliefState);
// NEVER: const context = row.beliefState as unknown as DiscoveryContext;

// WRITING a typed value to a JSON column — use toJsonValue:
data: { phases: toJsonValue(roadmap.phases) }
// NEVER: data: { phases: roadmap.phases as unknown as Prisma.InputJsonValue }
```

### AI call resilience

```typescript
// CORRECT: every generateObject call uses withModelFallback
const result = await withModelFallback(
  'module:function',
  { primary: MODELS.INTERVIEW, fallback: MODELS.INTERVIEW_FALLBACK_1 },
  async (modelId) => {
    const { object } = await generateObject({
      model: aiSdkAnthropic(modelId),
      schema: MySchema,
      messages: [...],
    });
    return object;
  },
);

// WRONG: bare generateObject with no fallback
const { object } = await generateObject({ model: ..., schema: ..., messages: [...] });
```

- Engines do not make direct database calls. They return structured results; the orchestrating function persists them.
- The belief state is a Prisma JSON field. Read it through `safeParseDiscoveryContext()` — never raw cast.
- An engine that fails must throw. The Inngest function catches it, logs it, and decides retry vs escalation. Engines do not swallow errors.

---

## Git Workflow

1. All work happens on `feature/phase-N-*` branches branched from `dev`.
2. Commits must be descriptive and atomic. One logical change per commit.
3. Format: `type(scope): description` — e.g., `feat(interview): add belief state schema`, `fix(api): handle redis ttl expiry`
4. No commits directly to `main` or `dev`.
5. PRs require: passing TypeScript compilation, no ESLint errors, and a description of what changed and why.
6. Merge `dev` into `main` only when a complete phase is tested and verified.

---

## File Size and Structure Limits

These are hard limits, not suggestions. They exist to prevent the primary failure mode of this codebase: files that grew without discipline until they became impossible to reason about.

### Hard limits per file

| File type | Max lines | Rationale |
|---|---|---|
| API route (`route.ts`) | 150 lines | Routes orchestrate — they do not implement |
| Service / engine (`*.ts` in `lib/`) | 300 lines | One responsibility means one screen |
| Agent (`*-agent.ts`) | 350 lines | Agents are complex but bounded |
| React component (`*.tsx`) | 200 lines | If it needs more, extract a sub-component |
| Zod schema file | 150 lines | Schemas are declarations, not logic |
| Inngest function | 200 lines | Steps should be extracted to services |
| Constants / types file | 100 lines | Split by domain if it grows |

**When a file approaches its limit, split it before it breaches.** Do not refactor after the fact. Split immediately.

### Hard limits per directory

| Directory | Max files | Action when breached |
|---|---|---|
| Any `lib/` subdirectory | 12 files | Create a named subdirectory |
| Any `components/` subdirectory | 15 files | Group by feature into subdirectory |
| Any `app/api/` route group | 10 route files | Group by domain |
| `inngest/functions/` | 15 files | Group by phase |

### Mandatory module structure

Every module directory must contain an `index.ts` barrel file that explicitly re-exports only the public interface. Nothing is accessed by reaching into internal files from outside the module. Internal files are an implementation detail.

```
lib/discovery/
├── index.ts                    # Public API — re-exports only
├── context-schema.ts           # Zod schemas (≤150 lines)
├── interview-engine.ts         # State machine (≤300 lines)
├── question-selector.ts        # Information gain logic (≤200 lines)
├── synthesis-engine.ts         # Prompt chain (≤300 lines)
└── constants.ts                # Named constants (≤100 lines)
```

### Naming rules

- Files: `kebab-case.ts` always
- Classes and types: `PascalCase`
- Functions and variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Zod schemas: suffix with `Schema` (e.g., `DiscoveryContextSchema`)
- Inngest functions: suffix with `Function` (e.g., `interviewSessionFunction`)

---

## What Not To Do

- Do not add `console.log` statements. Use `src/lib/logger.ts`.
- Do not create new files for one-time operations. Put utilities in the relevant module.
- Do not add dependencies without a clear reason. Every package is a maintenance burden.
- Do not use `// @ts-ignore` or `// @ts-expect-error`. Fix the type.
- Do not write error handling for cases that cannot happen. Trust the type system.
- Do not add speculative features, abstractions, or configuration for hypothetical future requirements. Build what is needed now, correctly.
- Do not commit `.env` files, API keys, or secrets.
- Do not use `Math.random()` for IDs. Use `crypto.randomUUID()`.

---

## Definition of Done

A task is complete when:
1. TypeScript compiles with zero errors (`pnpm build`)
2. ESLint passes with zero warnings (`pnpm lint`)
3. The feature works end-to-end in the local development environment
4. All new Prisma models have been migrated (`pnpm prisma migrate dev`)
5. No `console.log`, `TODO`, or `FIXME` comments remain in the changed files
6. The code has been reviewed against all five engineering principles above
7. Behaviour with non-trivial logic — security boundaries, concurrency,
   data invariants, prompt sanitisation, fallback chains, anonymisation —
   has unit test coverage written against the canonical examples and
   the known edge cases.

## Testing

**Tests are not optional.** The codebase prioritises tests for things
that would silently break the product if they regressed. The
priority hierarchy:

1. **Hard data invariants** — e.g. "no row with `consentedToTraining=false`
   ever has a non-null `anonymisedRecord`." A failing test on this
   class of invariant indicates a serious bug.
2. **Security boundaries** — CSRF, rate limit, ownership filters,
   auth gating, prompt-injection delimiters, HMAC signatures.
3. **Concurrency and idempotency** — pushback optimistic locks,
   accept idempotency, atomic JSON+progress writes.
4. **Pure helpers and parsers** — Zod schemas, anonymisation
   regexes, taskId derivation, date/time parsing in cron sweeps.
5. **Fallback and resilience paths** — provider chain, backoff,
   stream-cut detection, retry semantics.

**Lower priority for tests:**
- Happy-path React component rendering
- Snapshot tests of LLM prompts (the prompts evolve; freezing them
  produces brittle tests that get auto-skipped)
- Trivial getters and one-liners

**Test stack (when added):** Vitest is already a project devDependency.
Tests live alongside the source file as `foo.test.ts`. Server-only
test files use `import 'server-only'` guards via vitest's mocking.
LLM calls in tests use Vercel AI SDK's `MockLanguageModelV2` so
no real API calls are made.

The test suite is intentionally added LAST in the codebase cleanup
and bulletproofing sequence. The order is: dead code purge → schema
cleanup → pattern standardisation → type safety → documentation →
**tests last.** This is because tests written against the wrong
patterns are wasted work; we standardise first so the test surface
is the right shape.

---

*NeuraLaunch — Built with precision by Saheed Alpha Mansaray*
*Engineering standards last updated: 2026-04-09*
