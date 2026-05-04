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

## Lockfile drift fix (2026-05-02)

Vercel deploy of the script-flip commit (`e0c859b`) failed install with
`ERR_PNPM_OUTDATED_LOCKFILE`. Root cause: commit `121473a`
("Alhamdulilah, all eslint and typescript errores resolved",
2025-11-16) had bumped `@sentry/nextjs` from `^10.25.0` → `^10.51.0` in
`package.json` without regenerating `pnpm-lock.yaml`. Earlier deploys
slipped past frozen-lockfile enforcement via cache, but cache rotation
forced the strict check.

Resolution: `pnpm install` from repo root regenerated the lockfile.
Diff scoped to `@sentry/*` and `@sentry-internal/*` entries only —
142 line shift, no unrelated drift. `@sentry/nextjs` resolved version
moved from `10.48.0` → `10.51.0`. Committed as a follow-up
(`chore(deps): regenerate lockfile after stale @sentry/nextjs spec
bump`), deploy `740924a` shipped green at 17:05 UTC.

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

## Phase 6 — production burn-in (started 2026-05-02 17:05 UTC)

Production deploy `740924a` is the official Turbopack baseline. Build
metrics from this deploy compared to the earlier `d7c4450` deploy:
- Compile: 23.0s (was 23.9s).
- TypeScript: 19.9s (was 21.4s).
- Static gen: 9.3s (was 9.5s).
- Total build: ~58s.

`disableLogger` deprecation warning is gone. No `_experimental.*`
unknown-option warning surfaced — the Sentry annotation key is wired
correctly.

Burn-in success criteria (per user spec):
- Zero `PrismaClientInitializationError` in Sentry over the burn-in.
- Zero `ChunkLoadError` in Sentry over the burn-in.
- Zero `Module not found` errors during normal local dev.
- Tier-1 tools (Coach, Composer, Research, Packager, Validation) and
  the discovery flow execute end-to-end without compiler-related
  failures.

Rollback path remains: Vercel Instant Rollback to a pre-`d7c4450`
deployment for production; `pnpm build:webpack` / `pnpm dev:webpack`
locally.

## Phase 7 — Documentation + handoff (2026-05-02)

Files changed:
- `CLAUDE.md` — tech-stack table corrections.
  - Framework row: removed the "Pinned to `--webpack`" note. Replaced
    with "Turbopack is the default compiler" and explicit references
    to the `:webpack` rollback scripts plus the research-doc path.
  - Styling row: corrected `4.x` → `3.4.x` and added a note explaining
    v3 + classic PostCSS, plus the deferred-v4-upgrade reasoning.

## Migration final state (2026-05-02)

What shipped:
- `next.config.ts` rewritten for Turbopack (no webpack hook,
  `serverExternalPackages` for `@prisma/client` + `@paddle/paddle-node-sdk`,
  `turbopack.resolveAlias` mapping Node built-ins to `src/lib/empty.ts`
  under the `browser` condition).
- Sentry block stripped of Webpack-plugin-only keys
  (`disableServer/ClientWebpackPlugin`, `automaticVercelMonitors`,
  legacy `reactComponentAnnotation`, `disableLogger`). Replaced with
  `_experimental.turbopackReactComponentAnnotation.enabled`.
- `import 'server-only'` added to six direct `@prisma/client`
  value-import sites.
- `binaryTargets = ["native", "rhel-openssl-3.0.x"]` declared in
  `prisma/schema.prisma`.
- `package.json` scripts: `dev` / `build` use Turbopack;
  `dev:webpack` / `build:webpack` retained as rollback hatches.

What was deferred:
- **Tailwind v3 → v4 upgrade.** v4's Oxide engine has a known Turbopack
  PostCSS scanner defect (#19825) that silently drops bracketed
  arbitrary values. Defer the upgrade until upstream patches the bug
  AND someone owns a separate burn-in for the CSS engine swap. CLAUDE.md
  tech-stack table updated to reflect v3.4.x as the current truth.
- **Dead-dependency cleanup.** `dockerode` (in `package.json` but never
  imported) and the legacy webpack-config-only references to `ssh2`,
  `@sendgrid/mail`, `@aws-sdk/client-ses` (none of which are even in
  `package.json`). Separate cleanup ticket — touching these is not
  Turbopack-migration scope.
- **Indirect importer guards.** Per the strict reading of the research
  doc, every transitive importer of an externalized package could
  declare `'server-only'`. We deliberately scoped to direct
  value-imports only. The directive on the leaf file is sufficient
  protection — Next.js fails the build at import time if any of those
  files lands in a client bundle.

Known risks / watch items:
- **`automaticVercelMonitors` removal** ends Sentry's automatic
  cron-job monitoring instrumentation. If Vercel cron jobs need
  Sentry monitoring, the Sentry workstream will need to wire
  `Sentry.cron` manually. Currently no cron jobs route through
  Sentry, so no immediate impact.
- **The Sentry SDK upgrade `10.48.0` → `10.51.0`** that snuck in via
  the lockfile-regeneration commit was unverified at the time of
  flip. Burn-in covers it implicitly, but if Sentry-side regressions
  appear they could be SDK-version-related, not Turbopack-related.
  Bisect by checking `git log -- pnpm-lock.yaml` if needed.
- **`disableLogger` removal** trades a small bundle-size win for clean
  build logs. Turbopack tree-shaking covers most of the original
  optimisation. If the Sentry workstream wants to re-enable bundle
  trimming, the new key shape is `webpack.treeshake.removeDebugLogging`
  — webpack-only, would need the `:webpack` rollback to take effect.
- **Lockfile drift watch.** Commit `121473a` proved that a
  `package.json` change without lockfile regeneration can sit latent
  for months and surface as a deploy failure on cache rotation. CI
  could enforce `pnpm install --frozen-lockfile` as a pre-merge
  check; out of migration scope but worth a separate ticket.

## Sentry-agent handoff

The paused Sentry workstream's prerequisites are now met:
- Turbopack is the production compiler.
- `@sentry/nextjs@10.51.0` is installed and resolved.
- `_experimental.turbopackReactComponentAnnotation.enabled: true` is
  wired in `next.config.ts`.
- `instrumentation.ts`, `instrumentation-client.ts`,
  `sentry.server.config.ts`, `sentry.edge.config.ts` already exist
  in `client/`.

Open work for the Sentry agent when it resumes (per
`client/SENTRY_RESEARCH_DOC.txt`):
1. Provision `SENTRY_AUTH_TOKEN` in Vercel project env so source-map
   upload via `useRunAfterProductionCompileHook` can run. Currently
   the build log prints "No auth token provided. Will not upload
   source maps." Each deploy.
2. Decide on the source-map upload path — Vercel-native Sentry
   integration vs. CLI plugin. Research doc recommends the
   Vercel-native integration for Pro accounts.
3. Audit `sentry.server.config.ts` and `sentry.edge.config.ts` against
   the OpenTelemetry / runtime-instrumentation paradigm.
4. If Vercel cron monitoring is needed, wire `Sentry.cron` manually
   to replace the removed `automaticVercelMonitors` key.
5. If middleware.ts is later introduced, ensure its matcher excludes
   `/monitoring` (the Sentry tunnelRoute) — there's a breadcrumb
   comment about this in `next.config.ts` next to the `tunnelRoute`
   key.
6. Re-evaluate `disableLogger` removal — if bundle-size matters more
   than build-log noise, the webpack-only replacement key shape is
   documented in the breadcrumb comment in `next.config.ts`.

Migration is complete pending the production burn-in window.

## Sentry Integration

### Phase 0 — Resume (2026-05-02)

Resume report produced after the previous Sentry agent paused mid-Phase-1.
Findings: four config files reverted to wizard scaffolds during the pause;
`@sentry/nextjs@^10.51.0` is in place via the lockfile-drift fix; tsc clean
under post-migration `next.config.ts`. Six-handoff disposition recorded
inline in the report. Span inventory delta: previous count 26 → revised 29
after discovering 3 additional LLM-bearing files
(`discovery/question-generator.ts`, `discovery/response-generator.ts`,
`transformation/engine.ts`) and dropping `discovery/interview-engine.ts`
(state-machine helpers, no LLM call). Collapsed dispatcher patterns reduce
final ai.agent target to 24:
- `response-generator.ts` 5 generate*Response variants → one parent span
  with `response.type` attribute.
- `question-generator.ts` `generateQuestion` + `generateReflection` → one
  parent span with `generation.type` attribute.
- All other engines: one span at the top-level entry function.

### Phase 1 — Tripartite init rewrite (2026-05-02)

Files changed:
- `client/instrumentation-client.ts` — full rewrite. Replay integration
  with mandatory privacy keys (`maskAllText`, `maskAllInputs`,
  `blockAllMedia`, `networkDetailAllowUrls: []`). `tracesSampleRate` 0.1
  in prod / 1.0 in dev. `replaysSessionSampleRate` 0.1 prod / 1.0 dev.
  `replaysOnErrorSampleRate` 1.0. Removed `enableLogs` + the
  `consoleLoggingIntegration`. Kept `onRouterTransitionStart` export.
- `client/sentry.server.config.ts` — full rewrite. `tracesSampler` function
  drops three polling endpoints (`/api/health`,
  `/api/discovery/tool-jobs/active`,
  `/api/discovery/roadmaps/*/tool-jobs/*/status`) to 0; samples Paddle
  webhooks, checkout, and the four Tier-1 tool prefixes (coach, composer,
  research, packager) plus pushback at 1.0; default 0.1. Inherits parent
  sampling for distributed traces. Removed `enableLogs` +
  `consoleLoggingIntegration`.
- `client/sentry.edge.config.ts` — full rewrite to placeholder state.
  No middleware / no `runtime: "edge"` exists yet, so flat 0.1/1.0 rate
  with a banner comment marking Phase 6's edge validation step N/A until
  an edge surface ships.
- `client/instrumentation.ts` — replaced lazy dynamic-import
  `onRequestError` with top-of-file `import * as Sentry` plus
  `export const onRequestError = Sentry.captureRequestError`.
- `client/.env.example` — new file. Placeholder Sentry vars only.
  Broader env contract (DATABASE_URL, Anthropic, Paddle, Inngest etc.)
  deferred to a separate ticket per CLAUDE.md "do not expand scope".

Verification:
- `pnpm exec tsc --noEmit` from `client/` exits 0.
- `pnpm lint` not run yet (will run before Phase 2 handoff).

logger.ts sink check: pure `console.*` (debug/info/warn/error). The
`sendToLoggingService` hook is a placeholder stub with no real sink.
Removing `consoleLoggingIntegration` therefore removes the only path by
which logger output reached Sentry as logs — but exception capture and
error events are unaffected (those flow through `Sentry.captureException`
and the `onRequestError` hook, not the console integration). Safe to
remove. The dead `sendToLoggingService` placeholder is a separate
cleanup ticket.

Follow-ups deferred (out of Phase 1 scope):
- Broaden `.env.example` to cover the full project env contract.
- Remove `sendToLoggingService` placeholder from `logger.ts`.
- Phase 5: decide on Vercel-native vs CLI source-map upload (working
  assumption: Vercel-native, final commit at Phase 5 review).

Documentation clarifications (post-Phase-1 review):
- `SENTRY_AUTH_TOKEN` warning behaviour. Source-map upload runs only on
  `next build`; `next dev` never invokes the upload step regardless of
  token state. If `pnpm build` is invoked locally without the token,
  the upload step skips with a non-fatal warning. Local `pnpm dev` does
  not need the token at all.
- `vercel env pull` adoption is unconfirmed — if local dev reads only
  from `.env.local`, the Development column on the Vercel dashboard is
  dead weight and can be skipped. Conservative checklist sets it
  anyway; harmless either way.

Phase 6 watch-list adds:
- `instrumentation.ts` cold-start delta. The lazy → static import for
  `onRequestError` trades unpredictable first-error latency for
  predictable cold-start cost. Compare Vercel function cold-start
  durations before/after this change. If small functions grow by
  >20ms on cold start, investigate. Single-digit ms is expected and
  fine — Sentry was already in the bundle, the static import only
  shifts when it's resolved.

### Phase 2 — `@sentry/types` → `@sentry/core` sweep (2026-05-02)

Documentation-only phase. SDK v10 consolidated all type exports out of
the deprecated `@sentry/types` package and into `@sentry/core`.

Sweep result:
- Search: `Grep` for `@sentry/types` across `client/` and `packages/`
  with `node_modules/` excluded.
- Source hits: zero. The only file mentioning the string is
  `client/SENTRY_RESEARCH_DOC.txt` itself (the research doc
  documenting what NOT to do).
- Canonical example of the v10 pattern already exists in this commit:
  `client/sentry.server.config.ts` imports `SamplingContext` from
  `@sentry/core` for the tracesSampler.

Files changed:
- `client/instrumentation.ts` — added a "Sentry type imports — read
  before adding new ones" comment block to the file's banner.
  Documents the deprecation, names `@sentry/core` as the source for
  Event / Breadcrumb / Span / User / SamplingContext / SeverityLevel,
  and points at the canonical usage in `sentry.server.config.ts`.

Verification:
- `pnpm exec tsc --noEmit` from `client/` exits 0.

### Phase 3a — Span helper module (2026-05-02)

Centralised the Sentry span vocabulary so Phase 3b–3f's 30+ callsites
can wrap in one-liners. Phase 4's PII audit, Phase 6's tests, and
future contributors all hit one file.

Files created:
- `client/src/lib/observability/sentry-spans.ts` — span runners
  (`withAgentSpan`, `withQueueSpan`, `withToolUiSpan`,
  `withExaSearchSpan`, `withPaddleWebhookSpan`), distributed-trace
  helpers (`captureTraceHeaders`, `withDistributedTrace`),
  active-span mutators (`setActiveSpanAttribute`,
  `recordModelFallback`), dev-only PII guard (`assertNoPII`), and
  19 exported attribute-key constants. Banner doc encodes five
  operational rules: attribute-content rule ("Slack-message" test),
  stage-mutation over sub-spans, model-fallback records-but-doesn't-
  error, Inngest-step-retries-don't-multiply-spans, dev-only-PII-
  guard.
- `client/src/lib/observability/index.ts` — barrel export per
  CLAUDE.md mandatory module structure.

Risk-2 finding (`withModelFallback` token/latency exposure):
- Neither helper surfaces token counts or first-token latency
  natively. `withModelFallback` returns `T` from the caller's factory;
  `streamQuestionWithFallback` returns only `{ textStream, modelUsed }`.
- Resolution: kept both AI helpers purpose-narrow (overload retry /
  provider chain). The span helper exposes a `setAttr` callable to
  the factory closure; Phase 3b callsites pull `result.usage` from
  the AI SDK call before returning and emit attributes via setAttr.
  Zero invasive changes to AI helpers; ~24 callsites in 3b each
  add 2-3 lines. Within the original 30-line budget.

Risk-3 pattern (synthesis-stage mutation) baked into the helper docs
as operational rule #2. `setActiveSpanAttribute` is the explicit
escape hatch for code paths deep in the call stack that don't have
the closure-captured setAttr in scope.

Verification:
- `pnpm exec tsc --noEmit` from `client/` exits 0.
- `pnpm lint` from `client/` exits 0 (2 pre-existing warnings in
  `app/api/discovery/ventures/route.ts` and `lib/empty.ts`,
  unchanged).

### Phase 3b Step 1 — Banner refinements + dispatcher grep (2026-05-02)

Helper banner additions:
- Operational rule #1 sub-rule: latency capture always uses
  `Date.now()`. Mixing clocks across callsites makes Sentry's
  per-attribute aggregations meaningless.
- Operational rule #3 sub-rule: requested-vs-fired model double-set
  is intentional. Initial `withAgentSpan` attribute carries the
  REQUESTED model; inner `setAttr(ATTR_AGENT_MODEL, ...)` captures
  the FIRED model. Combined with `model.fallback_used`, you can
  answer "asked for vs ran" in any single Sentry event. Do not
  "fix" the double-set by removing the initial value.

Dispatcher grep (before any 3b wiring):
- `generateQuestion` + `generateReflection` (question-generator.ts):
  ALL CALLS from a single host file
  `app/api/discovery/sessions/[sessionId]/turn/route.ts`. Lines
  262, 270, 273, 399, 414, 438, 444. Dispatcher pattern HOLDS.
- `generateClarificationConfirmation` + `generateMetaResponse` +
  `generateFrustrationResponse` + `generateClarificationResponse` +
  `generatePricingFollowUp` (response-generator.ts): ALL CALLS from
  the SAME host file (lines 230, 239, 241, 243, 422). Dispatcher
  pattern HOLDS.
- Discovery: not two dispatchers — one dispatcher with seven
  branches. All 7 functions live behind one route handler that
  classifies user input and dispatches to exactly one. Collapse
  unifies to ONE span per turn (`discovery.turn`) carrying either
  `generation.type` (question | reflection) or `response.type`
  (one of five reply categories), mutually exclusive per turn.
- Final `ai.agent` span count: 24 → 23.

### Phase 3b Step 2 — Coach canary (2026-05-02)

Wrapped all four Coach engines per the helper API. Each one wraps
its existing `withModelFallback` block in `withAgentSpan`, captures
fired model + token usage + total latency from the AI SDK result,
and calls `recordModelFallback` when the fired modelId differs from
the requested primary.

Files changed:
- `client/src/lib/roadmap/coach/setup-engine.ts` — `coach.setup`
  span, tier 3 (Sonnet primary, Haiku fallback).
- `client/src/lib/roadmap/coach/preparation-engine.ts` —
  `coach.preparation` span, tier 4 (Opus primary, Sonnet fallback).
- `client/src/lib/roadmap/coach/roleplay-engine.ts` —
  `coach.roleplay` span, tier 3 (Sonnet primary, Haiku fallback).
- `client/src/lib/roadmap/coach/debrief-engine.ts` —
  `coach.debrief` span, tier 1 (Haiku primary AND fallback).

Token + latency capture finding (Risk 2 runtime confirmation):
- AI SDK v5's `generateText` returns `result.usage` with field
  names `inputTokens` and `outputTokens` (NOT the older
  `promptTokens` / `completionTokens` from v4).
- Confirmed by tsc accepting `usage.inputTokens` / `usage.outputTokens`
  reads against the AI SDK v5 type signature. If the field names
  had differed, tsc would have flagged it across all four engines.
- The mechanical pass across the remaining 17 callsites (Composer 3,
  Research 3, Packager 3, Discovery dispatcher 1 + synthesis 1 +
  pushback 1, Roadmap/checkin/diagnostic 3, Continuation 1, Ventures
  1, Transformation 2) can copy this exact pattern.

Verification:
- `pnpm exec tsc --noEmit` exits 0 after each engine wrap.
- `pnpm lint` exits 0 (same 2 pre-existing warnings unchanged).
- File sizes:
  - setup-engine.ts: 147 → 168 LOC (+21)
  - preparation-engine.ts: 172 → 198 LOC (+26)
  - roleplay-engine.ts: 151 → 173 LOC (+22)
  - debrief-engine.ts: 127 → 152 LOC (+25)
  All well under the 300-LOC engine cap.

Coach canary stop point reached. Stopping for review before the
mechanical pass on the remaining 17 callsites.

### Phase 3b Step 3 — Helper extension (2026-05-02)

Helper banner extended with operational rule #6 (streaming engines
capture at the consumption site, never inside the AI helper).
`ATTR_LATENCY_FIRST_TOKEN_MS` already exported from 3a; no constant
addition needed.

Files changed:
- `client/src/lib/observability/sentry-spans.ts` — added
  `withStreamingAgentSpan` (manual-lifetime wrapper backed by
  `Sentry.startInactiveSpan`). Wraps the producer stream as a manual
  ReadableStream so all three lifecycle hooks (close, error, cancel)
  end the span deterministically. Exports the `StreamingAgentSpanFactory`
  + `StreamingAgentSpanFactoryResult` types. Factory signature
  accepts both sync and async returns to keep route callsites that
  do no async work from triggering ESLint's `require-await` rule.
- `client/src/lib/observability/index.ts` — added
  `withStreamingAgentSpan` and the two type exports to the barrel.
- `client/src/lib/ai/question-stream-fallback.ts` — additive
  extension only. New `usagePromise` field on `FallbackStreamResult`
  resolves with the committed provider's terminal token usage
  (AI SDK v5's `result.usage`) after the stream closes, or
  `undefined` if the chain failed / stream cancelled / SDK didn't
  expose it. Never rejects — observability concerns must not crash
  the request path. Existing callers (the `teeDiscoveryStream` path
  in `turn/route.ts`) ignore the new field.

### Phase 3b Step 4 — Three-pattern canary (2026-05-02)

Wired three engines covering all three patterns the mechanical pass
will use.

**Streaming canary — `discovery.turn`**

Files changed:
- `client/src/app/api/discovery/sessions/[sessionId]/turn/route.ts` —
  `buildStreamResponse` becomes async, takes a `dispatch`
  discriminator (`{ generationType: ... } | { responseType: ... }`),
  and wraps the teeDiscoveryStream output via `withStreamingAgentSpan`
  with `discovery.turn` as the span name. All 13 `buildStreamResponse`
  callsites updated (one was missed in the initial grep — the
  `synthesis_request` branch at the original line 272 — caught by
  tsc and added). Six callsites that store the response in `ref` to
  set the `X-Synthesis-Transition` header now `await` first.

Branch labels emitted on the span:
- `generation.type ∈ {"question", "reflection"}` (7 callsites)
- `response.type ∈ {"meta", "frustration", "clarification_confirmation", "clarification", "pricing_follow_up"}` (5 callsites)

Total dispatcher branches wired: 12 (one of which appears twice in
the route flow as a synthesis-transition variant).

**Synthesis nested-children canary**

Files changed:
- `client/src/lib/discovery/synthesis-engine.ts` — three sub-functions
  (`summariseContext`, `eliminateAlternatives`, `runFinalSynthesis`)
  unchanged externally. Each now records fired model + token usage +
  total latency on the active span via `setActiveSpanAttribute`
  (because the wrap is at the orchestrator, not the call site).
  `summariseContext` and `eliminateAlternatives` use raw Anthropic
  SDK so they read snake_case `usage.input_tokens` / `output_tokens`;
  `runFinalSynthesis` uses AI SDK v5 `usage.inputTokens` /
  `outputTokens`. Both shapes documented inline.
- `runSynthesis` orchestrator now wraps in a parent
  `discovery.synthesis` span (carrying `agent.audience_type`) with
  three nested `withAgentSpan` calls for `synthesis.summarise`,
  `synthesis.eliminate`, `synthesis.final`. Children attach to the
  parent via Sentry's AsyncLocalStorage propagation through the
  outer factory's awaits.

**Mechanical-pattern canary — `composer.context`**

Files changed:
- `client/src/lib/roadmap/composer/context-engine.ts` — wired
  identically to Coach's pattern. `composer.context` span, tier 3
  Sonnet primary / Haiku fallback. Confirms the mechanical pattern
  is genuinely copyable — no Composer-specific peculiarities, no
  pattern divergence from the four Coach engines.

Verification:
- `pnpm exec tsc --noEmit` from `client/` exits 0.
- `pnpm lint` from `client/` exits 0 (same 2 pre-existing
  warnings in `app/api/discovery/ventures/route.ts` and
  `lib/empty.ts`, unchanged).

Risk-1 verification (route → worker → engine three-layer trace
stitching) is NOT covered by this canary — that pattern is wired
in Phase 3c when Inngest workers get `withQueueSpan` + the
distributed-trace-headers pattern. Risk-1 verification deferred to
the Phase 3c canary as planned.

AsyncLocalStorage propagation through nested `withAgentSpan` calls
COMPILES cleanly (Sentry's types model this correctly) but visual
verification in the Sentry UI requires running the app and firing a
synthesis request — not done from this agent context. The migration
log carries this as a Phase 6 verification step:

  Phase 6 watch: fire one production synthesis trace and confirm
  the Sentry UI shows discovery.synthesis as the parent with three
  child spans (synthesis.summarise → synthesis.eliminate →
  synthesis.final) under it, all under a single trace_id. If the
  three children appear as siblings of the parent rather than
  nested under it, AsyncLocalStorage propagation is failing across
  the awaits and the helper needs investigation.

Same verification gate applies to the streaming `discovery.turn`
span — its first-token latency / total latency / model id should
populate over the lifetime of the stream rather than being absent.

Stopping for review before the mechanical pass on the remaining 16
engines (3 Composer minus context which is done = 2; 3 Research; 3
Packager; 3 Roadmap; 1 Continuation; 1 Pushback; 1 Ventures; 2
Transformation = 16).

### Phase 3b inventory revision (2026-05-03)

The exhaustive `withModelFallback` grep + raw Anthropic SDK grep
surfaced 10 additional production LLM call sites missed by the
Phase 0 file-naming-pattern inventory, plus 3 multi-call engines
that warranted parent + children spans (per the synthesis precedent).
Final span count revised 23 → **44**.

Structural lesson: future LLM-observability inventories grep for
`withModelFallback` and raw SDK usage as the source of truth. File
naming (`*-engine.ts` / `*-agent.ts`) is too narrow — it missed
`safety-gate.ts`, `context-extractor.ts`, `brief-generator.ts`,
`update-founder-profile.ts`, `generate-cycle-summary.ts`, the four
`validation/*` generators, and `conversation-arc-summariser.ts`.

### Phase 3b mechanical pass — 21 engines (2026-05-03)

Wired all remaining engines per the Coach pattern. Three-engine
canary (`composer.generation`, `research.plan`, `discovery.safety_gate`)
confirmed the pattern holds for previously-missed surfaces — no
divergence from the Coach pattern.

**Pure mechanical wraps (24 spans across 21 files — 4 Coach + 20 from this pass):**

Already done in earlier phases:
- `coach.setup`, `coach.preparation`, `coach.roleplay`, `coach.debrief`
- `composer.context`

This pass:
- `composer.generation`, `composer.regeneration`
- `research.plan`
- `packager.context`, `packager.generation`, `packager.adjustment`
- `roadmap.generate`, `roadmap.checkin`, `roadmap.task_diagnostic`
- `continuation.diagnostic`, `continuation.brief`
- `discovery.safety_gate`, `discovery.extract_context`, `discovery.detect_audience_type`
- `lifecycle.update_founder_profile`, `lifecycle.generate_cycle_summary`
- `validation.interpret`, `validation.build_brief`, `validation.distribution_brief`, `validation.generate_page`
- `ventures.pause_reason`
- `transformation.report`, `transformation.redaction_detect`
- `roadmap.conversation_arc_summarise` (with TODO follow-up flag)

**Multi-call engines (parent + children, 10 spans across 3 files):**
- `discovery.pushback` (parent) + `pushback.reasoning` + `pushback.emit` + `pushback.rewrite` (conditional). Parent carries `pushback.rewrite_fired` and `pushback.action`.
- `research.execution` (parent) + `research.execution.phase1` + `research.execution.phase2`.
- `research.followup` (parent) + `research.followup.phase1` + `research.followup.phase2`.

**Already done streaming + nested-children:**
- `discovery.turn` (streaming, host of generation.type / response.type dispatcher)
- `discovery.synthesis` (parent) + `synthesis.summarise` + `synthesis.eliminate` + `synthesis.final`

**Final inventory: 44 spans across 26 files.**

Anomalies surfaced during fan-out:
- **`validation/distribution-generator.ts`** has a manual 3-iteration
  retry loop AROUND `withModelFallback` (Zod uniqueness rejection
  retry, distinct from Anthropic overload). Wired as ONE parent
  span around the whole function per "one logical operation = one
  span" rule. Added `validation.retry_count` attribute (0-3) so a
  retry-heavy run is queryable in Sentry without span proliferation.
  setActiveSpanAttribute used inside the inner factory because the
  closure-captured setAttr is one wrap-level out.
- **`roadmap/conversation-arc-summariser.ts`** does NOT use
  `withModelFallback` (raw Anthropic SDK direct call). The function
  is explicitly fail-open (returns null on any error), so the lack
  of fallback is by design. Wired the span; added a TODO at the
  call site flagging this for a separate ticket. CLAUDE.md
  compliance question: should the design be revisited?
- **`transformation/engine.ts` `generateTransformationReport`** uses
  `generateText` + manual JSON parse rather than `generateObject`
  (Opus 4.7 was wrapping output in a self-invented `$SCHEMA` key).
  No span deviation — same wrap pattern, just different parse logic
  inside.
- **`pushback-engine.ts`** required an inner-helper refactor
  (extracted `runPushbackTurnInner` so the parent span wraps the
  whole function body cleanly).
- **`research-tool` execution + followup** — same inner-helper
  pattern as pushback for the same reason.

Phase 6 watch items (consolidated from canary stops):
1. **AsyncLocalStorage propagation through nested withAgentSpan
   calls.** Fire one synthesis trace and confirm Sentry UI shows
   `discovery.synthesis` as parent with three children
   (`synthesis.summarise` → `synthesis.eliminate` → `synthesis.final`)
   under it, single trace_id. Same check for `discovery.pushback`,
   `research.execution`, `research.followup`.
2. **Streaming span lifecycle** — fire one discovery turn, confirm
   `discovery.turn` populates `latency.first_token_ms`,
   `latency.total_ms`, `agent.model`, and (when present)
   `tokens.input` / `tokens.output` over the stream's lifetime.
3. **Streaming span cancellation cleanup** — open a discovery turn,
   abort the request mid-stream (close browser tab), check that the
   span appears in Sentry as ended (not as a dangling open span).
   If it dangles, the cancel hook isn't firing or isn't ending the
   span.
4. **`instrumentation.ts` cold-start delta** (from Phase 1 watch
   list) — Vercel function cold-start durations before/after the
   lazy → static import change.
5. **Validation submit endpoint trace propagation** (from Phase 3c
   pre-flight): when validation Inngest workers are wrapped with
   `queue.task` spans in Phase 3c, confirm the validation submit
   route emits trace headers in the Inngest event payload (the
   Tier-1 tool routes already do this; validation submit predates
   the pattern and may need a small update).

Follow-up tickets surfaced:
- Revisit `conversation-arc-summariser.ts` design — should it use
  `withModelFallback`?
- Remove `sendToLoggingService` placeholder stub from
  `src/lib/logger.ts` (Phase 1 finding).
- Broaden `client/.env.example` to cover the full project env
  contract (Phase 1 finding).

Verification:
- `pnpm exec tsc --noEmit` from `client/` exits 0.
- `pnpm lint` from `client/` exits 0 (same 2 pre-existing warnings
  in `app/api/discovery/ventures/route.ts` and `lib/empty.ts`,
  unchanged).

Phase 3b mechanical pass complete. Stopping for review before
Phase 3c (Inngest worker `queue.task` spans + the three-layer
trace stitching pattern).

## Phase 3c — Inngest workers + three-layer trace stitching

### Phase 3c Pre-flight (2026-05-03)

Process discipline: **inventory deltas are expected between phases;
re-count at every phase boundary.** Phase 0 surveyed by file naming
pattern; this is the second time a re-count surfaced new functions
(Phase 3b found 10 missed engines; Phase 3c found 2 missed Inngest
functions).

Inngest function count delta: **19 → 21** (+2):
- `stuck-job-reconciliation.ts` — new file since Phase 0. Pure cron
  sweep (`*/15 * * * *`) flagging abandoned ToolJob + Roadmap rows
  in terminal-failed state. DB reads/writes only, no `inngest.send`
  side effects. Standard cron pattern; folds into the fan-out list.
- `validation-reporting-function.ts` exports TWO functions
  (`validationReportingSchedulerFunction` + `validationReportingFunction`).
  Phase 0 only counted one. Both wrapped.

Sentry Inngest integration availability: **none in v10.51.** Verified
by `node_modules/@sentry/*` directory inspection — no
`@sentry/inngest`, no `inngestIntegration` export. Step.run blocks
inherit the parent `queue.task` span via AsyncLocalStorage; engine
calls inside `step.run` automatically appear as children of the
worker's `queue.task` because `withAgentSpan` reads the active span.
No per-step wrapping needed.

Trace propagation through Inngest event payload: **verbatim JSON
pass-through.** Inngest does not sanitize, transform, or strip event
fields. Adding optional `sentryTrace?` and `baggage?` to the
Tier-1 + transformation event types is the cleanest stitching
mechanism. Phase 3d scope.

Inngest serverless replay caveat (PROACTIVELY DOCUMENTED):
- Inngest's serverless model invokes the function handler MULTIPLE
  TIMES per logical run (once per step boundary, replaying earlier
  step results). Each invocation opens a fresh `queue.task` span.
- A long-running tool worker (research-execute, ~6 steps) produces
  ~6 sibling `queue.task` spans correlated by `inngest.run_id`,
  not one span covering the whole run.
- This is honest: each invocation is a fresh serverless function
  execution. Sentry's job is not to merge them. Correlation by
  `inngest.run_id` filtering is the canonical workflow.
- **Phase 6 reviewer expectation:** seeing N sibling `queue.task`
  spans for one logical Inngest run is the EXPECTED shape, not a
  bug. Filter by `inngest.run_id` in Sentry to see the whole run.

Validation submit endpoint trace-propagation gap (Phase 3b
finding): confirmed as **Phase 3d scope, not Phase 3c blocker.**
Phase 3c wraps validation workers unconditionally — they legitimately
become trace roots today (cron-fired). When a route-driven trigger
is added (Phase 3d or follow-up), the worker requires no code
change because `withDistributedTrace` already gates on header
presence. **Worker-side code requires no changes when this happens.**

Deferred event types (Phase 3d scope):
- 7 events GET trace-header propagation in Phase 3d (Tier-1 tools +
  transformation): `tool/research-execute.requested`,
  `tool/research-followup.requested`, `tool/packager-generate.requested`,
  `tool/packager-adjust.requested`, `tool/composer-generate.requested`,
  `tool/coach-prepare.requested`, `discovery/transformation.requested`.
- 5 events DEFERRED to Phase 3d-extended or follow-up
  (`discovery/synthesis.requested`, `discovery/roadmap.requested`,
  `discovery/pushback.alternative.requested`,
  `discovery/continuation.requested`,
  `discovery/conversation.title.requested`). Their workers wrap as
  `queue.task` in this phase and become trace roots; no code
  changes needed when their routes eventually propagate headers.

### Phase 3c Step 1 — Helper extension (2026-05-03)

Files changed:
- `client/src/lib/observability/sentry-spans.ts` — added
  `withInngestQueueSpan` and `InngestQueueSpanOptions` type.
  Type-enforces the four standard correlation attributes
  (`inngest.function_id`, `inngest.event_name`, `inngest.run_id`,
  `inngest.attempt`) so a contributor cannot accidentally omit them.
  Span name defaults to `inngest.<functionId>` for stable Sentry
  filtering.
- `client/src/lib/observability/index.ts` — barrel re-exports
  `withInngestQueueSpan` and the new type.

### Phase 3c Step 2 — Three-canary wrap (2026-05-03)

**Canary 1 — `tools/research-execute-job.ts`** (Tier-1 tool worker,
3-layer trace target). Handler destructures `runId, attempt` from
the Inngest context (v4+ provides these directly). Wrapped with
`withDistributedTrace` (gated on `event.data.sentryTrace`/`baggage`)
then `withInngestQueueSpan({ functionId: 'tool-research-execute',
eventName: event.name, runId, attempt })`. Attempted to extract the
handler body to a separate function for cleanliness — surfaced a
typecheck error because Inngest's `step` type uses `Jsonify<>` on
return values, which a generic `Promise<T>` extraction cannot
satisfy. Reverted to inline-closure wrap; pattern stays consistent
across the other 20 wraps.

**Canary 2 — `transformation-report-function.ts`** (lifecycle worker,
3-layer trace target). Same wrap pattern. Confirms the pattern
generalizes beyond Tier-1 tool workers.

**Canary 3 — `validation-reporting-function.ts`** (cron, no upstream
parent). BOTH exported functions wrapped — scheduler (cron-fired
fan-out) AND per-page reporter (fanned-out from scheduler). Both
become trace roots; `withDistributedTrace` no-ops cleanly on
absent headers. **This canary is the load-bearing test for the
"no upstream parent" path** — verifies the worker is robust to
missing trace headers without Phase 3d having to land first.

Verification:
- `pnpm exec tsc --noEmit` from `client/` exits 0.
- `pnpm lint` from `client/` exits 0 (same 2 pre-existing warnings
  in `app/api/discovery/ventures/route.ts` and `lib/empty.ts`,
  unchanged).
- Visual trace-tree verification deferred to Phase 6 — the agent
  cannot run the app + inspect Sentry UI from this context.
  Compile-time correctness is a strong signal; Phase 6 catches
  any runtime miss.

Anomalies surfaced during the three-canary wrap:
- **`step` type incompatibility for extracted handlers.** Inngest's
  `step` parameter type uses `Jsonify<>` on return values from
  `step.run`. Extracting the handler body to a separate function
  with a generic `Promise<T>` step type fails typecheck. Resolution:
  inline closure wrap (handler body stays in the arrow function
  passed to `inngest.createFunction`). Same pattern across all 20+
  wraps.
- **`validation-reporting-function.ts` exports two functions.** One
  is the cron scheduler, the other is the per-page reporter. Both
  wrap identically with `withInngestQueueSpan`; both become trace
  roots today (per-page reporter inherits trace-root status from
  the scheduler — neither has route-side parent).

Stopping for canary review before fanning out the remaining 18
Inngest functions.

### Phase 3c Step 3 — Mechanical fan-out (2026-05-03)

**Inventory delta during fan-out: 21 → 22.** Discovered
`account-deletion-function.ts` mid-pass (was missing from the
Phase 3c pre-flight glob). Same Phase-0-pattern issue surfacing
again — file-naming-pattern globbing undercounts when files don't
match expected naming. **Structural lesson reinforced:** future
Inngest inventories grep `inngest.createFunction` across the
target directory tree, not glob by filename pattern.

Final inventory: **22 Inngest functions** wired with `queue.task`
spans across **21 files** (validation-reporting-function.ts hosts 2).

Wiring pattern (identical across all 22):
1. Add `withInngestQueueSpan` + `withDistributedTrace` imports.
2. Add `runId, attempt` to handler destructure (and `event` for
   the two cron-only handlers that previously omitted it).
3. Wrap handler body: `withDistributedTrace({ sentryTrace, baggage },
   () => withInngestQueueSpan({ functionId, eventName, runId,
   attempt }, async () => { ... original body ... }))`.
4. `withDistributedTrace` no-ops cleanly on absent headers — every
   worker is robust to missing parent trace context regardless of
   trigger type.

Files wrapped (this pass — 19 of 22; the 3 from canary already done):
- Tier-1 tool workers (5): `tools/coach-prepare-job.ts`,
  `tools/composer-generate-job.ts`, `tools/packager-generate-job.ts`,
  `tools/packager-adjust-job.ts`, `tools/research-followup-job.ts`.
- Lifecycle / route-driven (5): `discovery-session-function.ts`,
  `roadmap-generation-function.ts`, `pushback-alternative-function.ts`,
  `continuation-brief-function.ts`, `lifecycle-transition-function.ts`,
  `conversation-title-function.ts`, `account-deletion-function.ts`.
- Cron sweeps (6): `validation-lifecycle-function.ts`,
  `roadmap-nudge-function.ts`, `usage-anomaly-detection-function.ts`,
  `paddle-reconciliation-function.ts`,
  `backfill-roadmap-task-ids-function.ts`,
  `stuck-job-reconciliation.ts`.

(Already wired in canary: `tools/research-execute-job.ts`,
`transformation-report-function.ts`,
`validation-reporting-function.ts` (2 functions).)

### Phase 3c — Cross-trace correlation note (deferred)

Cron-emitted Inngest events become **separate trace roots** in this
phase. Cross-correlation via `inngest.run_id` of the originating
cron is the supported pattern. Nested trace stitching across
cron-emitted events (e.g., the `validation-reporting-scheduler` →
`validation-page-reporting` fan-out producing one unified trace
tree) is **deferred indefinitely** — low priority, not a Phase 3
concern. Sentry's UI filtering by `inngest.run_id` covers the
diagnostic case adequately.

### Phase 3c — Deferred lifecycle/cron route propagation note

Five route-driven event types are wrapped with `queue.task` spans
in this phase but their routes do NOT propagate trace headers.
Phase 3d's seven Tier-1 + transformation events get propagation;
the deferred five (`discovery/synthesis.requested`,
`discovery/roadmap.requested`, `discovery/pushback.alternative.requested`,
`discovery/continuation.requested`,
`discovery/conversation.title.requested`) remain trace roots until
a follow-up ticket lands route-side propagation.

**Worker-side code requires zero changes when this happens** —
`withDistributedTrace` is already gated on header presence, so
the workers will start stitching automatically the moment the
routes propagate.

### Phase 3c — Phase 6 watch items (consolidated)

Adding two new items specific to Phase 3c:

6. **Inngest serverless replay correlation.** Fire one
   research-execute job; expect ~6 sibling `queue.task` spans
   correlated by `inngest.run_id`. Filter by `inngest.run_id` in
   Sentry — confirm the filter shows all sibling spans for the
   run.
7. **`inngest.attempt` increments across siblings.** For the
   research-execute job above, confirm each sibling carries the
   correct `inngest.attempt` value, monotonically increasing per
   replay (0, 1, 2, ...). If all siblings show `attempt: 0`, the
   helper is reading the wrong field from Inngest's context and
   replay correlation breaks. Likely runtime fix; tsc cannot
   catch this.

### Phase 3c — Anomalies surfaced

1. **`account-deletion-function.ts` missed in pre-flight glob.**
   Pattern-globbing under-inventories — same lesson as Phase 3b's
   engine-grep gap. Fixed by folding into fan-out; documented as
   structural lesson.
2. **`validationReportingSchedulerFunction` was a Phase 0 miscount,
   not a new addition.** File exports two `inngest.createFunction`
   calls; original count assumed one per file.
3. **`step` type with extracted handlers.** Inngest's
   `step.run<T>` returns `Promise<Jsonify<T>>`. Extracting the
   handler to a separate function with a generic step type fails
   typecheck. Universal resolution: inline-closure wrap (handler
   body stays in the arrow function passed to
   `inngest.createFunction`). Applied consistently across all 22
   wraps.

### Phase 3c — Final verification

- `pnpm exec tsc --noEmit` from `client/` exits 0.
- `pnpm lint` from `client/` exits 0 (same 2 pre-existing warnings
  in `app/api/discovery/ventures/route.ts` and `lib/empty.ts`,
  unchanged).
- 22 of 22 Inngest functions wrapped. Visual trace-tree
  verification deferred to Phase 6 (cannot run from this agent
  context).

### Phase 3c — Structural lesson (durable)

**Inventory deltas are expected at every phase boundary.** Two
specific patterns recurred during this work:

1. **File-naming-pattern globbing undercounts.** Both Phase 3b
   (engine inventory) and Phase 3c (Inngest inventory) found
   missed surfaces by callsite grep. The durable fix:
   - For Inngest: `grep "inngest.createFunction" src/inngest/`
   - For LLM-bearing engines: `grep "withModelFallback\|new Anthropic"`
   - For trace-header-emitting routes: `grep "inngest.send"`
2. **Files can host multiple Inngest function declarations.** Count
   `inngest.createFunction` occurrences, not files.

Phase 3c complete. Stopping for review before Phase 3d (route-layer
`ui.action` spans + Server Action wrapping + 7 event-type
extensions for trace-header propagation).

## Phase 3d — Route-layer ui.action spans + Server Actions + event-type extensions

### Phase 3d Pre-flight (2026-05-03)

- Server Action inventory: 2 functions across 2 files
  (`swapVentureStatus`, `generatePortalLink`). File count == function
  count for once — but the grep discipline did its job (file lies
  weren't pre-decided).
- Sentry v10 `getTraceData()` confirmed exported from
  `@sentry/core`; already abstracted via Phase 3a's
  `captureTraceHeaders()` helper. Zero new API surface.
- `withServerActionInstrumentation` confirmed in v10.51 with two
  overloaded signatures `(name, callback)` / `(name, options,
  callback)`. Bare overload sufficient for both NeuraLaunch Server
  Actions.
- `inngest.send()` callsite inventory: 16 sites across 11 files.
  Architectural collapse: 6 Tier-1 tool events flow through one
  helper at `lib/tool-jobs/queue.ts:33`. One helper update injects
  trace headers for all 6 events. Transformation route at
  `discovery/ventures/[ventureId]/route.ts:327` does direct
  `inngest.send` — needs inline header injection.
- Two ambiguous callsites (`checkpoint:176`, `diagnostic:200`) both
  send `CONTINUATION_BRIEF_EVENT` — deferred-event scope, no work
  this phase.

### Phase 3d Step 2 — Event-type extensions (2026-05-03)

`client/src/inngest/client.ts`: additive `sentryTrace?: string;
baggage?: string;` on the data shape of all 7 in-scope event types
(6 Tier-1 tools + `discovery/transformation.requested`). Architectural
docstring on the type-map header documents the deferred-events path:
adding header propagation to deferred routes later requires only a
route-side change — workers already gate on header presence.

### Phase 3d Step 3 — `tool-jobs/queue.ts` helper extension (2026-05-03)

Added optional `traceHeaders?: DistributedTraceHeaders` parameter
to `sendToolJobEvent`. When present, headers are merged into
`event.data` via `mergeTraceHeaders()` before send. Existing callers
that don't pass headers continue working unchanged (additive
parameter, default undefined). Defensive coverage of both
single-event and array dispatch.

### Phase 3d Step 4-7 — Canary + fan-out (2026-05-03)

13 callsites wired across 3 distinct patterns:

**Tier-1 tool routes (12 routes — 6 standalone + 6 task-launched):**
- `api/discovery/roadmaps/[id]/research/execute/route.ts` (canary)
- `api/discovery/roadmaps/[id]/tasks/[taskId]/research/execute/route.ts`
- `api/discovery/roadmaps/[id]/research/followup/route.ts`
- `api/discovery/roadmaps/[id]/tasks/[taskId]/research/followup/route.ts`
- `api/discovery/roadmaps/[id]/coach/prepare/route.ts`
- `api/discovery/roadmaps/[id]/tasks/[taskId]/coach/prepare/route.ts`
- `api/discovery/roadmaps/[id]/composer/generate/route.ts` (Branch B only)
- `api/discovery/roadmaps/[id]/tasks/[taskId]/composer/generate/route.ts` (Branch B only)
- `api/discovery/roadmaps/[id]/packager/generate/route.ts` (Branch B only)
- `api/discovery/roadmaps/[id]/tasks/[taskId]/packager/generate/route.ts` (Branch B only)
- `api/discovery/roadmaps/[id]/packager/adjust/route.ts`
- `api/discovery/roadmaps/[id]/tasks/[taskId]/packager/adjust/route.ts`

**Transformation route (inline header injection, not via tool-jobs/queue):**
- `api/discovery/ventures/[ventureId]/route.ts:327` —
  `ui.transformation_complete` span. Inline header injection
  (direct `inngest.send`, not a ToolJob flow).

**Server Actions (2):**
- `actions/ventures.ts` — `swapVentureStatus` (canary)
- `actions/billing.ts` — `generatePortalLink`

Per-route input attributes:
- `tool.research_execute` (both variants): `tool.input_length` =
  `plan.length`
- `tool.research_followup` (both variants): `tool.input_length` =
  `query.length`
- `tool.composer_generate` (both variants Branch B):
  `tool.input_length` = `JSON.stringify(context).length`
- `tool.packager_generate` (both variants Branch B):
  `tool.input_length` = `JSON.stringify(context).length`
- `tool.packager_adjust` (both variants):
  `tool.input_length` = `adjustmentRequest.length`
- `tool.coach_prepare` (both variants): no body input → no
  `tool.input_length` attribute (per "omit rather than invent")
- `ui.transformation_complete`: no input length (route is a state
  transition, not a content submission)

### Phase 3d Anomalies surfaced

1. **Inventory delta during fan-out: 5 → 12 tool routes.** Pre-flight
   missed the 6 task-launched variants under `[taskId]/`. Fourth
   inventory miss across the integration. Same Phase 0 lesson —
   file-naming-pattern globbing under-counts when route files split
   on URL parameters (the `tasks/[taskId]/<tool>/<verb>/route.ts`
   pattern wasn't visible in my pre-flight grep). Folded into
   fan-out.
2. **Composer + Packager generate routes have TWO branches.** Branch
   A (sync context collection) and Branch B (async generation).
   Only Branch B uses `sendToolJobEvent`. Branch A's observability
   lives at the engine layer (Phase 3b wrapped `runComposerContext`
   / `runPackagerContext` with `withAgentSpan`). Wrapped only Branch
   B — Branch A stays unchanged.
3. **TS flow narrowing on `parsed.data` doesn't survive the async
   closure boundary.** When `withToolUiSpan(..., async () => { ... })`
   reads `parsed.data.context` inside the callback, TS widens the
   discriminated union back to the full `union` because the closure
   is a separate function scope. Resolution: extract narrowed values
   to a local `const generateInput = parsed.data;` BEFORE the
   `withToolUiSpan` call, and reference `generateInput.context` /
   `generateInput.mode` / etc. inside the closure. Applied to
   composer × 2 and packager-generate × 2.
4. **`withServerActionInstrumentation` widens discriminated unions
   on callback inference** (already documented from canary).
   `generatePortalLink` got the same explicit return-type
   annotation pattern. Top-level type alias
   (`GeneratePortalLinkResult`) was lifted so the inner callback
   can declare its return type and preserve narrowing.

### Phase 3d Final verification

- `pnpm exec tsc --noEmit` from `client/` exits 0.
- `pnpm lint` from `client/` exits 0 (same 2 pre-existing warnings
  in `app/api/discovery/ventures/route.ts` and `lib/empty.ts`).
- 15 wraps total across Phase 3d: 12 tool routes + 1 transformation
  route + 2 Server Actions.
- Visual trace-tree verification deferred to Phase 6 (no Sentry UI
  access from this agent).

### Phase 3d — Structural lessons (durable)

**Fourth inventory miss across the integration.** The structural
lesson now firmly established:

| Phase | Miss | Fix |
|---|---|---|
| 3b | engine inventory (10 missed) | grep `withModelFallback\|new Anthropic` |
| 3c | Inngest count #1 (1 missed) | `account-deletion-function.ts` was added since Phase 0 |
| 3c | Inngest count #2 (1 miscount) | `validation-reporting-function.ts` exports two |
| 3d | tool routes (7 missed) | task-launched variants under `[taskId]/` weren't in pre-flight glob |

The durable fix: **file-naming-pattern globbing is the wrong
inventory method, every time.** Use callsite grep instead:
- Engines: `grep "withModelFallback\|new Anthropic"`
- Inngest: `grep "inngest.createFunction"`
- Inngest senders: `grep "inngest.send"`
- Tool routes: `grep "sendToolJobEvent"`
- Server Actions: `grep "^'use server'"` then enumerate exports.

Phase 3d complete. Stopping for review before Phase 3e (Exa wrap,
~15 min) and Phase 3f (Paddle webhook wrap, with PII canary).

## Phase 3e — Exa wrap (canonical external-API pattern)

### Phase 3e (2026-05-04)

One callsite at `lib/research/exa-client.ts:106` (the
`exaSearchOnce` function's `client.search()` call). Wrapped with
`withExaSearchSpan({ queryLength: query.length }, () => ...)`.

Helper API refinement: `withExaSearchSpan`'s `audienceType` was
made **optional**. The transport file (`exa-client.ts`) doesn't
know the founder's audience type — that's an agent-layer concept.
Parent `ai.agent` spans (Phase 3b's withAgentSpan wraps in
synthesis / coach-prep / packager-gen / composer-gen / research)
already carry `agent.audience_type`; Sentry's UI joins via the
trace tree. Higher-level callsites that DO know the audience type
can pass it for first-class filtering.

API key (`e85b***378`) verified absent from any attribute path:
- Helper signature accepts only `{ queryLength, audienceType? }`
- API key is passed implicitly via the SDK constructor
  (`getClient()` reads from env), structurally unreachable from
  the wrap

This is the **canonical pattern for any future external-API
wrap.** Future contributors wrapping Tavily, future SDKs, etc.
should:
1. Capture only the request shape's structural metadata (length,
   type, count — never the request content itself)
2. Never include API keys, tokens, customer IDs, or freeform user
   text in attributes
3. The "Slack-message rule" is the test: would you put this on a
   Slack message to the team without redaction? If no, omit.

Files changed:
- `client/src/lib/observability/sentry-spans.ts` —
  `withExaSearchSpan` audienceType made optional; conditional
  inclusion in attribute bag.
- `client/src/lib/research/exa-client.ts` — wrapped the
  `client.search()` call inside the retry loop. Each attempt
  becomes its own span, which is correct: a retry is a separate
  HTTP roundtrip with its own latency profile.

Verification:
- `pnpm exec tsc --noEmit` exits 0.
- API key never reaches any attribute path (verified by helper
  signature + by inspection of the wrap call site).

## Phase 3f — Paddle webhook wrap (canonical PII-sensitive pattern)

### Phase 3f (2026-05-04)

One entry handler at `app/api/webhooks/paddle/route.ts`. Wrapped
the call to `handleWebhookEvent(event)` (post-signature-
verification) with `withPaddleWebhookSpan({ eventType:
event.eventType }, ...)`.

Sub-handler architecture decision: **no per-sub-handler spans.**
The dispatcher in `webhook-processor.ts` switches on
`event.eventType` and delegates to one of seven handler
functions. Each handler runs inside the parent span's
AsyncLocalStorage context, and their Prisma DB calls
auto-instrument as `db.query` child spans — the right
granularity. Adding `withPaddleSubHandlerSpan(...)` wrappers
around each delegate would emit empty parent spans without
diagnostic value (the eventType attribute on the parent already
differentiates).

PII verification — by inspection:
- `withPaddleWebhookSpan`'s helper signature accepts only
  `{ eventType: string }`. Customer IDs, transaction amounts,
  email addresses, subscription IDs — all structurally rejected.
- `event.eventType` values are Paddle enum constants
  (`subscription.created`, `transaction.completed`,
  `adjustment.created`, etc.) — public API surface, not PII.
- Sub-handlers receive the full event object via the dispatcher
  but never call `setAttr` (not span-aware). No leakage path.
- The `assertNoPII` dev-only guard from Phase 3a runs on every
  `setAttr` call; a future contributor accidentally passing an
  email-shaped value to `paddle.event_type` triggers a dev-time
  failure with stack trace.

This is the **canonical pattern for any future PII-sensitive
integration wrap** (future Stripe, future identity providers,
etc.). The harm asymmetry is the operational principle:
- "subscription.created event fired" — operationally useful,
  reveals nothing
- "customer cus_abc123 triggered subscription.created" —
  attributes activity to a specific user, becomes PII the moment
  a Sentry incident response involves a screenshot

Files changed:
- `client/src/app/api/webhooks/paddle/route.ts` — wrapped the
  inline `handleWebhookEvent(event)` call. Inline comment
  references the migration-log section so a future reader
  understands why the wrap is shaped the way it is.

Verification:
- `pnpm exec tsc --noEmit` exits 0.
- `pnpm lint` exits 0 (2 pre-existing warnings unchanged).
- PII-by-inspection check passed (helper signature + sub-handler
  audit + assertNoPII dev guard, three layers of defence).

### Phase 3e + 3f — Note on attribute omission

Three classes of span legitimately omit attributes that earlier
phases captured:
- `tool.coach_prepare`: no body input → no `tool.input_length`.
- `ui.transformation_complete`: state transition, not content
  submission → no input length.
- `paddle.webhook`: PII-sensitive payload → only `event_type`.

The principle: **attributes that would help debug a real
production incident.** Not every span needs a token-count
attribute. Empty-string or zero attributes are noise; recording
nothing is more honest. Future contributors adding new spans
should make the attribute decision per-callsite based on what
would help debugging — not a cargo-cult "always include
input_length."

Phase 3e + 3f complete. Stopping for review before Phase 4
(PII scrubbing — `beforeSend` / `beforeSendTransaction` hooks +
deliberate-PII canary test events). Phase 4 deserves its own
careful pre-flight; production hard line.

## Phase 4 — PII scrubbing (production hard line)

### Phase 4 Pre-flight (2026-05-04)

Critical default-capture finding:
**`maxIncomingRequestBodySize: 'medium'` is the v10 default** — Sentry
attaches request bodies up to 10kB to error events without explicit
opt-out. NeuraLaunch's POST routes carry user content verbatim
(discovery turn text, billing forms, venture descriptions). This is
the highest-volume PII surface in the SDK's default config.

**Defense-in-depth design (3 layers, all required):**
1. **Helper signature protections (Phase 3a)** — typed attribute keys
   on every `withXxxSpan` helper. Compile-time prevention.
2. **`maxIncomingRequestBodySize: 'none'`** at the HTTP integration
   (Phase 4) — disables body attachment at the source.
3. **`beforeSend` / `beforeSendTransaction` regex + denylist scrub**
   (Phase 4) — runtime egress filter on every event.

### Phase 4 Implementation (2026-05-04)

Files created (4):
- `client/src/lib/observability/scrub-patterns.ts` — pure scrub
  primitives (regex patterns, denylist, scrubString, isDeniedKey,
  isHealthcheckUrl, walkAndScrub, stripQueryString). NO `server-only`
  import — unit-testable in isolation.
- `client/src/lib/observability/scrub.ts` — server-only Sentry hook
  implementations (`beforeSend`, `beforeSendTransaction`). Re-exports
  pure primitives.
- `client/src/lib/observability/scrub-browser.ts` — browser-side
  `beforeSend` hook (mirrors scrub.ts minus the `server-only` import).
- `client/src/lib/observability/scrub.test.ts` — Vitest suite, 62
  tests. Every regex has must-match AND must-NOT-match columns.
- `client/scripts/sentry-canary.ts` — deliberate-PII canary script.
  Fires 5 test events, prints event IDs for visual verification in
  Sentry's UI.

Files changed (3):
- `client/sentry.server.config.ts` — added `httpIntegration({
  maxIncomingRequestBodySize: "none" })`, wired `beforeSend` +
  `beforeSendTransaction`.
- `client/sentry.edge.config.ts` — wired both hooks for parity (no
  edge surface today; Phase 6 N/A until middleware ships).
- `client/instrumentation-client.ts` — wired browser `beforeSend`.

### Regex pattern inventory

9 PII patterns + 13 denylist key patterns. Every pattern is
documented with both must-match AND must-NOT-match contracts:
- Email (RFC-5322 simplified)
- Key prefixes underscore: sk_, pk_, exa_, sntr_, pdl_, pdl_sdbx_,
  rk_, whsec_, pi_, ch_
- Key prefixes dash: sk-, pk-, exa-, sntr-, pdl-, rk-
- Anthropic API keys: sk-ant-...
- Inngest signing keys: signkey-(prod|test)-...
- JWT (3-segment base64url)
- Long digit runs (13-19 digits — explicitly excludes phone/ZIP/port)
- SSN (3-2-4 dashed)
- Billing entity IDs: cus_/sub_/ctm_/txn_/adj_/trn_/pri_/pro_/ses_

### Anomalies surfaced + fixed during implementation

1. **`server-only` blocks Vitest imports.** Restructured into
   `scrub-patterns.ts` (pure, testable) + `scrub.ts` (server-only
   re-export + hooks) + `scrub-browser.ts` (browser-side mirror).
2. **First test failure caught a real bug:** `/token/i` matched
   `tokens.input` (a NeuraLaunch attribute carrying integer token
   count, not a credential). Tightened to
   `(?<![a-zA-Z])token(?![a-zA-Z])` — letter-boundary, not word-
   boundary. Plain `\b` doesn't work because regex word-class
   includes `_`, which would reject `access_token`. The lookaround
   pattern correctly matches `access_token` while rejecting
   `tokens.input` / `tokens.output`. **The Vitest suite caught a
   production regression before it shipped — the test infrastructure
   paid for itself on the first run.**
3. **Sentry hook type signature mismatch.** v10 expects `ErrorEvent`
   / `TransactionEvent` parameters. Importing those from
   `@sentry/core` failed because pnpm has 3 versions installed
   (10.25, 10.48, 10.51) from transitive deps with skewed `Scope`
   class shapes. Resolution: hooks accept the broader `Event` type;
   each Sentry.init callsite casts to the narrower expected type via
   conditional-type extraction. Runtime-safe (both narrower types
   extend `Event`); tsc-safe across the version skew.
4. **Async-arrow-no-await lint errors** in `sentry-canary.ts` —
   Sentry's `startSpan` callback was unnecessarily async. Removed
   `async` keyword from the two affected callbacks.

### Phase 6 watch items added

8. **PII canary visual verification.** Run `pnpm tsx
   scripts/sentry-canary.ts` against the dev Sentry environment.
   Verify each of the 5 events has its PII redacted as `[Filtered]`
   in the Sentry UI:
   - canary-1: event.message (was email)
   - canary-2: exception.values[0].value (was Anthropic key)
   - canary-3: span attribute test.jwt (was JWT)
   - canary-4: span attribute paddle_customer_id (was Paddle ID)
   - canary-5: breadcrumb URL (was ?token=...)
   ALL FIVE must redact correctly. Any one failure = scrub not wired
   correctly for that surface.

### Verification

- `pnpm exec tsc --noEmit` from `client/` exits 0.
- `pnpm lint` from `client/` exits 0 (2 pre-existing warnings).
- Vitest suite: 62 of 62 tests pass.
  - 9 regex patterns × must-match/must-NOT-match coverage
  - 13 denylist keys × must-match/must-NOT-match coverage
  - Walker tests (nested scrub, depth cap)
  - beforeSend hook tests (healthcheck drop, URL strip, message
    scrub, exception scrub, request body scrub, breadcrumb scrub)
  - beforeSendTransaction hook tests (span description, span data,
    healthcheck drop)

Phase 4 complete. Stopping for review. Visual canary verification is
yours to run via `pnpm tsx scripts/sentry-canary.ts`. Phase 5 (source
maps) is next.

## Phase 5 — Source maps

### Phase 5 Pre-flight (2026-05-04)

Critical compiler-default finding:

`useRunAfterProductionCompileHook` in `@sentry/nextjs` v10.51 defaults
to **different values per compiler** ([types.d.ts:623](file://node_modules/@sentry/nextjs/build/types/config/types.d.ts)):
- Turbopack: `true` — post-build CLI hook injects Debug IDs after
  compile completes
- Webpack: `false` — legacy in-build webpack-plugin path

[`client/package.json:7`](client/package.json#L7) — production builds
use `next build --webpack`. **Production today uses the Webpack
plugin path.** Deploy `740924a` (2026-05-02) is structural evidence
that the existing pipeline produces working Sentry source maps under
this path.

The Turbopack-specific risks the research doc raised (Vercel SRI vs
post-compile Debug ID injection race) **do not currently apply.**
When the project flips to Turbopack default builds, the flag
auto-flips to `true` and the post-compile hook activates — at which
point the SRI risks reappear. **See Phase 6 watch item #9 for
re-verification at Turbopack default flip.**

### Phase 5 Implementation (2026-05-04)

Files changed:
- `client/next.config.ts` — added explicit
  `sourcemaps: { deleteSourcemapsAfterUpload: true }` to
  `withSentryConfig` options. Default in v10.51 is already `true`;
  explicit is documentation. Inline comment documents the three-layer
  "no source maps reach the production edge" defense (the hide flag,
  the productionBrowserSourceMaps disable, and the post-upload
  deletion).

Files created:
- `client/src/app/dev/sentry-source-map-canary/page.tsx` — hidden
  client component for source-map upload verification.
  Two-layer gate:
    1. `NEXT_PUBLIC_SENTRY_TEST_ENABLED === 'true'` (intended toggle)
    2. `NEXT_PUBLIC_VERCEL_ENV !== 'production'` (defense-in-depth)
  Both must agree; either rejects → `notFound()`.

### Phase 5 Verification — runbook (user-driven)

**Pre-deploy:**

```bash
# Confirm next.config.ts changes are clean
pnpm exec tsc --noEmit
pnpm lint
```

**One-time setup:**

1. Vercel dashboard → Integrations → Marketplace → search "Sentry".
2. If installed: click → confirm scopes are minimal
   (`project:read`, `project:write`, `project:releases`). **Disable
   Cron Monitoring scope if granted** — NeuraLaunch's Inngest crons
   run on Inngest Cloud, not Vercel cron.
3. If not installed: click "Add Integration" → select the
   `neuralaunch` Vercel project → grant the three minimal scopes
   only. The integration auto-provisions `SENTRY_AUTH_TOKEN` on
   Preview + Production envs.
4. Set `NEXT_PUBLIC_SENTRY_TEST_ENABLED=true` on the Vercel Preview
   environment **only**. Do NOT set on Production.

**Per-deployment verification (run after each Vercel preview build):**

```bash
# Trigger a fresh preview deploy via git push or Vercel CLI

# Pull the build artifact locally (or run pnpm build if reproducing)
# and verify Debug IDs landed in the chunks:
grep -l "//# debugId=" .next/static/chunks/*.js | head -5
# Expected: every production chunk file listed.

# Show actual Debug ID values (sample of 3):
grep -oE "//# debugId=[a-f0-9-]+" .next/static/chunks/*.js | head -3
# Expected: 3 distinct UUID-shaped IDs.

# Confirm .map files were uploaded AND deleted:
ls .next/static/chunks/*.map 2>&1 | wc -l
# Expected: 0 (sourcemaps.deleteSourcemapsAfterUpload removed them).
```

**Browser verification (the load-bearing test):**

1. Navigate to `<preview-url>/dev/sentry-source-map-canary`.
2. Click "Throw test error".
3. Open Sentry → filter `environment:preview` → find the event
   "Sentry source-map canary — Phase 5 verification".
4. Inspect the stack trace.

**Pass criteria:**
- Top frame shows
  `src/app/dev/sentry-source-map-canary/page.tsx`
  with a sensible line + column number near the `throw new Error()`.
- All other frames show TypeScript file paths under `src/`, not
  `static/chunks/<hash>.js`.

**Fail criteria:**
- Top frame shows `static/chunks/<hash>.js:1:<bignum>` (minified,
  un-mapped) — source-map upload is broken. Triage via §"Rollback
  recipe" below.

**Source-map size budget (record after first verification):**
- Sentry → project Settings → Source Maps → release row → artifact
  count and total size.
- Document the baseline number here once measured (replace
  `<TBD: artifact count>` and `<TBD: MB>` after first run).
- Expected order of magnitude: 50-200 MB per release. Counts against
  Sentry storage quota.
- If volume is consistently >200 MB and quota is a concern,
  `widenClientFileUpload: true` (currently set) can be turned off —
  trade is reduced de-minification coverage for less storage.

**Post-verification cleanup (after first preview pass):**

1. Remove the manual `SENTRY_AUTH_TOKEN` from Vercel env table
   (Preview + Production).
2. Trigger a fresh preview deploy.
3. Re-run the Debug ID grep + browser verification — confirm both
   still pass on integration-only token.
4. Update `client/.env.example`'s `SENTRY_AUTH_TOKEN` line to note
   it's integration-managed and shouldn't be set manually.
5. Unset `NEXT_PUBLIC_SENTRY_TEST_ENABLED` on Vercel Preview.

### Phase 5 Rollback recipe — Vercel-native → CLI

If the Vercel-native integration causes deploy issues (SRI conflicts
when Turbopack default flips, integration outage, etc.), revert to
manual CLI source-map upload:

1. Vercel dashboard → Integrations → Sentry → **Disable**.
   (Existing builds are not affected; new builds stop receiving the
   integration's auto-token.)
2. Generate a fresh User Auth Token from Sentry → Settings → User
   Auth Tokens with scopes `project:write` + `org:read`.
3. Add `SENTRY_AUTH_TOKEN` back to Vercel env table (Preview +
   Production) with the new token.
4. Trigger a new deployment. The Sentry webpack plugin reads the env
   var directly — same code path as pre-Phase-5.
5. No `next.config.ts` changes needed. `withSentryConfig` accepts
   both paths transparently.

### Phase 5 — Phase 6 watch items added

9. **Turbopack default flip — re-verify source-map upload.** When
   `client/package.json`'s `build` script drops the `--webpack` flag,
   `useRunAfterProductionCompileHook` flips from `false` to `true`
   automatically. Re-run the entire Phase 5 verification runbook
   above. Specifically watch for the SRI conflict failure mode (deploy
   succeeds but Sentry shows missing-artifact errors on first
   captured event).

10. **Source-map artifact size budget.** First preview deploy under
    the Vercel-native integration produces a baseline artifact size
    on Sentry's Source Maps page. Document the number; if subsequent
    deploys show >2× growth without a corresponding bundle-size
    change, investigate (could indicate `widenClientFileUpload`
    over-collecting, or a vendor SDK change emitting more maps).

### Phase 5 Verification

- `pnpm exec tsc --noEmit` from `client/` exits 0.
- `pnpm lint` from `client/` exits 0 (2 pre-existing warnings).
- All implementation steps complete; verification runbook documented
  for user-driven execution.

Phase 5 implementation complete. User-driven verification steps
(Vercel integration install/audit, env var set/unset, deploy,
browser test, manual token removal) documented as a runbook.
Stopping for the verification gate. Phase 6 (validation /
end-to-end checklist) is next.



