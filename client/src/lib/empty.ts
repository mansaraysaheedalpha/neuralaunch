// Empty module used as the browser-condition alias target for Node.js
// built-ins under Turbopack. Replaces the legacy
// `webpack.resolve.fallback = { fs: false, ... }` pattern, which Turbopack
// rejects (it does not accept `false` as a resolution target).
//
// See `turbopack.resolveAlias` in next.config.ts and
// docs/migrations/turbopack-migration-research-2026-05.md
// § "Native Module Client Fallbacks".
export default {};
