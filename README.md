# NeuraLaunch

AI-powered growth engine that takes a founder from a vague idea or
stalled situation to a launched product. Built by a two-person team
with senior-engineering discipline.

**Production:** [startupvalidator.app](https://startupvalidator.app)

---

## What this repo contains

```
neuralaunch/
├── client/                # Next.js 15 application (the product)
│   ├── src/app/           # App Router pages + API routes
│   ├── src/lib/           # Discovery, roadmap, validation engines
│   ├── src/inngest/       # Durable background functions
│   └── prisma/            # Schema + migrations
├── ARCHITECTURE.md        # How the system actually flows
├── RUNBOOK.md             # On-call playbook for production incidents
└── CLAUDE.md              # Engineering standards (mandatory)
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

- **Framework:** Next.js 15.5 (App Router only)
- **Language:** TypeScript 5, strict mode, no `any`
- **Styling:** Tailwind CSS 4 + shadcn/ui v4
- **Animation:** Motion v12 (`motion/react`)
- **AI:** Vercel AI SDK 5 + Anthropic Claude 4.6 (Sonnet for
  execution, Opus for synthesis) + Google Gemini Flash as the
  third-tier fallback
- **Orchestration:** Inngest v4 for durable background work
- **ORM:** Prisma 6 against PostgreSQL on Neon (with `pgvector`)
- **Session store:** Upstash Redis (15-minute sliding TTL)
- **Auth:** NextAuth v5 beta (server-side sessions)
- **Validation:** Zod v4 — schemas are the source of truth, types
  are inferred from them

The complete list of deprecated patterns lives in `CLAUDE.md` under
"Tech Stack — Deprecated."

## The three phases

1. **Discovery** — adaptive interview produces a typed belief state,
   then synthesises a single recommendation with `recommendationType`,
   path, reasoning, first three steps, risks, and assumptions.
   Founders can push back; the agent defends, refines, or replaces.
2. **Roadmap** — accepted recommendations are turned into a phased
   execution plan with check-in support, stuck-task handling, and a
   nudge cron that re-engages the founder.
3. **Validation** — for `build_software` recommendations, generates a
   landing page, captures real-world demand signal, and writes back a
   structured report with confirmed/disconfirmed assumptions.

`ARCHITECTURE.md` covers the full data flow.

## Running locally

```bash
cd client
pnpm install      # NOT npm — npm corrupts node_modules in this project
pnpm dev
```

Required environment variables are validated at startup in
`client/src/lib/env.ts` — the app refuses to start if any are missing.

## Status

Phases 1, 2, and 3 are shipped to production. The codebase is
currently in the cleanup → bulletproofing sequence. See `CLAUDE.md`
for the engineering standards that govern ongoing work.
