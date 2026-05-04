// src/lib/observability/scrub-browser.ts
//
// Browser entry point for Sentry's `beforeSend` hook. Thin re-export of
// the production hook implementation in `scrub.ts` — same logic, same
// scrub coverage. Exists as a separate module because
// `instrumentation-client.ts` (the browser Sentry init) is bundled into
// the client bundle and historically had to import from a non-server-
// only module. Today `scrub.ts` has no `server-only` import, so this
// re-export is API-stability only — it lets future code distinguish
// "I need the browser hook" from "I need the server hook" without
// losing the shared implementation.
//
// Browser doesn't get `beforeSendTransaction`: client-side transactions
// are pageload + navigation only, and their span data is structurally
// URL-free (Sentry's BrowserTracing integration captures route names,
// not query strings, for transactions; query strings come through
// breadcrumbs which the `beforeSend` hook scrubs).

export { beforeSend } from './scrub';
