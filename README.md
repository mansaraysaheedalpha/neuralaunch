# NeuraLaunch

AI-powered growth engine that takes a founder from a vague idea or
stalled situation to a launched product. Built by a two-person team
with senior-engineering discipline.

**Production:** [startupvalidator.app](https://startupvalidator.app)

---

## What this repo contains

```
neuralaunch/
├── client/                # Next.js 16 application (the product)
│   ├── src/app/           # App Router pages + API routes
│   ├── src/lib/           # Discovery, roadmap, validation, tools, lifecycle engines
│   ├── src/inngest/       # Durable background functions
│   └── prisma/            # Schema + migrations (canonical Prisma path)
├── mobile/                # React Native (Expo) app — standalone, NOT a workspace member
├── packages/              # Workspace packages shared by client + mobile
│   ├── api-types/         # Zod schemas + inferred wire types
│   └── constants/         # Enum value lists + configuration limits
├── docs/                  # Vision, runbooks, current specs
├── ARCHITECTURE.md        # How the system actually flows
├── RUNBOOK.md             # On-call playbook for production incidents
└── CLAUDE.md              # Engineering standards (mandatory reading)
```

## Where to start

Pick the doc that matches what you are about to do:

| You are about to… | Read first |
|---|---|
| Understand how the product works end-to-end | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Fix something that is broken in production | [`RUNBOOK.md`](RUNBOOK.md) |
| Write code in this repo | [`CLAUDE.md`](CLAUDE.md) |
| Run the app locally | [`client/README.md`](client/README.md) |

`CLAUDE.md` is non-negotiable. It governs every line of code in this
repo — file size limits, naming, security rules, the testing
priority hierarchy, and the list of deprecated patterns. Read it
before opening a PR.

## Tech stack (late 2026)

- **Framework:** Next.js 16.2 (App Router only; Turbopack is the
  default compiler)
- **Language:** TypeScript 5, strict mode, no `any`
- **Styling:** Tailwind CSS 3.4 + shadcn/ui v4 (Tailwind 4 upgrade
  deferred — see `docs/migrations/turbopack-migration-research-2026-05.md`)
- **Animation:** Motion v12 (`motion/react`)
- **AI:** Vercel AI SDK 5 + Anthropic Claude 4.6 (Sonnet for
  execution, Opus for synthesis) + Google Gemini 2.5 Flash as the
  third-tier fallback on the question-generation hot path
- **Research tools:** Tavily + Exa, exposed as in-loop tools the agent
  picks between per query
- **Orchestration:** Inngest v4 for durable background work
- **ORM:** Prisma 6.6 against PostgreSQL on Neon (with `pgvector`)
- **Session store:** Upstash Redis (15-minute sliding TTL; Postgres
  fallback on miss)
- **Auth:** NextAuth v5 beta (server-side sessions; mobile via bridge
  token)
- **Billing:** Paddle v4 (Free / Execute / Compound tiers)
- **Validation:** Zod v4 — schemas are the source of truth, types are
  inferred from them
- **Push:** native push notifications on mobile via `lib/push/`

The complete list of deprecated patterns lives in `CLAUDE.md` under
"Tech Stack — Deprecated."

## What the product actually does

NeuraLaunch is a **multi-venture lifecycle**, not a single funnel. A
founder may run several `Venture` rows over time; each Venture has
one or more `Cycle` rows (recommendation + roadmap + optional
validation attempts). Inside any one cycle:

1. **Discovery** — adaptive interview produces a typed belief state,
   then synthesises a single recommendation with `recommendationType`,
   path, reasoning, first three steps, risks, and assumptions.
   Founders can push back; the agent defends, refines, or replaces.
2. **Roadmap** — accepted recommendations are turned into a phased
   execution plan with check-in support, stuck-task handling, a nudge
   cron that re-engages the founder, and four per-task **Tools** that
   accelerate execution: Research, Packager, Composer, Coach.
3. **Validation** — for `build_software` recommendations, generates a
   public landing page, captures real-world demand signal, and writes
   back a structured report with confirmed/disconfirmed assumptions.

When a venture completes, a **Transformation Report** can be produced
(Opus narrative + redaction + founder review + optional publish to the
public `/stories` archive).

For founders who arrive without an idea, a separate **No-Idea**
archetype track (currently in active development) runs a six-stage
ideation pipeline upstream of the standard Discovery flow.

`ARCHITECTURE.md` covers the full data flow including the lifecycle
memory layer, cross-venture context, and the tools subsystem.

## Running locally

```bash
cd client
pnpm install      # NOT npm — npm corrupts node_modules in this project
pnpm dev
```

Required environment variables are validated at startup in
`client/src/lib/env.ts` — the app refuses to start if any are missing.

## Status

Phases 1, 2, and 3 are shipped to production along with the tools
layer, lifecycle memory, the venture/cycle model, transformation
reports, the public stories archive, and the mobile app. The No-Idea
archetype ideation track is in active development.

See `CLAUDE.md` for the engineering standards that govern ongoing work.
