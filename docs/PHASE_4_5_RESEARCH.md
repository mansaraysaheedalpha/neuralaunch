# NeuraLaunch — Phase 4 & Phase 5 Technology Research

> Compiled research for the Website Builder (Phase 4) and the MVP Builder
> (Phase 5). Captures the late-2026 landscape of AI agent frameworks, code
> execution sandboxes, deployment automation, and how the current market
> leaders (Lovable, Bolt.new, v0) actually work under the hood — with the
> architectural recommendations that follow from it.
>
> **Status:** Reference document. Not yet decided.
> **Owner:** Saheed Alpha Mansaray
> **Compiled:** 2026-04-07

---

## Executive Summary

After deep research into the late-2026 landscape, the recommended architecture
for NeuraLaunch Phase 4 and Phase 5 is:

> **Claude Agent SDK (TypeScript) + LangGraph (TypeScript) hybrid for Phase 5,
> Claude Agent SDK alone for Phase 4, E2B sandboxes for code execution, Vercel
> for Platforms for deployment — all in the existing Next.js monorepo. No
> Python service.**

The single most important finding: **the Claude Agent SDK (formerly Claude
Code SDK) is exactly the framework you described wanting.** It is, literally,
"Claude Code as a library." Same `Read`, `Write`, `Edit`, `Bash`, `Glob`,
`Grep` tools. Same agent loop. Same context management. Same subagent
spawning. Same hooks. Anthropic released it specifically so developers can
build domain-specific agents that work the way Claude Code works.

The full reasoning, comparisons, and concrete recommendations follow.

---

## 1. The Agent Framework Decision

### The Late-2026 Landscape

There are five real options for multi-agent code generation. After eliminating
the immature ones, three remain seriously in play.

**Claude Agent SDK** ([@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk))
— Renamed from Claude Code SDK on September 29, 2025. Current version 0.2.71
(TypeScript), 0.1.48 (Python). The TypeScript SDK is at parity with Python on
all core functionality: same six built-in tools, same agent loop, same hooks
(`PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `SessionEnd`,
`UserPromptSubmit`), same subagent system, same MCP integration, same session
resumption.

**LangGraph 1.x** — Reached 1.0 GA in October 2025, currently 1.0.10. The
TypeScript version exists and is at near-parity with Python for core graph
operations. Strongest in production for stateful, long-running workflows with
checkpointing, conditional routing, and human-in-the-loop gates.

**OpenAI Agents SDK / Swarm** — Solid but locks you to OpenAI's models, which
is wrong for NeuraLaunch since the rest of the system is Claude-based.

**CrewAI** — Good for prototyping, weaker production story, role-based
abstraction adds friction for code generation specifically.

**AutoGen / Magnetic-One** — Microsoft research, shifted focus, unstable for
production use.

### The Hybrid Pattern Emerging in Production

The serious teams building production code-generation agents in 2026 have
converged on a hybrid pattern:

> **LangGraph for the workflow skeleton, Claude Agent SDK for the heavy
> lifting inside nodes.**

LangGraph handles *workflow orchestration* — what runs when, under what
conditions, with what state, with what retry policy, with what human-approval
gates. The Claude Agent SDK handles *agent execution* — how an individual
agent runs, with what tools, with what context, with what subagents.

They operate at different levels and don't compete. LangGraph is the
conductor; Claude Agent SDK is the soloist. From the late-2026 analyses, this
is now the dominant production pattern for serious code generation systems.

### What Phase 5 Actually Needs

For **Phase 5**, the right shape is both:

- **LangGraph** owns the build pipeline. The graph is:
  `setup → scaffold → generate-pages → generate-api → generate-db → generate-tests → fix-loop → integration-test → deploy`.
  Each node has its own retry budget. Conditional edges based on test results.
  Human approval gates where needed. Persistent checkpointing so a build can
  resume after a crash.

- **Claude Agent SDK** runs inside each node. Each LangGraph node spawns a
  Claude Agent SDK agent with a focused prompt and a restricted tool set,
  scoped to the working directory in the sandbox. When the FrontendAgent
  needs to write 8 files, it does it through the SDK's `Write`/`Edit`/`Bash`
  tools — the same way Claude Code writes code.

For **Phase 4** (website builder), this is overkill. Phase 4 is mostly content
generation with light scaffolding — it doesn't need a graph. **Phase 4 should
just use the Claude Agent SDK directly with a single agent and the standard
tools.**

### What's in the Claude Agent SDK

| Tool | What it does |
|---|---|
| `Read` | Read any file in the working directory |
| `Write` | Create new files |
| `Edit` | Make precise edits to existing files |
| `Bash` | Run shell commands, scripts, git |
| `Glob` | Find files by pattern (`**/*.ts`) |
| `Grep` | Regex search across file contents |
| `WebSearch` | Search the web for current info |
| `WebFetch` | Fetch and parse web pages |
| `AskUserQuestion` | Multiple-choice clarifying questions |
| `Agent` | **Spawn subagents** with isolated context windows |

**Hooks system** — `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`,
`SessionEnd`, `UserPromptSubmit`. This is how you implement: cost tracking
per project, tool denylists per user tier, audit logging, sandbox enforcement,
"don't run `rm -rf` on the user's workspace."

**Custom tools as in-process MCP servers.** Write a TypeScript helper or
Python decorator and the SDK exposes your function as an MCP tool that runs
in the same process — no separate server, no IPC overhead. This is how you
give the agent access to your Postgres, your validation report data, your
deployment provider.

**Subagents have isolated context windows.** A main agent can spawn
`code-reviewer`, `test-writer`, `deploy-checker` subagents in parallel. Each
gets its own fresh context, runs concurrently, and only the final message
returns to the parent. From the official docs:

> *"Each subagent runs in its own fresh conversation with only its final
> message returning to the parent, giving you context isolation,
> parallelization, and per-subagent tool restrictions."*

This solves the context-window pollution problem that killed the old custom
agent system in NeuraLaunch.

**Sessions are resumable.** Capture `session_id` from the first query, pass
it to `resume` on the next, and Claude continues with full context — without
re-reading files. Solves the long-running build state problem cheaply.

**Authentication options:** Direct Anthropic API key, AWS Bedrock, Google
Vertex AI, Microsoft Azure AI Foundry. NeuraLaunch will use the direct
Anthropic API.

**Cost model:** SDK is free and open source. You pay only for Claude API
token usage.

### LangGraph — Use It or Drop It

`@langchain/langgraph` 1.0.1 is already in `package.json`. The right call:
**use it for Phase 5, drop it from Phase 4** (use Claude Agent SDK alone).

---

## 2. The Sandbox Decision

### The Numbers (Late-2026 Benchmark)

| Provider | Cold start | Hourly (1vCPU/2GB) | Persistence | Snapshots | Best for |
|---|---|---|---|---|---|
| **E2B** | ~150ms | $0.0828 | ✅ Persistent | ❌ | AI app builders, Firecracker microVMs |
| **Daytona** | ~90ms | $0.0828 | ✅ Persistent | ✅ | Persistent dev environments |
| **Modal** | sub-second | $0.1193 | Snapshots only | ✅ | Python-heavy, GPU workloads |
| **Blaxel** | ~25ms | $0.0828 | Snapshots only | ✅ | Stateful agents needing fast resume |
| **Cloudflare Sandbox** | 2–3s | $0.090 | Limited | ❌ | Edge-first apps |
| **Vercel Sandbox** | fast | $0.1492 | Ephemeral | ❌ | One-shot tasks only |

Source: Superagent AI Code Sandbox Benchmark 2026 (and corroborating
comparisons from ZenML, Northflank, Better Stack).

### Recommendation: E2B

**Reasons specific to NeuraLaunch:**

1. **Persistence matters.** A NeuraLaunch user's MVP build takes 5–20 minutes
   and they may come back the next day to iterate. Vercel Sandbox is
   ephemeral and disqualified. Modal and Blaxel only support snapshots which
   means lifecycle management overhead. E2B and Daytona just give you a
   persistent filesystem.

2. **Firecracker microVMs vs containers.** E2B runs each sandbox in a
   Firecracker microVM with a dedicated kernel per session. Daytona uses
   Docker containers with a shared host kernel. For multi-tenant code
   execution where untrusted user-influenced code will run, Firecracker's
   kernel-level isolation is the right security boundary.

3. **Best-in-class TypeScript SDK.** Benchmark explicitly notes E2B has
   "great SDKs" and is "best for quick integration." NeuraLaunch is
   TypeScript-first.

4. **150ms cold start is fine.** Daytona's 90ms isn't worth changing
   trade-offs for. The user will already wait several seconds for the first
   agent response.

5. **Pricing is competitive.** $0.0828/hour matches Daytona and Blaxel and
   beats Modal/Cloudflare/Vercel. At a typical 15-minute build, that's
   roughly $0.02 in compute per build. The Anthropic API costs will dominate.

6. **$100 free credit on Hobby tier.** ~1,200 hours of testing before paying
   anything.

### Why Not Daytona

Daytona is 90ms cold start vs 150ms — a difference that doesn't matter for
this use case. It uses Docker containers with shared kernel — worse isolation
than E2B. Snapshots are nice but only valuable if forking sandboxes to try
multiple approaches, which Phase 5 doesn't need.

### Why Not WebContainers (Bolt's Approach)

Bolt.new uses StackBlitz WebContainers — Node.js running in the browser via
WebAssembly. It's clever but wrong for NeuraLaunch:

- WebContainers run in the user's browser tab. Close the tab, build dies.
- Many npm packages don't work in WebContainers (anything native, anything
  with real filesystem semantics, Prisma, etc.).
- Cannot run a real database — Bolt has to fake this.
- Build state is on the user's machine, not yours, so you can't run agents
  server-side while the user reads their recommendation.

Phase 5 needs server-side execution that continues regardless of what the
user is doing in their browser. E2B is the right answer.

### Why Not Self-Hosted Firecracker

You could run your own Firecracker pool. You shouldn't. The engineering cost
of building a multi-tenant Firecracker control plane (provisioning,
networking, security patching, kernel management, snapshots, billing) is at
least 2 engineer-months. E2B is solving exactly this problem and charging
$0.0828/hour for it. Don't reinvent.

---

## 3. Python vs TypeScript — The Honest Answer

**Use TypeScript. Stay in the existing monorepo. Do not introduce a Python
FastAPI service for the agent layer.**

### Why

1. **Claude Agent SDK TypeScript is at parity with Python.** Same six tools.
   Same agent loop. Same hooks. Same subagents. Same MCP. Same sessions. The
   TypeScript SDK is at version 0.2.71 in early 2026, actively maintained by
   Anthropic. There is no functional gap that would justify a separate Python
   service.

2. **LangGraph TypeScript exists and works.** Not as battle-tested as the
   Python version, but for the workflow patterns Phase 5 needs (graph with
   nodes, conditional edges, checkpointing, human-in-the-loop), it's
   complete.

3. **The cost of crossing the language boundary is real.** A separate Python
   service means: separate deployment pipeline, separate environment
   variables, separate logging, separate auth secrets, separate Sentry
   project, separate CI, network calls between services, serialization of
   belief state across the boundary, debugging spans across two stacks. For
   an organization of two people, that's a permanent tax on every change.

4. **Existing infrastructure is TypeScript-native.** Inngest v4, Vercel AI
   SDK v6, Prisma, NextAuth, Redis, Vector — all TypeScript. Adding Python
   means re-implementing all the cross-cutting concerns (auth, rate
   limiting, prompt injection defense, Sentry instrumentation) in a second
   language.

5. **The single legitimate reason to use Python doesn't apply here.**
   Python's advantage in agent frameworks was historically that LangChain
   and LangGraph were Python-first and the TypeScript ports lagged. As of
   late 2026 that's no longer the case for the things you actually need.

### When You Would Want Python

If Phase 5 needed heavy ML beyond LLM calls (custom embeddings, vision
models, fine-tuning), Python would win. But Phase 5 is LLM orchestration +
sandbox execution + deployment. None of that is Python-favored.

**Save the FastAPI experience for if you ever need a separate service for
something Python is genuinely better at** — self-hosted embeddings, custom
evaluation pipelines, scientific computing. Don't preemptively split the
architecture.

---

## 4. Deployment — Vercel for Platforms

### The Two Multi-Tenant Models

From the official Vercel docs, there are two architectures:

**Multi-Tenant (single deployment, multiple domains)** — One Next.js codebase,
many domains pointing at it. Tenants differentiated at runtime by host
header. Used by Hashnode, Dub, Mintlify, Cal.com, Zapier Interfaces.

**Multi-Project (one project per tenant)** — Each user gets their own Vercel
project, their own deployments, their own environment variables, their own
custom domain.

### Which One Is Right for NeuraLaunch

**Multi-Project.** Each user generates a unique app, with unique code, unique
dependencies, unique environment variables. Cannot serve them all from one
deployment. The Multi-Tenant model is for SaaS platforms where every tenant
runs the same code; Phase 5 builds *unique* code for each user.

Vercel for Platforms supports this. The Vercel REST API lets you
programmatically:

- Create a new project per user (`POST /v9/projects`)
- Push code (`POST /v13/deployments` with file uploads or git source)
- Manage environment variables (`POST /v9/projects/{projectId}/env`)
- Add custom domains (`POST /v9/projects/{projectId}/domains`)
- Trigger redeploys

### Critical Limits

- **Hobby plan caps at 50 custom domains.** Pro tier is the floor for
  NeuraLaunch production.
- **Pro plan: effectively unlimited custom domains** (soft limit 100,000 per
  project, raisable on request).
- **Multi-tenant preview URLs are Enterprise-only.** Workaround: use your own
  subdomain routing on a single project for previews, then promote to a real
  per-user project on publish.
- **Custom SSL certs are Enterprise-only.** Auto-issued certs are fine for
  99% of cases.
- **Domain API rate limits:** 100 add/remove + 50 verify per hour per team.

### Cost Forecast

- Vercel Pro: $20/month base
- Per generated user app: ~$0 if it stays under Pro plan inclusive limits,
  then $0.06 per million function invocations
- Custom domains: free, unlimited
- Build minutes: 6000/month included on Pro, then $0.0067/minute
- Bandwidth: 1TB/month included on Pro

For 100 active user-generated apps with light traffic, total monthly Vercel
bill should be under $50. The Anthropic API costs will dominate everything
else.

### Why Not Render / Railway / Fly.io

Render is a great platform but not optimal here:

- Render is project-based but doesn't have a multi-tenant API as polished as
  Vercel for Platforms
- Cold starts on Render's free tier are punishing
- The Next.js + Vercel optimizations (edge functions, ISR, image
  optimization) are non-trivial to replicate elsewhere

Vercel for Platforms is the right answer because the apps NeuraLaunch
generates will be Next.js apps and Vercel is where Next.js runs best.
Railway is the second choice if Vercel pricing becomes prohibitive.

---

## 5. How Lovable, Bolt.new, and v0 Actually Work

### The Three Tools

**v0 (Vercel)** uses multiple proprietary models — v0-Mini, v0-Pro, v0-Max —
fine-tuned specifically for React + Tailwind + shadcn/ui. The output is
tightly opinionated: every component is shadcn, every style is Tailwind,
every project is Next.js. This is its strength (consistency) and its
limitation (you can't deviate). Deployment is Vercel-native.

**Bolt.new (StackBlitz)** uses Claude Sonnet (with optional model swaps in
the Bolt.diy variant) and runs everything in-browser on WebContainers. Fast
preview, instant feedback, but limited to what runs in WebAssembly Node.
Deployment is Netlify or whatever you wire up.

**Lovable** uses Claude Sonnet primarily, generates React + Supabase apps,
exports to GitHub. Backend is Supabase Edge Functions. The interesting thing
about Lovable is the "element selection from preview" UX — you click an
element in the live preview and tell the AI to change it, and the AI knows
which file to edit because of how Lovable instruments the components.

### The 70% Problem They All Share

From Addy Osmani's analysis:

> *"All three tools hit the '70% problem' — they bootstrap quickly but
> eventually require manual editing as projects grow complex. You will
> likely hit a complexity threshold where shifting to editing code locally
> will be necessary."*

**This is the gap NeuraLaunch should target.** The 70% problem comes from:

1. **No real test loop.** They generate code but don't run it through a
   comprehensive test suite, so when the code breaks, the user has to fix
   it manually.
2. **No structured iteration loop.** A user who wants to add a third feature
   has to re-prompt and hope the AI doesn't break the first two.
3. **No long-term context.** The agent forgets earlier decisions because
   the context window pollutes.
4. **No agent specialization.** One model writing frontend, backend, and
   database simultaneously means none of them get expert treatment.

### What NeuraLaunch Can Do Better

| Their gap | NeuraLaunch's solution |
|---|---|
| One generic model doing everything | Subagent specialization via Claude Agent SDK (FrontendAgent, BackendAgent, DatabaseAgent, TestAgent — each with restricted tools and focused prompts, each running in isolated context) |
| No real test loop | LangGraph self-healing loop: `generate → test → if-fail-fix → if-fail-escalate` with explicit retry budgets per node |
| Generated from a guess | Generated from a *validated build brief* (Phase 3 output) — every feature has data behind it |
| Forgets what it built | LangGraph checkpointing + Claude Agent SDK session resumption — full history persisted across the entire build |
| Manual handoff to local IDE | Live in-app preview that stays connected to the running sandbox — same model as Lovable's element selection but with a better agent loop behind it |

The 70% problem is structural to one-shot prompting. The solution is
structural too: gated workflow (LangGraph) + specialized agents (Claude
Agent SDK subagents) + isolated execution per agent + persistent state.
None of those things exists in Bolt or Lovable today. NeuraLaunch can build
it.

---

## 6. Recommended Phase 5 Architecture

### The Stack

```
TypeScript monorepo (existing client/)
│
├── @anthropic-ai/claude-agent-sdk   ← agent execution
├── @langchain/langgraph              ← workflow orchestration
├── @e2b/code-interpreter              ← sandboxed code execution
├── ai (Vercel AI SDK v6)              ← non-agent LLM calls (already in use)
├── inngest                            ← background job runner (already in use)
├── prisma                             ← persistence (already in use)
└── @upstash/redis                     ← session state (already in use)
```

**Net new dependencies for Phase 5: 3.**

### The Build Pipeline (LangGraph Skeleton)

```
                ┌──────────────────────────────────────┐
                │       Phase 5 Build Graph            │
                └──────────────────────────────────────┘

┌─────────────┐
│   START     │  load Recommendation + Roadmap + ValidationReport
└──────┬──────┘
       ▼
┌─────────────┐
│  PROVISION  │  spin up E2B sandbox, mount /workspace
└──────┬──────┘
       ▼
┌─────────────┐
│  SCAFFOLD   │  Claude Agent SDK: create-next-app + base structure
└──────┬──────┘
       ▼
┌─────────────┐
│  PLAN BUILD │  Decompose into phases by feature
└──────┬──────┘
       ▼
┌──────────────────────┬──────────────────────┬─────────────────┐
▼                      ▼                      ▼                 ▼
DB AGENT           BACKEND AGENT         FRONTEND AGENT     INFRA AGENT
(subagent)         (subagent)            (subagent)         (subagent)
schema, prisma     api routes,           pages,              env vars,
migrations         business logic        components          deployment config
│                      │                      │                 │
└──────────────────────┴──────────┬───────────┴─────────────────┘
                                  ▼
                          ┌───────────────┐
                          │  TEST AGENT   │  run vitest, capture failures
                          └───────┬───────┘
                                  │
                       ┌──────────┴──────────┐
                       ▼                     ▼
                  fail (retry           pass
                  budget left)
                       │                     │
                       ▼                     ▼
                ┌───────────┐         ┌───────────────┐
                │ FIX LOOP  │         │ CRITIC AGENT  │  security, perf review
                └─────┬─────┘         └───────┬───────┘
                      │                       │
                      └───────┬───────────────┘
                              ▼
                      ┌───────────────┐
                      │   DEPLOY      │  Vercel for Platforms API
                      └───────┬───────┘
                              ▼
                      ┌───────────────┐
                      │ PREVIEW LIVE  │  serve preview URL in app iframe
                      └───────────────┘
```

Each oval is a LangGraph node. Each rectangle is a Claude Agent SDK call
with specific `allowed_tools`, scoped to the E2B sandbox working directory.

### The Subagent Definitions

```typescript
// lib/builder/agents/definitions.ts
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';

export const BUILDER_SUBAGENTS: Record<string, AgentDefinition> = {
  'database-architect': {
    description: 'Generates Prisma schema, migrations, and seed data',
    prompt: `You are a database architect. Given a feature spec, you write the
    Prisma schema, generate the migration, and create realistic seed data.
    You use Postgres-compatible types only. Every model has proper indexes.`,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep'],
  },
  'backend-engineer': {
    description: 'Writes Next.js API routes, business logic, validation',
    prompt: `You are a backend engineer building a Next.js 15 App Router API.
    Every route uses Zod validation, NextAuth authentication where applicable,
    Prisma for data access, and returns typed JSON. Errors are caught and
    return safe error responses.`,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'frontend-engineer': {
    description: 'Writes React components, pages, forms, styling',
    prompt: `You are a frontend engineer building a Next.js 15 App Router frontend.
    Use Tailwind CSS, shadcn/ui where appropriate, React Hook Form for forms,
    and Zod schemas inferred from the backend. Server components by default.`,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'test-runner': {
    description: 'Writes vitest tests and runs them, reports failures',
    prompt: `You are a test engineer. Write vitest tests for every API route
    and key business logic function. Run them and report failures with file:line.`,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  },
  'critic': {
    description: 'Reviews generated code for security, perf, accessibility',
    prompt: `You are a senior reviewer. Read the generated code and produce a
    structured review: security issues, performance issues, accessibility issues,
    each with file:line and severity. Do not write code — only review.`,
    tools: ['Read', 'Glob', 'Grep'],  // read-only — cannot modify code
  },
};
```

Five specialized subagents. Each scoped to its responsibility. Each with the
exact tools it needs and nothing more. The Critic is read-only — it cannot
accidentally modify code while reviewing.

### The LangGraph Node Pattern

```typescript
// lib/builder/graph/nodes/frontend-node.ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { BuilderState } from '../state';

export async function frontendNode(state: BuilderState): Promise<Partial<BuilderState>> {
  const messages: string[] = [];

  for await (const message of query({
    prompt: buildFrontendPrompt(state.spec, state.completedFeatures),
    options: {
      cwd: state.sandboxWorkdir,           // E2B sandbox path
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Agent'],
      agents: { 'frontend-engineer': BUILDER_SUBAGENTS['frontend-engineer'] },
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [enforceBashAllowlist] }],
        PostToolUse: [{ matcher: 'Edit|Write', hooks: [logFileChange(state.buildId)] }],
      },
      model: 'claude-sonnet-4-6',
    },
  })) {
    if ('result' in message) messages.push(message.result);
  }

  return { frontendComplete: true, frontendLog: messages };
}
```

The Claude Agent SDK does the heavy lifting inside the node. LangGraph's job
is to call the node, persist its state, decide what runs next, and retry on
failure.

### The E2B Integration

```typescript
// lib/builder/sandbox/e2b-manager.ts
import { Sandbox } from '@e2b/code-interpreter';

export async function provisionBuildSandbox(buildId: string): Promise<Sandbox> {
  const sandbox = await Sandbox.create('neuralaunch-nextjs', {
    metadata: { buildId },
    timeoutMs: 30 * 60 * 1000,  // 30 min wall-clock
  });

  await sandbox.commands.run('mkdir -p /workspace');
  await sandbox.commands.run(
    'cd /workspace && npx create-next-app@15 . --typescript --tailwind --app --no-eslint --use-pnpm'
  );

  return sandbox;
}
```

E2B's TypeScript SDK is straightforward. The Claude Agent SDK runs the
agents in your Inngest worker process; E2B is the place where the agents'
`Bash` and `Edit` calls actually execute.

### Module Structure

```
src/lib/builder/
  index.ts                      # public API
  constants.ts                  # model selection, retry budgets, timeouts
  state.ts                      # BuilderState type
  sandbox/
    e2b-manager.ts              # provisioning, lifecycle
    sandbox-fs.ts               # file ops via E2B
  agents/
    definitions.ts              # AgentDefinition for each subagent
    prompts.ts                  # the actual prompts
  graph/
    graph-builder.ts            # LangGraph wiring
    nodes/
      provision-node.ts
      scaffold-node.ts
      plan-node.ts
      database-node.ts
      backend-node.ts
      frontend-node.ts
      test-node.ts
      fix-loop-node.ts
      critic-node.ts
      deploy-node.ts
    edges.ts                    # conditional routing
  deploy/
    vercel-platforms.ts         # Vercel for Platforms API client
  hooks/
    enforce-bash-allowlist.ts   # PreToolUse hook for safety
    log-file-change.ts          # PostToolUse hook for auditing
```

### Persistence Across the Build

```
DiscoverySession + Recommendation + Roadmap + ValidationReport
                                                    │
                                                    ▼
                                     ┌──────────────────────┐
                                     │       Build           │  ← new Prisma model
                                     │  (Phase 5)            │
                                     └──────────┬────────────┘
                                                ▼
                              ┌─────────────────┴─────────────────┐
                              ▼                                   ▼
                       BuildPhase[]                        BuildArtifact[]
                       (one per LangGraph node)            (generated files)
```

LangGraph checkpointing writes graph state to Postgres (it has a Prisma
adapter as of 1.0.5). The build can survive process restarts. Inngest
already provides durable execution at the orchestration layer. Together: a
build can crash mid-way and resume cleanly.

---

## 7. Recommended Phase 4 Architecture (Simpler)

Phase 4 is the marketing/website builder. Much less complex than Phase 5.
**Use Claude Agent SDK alone, no LangGraph, no E2B.**

```
ValidationReport (or Recommendation if no validation yet)
         │
         ▼
┌─────────────────────────────────────────────┐
│   Single Claude Agent SDK call               │
│   tools: Read, Write, Edit, Glob, Grep      │
│   cwd: in-memory virtual filesystem         │
│   subagents:                                 │
│     - copy-writer (one-shot)                │
│     - designer (selects template variant)   │
│     - seo-writer (meta tags, JSON-LD)       │
└──────────────────┬──────────────────────────┘
                   ▼
          Generated website files
                   │
                   ▼
          Vercel API: create project + deploy
                   │
                   ▼
          Live URL on user-chosen domain
```

Phase 4 doesn't need a sandbox for code execution because the website is
mostly static — it doesn't run anything that needs verification at build
time. The Vercel build step validates it. If Vercel build fails, the agent
reads the build log and fixes.

For Phase 4 a much smaller pattern works: a single agent with file system
tools that writes into a temporary local directory in the Inngest worker,
then uploads to Vercel.

### The Hybrid Logic for Phase 4 Input

Implementing the Option B hybrid decided previously:

```typescript
// lib/website-builder/input-resolver.ts
export async function resolveWebsiteBuildInput(recommendationId: string) {
  const recommendation = await prisma.recommendation.findUnique({
    where: { id: recommendationId },
    include: {
      session: { select: { beliefState: true, audienceType: true } },
      validationPage: { include: { report: true } },
    },
  });

  if (!recommendation) throw new Error('Not found');

  const report = recommendation.validationPage?.report;
  const hasStrongValidation = report &&
    (report.signalStrength === 'strong' || report.signalStrength === 'moderate');

  return {
    source: hasStrongValidation ? 'validated' : 'recommendation',
    recommendation,
    validatedFeatures: hasStrongValidation ? report.confirmedFeatures : null,
    surveyInsights: hasStrongValidation ? report.surveyInsights : null,
    canRegenerateAfterValidation: !hasStrongValidation,
  };
}
```

The Phase 4 generator branches on `source`. When validated, uses the
confirmed features and verbatim survey language. When not validated,
generates from the recommendation alone and the UI shows a "Regenerate after
validation" banner.

---

## 8. AI-Driven Scaffolding Patterns

The patterns that work for production-grade code generation:

**1. Scaffold-then-edit, NOT file-by-file from scratch.** Start from a
known-good template (a Next.js starter, a Vite + React starter, an Astro
starter), then have the agent edit it. This eliminates 80% of the
"boilerplate generation breaks" failure mode that plagues v0 and Bolt.

**2. AST-aware editing via tree-sitter or ts-morph.** When editing
TypeScript files, parse them properly instead of doing string replace. The
Claude Agent SDK's `Edit` tool already does this internally (Claude Code
uses anchored string matching with surrounding context), but for surgical
refactors across files, ts-morph in custom MCP tools is the right escape
hatch.

**3. Self-healing loops.** This is the pattern Claude Code uses internally:

```
generate → run typecheck → if errors, read errors, fix, retry
generate → run tests → if failures, read failures, fix, retry
generate → run build → if errors, fix, retry
```

The Claude Agent SDK supports this natively because `Bash` is a tool — the
agent runs `pnpm typecheck` itself, sees the output, and decides what to do.

**4. Parallel feature subagents.** For Phase 5, the planning agent breaks
the build brief into features, then spawns subagents in parallel — one per
feature, each with its own context. They write their files independently,
then a synthesis agent integrates and resolves conflicts.

**5. Test generation and execution as part of the loop.** Don't ship code
that hasn't been compiled. Don't ship features that haven't passed at least
a basic test.

---

## 9. Vector Memory and Code Context

**For Phase 5 you don't need a complex retrieval system.**

Modern code agents (Claude Code, Cursor, Windsurf, Cline) all converged on
the same insight: **for projects under ~50 files, you don't need vector
retrieval at all.** Just give the agent file system tools (`Read`, `Glob`,
`Grep`) and let it navigate. Claude Code does this.

Vector retrieval becomes valuable only when:

- Project exceeds ~100k tokens of code
- Multi-repo / monorepo navigation needed
- Cross-file semantic search ("find me all places that handle auth")

For Phase 5 generated MVPs (which will be small starter apps), the agent's
own `Read`/`Glob`/`Grep` tools will outperform vector retrieval. **Use the
SDK's built-in tools. Skip vector retrieval until you actually need it.**

NeuraLaunch already has Upstash Vector installed for the discovery engine.
Don't add a second layer for code.

---

## 10. The Decisions That Need Making Now

| Decision | Recommendation | Reasoning |
|---|---|---|
| Agent framework | **Claude Agent SDK + LangGraph hybrid** | Phase 5 needs both — SDK for execution, LangGraph for workflow |
| Language | **TypeScript only** | Keep monorepo intact, SDK parity is real |
| Sandbox | **E2B** | Best isolation, persistence, TypeScript SDK, fair pricing |
| Deployment | **Vercel for Platforms (Pro tier)** | Right model for unique-app-per-user |
| Phase 4 complexity | **Single Claude Agent SDK call, no LangGraph** | Don't over-engineer the simpler phase |
| Phase 5 first node | **Provision sandbox + scaffold Next.js** | Match the proven build pattern |
| Build order | **Phase 4 first, then Phase 5** | Simpler phase ships faster, validates the SDK + Vercel API integration |
| Cleanup before Phase 4 | **Drop dead models, dead deps, dead events** | Don't add to a polluted base |

---

## 11. Open Questions to Resolve Before Phase 5 Implementation

Two things I couldn't fully verify in this round of research and that should
be confirmed before writing any Phase 5 code:

1. **The exact mechanism for binding Claude Agent SDK's `Bash`/`Edit`/`Write`
   tool calls to execute inside an E2B sandbox.** The SDK's tools default to
   local filesystem and local shell. To make them target E2B you either need
   to (a) override the tool implementations with custom MCP tools that proxy
   to E2B's API, or (b) run the agent process *inside* the E2B sandbox
   itself via E2B's process execution. Both work; trade-offs differ. Read
   E2B's most recent agent integration cookbook before committing.

2. **LangGraph TypeScript checkpointer for Postgres.** The Python version
   has a battle-tested Postgres checkpointer. The TypeScript version has
   one but needs verification at production parity. Worst case implement a
   small custom checkpointer against the existing Prisma instance — a
   `save_state` / `load_state` pair against a `LangGraphCheckpoint` table.

Both are answerable with one focused day of prototyping at the start of
Phase 5 implementation. They don't change the architecture — they affect
50–100 lines of glue code.

---

## 12. Sources

**Claude Agent SDK:**
- [Agent SDK Overview — Anthropic](https://platform.claude.com/docs/en/agent-sdk/overview)
- [@anthropic-ai/claude-agent-sdk on npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [Building Agents with the Claude Agent SDK — Anthropic Blog](https://claude.com/blog/building-agents-with-the-claude-agent-sdk)
- [Claude Agent SDK Deep Dive — Shivansh Gupta on Medium](https://medium.com/@shivanshmay2019/claude-agent-sdk-deep-dive-what-it-means-to-use-claude-code-as-a-library-773aea121787)
- [Claude Agent SDK: Python & TypeScript Guide — Morph](https://www.morphllm.com/claude-agent-sdk)
- [Subagents in the SDK — Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/subagents)
- [Custom tools — Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/custom-tools)
- [Connect to external tools with MCP — Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/mcp)

**LangGraph + Multi-Agent Frameworks:**
- [LangGraph + Claude Agent SDK: The Ultimate Guide — Mager.co](https://www.mager.co/blog/2026-03-07-langgraph-claude-agent-sdk-ultimate-guide/)
- [LangChain Deep Agents vs. Claude Agent SDK — Rick Hightower on Medium](https://medium.com/@richardhightower/the-agent-framework-landscape-langchain-deep-agents-vs-claude-agent-sdk-1dfed14bb311)
- [Best Multi-Agent Frameworks in 2026 — Gurusup](https://gurusup.com/blog/best-multi-agent-frameworks-2026)
- [LangGraph vs CrewAI vs OpenAI Agents SDK — Particula](https://particula.tech/blog/langgraph-vs-crewai-vs-openai-agents-sdk-2026)
- [AI Agent Frameworks 2026 — Let's Data Science](https://letsdatascience.com/blog/ai-agent-frameworks-compared)
- [I Found a Way to Use Claude Agent SDK Inside LangGraph Nodes — Khaled Elfakharany](https://www.khaledelfakharany.com/articles/langgraph-claude-sdk-integration)

**Code Execution Sandboxes:**
- [AI Code Sandbox Benchmark 2026 — Superagent](https://www.superagent.sh/blog/ai-code-sandbox-benchmark-2026)
- [E2B vs Daytona — ZenML Blog](https://www.zenml.io/blog/e2b-vs-daytona)
- [Daytona vs E2B 2026 — Northflank](https://northflank.com/blog/daytona-vs-e2b-ai-code-execution-sandboxes)
- [11 Best Sandbox Runners 2026 — Better Stack](https://betterstack.com/community/comparisons/best-sandbox-runners/)
- [E2B, Daytona, Modal, Sprites — SoftwareSeni](https://www.softwareseni.com/e2b-daytona-modal-and-sprites-dev-choosing-the-right-ai-agent-sandbox-platform/)

**Lovable, Bolt, v0:**
- [AI-Driven Prototyping: v0, Bolt, and Lovable Compared — Addy Osmani](https://addyo.substack.com/p/ai-driven-prototyping-v0-bolt-and)
- [Bolt vs v0 vs Lovable — Better Stack](https://betterstack.com/community/comparisons/bolt-vs-v0-vs-lovable/)
- [Bolt vs Lovable vs V0 2026 — UI Bakery](https://uibakery.io/blog/bolt-vs-lovable-vs-v0)
- [Lovable vs Bolt vs V0 — Lovable](https://lovable.dev/guides/lovable-vs-bolt-vs-v0)

**Vercel for Platforms:**
- [Vercel for Platforms — Vercel Docs](https://vercel.com/docs/multi-tenant)
- [Multi-tenant Limits — Vercel Docs](https://vercel.com/docs/multi-tenant/limits)
- [Vercel REST API Reference](https://vercel.com/docs/rest-api)
- [Introducing Vercel for Platforms — Vercel Changelog](https://vercel.com/changelog/introducing-vercel-for-platforms)

---

*Compiled for NeuraLaunch Phase 4 & 5 planning. Built by Saheed Alpha Mansaray.*
