// src/lib/research/free-composite/clients/hn-algolia.ts
//
// HN Algolia full-text search across Hacker News stories AND comments.
// No auth required. Free for reasonable volume (the back-of-envelope
// limit is ~10k requests/hour — we're nowhere near that).
//
// Endpoint:   https://hn.algolia.com/api/v1/search
// Docs:       https://hn.algolia.com/api
// Cache TTL:  10 min (community signals move fast)

import 'server-only';
import { logger } from '@/lib/logger';
import { cachedFetch } from '../../cache';
import { buildMention } from '../normalize';
import type { Mention, SourceClient } from '../types';

const ENDPOINT       = 'https://hn.algolia.com/api/v1/search';
const TIMEOUT_MS     = 8_000;
const HITS_PER_PAGE  = 20;

interface HnHit {
  objectID:     string;
  title?:       string;
  story_title?: string;
  story_text?:  string;
  comment_text?: string;
  url?:         string;
  author?:      string;
  points?:      number | null;
  created_at:   string;
  story_id?:    number;
}

interface HnAlgoliaResponse {
  hits: HnHit[];
}

async function liveSearch(query: string): Promise<Mention[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('query', query);
  url.searchParams.set('tags',  'story,comment');
  url.searchParams.set('hitsPerPage', String(HITS_PER_PAGE));

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HN Algolia returned ${res.status}`);
    }
    const data = (await res.json()) as HnAlgoliaResponse;
    return data.hits.map(hitToMention).filter((m): m is Mention => m !== null);
  } finally {
    clearTimeout(timeout);
  }
}

function hitToMention(h: HnHit): Mention | null {
  // story_text + comment_text are mutually exclusive in Algolia's
  // schema; title is set for story records only. Pick whichever the
  // record exposes.
  const raw =
    (h.comment_text ?? '').trim()
    || (h.story_text ?? '').trim()
    || (h.title ?? h.story_title ?? '').trim();
  if (!raw) return null;

  const url = h.url
    ?? (h.story_id ? `https://news.ycombinator.com/item?id=${h.story_id}` : `https://news.ycombinator.com/item?id=${h.objectID}`);

  return buildMention({
    source:       'hn',
    url,
    authorHandle: h.author ?? null,
    rawExcerpt:   raw,
    postedAt:     h.created_at,
    score:        h.points ?? null,
  });
}

export const hnAlgoliaClient: SourceClient = {
  source:       'hn',
  cacheKey:     'community-pulse-hn-algolia',
  isConfigured: () => true,
  search: async (query, options = {}) => {
    const log = logger.child({ module: 'FreeComposite/HnAlgolia' });
    return cachedFetch<Mention[]>({
      provider:    'community-pulse-hn-algolia',
      queryKey:    query.toLowerCase().trim().replace(/\s+/g, ' '),
      bypassCache: options.bypassCache ?? false,
      fetch:       async () => {
        try {
          return await liveSearch(query);
        } catch (err) {
          log.warn('[FreeComposite] HN Algolia search failed', {
            query,
            message: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },
    });
  },
};
