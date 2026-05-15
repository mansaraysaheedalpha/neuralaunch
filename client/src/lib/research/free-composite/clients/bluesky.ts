// src/lib/research/free-composite/clients/bluesky.ts
//
// Bluesky AppView search via the public XRPC endpoint. No auth —
// the AppView exposes a read-only search shape. Anchor source for
// the Pain Scout (high founder / dev density on the platform).
//
// Endpoint:   https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts
// Docs:       https://docs.bsky.app/docs/api/app-bsky-feed-search-posts
// Cache TTL:  10 min
//
// Query truncation: long queries (>200 chars) occasionally trip the
// cursor pagination — we truncate proactively rather than risk a
// 4xx that would mark the source down.

import 'server-only';
import { logger } from '@/lib/logger';
import { cachedFetch } from '../../cache';
import { buildMention } from '../normalize';
import type { Mention, SourceClient } from '../types';

const ENDPOINT       = 'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts';
const TIMEOUT_MS     = 8_000;
const QUERY_MAX_CHARS = 200;
const LIMIT          = 25;

interface BlueskyPost {
  uri:     string;
  cid:     string;
  author?: {
    did:    string;
    handle: string;
  };
  record?: {
    text:      string;
    createdAt: string;
  };
  likeCount?:  number;
  replyCount?: number;
  indexedAt?:  string;
}

interface BlueskySearchResponse {
  posts: BlueskyPost[];
}

async function liveSearch(query: string): Promise<Mention[]> {
  const truncated = query.slice(0, QUERY_MAX_CHARS);
  const url = new URL(ENDPOINT);
  url.searchParams.set('q',     truncated);
  url.searchParams.set('limit', String(LIMIT));

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal:  controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Bluesky AppView returned ${res.status}`);
    }
    const data = (await res.json()) as BlueskySearchResponse;
    return data.posts.map(postToMention).filter((m): m is Mention => m !== null);
  } finally {
    clearTimeout(timeout);
  }
}

function postToMention(p: BlueskyPost): Mention | null {
  const raw = p.record?.text?.trim();
  if (!raw) return null;

  // Convert the at://did:plc:.../app.bsky.feed.post/RKEY URI to a
  // viewable bsky.app/profile/HANDLE/post/RKEY URL. Falls back to
  // the raw URI when handle is missing.
  const rkey  = p.uri.split('/').pop() ?? '';
  const url   = p.author?.handle
    ? `https://bsky.app/profile/${p.author.handle}/post/${rkey}`
    : p.uri;

  const likes   = p.likeCount   ?? 0;
  const replies = p.replyCount  ?? 0;

  return buildMention({
    source:       'bluesky',
    url,
    authorHandle: p.author?.handle ?? null,
    rawExcerpt:   raw,
    postedAt:     p.record?.createdAt ?? p.indexedAt ?? new Date().toISOString(),
    score:        likes + replies,
  });
}

export const blueskyClient: SourceClient = {
  source:       'bluesky',
  cacheKey:     'community-pulse-bluesky',
  isConfigured: () => true,
  search: async (query, options = {}) => {
    const log = logger.child({ module: 'FreeComposite/Bluesky' });
    return cachedFetch<Mention[]>({
      provider:    'community-pulse-bluesky',
      queryKey:    query.toLowerCase().trim().replace(/\s+/g, ' '),
      bypassCache: options.bypassCache ?? false,
      fetch:       async () => {
        try {
          return await liveSearch(query);
        } catch (err) {
          log.warn('[FreeComposite] Bluesky search failed', {
            query,
            message: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },
    });
  },
};
