// src/lib/research/free-composite/clients/hn-firebase.ts
//
// HN Firebase real-time API. Doesn't support text search — used as
// the ENRICHMENT path. The orchestrator passes pre-known item IDs
// (from HN Algolia or from a founder-supplied URL); this client
// fetches the live item state.
//
// Endpoint:   https://hacker-news.firebaseio.com/v0/item/{id}.json
// Docs:       https://github.com/HackerNews/API
// Cache TTL:  10 min

import 'server-only';
import { logger } from '@/lib/logger';
import { cachedFetch } from '../../cache';
import { buildMention } from '../normalize';
import type { Mention, SourceClient } from '../types';

const ENDPOINT_BASE = 'https://hacker-news.firebaseio.com/v0/item';
const TIMEOUT_MS    = 8_000;

interface HnItem {
  id:     number;
  type?:  'story' | 'comment' | 'job' | 'poll' | 'pollopt';
  by?:    string;
  time?:  number;     // unix seconds
  text?:  string;     // HTML for comments + Ask HN
  title?: string;
  url?:   string;
  score?: number;
  dead?:  boolean;
  deleted?: boolean;
}

/**
 * For the Pulse use case, the "query" passed to this client is
 * actually a comma-separated list of HN item IDs (the orchestrator
 * extracts these from prior Algolia results or from a URL the
 * founder pasted). The signature stays `(query, options)` for
 * SourceClient conformance.
 */
async function liveSearch(query: string): Promise<Mention[]> {
  const ids = query.split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
  if (ids.length === 0) return [];

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const items = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`${ENDPOINT_BASE}/${id}.json`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HN Firebase item ${id} returned ${res.status}`);
        return (await res.json()) as HnItem | null;
      }),
    );
    return items
      .map(itemToMention)
      .filter((m): m is Mention => m !== null);
  } finally {
    clearTimeout(timeout);
  }
}

function itemToMention(item: HnItem | null): Mention | null {
  if (!item || item.deleted || item.dead) return null;
  const raw = (item.text ?? item.title ?? '').replace(/<[^>]*>/g, '').trim();
  if (!raw) return null;

  return buildMention({
    source:       'hn',
    url:          item.url ?? `https://news.ycombinator.com/item?id=${item.id}`,
    authorHandle: item.by ?? null,
    rawExcerpt:   raw,
    postedAt:     item.time ? new Date(item.time * 1000).toISOString() : new Date().toISOString(),
    score:        item.score ?? null,
  });
}

export const hnFirebaseClient: SourceClient = {
  source:       'hn',
  cacheKey:     'community-pulse-hn-firebase',
  isConfigured: () => true,
  search: async (query, options = {}) => {
    const log = logger.child({ module: 'FreeComposite/HnFirebase' });
    return cachedFetch<Mention[]>({
      provider:    'community-pulse-hn-firebase',
      queryKey:    query.toLowerCase().trim(),
      bypassCache: options.bypassCache ?? false,
      fetch:       async () => {
        try {
          return await liveSearch(query);
        } catch (err) {
          log.warn('[FreeComposite] HN Firebase search failed', {
            query,
            message: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },
    });
  },
};
