// sentry.edge.config.ts — Sentry SDK init for the V8 Edge runtime
// (Next.js middleware, edge route handlers).
// Source-of-truth refs:
//   - client/SENTRY_RESEARCH_DOC.txt § "Tripartite Initialization Structure"
//   - docs/migrations/turbopack-migration-research-2026-05.md § "Sentry on Turbopack"
//
// PLACEHOLDER STATE: NeuraLaunch has no middleware.ts and no
// `export const runtime = "edge"` declarations as of Phase 1. This file
// exists so that introducing an edge surface later doesn't require
// re-scaffolding under deadline pressure. Phase 6's "edge runtime" validation
// step is N/A until that surface ships.
//
// Phase 1 deltas (vs. wizard scaffold): same as server config — enableLogs +
// consoleLoggingIntegration removed; sampling pruned to a flat low rate
// (no surgical sampler needed yet because there's no edge traffic to shape).
//
// Phase 4 deltas: same beforeSend / beforeSendTransaction hooks as the
// Node config. Edge runtime today has no surface, but the hooks land here
// for parity so introducing middleware later doesn't ship raw query strings
// to Sentry. See scrub.ts banner for the design.
import * as Sentry from "@sentry/nextjs";
import { beforeSend, beforeSendTransaction } from "@/lib/observability/scrub";

const isDevelopment = process.env.NODE_ENV === "development";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  debug: false,
  tracesSampleRate: isDevelopment ? 1.0 : 0.1,
  // Hook widening — see sentry.server.config.ts for rationale.
  beforeSend: beforeSend as Parameters<typeof Sentry.init>[0] extends infer O
    ? O extends { beforeSend?: infer F } ? F : never
    : never,
  beforeSendTransaction: beforeSendTransaction as Parameters<typeof Sentry.init>[0] extends infer O
    ? O extends { beforeSendTransaction?: infer F } ? F : never
    : never,
});
