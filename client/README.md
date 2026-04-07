# NeuraLaunch — Client (Next.js Application)

This directory contains the Next.js 15 application that powers
[startupvalidator.app](https://startupvalidator.app). For the
project overview, architecture, and engineering standards, read
the documents at the repository root:

- [`../README.md`](../README.md) — project overview
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — how the system flows
- [`../RUNBOOK.md`](../RUNBOOK.md) — production incident playbook
- [`../CLAUDE.md`](../CLAUDE.md) — engineering standards (mandatory)

## Local development

```bash
pnpm install      # NOT npm — npm corrupts node_modules in this project
pnpm dev          # http://localhost:3000
```

Required environment variables are validated at startup in
[`src/lib/env.ts`](src/lib/env.ts). The app refuses to start if
any required secret is missing — copy `.env.example` if it exists,
otherwise see the env schema for the required keys.

## Common scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server with HMR |
| `pnpm build` | Runs `prisma migrate deploy && prisma generate && next build` |
| `pnpm start` | Production server (after build) |
| `pnpm lint` | ESLint over the source tree |
| `pnpm test` | Vitest run |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:coverage` | Vitest with coverage |

## Database

Schema lives in [`prisma/schema.prisma`](prisma/schema.prisma).
Migrations are tracked in [`prisma/migrations/`](prisma/migrations/).

```bash
pnpm prisma migrate dev --create-only         # generate a new migration
pnpm prisma migrate deploy                    # apply pending migrations
pnpm prisma generate                          # regenerate the client
pnpm prisma studio                            # browse the data
```

If a Vercel build fails with `P3009` (failed migration in target
database), follow the playbook in [`../RUNBOOK.md`](../RUNBOOK.md).

## Code layout

```
src/
├── app/             # App Router pages, layouts, and API route handlers
├── components/      # Shared React components (Sidebar, discovery UI)
├── lib/             # Engines, agents, helpers
│   ├── discovery/   # Phase 1 — interview, synthesis, pushback
│   ├── roadmap/     # Phase 2 — execution plan generation, check-ins
│   ├── validation/  # Phase 3 — landing page, reporting, lifecycle
│   ├── ai/          # Provider fallback chain
│   └── ...          # Cross-cutting utilities
├── inngest/         # Durable background functions + event type map
└── auth.ts          # NextAuth v5 config (server-side sessions)
```

See [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for what each
module is responsible for and how the phases connect.
