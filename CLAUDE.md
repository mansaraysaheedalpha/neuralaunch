# NeuraLaunch — Engineering Standards

> This document governs every line of code written in this repository.
> It is not aspirational. It is mandatory.

---

## Project Context

**NeuraLaunch** is an AI-powered growth engine that guides people from a vague idea or stalled situation to a launched product. It is built by two people with the precision and discipline expected of a senior engineering team at a world-class technology company.

**Repository layout:**
```
neuralaunch/
├── client/          # Next.js 15 application (primary codebase)
│   ├── src/app/     # App Router pages and API routes
│   ├── src/lib/     # Core business logic, agents, services
│   ├── src/components/
│   ├── src/inngest/ # Durable background functions
│   └── prisma/      # Database schema and migrations
└── mcp-servers/     # MCP integration servers
```

**Active branch strategy:**
- `main` — production-ready, protected. No direct commits.
- `dev` — integration branch. All features merge here first via PR.
- `feature/phase-N-*` — one branch per product phase. Branched from `dev`.

**Current phase:** `feature/phase-1-discovery-engine`

---

## Core Engineering Principles

Every decision — architecture, naming, structure, implementation — must satisfy all five of the following principles. When they conflict, use the order listed as the tiebreaker.

### 1. Reliability

The system must behave correctly under failure. Users trust NeuraLaunch with their ideas and time. Losing their session state, returning a hallucinated recommendation, or silently dropping data is a fundamental product failure.

- Every external I/O operation (AI calls, DB writes, Redis, third-party APIs) must handle failures explicitly. No silent catches.
- Inngest functions are the primary mechanism for durable execution. Any operation that cannot tolerate a serverless timeout must run inside an Inngest step.
- All AI-generated structured data must be validated through a Zod v4 schema before it touches the database or the client. Never trust raw LLM output.
- Use Prisma transactions for any operation that involves more than one write. Partial writes are data corruption.
- Upstash Redis is ephemeral. Never rely on it as the only store for state that must survive beyond the session TTL.

### 2. Security

NeuraLaunch handles personal information — people's frustrations, business ideas, financial situations, and goals. This data is sensitive. Treat it accordingly.

- Never log user message content, belief state data, or AI outputs at INFO level. Use DEBUG, and ensure DEBUG is off in production.
- All API routes must authenticate via NextAuth before executing any business logic. No unauthenticated route should touch the database.
- Validate and sanitize all user input at the API boundary using Zod before it reaches any service or agent. SQL injection, prompt injection, and XSS are not acceptable failure modes.
- Environment variables must be validated at startup via `src/lib/env.ts`. The application must refuse to start if required secrets are missing.
- AI tool calls that execute system commands (sandbox agent, command tool) must run inside Docker containers with strict resource limits. Never execute user-influenced strings as shell commands outside a sandbox.
- Never expose internal error messages, stack traces, or Prisma error codes to the client. Log them server-side; return a generic, safe message to the client.
- Secrets (API keys, tokens) must never appear in logs, error messages, or response bodies.

### 3. Scalability

The system must degrade gracefully under increased load, not collapse.

- All Inngest functions must be idempotent. Running the same function twice with the same input must produce the same outcome with no side effects.
- Rate limiting is mandatory on all AI-calling API routes. Use `src/lib/rate-limit.ts`. Every LLM call has a cost; unbounded requests will bankrupt the project.
- Use streaming responses (Vercel AI SDK v5 `streamText`) for all real-time AI output. Never buffer a full AI response in memory before sending it.
- Database queries must use explicit `select` clauses. Never fetch entire records when only a subset of fields is needed.
- Add appropriate database indexes when introducing new query patterns. Check `prisma/schema.prisma` `@@index` directives.
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
| Real-time | Pusher | current | To be evaluated for Ably migration (Phase 2+). |
| Database | PostgreSQL (Neon) | — | pgvector extension for vector search. |

**Deprecated — do not use:**
- `framer-motion` (replaced by `motion/react`)
- `budget_tokens` in Anthropic calls (replaced by Adaptive Thinking `effort` parameter)
- `useEffect` for data fetching (replaced by Server Components + `use()`)
- Manual SSE transport for MCP (replaced by Upstash Pub/Sub pattern)

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

### Zod v4 schema patterns

```typescript
// CORRECT: Infer TypeScript types from Zod schemas
const DiscoveryContextSchema = z.object({ ... });
type DiscoveryContext = z.infer<typeof DiscoveryContextSchema>;

// WRONG: Duplicate types manually
// type DiscoveryContext = { ... }; // Don't do this
```

---

## Agent System Standards

- Every agent extends `BaseAgent`. No standalone functions that replicate agent behavior.
- Agent tools are registered in the tool registry. New tools require a `base-tool.ts` interface implementation.
- Agents do not make direct database calls. They return structured results; the orchestrating function persists them.
- The belief state is a Prisma JSON field. Agents read from and write to it through typed accessor functions — never raw JSON mutation.
- An agent that fails must throw a typed error. The Inngest function catches it, logs it, and decides retry vs escalation. Agents do not swallow errors.

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

---

*NeuraLaunch — Built with precision by Saheed Alpha Mansaray*
*Engineering standards last updated: 2026-04-02*
