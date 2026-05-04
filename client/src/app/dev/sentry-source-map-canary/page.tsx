// src/app/dev/sentry-source-map-canary/page.tsx
//
// Phase 5 source-map verification surface. A hidden client component
// with a single "Throw test error" button. When clicked, the thrown
// error's stack trace lands in Sentry with file path + line + column
// pointing at THIS file. If Sentry's UI shows the un-minified path
// (e.g. `src/app/dev/sentry-source-map-canary/page.tsx:42:7`), source-map
// upload + Debug ID injection are working correctly. If it shows
// `static/chunks/<hash>.js:1:12345`, the upload pipeline is broken and
// stack traces in production will be unreadable.
//
// TWO-LAYER GATE — both conditions must fail-open before the page renders:
//   1. NEXT_PUBLIC_SENTRY_TEST_ENABLED must be `'true'` (intended toggle,
//      set on Vercel Preview only during verification windows).
//   2. NEXT_PUBLIC_VERCEL_ENV must NOT be `'production'` (defense-in-depth
//      against accidental production exposure if the env var leaks into
//      the production environment table).
//
// Both layers must agree. If either condition rejects, `notFound()` returns
// a 404 — the page is structurally invisible to anyone who hits the URL
// without explicit activation.
//
// Verification flow (post-deploy to Vercel Preview):
//   1. Set `NEXT_PUBLIC_SENTRY_TEST_ENABLED=true` on Vercel Preview env
//   2. Deploy preview build
//   3. Open <preview-url>/dev/sentry-source-map-canary in a browser
//   4. Click "Throw test error"
//   5. Filter Sentry by `environment:preview` and find the
//      "Sentry source-map canary" event
//   6. Pass: stack frame shows
//      `src/app/dev/sentry-source-map-canary/page.tsx:<N>:<M>`
//      Fail: stack frame shows `static/chunks/<hash>.js:1:<bignum>`
//   7. Unset `NEXT_PUBLIC_SENTRY_TEST_ENABLED` after verification

'use client';

import { notFound } from 'next/navigation';

const ERROR_MESSAGE = 'Sentry source-map canary — Phase 5 verification';

export default function SentrySourceMapCanaryPage(): React.ReactElement {
  // Two-layer gate evaluated at render time. Both client and server
  // renders apply this check. Client-side env vars are inlined at build
  // time on `NEXT_PUBLIC_` prefix.
  if (
    process.env.NEXT_PUBLIC_SENTRY_TEST_ENABLED !== 'true' ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
  ) {
    notFound();
  }

  return (
    <main style={{ padding: 32, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Sentry source-map canary</h1>
      <p style={{ marginBottom: 8 }}>
        Click the button below to throw a test error from this page&apos;s
        click handler. The error will be reported to Sentry; Sentry&apos;s
        UI should show the stack trace with file path
        <code> src/app/dev/sentry-source-map-canary/page.tsx</code>
        and a line number near the throw site.
      </p>
      <p style={{ marginBottom: 16 }}>
        If the stack trace shows minified output instead, source-map
        upload is not working. Check{' '}
        <code>docs/migrations/turbopack-migration-log.md § &quot;Phase 5&quot;</code>{' '}
        for the verification + rollback recipe.
      </p>
      <button
        type="button"
        onClick={() => {
          throw new Error(ERROR_MESSAGE);
        }}
        style={{
          padding: '10px 20px',
          fontSize: 16,
          background: '#dc2626',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        Throw test error
      </button>
    </main>
  );
}
