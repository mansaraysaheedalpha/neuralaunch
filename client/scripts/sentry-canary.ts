// scripts/sentry-canary.ts
//
// Phase 4 PII scrub canary. Fires deliberate-PII test events into the
// configured Sentry project and prints the event IDs so you can search
// for them in the Sentry UI and verify each PII vector appears as
// [Filtered] in the resulting event.
//
// Run via: pnpm tsx scripts/sentry-canary.ts (from the `client/` dir).
//
// REQUIRES: client/.env.local with SENTRY_DSN set. The script loads
// .env.local explicitly via dotenv — `tsx` does NOT auto-load env
// files, and a missing DSN causes Sentry.init to construct a no-op
// client that returns synthetic event IDs without dispatching to the
// backend. Result: the canary "succeeds" but no events appear in
// Sentry's UI. The DSN-host log line below catches that failure mode
// before it wastes a debugging session.
//
// PASS CRITERIA (verify by inspection in Sentry's UI):
//   1. Event "canary-1": event.message contains [Filtered] (was email)
//   2. Event "canary-2": exception.values[0].value contains [Filtered]
//      (was Anthropic API key)
//   3. Event "canary-3": span attribute test.jwt = [Filtered] (was JWT)
//   4. Event "canary-4": span attribute paddle_customer_id = [Filtered]
//      (was Paddle customer ID — denylist key match)
//   5. Event "canary-5": breadcrumb URL contains ?[Filtered] (was
//      ?token=...)
//
// ALL FIVE must redact correctly. Any one failure means the scrub is
// not wired correctly for that surface.

// Load .env.local BEFORE importing Sentry — Sentry.init reads
// process.env at call time and `tsx` does not auto-load env files.
// dotenv is already a devDependency.
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import * as Sentry from '@sentry/nextjs';
import { beforeSend, beforeSendTransaction } from '../src/lib/observability/scrub';

// Sanity log so a missing/stale DSN doesn't silently fail the canary.
// Sentry's no-op fallback returns synthetic event IDs without sending
// anything; without this line, that failure mode is invisible.
const dsnRaw = process.env.SENTRY_DSN ?? '';
if (!dsnRaw) {
  console.error('[Canary] FATAL: SENTRY_DSN is not set. Add it to client/.env.local');
  console.error('[Canary] (NEXT_PUBLIC_SENTRY_DSN and SENTRY_DSN should both contain the same value)');
  process.exit(1);
}
try {
  const dsnUrl = new URL(dsnRaw);
  console.log(`[Canary] Using DSN host: ${dsnUrl.host} (project id: ${dsnUrl.pathname.replace(/^\//, '')})`);
} catch {
  console.error('[Canary] FATAL: SENTRY_DSN is not a valid URL — check client/.env.local');
  process.exit(1);
}

// Bootstrap a minimal Sentry init for the canary. Mirrors
// sentry.server.config.ts's hooks so the test fires through the same
// scrub path as production.
Sentry.init({
  dsn: dsnRaw,
  environment: process.env.SENTRY_ENVIRONMENT ?? 'development',
  tracesSampleRate: 1.0,
  // Same hook widening as sentry.server.config.ts.
  beforeSend: beforeSend as Parameters<typeof Sentry.init>[0] extends infer O
    ? O extends { beforeSend?: infer F } ? F : never
    : never,
  beforeSendTransaction: beforeSendTransaction as Parameters<typeof Sentry.init>[0] extends infer O
    ? O extends { beforeSendTransaction?: infer F } ? F : never
    : never,
});

async function main(): Promise<void> {
  console.log('[Canary] Firing 5 deliberate-PII events into Sentry...');

  // 1. captureMessage with email in body
  const id1 = Sentry.captureMessage(
    'canary-1: test event for user alice+test@example.com',
  );

  // 2. captureException with error message containing fake Anthropic key
  let id2: string | undefined;
  try {
    throw new Error(
      'canary-2: DB query failed for sk-ant-api03-FAKE_KEY_FOR_TEST_ONLY_xxxxxxxxxxxxxxxxxxxxxxx',
    );
  } catch (e) {
    id2 = Sentry.captureException(e);
  }

  // 3. Span with attribute containing fake JWT
  const id3 = Sentry.startSpan({ name: 'canary-3' }, (span) => {
    span?.setAttribute(
      'test.jwt',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    );
    return Sentry.captureMessage('canary-3: span with JWT attribute');
  });

  // 4. Span with attribute key in denylist
  const id4 = Sentry.startSpan({ name: 'canary-4' }, (span) => {
    span?.setAttribute('paddle_customer_id', 'cus_01h3z4y5x6w7v8u9_FAKE');
    return Sentry.captureMessage('canary-4: span with denylist-key attribute');
  });

  // 5. captureMessage with breadcrumb URL containing fake token
  Sentry.addBreadcrumb({
    category: 'fetch',
    message: 'GET /api/dev/test',
    data: { url: '/api/dev/test?token=abc123session456token', method: 'GET' },
  });
  const id5 = Sentry.captureMessage('canary-5: event with breadcrumb URL token');

  console.log('[Canary] Event IDs (search these in Sentry UI):');
  console.log(`  canary-1 (email):                 ${id1}`);
  console.log(`  canary-2 (Anthropic key):         ${id2}`);
  console.log(`  canary-3 (JWT):                   ${id3}`);
  console.log(`  canary-4 (Paddle customer ID):    ${id4}`);
  console.log(`  canary-5 (breadcrumb URL token):  ${id5}`);
  console.log('');
  console.log('[Canary] Flushing transport buffer (max 10s)...');

  // Sentry's transport batches sends; explicit flush ensures the events
  // are dispatched to Sentry's backend before this process exits. A
  // fast-exiting script can lose events without this call.
  //
  // 10s timeout — first call from a cold Node process to a regional
  // Sentry edge (e.g. ingest.de.sentry.io) involves DNS + TLS handshake
  // before the events queue. 2s was too tight; the events would still
  // dispatch in the background but the script exited before confirmation,
  // producing a false "WARNING: flush timed out" line. 10s gives
  // comfortable margin for any region's cold-start latency.
  const flushed = await Sentry.flush(10000);
  if (!flushed) {
    console.error('[Canary] WARNING: flush timed out — events may not have reached Sentry');
    process.exit(1);
  }

  console.log('[Canary] Done. Verify each event in Sentry UI:');
  console.log('         https://sentry.io/organizations/tabempa-engineering/issues/');
  console.log('         Filter: environment:development');
}

main().catch((err: unknown) => {
  console.error('[Canary] Unexpected error:', err);
  process.exit(1);
});
