// sentry.server.config.ts — Sentry SDK init for the Node.js runtime
// (App Router server components, route handlers, server actions, Inngest
// workers).
// Source-of-truth refs:
//   - client/SENTRY_RESEARCH_DOC.txt § "Tripartite Initialization Structure"
//   - docs/migrations/turbopack-migration-research-2026-05.md § "Sentry on Turbopack"
//   - docs/migrations/turbopack-migration-log.md § "Sentry Integration"
//
// Phase 1 deltas (vs. wizard scaffold):
//   - removed enableLogs + consoleLoggingIntegration. logger.ts uses pure
//     console.* (verified Phase 1); removing the integration eliminates the
//     PII leak surface flagged in CLAUDE.md § "Security: never log user
//     message content at INFO".
//   - tracesSampleRate (1.0 flat) replaced with a tracesSampler function
//     that drops polling endpoints to 0 and samples critical paths at 100%.
//
// Phase 4 deltas:
//   - httpIntegration({ maxIncomingRequestBodySize: "none" }) — disables
//     request-body attachment at the source. Default is "medium" (10kB
//     bodies attached); since NeuraLaunch's POST routes carry user content
//     verbatim (discovery turn text, billing form fields, venture
//     descriptions), disabling at the source is the primary defense.
//   - beforeSend / beforeSendTransaction hooks from `lib/observability/scrub`
//     run on every event. Healthcheck-originated errors dropped entirely;
//     query strings stripped from URLs; PII regex + denylist scrub on every
//     string + attribute key. See scrub.ts banner for the three-layer
//     defense-in-depth design.
import * as Sentry from "@sentry/nextjs";
import type { SamplingContext } from "@sentry/core";
import { beforeSend, beforeSendTransaction } from "@/lib/observability/scrub";

const isDevelopment = process.env.NODE_ENV === "development";

// Surgical traces sampler. Errors bypass this entirely — they're always
// captured. Only successful transaction sampling is gated here.
function pickRate(ctx: SamplingContext): number {
  if (isDevelopment) return 1.0;

  // Inherit parent sampling for distributed traces (e.g. browser → server).
  if (typeof ctx.parentSampled === "boolean") return ctx.parentSampled ? 1.0 : 0;

  const target =
    (typeof ctx.name === "string" ? ctx.name : "") ||
    (ctx.normalizedRequest?.url ?? "");

  // Drop polling/healthcheck endpoints entirely — they dominate volume
  // and contribute zero diagnostic value.
  if (target.includes("/api/health")) return 0;
  if (target.includes("/api/discovery/tool-jobs/active")) return 0;
  if (/\/api\/discovery\/roadmaps\/[^/]+\/tool-jobs\/[^/]+\/status/.test(target)) return 0;

  // Critical paths: 100% sampled.
  if (target.includes("/api/checkout")) return 1.0;
  if (target.includes("/api/webhooks/paddle")) return 1.0;
  if (
    target.includes("/coach/") ||
    target.includes("/composer/") ||
    target.includes("/research/") ||
    target.includes("/packager/") ||
    target.includes("/pushback")
  ) {
    return 1.0;
  }

  // Default: 10% of general traffic.
  return 0.1;
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  debug: false,
  tracesSampler: pickRate,

  // Defense-in-depth layer 2 (of 3): disable request-body attachment at
  // the source. The Sentry HTTP integration's default is to attach
  // bodies up to 10kB to error events; for NeuraLaunch's content-heavy
  // POST surface this is unacceptable. Layer 3 (beforeSend regex scrub)
  // catches anything that slips past, but defense-in-depth means
  // disabling the attachment in the first place.
  integrations: [
    Sentry.httpIntegration({ maxIncomingRequestBodySize: "none" }),
  ],

  // Defense-in-depth layer 3 (of 3): runtime regex + denylist scrub.
  // See lib/observability/scrub.ts banner for the three-layer design.
  // Hook type widening: scrub functions accept the broader `Event` type
  // for version-skew mitigation (see scrub.ts banner). Cast to whatever
  // narrower type Sentry.init expects — runtime behavior is unchanged
  // because both `ErrorEvent` and `TransactionEvent` extend `Event`.
  beforeSend: beforeSend as Parameters<typeof Sentry.init>[0] extends infer O
    ? O extends { beforeSend?: infer F } ? F : never
    : never,
  beforeSendTransaction: beforeSendTransaction as Parameters<typeof Sentry.init>[0] extends infer O
    ? O extends { beforeSendTransaction?: infer F } ? F : never
    : never,
});
