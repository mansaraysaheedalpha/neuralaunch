# Turbopack Migration — Audit Log

Source-of-truth research doc: `docs/migrations/turbopack-migration-research-2026-05.md`.
Each phase appends one block. Newest at the bottom.

---

## Phase 0 — Pre-flight (2026-05-02)

Inventory only — no code changes. Findings reported back to user; awaiting
go/no-go on items flagged below before Phase 1 can begin.

Resolved by user direction:
- Tailwind stays on v3.4.18; Phase 4 refactor is removed from the plan.
  v3 → v4 is deferred to its own future ticket — re-open only after
  upstream patches the Turbopack PostCSS scanner defect for v4 + Oxide.
- `serverExternalPackages` reflects actual `client/src/` imports only
  (`@prisma/client`, `@paddle/paddle-node-sdk`). `ssh2`, `dockerode`,
  `@sendgrid/mail`, `@aws-sdk/client-ses` are NOT listed — none of them
  are imported. Dead-dep cleanup is a separate ticket.
- Sentry's `disableServer/ClientWebpackPlugin` keys are removed (Turbopack
  doesn't run the Webpack plugin pipeline; the gates are dead config).
- New Phase 3.5 inserted: preview deploy on `--webpack` after the Prisma
  schema edit, before the compiler flip — never stack two unvalidated
  changes at deploy time.

## Phase 1 — next.config.ts refactor (2026-05-02)

Files changed:
- `client/next.config.ts` — full rewrite. Removed the entire `webpack:`
  function (and the `import type { Configuration } from "webpack"`).
  Added root-level `serverExternalPackages: ['@prisma/client',
  '@paddle/paddle-node-sdk']`. Added `turbopack.resolveAlias` mapping
  `fs`, `net`, `tls`, `crypto`, `stream`, `os`, `path` to
  `./src/lib/empty.ts` under the `browser` condition. Header block at
  the top documents the dual-compiler intent and links the research doc.
- `client/next.config.ts` (Sentry block) — removed
  `disableServerWebpackPlugin`, `disableClientWebpackPlugin`,
  `automaticVercelMonitors`, and the legacy top-level
  `reactComponentAnnotation: { enabled: true }`. Added
  `_experimental.turbopackReactComponentAnnotation.enabled: true`.
  Inline breadcrumb comments explain each omission so a future
  contributor doesn't reintroduce them by pattern-matching against
  old examples.
- `client/src/lib/empty.ts` — new file. Single `export default {}`,
  serves as the alias target for the Node.js built-in stubs above.

Verification:
- `pnpm exec tsc --noEmit` from `client/` exits 0. No type errors.
- `pnpm dev` / `pnpm build` not yet run — deferred to Phase 6 burn-in
  per plan.

Stopped for review per Prime Directive #3 before advancing to Phase 2.

Carry-forward for Phase 6 (added 2026-05-02):
- During the first `pnpm dev` after the compiler flip (Phase 6 step 2),
  grep the dev server startup output for Sentry warnings of the form
  `Unknown option:` or `Deprecated:`. The Sentry SDK logs these at init
  when it doesn't recognise a config key. If
  `_experimental.turbopackReactComponentAnnotation.enabled` is the wrong
  shape or path, this is where it surfaces (rather than silently failing
  to annotate components for Session Replay). Belt-and-braces — the
  research doc's source for that key is solid, but the verification is
  cheap.

## Phase 2 — `'server-only'` directive sweep (2026-05-02)

Six files received `import 'server-only';` as the first import (after the
file-path comment, matching the convention in the 93 already-guarded
files). Scope locked at the value-import sites of `@prisma/client` from
the Phase 0 inventory; no expansion to indirect importers.

Files changed:
- `client/src/lib/api-error.ts` — load-bearing lib helper. Imported by
  two API route files only (`api/conversations/route.ts` and
  `api/conversations/[conversationId]/route.ts`); both server contexts.
- `client/src/inngest/functions/validation-reporting-function.ts`
- `client/src/inngest/functions/validation-lifecycle-function.ts`
- `client/src/app/api/discovery/ventures/[ventureId]/route.ts`
- `client/src/app/api/user/training-consent/route.ts`
- `client/src/app/api/discovery/recommendations/[id]/outcome/route.ts`

Importer audit — confirmed no client-bundle reachability:
- `lib/api-error.ts` → only `app/api/conversations/**` route files (server).
- `validation-reporting-function.ts` → only `inngest/functions/index.ts`
  and `inngest/client.ts` (server registry).
- `validation-lifecycle-function.ts` → same as above.
- The three API route files are leaves — no other module imports them.

Verification:
- `server-only: ^0.0.1` already in `client/package.json` dependencies
  (line 78). No install required.
- `pnpm exec tsc --noEmit` from `client/` exits 0.

No structural surprises. Stopped for review per Prime Directive #3
before advancing to Phase 3.

## Phase 3 — Prisma binaryTargets (2026-05-02)

Single schema edit. The `generator client` block now declares the
`rhel-openssl-3.0.x` engine binary alongside `native`, so Vercel
serverless functions resolve the correct engine when Turbopack's
stricter native-binary tracing replaces the Webpack `ignore-loader`
shim.

Files changed:
- `client/prisma/schema.prisma` — added one line: `binaryTargets   =
  ["native", "rhel-openssl-3.0.x"]` inside the existing
  `generator client` block. The `previewFeatures = ["postgresqlExtensions"]`
  line is preserved verbatim. No other edits to the file.

Generation + verification:
- `pnpm prisma generate` from `client/` succeeded in 1.17s. Prisma
  Client v6.19.3 written to the pnpm-resolved
  `.pnpm/@prisma+client@6.19.0_…/node_modules/@prisma/client` path.
- Engine binaries on disk after generation:
  - `node_modules/.pnpm/@prisma+client@6.19.0_…/node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node`
  - `node_modules/.pnpm/prisma@6.19.3_…/node_modules/prisma/libquery_engine-rhel-openssl-3.0.x.so.node`
  Confirms the new target is materialised, not just declared.
- `pnpm exec tsc --noEmit` from `client/` exits 0. Regenerated client
  types remain compatible with the codebase.

Stopped before Phase 3.5 per user instruction (preview deploy gate
is user-driven).

## Phase 3.5 — Production deploy on main (2026-05-02)

User intentionally pushed the three commits directly to `main`. Vercel
auto-deployed. Build went green in ~58s (compile 23.9s, TypeScript 21.4s,
static gen 9.5s). 51/51 static pages, 119 routes including the touched
ones. No PrismaClientInitializationError, no ChunkLoadError, no
"Module not found".

One unexpected detail: Vercel ran a bare `next build` (not the
`package.json` build script), so the production build compiled under
Turbopack, not Webpack. Phase 5's compiler flip was effectively executed
by the deploy itself.

Real warnings observed:
- `[@sentry/nextjs] DEPRECATION WARNING: disableLogger is deprecated…
  (Not supported with Turbopack.)` — printed twice. Phase 1 had kept
  `disableLogger: true` as compiler-agnostic; the runtime SDK disagrees.
  Removed in the Phase 1 amendment below.
- No `Unknown option:` warning against
  `_experimental.turbopackReactComponentAnnotation.enabled`. The shape
  added in Phase 1 is correct.
- Pre-existing Redis "Dynamic server usage" warnings on `/`. Unrelated
  to migration.
- Sentry source-map upload skipped — auth token absent. Expected; the
  Sentry workstream remains paused.

## Phase 1 amendment — strip `disableLogger` (2026-05-02)

Files changed:
- `client/next.config.ts` — removed `disableLogger: true` from the
  `withSentryConfig` second-arg block. Replaced with a breadcrumb
  comment explaining why it's gone (Turbopack already tree-shakes
  dead branches; the suggested replacement is webpack-only).

Verification: `pnpm exec tsc --noEmit` exits 0.

## Phase 5 — package.json script flip (2026-05-02)

Vercel already flipped the compiler in production by invoking
`next build` directly, so the script edits below are a *local* parity
fix only — without them, `pnpm dev` would still run Webpack locally
while production runs Turbopack, defeating the burn-in.

Files changed:
- `client/package.json` —
  - `dev`:    `next dev` (was `next dev --webpack`)
  - `build`:  `prisma migrate deploy && prisma generate && cross-env NODE_OPTIONS=--max-old-space-size=4096 next build` (was the same with `--webpack`)
  - Added `dev:webpack` and `build:webpack` as the rollback escape hatches.

Verification: `pnpm exec tsc --noEmit` exits 0.

