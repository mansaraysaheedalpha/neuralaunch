// src/lib/observability/scrub-patterns.ts
//
// Pure, isomorphic scrub primitives. NO `server-only` import — this
// module is unit-testable in isolation via Vitest. The server-side
// Sentry hooks live in `scrub.ts` and re-export everything below.
//
// See `scrub.test.ts` for the must-match / must-NOT-match contract.
// Every regex pattern below is documented with both columns; both
// must pass before this file is allowed to ship.

// ─── Regex patterns ────────────────────────────────────────────────────────

/**
 * Email — RFC-5322 simplified. Catches local+tag@domain.tld.
 * Must match: user@example.com, user+tag@example.com,
 *             user.name@sub.domain.co.uk
 * Must NOT:   user@ (incomplete), @example.com (missing local),
 *             user@example (missing TLD)
 */
const RX_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Key prefixes — underscore variant. Stripe, Sentry, Anthropic, Exa,
 * Paddle, Stripe restricted/webhook keys.
 * Must match: sk_live_abc123def456, sntr_AbCdEfGh1234567890,
 *             pdl_sdbx_xxxxxxxxxxxxxxxx, rk_test_abcdef1234567890,
 *             whsec_abcdef1234567890, pi_abcdef1234567890,
 *             ch_abcdef1234567890
 * Must NOT:   sk_, sk_short, userskname (no underscore)
 */
const RX_KEY_UNDERSCORE = /\b(sk|pk|exa|sntr|pdl|pdl_sdbx|rk|whsec|pi|ch)_[A-Za-z0-9_-]{8,}\b/g;

/**
 * Key prefixes — dash variant. Some providers use sk-live-... shape.
 * Must match: sk-live-abc123def456
 * Must NOT:   dash-something-else
 */
const RX_KEY_DASH = /\b(sk|pk|exa|sntr|pdl|rk)-[A-Za-z0-9_-]{8,}\b/g;

/**
 * Anthropic API keys — distinct shape (sk-ant-...).
 * Must match: sk-ant-api03-AbCdEf... (20+ chars after the third dash)
 * Must NOT:   sk-ant- (too short)
 */
const RX_ANTHROPIC_KEY = /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g;

/**
 * Inngest signing keys. NeuraLaunch has 22+ Inngest functions; if a
 * key ever leaked into a span attribute, this catches it.
 * Must match: signkey-prod-AbCdEf1234567890, signkey-test-...
 * Must NOT:   signkey-prod-short
 */
const RX_INNGEST_SIGNKEY = /\bsignkey-(prod|test)-[A-Za-z0-9_-]{16,}\b/g;

/**
 * JWT — three base64url-safe segments separated by dots.
 * Must match: eyJhbGciOi.eyJzdWIi.SflKxwRJ
 * Must NOT:   eyJ (incomplete), random base64 without three segments
 */
const RX_JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

/**
 * Long digit runs — 13-19 digits (credit-card / IBAN-like territory).
 * Deliberately starts at 13 to skip phone numbers (10-12 digits with
 * country code), US ZIP codes (5/9), and port numbers.
 * Must match: 4111111111111111 (16-digit CC), 123456789012345 (15)
 * Must NOT:   12345 (ZIP), 4155551234 (phone), 123-456-7890 (dashed phone)
 */
const RX_LONG_DIGITS = /\b\d{13,19}\b/g;

/**
 * SSN — US-specific shape (3-2-4).
 * Must match: 123-45-6789
 * Must NOT:   123-456-7890 (phone, 3-3-4 shape)
 */
const RX_SSN = /\b\d{3}-\d{2}-\d{4}\b/g;

/**
 * Paddle / Stripe entity IDs — cus_, sub_, ctm_, txn_, adj_, trn_,
 * pri_, pro_, ses_ followed by 16+ alphanumerics. Any billing-system
 * entity ID is PII because it links to a paying customer.
 * Must match: cus_01h3z4y5x6w7v8u9, sub_01h3z4y5x6w7v8u9
 * Must NOT:   cus_ (incomplete), customer_id (no entity-id-suffix)
 */
const RX_BILLING_ENTITY_ID = /\b(cus|sub|ctm|txn|adj|trn|pri|pro|ses)_[a-zA-Z0-9]{16,}\b/g;

const ALL_PATTERNS: ReadonlyArray<RegExp> = [
  RX_EMAIL,
  RX_KEY_UNDERSCORE,
  RX_KEY_DASH,
  RX_ANTHROPIC_KEY,
  RX_INNGEST_SIGNKEY,
  RX_JWT,
  RX_LONG_DIGITS,
  RX_SSN,
  RX_BILLING_ENTITY_ID,
];

/**
 * Field-name denylist (case-insensitive). When a span attribute KEY
 * matches one of these, the VALUE is replaced with [Filtered]
 * regardless of value content.
 *
 * Letter-boundary anchors `(?<![a-zA-Z])X(?![a-zA-Z])` are
 * LOAD-BEARING. Plain `\bX\b` doesn't work because `_` is a regex
 * word-char, so `\btoken\b` rejects `access_token` (`_` glued to
 * `t`). And bare `/token/i` over-matches `tokens.input` (a
 * NeuraLaunch attribute carrying the AI SDK's integer input-token
 * count, not a credential).
 *
 * The lookaround pattern correctly:
 *   - matches `token` alone, `access_token`, `id_token_v2`
 *   - rejects `tokens.input`, `tokens.output`, `mytoken` (letter on
 *     either side)
 *
 * The Vitest suite enforces both columns. Don't simplify these
 * patterns without re-verifying both must-match and must-NOT-match.
 */
const KEY_DENYLIST: ReadonlyArray<RegExp> = [
  /(?<![a-zA-Z])password(?![a-zA-Z])/i,
  /(?<![a-zA-Z])token(?![a-zA-Z])/i,
  /(?<![a-zA-Z])api_?key(?![a-zA-Z])/i,
  /(?<![a-zA-Z])secret(?![a-zA-Z])/i,
  /(?<![a-zA-Z])authorization(?![a-zA-Z])/i,
  /(?<![a-zA-Z])cookie(?![a-zA-Z])/i,
  /paddle.*id/i,
  /customer.*id/i,
  /credit.*card/i,
  /(?<![a-zA-Z])cvv(?![a-zA-Z])/i,
  /(?<![a-zA-Z])ssn(?![a-zA-Z])/i,
  /(?<![a-zA-Z])email(?![a-zA-Z])/i,
  /(?<![a-zA-Z])phone(?![a-zA-Z])/i,
];

export const FILTERED_PLACEHOLDER = '[Filtered]';

// ─── Pure scrub functions ──────────────────────────────────────────────────

/**
 * Replace every occurrence of any PII pattern in a string with
 * [Filtered]. Returns the input unchanged if no patterns match.
 */
export function scrubString(input: string): string {
  if (!input) return input;
  let out = input;
  for (const pattern of ALL_PATTERNS) {
    out = out.replace(pattern, FILTERED_PLACEHOLDER);
  }
  return out;
}

/**
 * Test whether an attribute key matches the denylist.
 */
export function isDeniedKey(key: string): boolean {
  return KEY_DENYLIST.some(rx => rx.test(key));
}

/**
 * Strip the query string from a URL but preserve the marker that one
 * existed. Per the breadcrumb-handling decision: dropping the query
 * entirely loses the diagnostic signal "this code path uses query
 * params"; preserving the marker without the content keeps the
 * structural information visible in Sentry's UI.
 */
export function stripQueryString(url: string): string {
  if (typeof url !== 'string') return url;
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return url;
  return `${url.slice(0, qIdx)}?${FILTERED_PLACEHOLDER}`;
}

// ─── Healthcheck URL detection ─────────────────────────────────────────────

const HEALTHCHECK_URL_PATTERNS: ReadonlyArray<RegExp> = [
  /\/api\/health(\?|$|\/)/,
  /\/api\/discovery\/tool-jobs\/active(\?|$|\/)/,
  /\/api\/discovery\/roadmaps\/[^/]+\/tool-jobs\/[^/]+\/status(\?|$|\/)/,
];

export function isHealthcheckUrl(url: string | undefined): boolean {
  if (!url) return false;
  return HEALTHCHECK_URL_PATTERNS.some(rx => rx.test(url));
}

// ─── Recursive scrub walker ────────────────────────────────────────────────

const MAX_WALK_DEPTH = 8;

export function walkAndScrub(value: unknown, depth: number): unknown {
  if (depth > MAX_WALK_DEPTH) return value;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map(v => walkAndScrub(v, depth + 1));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (isDeniedKey(k)) {
        out[k] = FILTERED_PLACEHOLDER;
      } else if (typeof v === 'string') {
        out[k] = scrubString(v);
      } else {
        out[k] = walkAndScrub(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

// ─── Test-only exports for Vitest ──────────────────────────────────────────
export const __forTesting__ = {
  RX_EMAIL,
  RX_KEY_UNDERSCORE,
  RX_KEY_DASH,
  RX_ANTHROPIC_KEY,
  RX_INNGEST_SIGNKEY,
  RX_JWT,
  RX_LONG_DIGITS,
  RX_SSN,
  RX_BILLING_ENTITY_ID,
  KEY_DENYLIST,
  HEALTHCHECK_URL_PATTERNS,
};
