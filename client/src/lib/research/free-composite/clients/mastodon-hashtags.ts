// src/lib/research/free-composite/clients/mastodon-hashtags.ts
//
// Mastodon HASHTAG TIMELINES only. The brief is explicit:
// mastodon.social's July-2025 ToS bars scrapers calling
// type=statuses. We MUST stay on hashtag timelines.
//
// Query → hashtag mapping: the "query" is split on whitespace and
// each word becomes a hashtag we fetch in parallel. Stop-words /
// non-alphanumeric tokens are filtered out. The orchestrator passes
// curated query strings; this client doesn't try to be clever about
// what makes a good hashtag — it just maps tokens 1:1.
//
// Endpoint:   https://mastodon.social/api/v1/timelines/tag/{hashtag}
// Docs:       https://docs.joinmastodon.org/methods/timelines/#tag
// Cache TTL:  10 min

import 'server-only';
import { logger } from '@/lib/logger';
import { cachedFetch } from '../../cache';
import { buildMention } from '../normalize';
import type { Mention, SourceClient } from '../types';

const INSTANCE       = 'https://mastodon.social';
const TIMEOUT_MS     = 8_000;
const LIMIT          = 20;
const MAX_HASHTAGS   = 4;          // bound per-query fan-out within this client
const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'is', 'are']);

interface MastodonStatus {
  id:           string;
  url:          string;
  uri:          string;
  content:      string;       // HTML
  created_at:   string;
  account?: {
    acct:       string;
    username:   string;
  };
  favourites_count?: number;
  reblogs_count?:    number;
  replies_count?:    number;
}

function queryToHashtags(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length >= 3 && !STOPWORDS.has(w))
    .slice(0, MAX_HASHTAGS);
}

async function liveSearch(query: string): Promise<Mention[]> {
  const hashtags = queryToHashtags(query);
  if (hashtags.length === 0) return [];

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const perTag = await Promise.allSettled(
      hashtags.map(async (tag) => {
        const url = new URL(`${INSTANCE}/api/v1/timelines/tag/${encodeURIComponent(tag)}`);
        url.searchParams.set('limit', String(LIMIT));
        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) throw new Error(`Mastodon timeline ${tag} returned ${res.status}`);
        return (await res.json()) as MastodonStatus[];
      }),
    );
    const out: Mention[] = [];
    for (const r of perTag) {
      if (r.status !== 'fulfilled') continue;
      for (const s of r.value) {
        const m = statusToMention(s);
        if (m) out.push(m);
      }
    }
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

function statusToMention(s: MastodonStatus): Mention | null {
  const raw = s.content.replace(/<[^>]*>/g, '').trim();
  if (!raw) return null;
  const engagement = (s.favourites_count ?? 0) + (s.reblogs_count ?? 0) + (s.replies_count ?? 0);
  return buildMention({
    source:       'mastodon',
    url:          s.url ?? s.uri,
    authorHandle: s.account?.acct ?? s.account?.username ?? null,
    rawExcerpt:   raw,
    postedAt:     s.created_at,
    score:        engagement || null,
  });
}

export const mastodonHashtagsClient: SourceClient = {
  source:       'mastodon',
  cacheKey:     'community-pulse-mastodon-hashtags',
  isConfigured: () => true,
  search: async (query, options = {}) => {
    const log = logger.child({ module: 'FreeComposite/MastodonHashtags' });
    return cachedFetch<Mention[]>({
      provider:    'community-pulse-mastodon-hashtags',
      queryKey:    query.toLowerCase().trim().replace(/\s+/g, ' '),
      bypassCache: options.bypassCache ?? false,
      fetch:       async () => {
        try {
          return await liveSearch(query);
        } catch (err) {
          log.warn('[FreeComposite] Mastodon hashtags search failed', {
            query,
            message: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },
    });
  },
};
