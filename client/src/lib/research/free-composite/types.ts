// src/lib/research/free-composite/types.ts
//
// Shared shape across every community-pulse source client. The
// orchestrator in index.ts fans out to all nine clients, each returns
// a Mention[], normalize.ts dedupes by content hash, relevance.ts
// re-ranks, and the agent sees the unified Mention shape — never
// vendor-specific JSON.
//
// Pure types + structural client interface — no runtime imports
// from this file so it stays cheap to import in tests.

import 'server-only';
import type { CacheProvider } from '../cache';

/**
 * Which platform the mention came from. Pinned as a tuple so the
 * orchestrator can iterate and the Mention.source field stays a
 * narrow union.
 */
export const MENTION_SOURCES = [
  'hn',
  'bluesky',
  'lemmy',
  'mastodon',
  'github',
  'devto',
  'hashnode',
  'lobsters',
] as const;
export type MentionSource = typeof MENTION_SOURCES[number];

/**
 * The unified shape every client normalises to. Carries enough
 * context for the agent to decide whether a mention is a real pain
 * signal (excerpt, score) and enough for the founder to click
 * through (url, authorHandle).
 *
 * PII contract: excerpt is hard-capped to 280 chars at normalize
 * time. Full post bodies NEVER persist on our side — the founder
 * clicks through to the source for full context. This is load-
 * bearing; see free-composite/README.md § "PII handling".
 */
export interface Mention {
  /** Which client surfaced this. Drives source-attribution in the UI. */
  source:        MentionSource;
  /** Canonicalised URL (utm_* stripped, trailing slash normalised, fragment removed). */
  url:           string;
  /** Author handle when the platform exposes one; null when anonymous (HN). */
  authorHandle:  string | null;
  /**
   * Short excerpt. ≤280 chars, server-side clamped in normalize.ts.
   * The agent reads this; the founder reads the source.
   */
  excerpt:       string;
  /** ISO timestamp of the original post. */
  postedAt:      string;
  /** Upvotes / engagement count, when the platform exposes one. */
  score:         number | null;
  /**
   * sha256(normalised excerpt). The dedupe key — two clients
   * surfacing the same content (e.g. a Bluesky cross-post of an HN
   * thread) collapse to one row.
   */
  contentHash:   string;
}

/**
 * Structural shape every source client implements. The orchestrator
 * doesn't care HOW Bluesky talks to its AppView or HOW Hashnode does
 * GraphQL — it just needs `search(query) → Mention[]`. Each client
 * owns its own cache wrapping, retry, timeout, and rate-limit
 * politeness.
 */
export interface SourceClient {
  /** Display label for logs + the fan-out result map. */
  source:      MentionSource;
  /** The cache provider literal this client passes to cachedFetch. */
  cacheKey:    CacheProvider;
  /**
   * Returns true when the client can run in the current environment
   * (PAT present, env var set, etc.). When false, the orchestrator
   * skips the client entirely — never opens a half-configured
   * request that would fail at HTTP time.
   */
  isConfigured: () => boolean;
  /**
   * Returns a normalised Mention[] for the query. Throws on fatal
   * vendor errors; the orchestrator catches per-client so one source
   * failure doesn't collapse the fan-out.
   */
  search:      (query: string, options?: { bypassCache?: boolean }) => Promise<Mention[]>;
}

/**
 * The per-client outcome from the fan-out, recorded for the
 * researchLog entry. Successful clients carry their result count;
 * failed clients carry the error message so the audit log shows
 * exactly which source went down.
 */
export type FanOutClientResult =
  | { source: MentionSource; status: 'ok';     count: number }
  | { source: MentionSource; status: 'skipped'; reason: string }
  | { source: MentionSource; status: 'error';   message: string };

/**
 * Final shape returned by the orchestrator's `searchAll`. The
 * `community_pulse` tool's execute function consumes this and
 * renders the per-mention summary string the agent reads.
 */
export interface FanOutResult {
  mentions:        Mention[];
  perClientStatus: FanOutClientResult[];
}
