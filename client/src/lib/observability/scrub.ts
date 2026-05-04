// src/lib/observability/scrub.ts
//
// Sentry `beforeSend` / `beforeSendTransaction` hooks. Pure scrub
// primitives live in `scrub-patterns.ts` (unit-testable in isolation via
// Vitest); this module wires them into the Sentry event lifecycle.
//
// Single source of truth for hook bodies. Both server-side
// (`sentry.server.config.ts`, `sentry.edge.config.ts`) AND browser-side
// (`instrumentation-client.ts` via `scrub-browser.ts` re-export) consume
// these implementations. Same logic everywhere — a regression caught by
// the Vitest suite catches it for all three runtimes.
//
// Defense-in-depth at egress (three layers, all required):
//   1. Helper signature protections (Phase 3a — `withXxxSpan` typed
//      attribute keys + dev-only assertNoPII).
//   2. Sentry HTTP integration `maxIncomingRequestBodySize: 'none'`
//      (Phase 4 — disables request-body attachment at the source).
//   3. THIS MODULE — runtime regex + denylist scrub on every event
//      before send.
//
// File-naming + import-site discipline is the boundary, not a
// `server-only` package guard. Earlier iterations imported
// `'server-only'` here for layered defense, but (a) nothing in the
// client bundle imports this file, (b) the test suite had to mock the
// guard to load this module, and (c) the verification script
// (`scripts/sentry-canary.ts`) crashed under `tsx` because the mock
// doesn't apply outside Vitest. The file's only callers are server
// runtime configs + the verification script + the test — none of
// those land in client bundles.

// Hook signatures use the broader `Event` type rather than the narrower
// `ErrorEvent` / `TransactionEvent` for two reasons:
//   (a) `TransactionEvent` is not in `@sentry/nextjs`'s public re-export
//       surface — pulling it from `@sentry/core` directly causes
//       version-skew errors because pnpm has 10.25 / 10.48 / 10.51 installed
//       from transitive deps.
//   (b) Both narrower types extend `Event`, so this widening is structurally
//       safe. The Sentry.init callsite casts to the narrower expected type.
import type { Event, EventHint } from '@sentry/nextjs';
import {
  FILTERED_PLACEHOLDER,
  scrubString,
  stripQueryString,
  isHealthcheckUrl,
  walkAndScrub,
} from './scrub-patterns';

/**
 * `beforeSend` — runs on every error / message event before send.
 *
 * Order of operations:
 *   1. Drop healthcheck-originated errors entirely (early return null).
 *   2. Strip query strings from request URL + breadcrumb URLs.
 *   3. Scrub event.message + every exception value's message string.
 *   4. Scrub event.request.data (defense-in-depth — the
 *      httpIntegration `maxIncomingRequestBodySize: 'none'` config
 *      prevents this from being populated, but the scrub catches any
 *      future regression).
 *   5. Recursive walk over event.contexts + event.extra + every
 *      breadcrumb's `data` field.
 *
 * Returning null drops the event. Returning the (mutated) event sends
 * it.
 */
export function beforeSend(event: Event, _hint?: EventHint): Event | null {
  // 1. Healthcheck drop
  if (isHealthcheckUrl(event.request?.url)) {
    return null;
  }

  // 2. Strip query strings on URLs
  if (event.request?.url) {
    event.request.url = stripQueryString(event.request.url);
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(bc => {
      const data = bc.data;
      if (data && typeof data === 'object' && 'url' in data && typeof data.url === 'string') {
        return { ...bc, data: { ...data, url: stripQueryString(data.url) } };
      }
      return bc;
    });
  }

  // 3. Scrub message strings
  if (typeof event.message === 'string') {
    event.message = scrubString(event.message);
  }
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map(ex => ({
      ...ex,
      value: typeof ex.value === 'string' ? scrubString(ex.value) : ex.value,
    }));
  }

  // 4. Scrub request body (defense-in-depth)
  if (event.request) {
    if (event.request.data !== undefined) {
      event.request.data = walkAndScrub(event.request.data, 0) as typeof event.request.data;
    }
    if (event.request.headers) {
      event.request.headers = walkAndScrub(event.request.headers, 0) as typeof event.request.headers;
    }
    if (event.request.query_string !== undefined) {
      event.request.query_string = FILTERED_PLACEHOLDER;
    }
  }

  // 5. Recursive walk over remaining surfaces
  if (event.contexts) {
    event.contexts = walkAndScrub(event.contexts, 0) as typeof event.contexts;
  }
  if (event.extra) {
    event.extra = walkAndScrub(event.extra, 0) as typeof event.extra;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(bc => ({
      ...bc,
      message: typeof bc.message === 'string' ? scrubString(bc.message) : bc.message,
      data: bc.data ? (walkAndScrub(bc.data, 0) as typeof bc.data) : bc.data,
    }));
  }

  return event;
}

/**
 * `beforeSendTransaction` — runs on every transaction (span tree)
 * before send. Healthcheck transactions are dropped at the
 * tracesSampler (returns 0); this is a second-layer scrub.
 */
export function beforeSendTransaction(event: Event): Event | null {
  if (isHealthcheckUrl(event.request?.url)) {
    return null;
  }

  if (event.request?.url) {
    event.request.url = stripQueryString(event.request.url);
  }
  if (event.request?.query_string !== undefined && event.request) {
    event.request.query_string = FILTERED_PLACEHOLDER;
  }

  if (event.spans) {
    event.spans = event.spans.map(span => {
      const next = { ...span };
      if (typeof next.description === 'string') {
        next.description = scrubString(next.description);
      }
      if (next.data) {
        next.data = walkAndScrub(next.data, 0) as typeof next.data;
      }
      return next;
    });
  }

  if (event.contexts) {
    event.contexts = walkAndScrub(event.contexts, 0) as typeof event.contexts;
  }

  return event;
}

// Re-export pure primitives so callsites can use them too without
// importing from `scrub-patterns.ts` directly.
export {
  FILTERED_PLACEHOLDER,
  scrubString,
  stripQueryString,
  isHealthcheckUrl,
  isDeniedKey,
} from './scrub-patterns';
