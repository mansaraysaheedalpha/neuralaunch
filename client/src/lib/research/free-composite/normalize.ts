// src/lib/research/free-composite/normalize.ts
//
// Vendor → unified Mention. Each client returns a Mention[] already
// (each client owns its own vendor-shape mapping), but this module
// provides the SHARED utilities every client needs: URL canonical-
// isation, excerpt clamp, content-hash computation, and the cross-
// source dedupe that runs in the orchestrator after fan-out.
//
// PII contract enforcement: `clampExcerpt` is the ONE place excerpt
// truncation happens. Every client must route its raw post body
// through it. The 280-char cap is load-bearing — see
// free-composite/README.md § "PII handling".

import 'server-only';
import { createHash } from 'crypto';
import type { Mention, MentionSource } from './types';

/** Hard cap on excerpt length. See README § PII handling. */
export const EXCERPT_MAX_CHARS = 280;

/**
 * Tracking parameters to strip from canonicalised URLs. Adding new
 * parameters here is cheap; never adds a false-positive dedupe.
 */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'ref',
  'ref_src',
  'ref_url',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
]);

/**
 * Canonicalise a URL for dedupe purposes:
 *   - Lowercase the host
 *   - Strip tracking query params
 *   - Sort remaining query params (so ?a=1&b=2 == ?b=2&a=1)
 *   - Remove the fragment
 *   - Strip trailing slash from path (except root)
 *
 * Returns the original string when the URL is unparseable rather
 * than throwing — a malformed URL still dedupes against itself by
 * literal equality, which is fine for our purposes.
 */
export function canonicaliseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.toLowerCase();
    u.hash = '';

    const keep: [string, string][] = [];
    for (const [k, v] of u.searchParams.entries()) {
      if (!TRACKING_PARAMS.has(k.toLowerCase())) keep.push([k, v]);
    }
    keep.sort(([a], [b]) => a.localeCompare(b));
    u.search = '';
    for (const [k, v] of keep) u.searchParams.append(k, v);

    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }

    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * Strip surrounding whitespace, collapse runs of whitespace, then
 * hard-truncate at EXCERPT_MAX_CHARS. The orchestrator's PII contract
 * lives here — if you're tempted to bump the cap, read README first.
 */
export function clampExcerpt(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= EXCERPT_MAX_CHARS) return cleaned;
  return cleaned.slice(0, EXCERPT_MAX_CHARS).trimEnd();
}

/**
 * sha256 of the (already-clamped) excerpt. Used as the dedupe key in
 * `dedupeByContentHash`. Different excerpts → different hashes;
 * identical excerpts (Bluesky cross-post of an HN comment, e.g.) →
 * same hash → one row in the merged output.
 */
export function computeContentHash(clampedExcerpt: string): string {
  return createHash('sha256').update(clampedExcerpt.toLowerCase()).digest('hex');
}

/**
 * Build a normalised Mention from raw vendor fields. Every client
 * routes through this so the contract — excerpt clamped, URL
 * canonicalised, content hash computed — applies uniformly.
 */
export function buildMention(args: {
  source:       MentionSource;
  url:          string;
  authorHandle: string | null;
  rawExcerpt:   string;
  postedAt:     string;
  score:        number | null;
}): Mention {
  const excerpt     = clampExcerpt(args.rawExcerpt);
  const contentHash = computeContentHash(excerpt);
  return {
    source:       args.source,
    url:          canonicaliseUrl(args.url),
    authorHandle: args.authorHandle,
    excerpt,
    postedAt:     args.postedAt,
    score:        args.score,
    contentHash,
  };
}

/**
 * Cross-source dedupe by content hash. First occurrence wins for the
 * Mention itself; subsequent occurrences contribute a "also seen on
 * X" attribution that we DON'T currently surface (could be added
 * later as `alsoSeenOn: MentionSource[]` if the founder wants it).
 *
 * Stable: preserves the input order of first-seen mentions, which
 * the orchestrator then hands to relevance.ts for re-ranking.
 */
export function dedupeByContentHash(mentions: ReadonlyArray<Mention>): Mention[] {
  const seen = new Set<string>();
  const out: Mention[] = [];
  for (const m of mentions) {
    if (seen.has(m.contentHash)) continue;
    seen.add(m.contentHash);
    out.push(m);
  }
  return out;
}
