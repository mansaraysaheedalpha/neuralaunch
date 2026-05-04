// instrumentation.ts — Next.js bootstrap hook. The framework calls
// register() before any HTTP request is handled. We dispatch to the
// runtime-specific Sentry init based on NEXT_RUNTIME, and re-export
// Sentry's request-error capture as Next.js's onRequestError hook.
// Source-of-truth refs:
//   - client/SENTRY_RESEARCH_DOC.txt § "Core Installation and Initialization"
//   - docs/migrations/turbopack-migration-log.md § "Sentry Integration"
//
// Phase 1 delta: replaced lazy dynamic-import onRequestError with a
// top-of-file static Sentry import + Sentry.captureRequestError. The lazy
// shape was a wizard default; the static form pre-loads on cold start so
// the first error hitting the runtime isn't paying an import-time cost.
//
// ─── Sentry type imports — read before adding new ones ────────────────────
// Sentry SDK v10 deprecated `@sentry/types`. All type exports
// (Event, Breadcrumb, Span, User, SamplingContext, SeverityLevel, etc.)
// now live in `@sentry/core`. Pre-v10 examples on the public internet
// will still show `import type ... from "@sentry/types"` — DO NOT copy
// that pattern. Always import types from `@sentry/core`. Canonical
// usage in this codebase: `sentry.server.config.ts` imports
// `SamplingContext` from `@sentry/core` for the tracesSampler. See
// client/SENTRY_RESEARCH_DOC.txt § "Modern TypeScript Integration:
// The SDK v10 Migration".
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
