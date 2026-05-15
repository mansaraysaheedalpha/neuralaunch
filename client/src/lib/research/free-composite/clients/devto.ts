// src/lib/research/free-composite/clients/devto.ts
//
// Dev.to articles API. No auth required for read access; an optional
// API key (env.DEVTO_API_KEY) lifts rate limits.
//
// Endpoint:   https://dev.to/api/articles
// Docs:       https://developers.forem.com/api
// Cache TTL:  10 min
//
// Search shape: Dev.to's search is tag-based. The "query" is mapped
// onto the `tag` parameter (we tokenise + try the most distinctive
// token). For richer text search we'd need Dev.to's GraphQL, which
// is unstable per their own docs.

import 'server-only';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { cachedFetch } from '../../cache';
import { buildMention } from '../normalize';
import type { Mention, SourceClient } from '../types';

const ENDPOINT    = 'https://dev.to/api/articles';
const TIMEOUT_MS  = 8_000;
const PER_PAGE    = 20;

interface DevToArticle {
  id:            number;
  title:         string;
  description?:  string;
  body_markdown?: string;
  url:           string;
  user:          { username: string };
  positive_reactions_count?: number;
  comments_count?: number;
  published_at:  string;
}

function queryToTag(q: string): string | null {
  const tokens = q.toLowerCase().split(/\s+/).map(t => t.replace(/[^a-z0-9]/g, ''));
  // Pick the longest single token as the tag — heuristic for "most
  // distinctive". Dev.to tags are lowercased single words.
  const picked = tokens.filter(t => t.length >= 4).sort((a, b) => b.length - a.length)[0];
  return picked ?? null;
}

async function liveSearch(query: string): Promise<Mention[]> {
  const tag = queryToTag(query);
  if (!tag) return [];

  const url = new URL(ENDPOINT);
  url.searchParams.set('tag',      tag);
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('top',      '7');         // top of last 7 days

  const headers: Record<string, string> = { 'Accept': 'application/vnd.forem.api-v1+json' };
  if (env.DEVTO_API_KEY) headers['api-key'] = env.DEVTO_API_KEY;

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal, headers });
    if (!res.ok) throw new Error(`Dev.to returned ${res.status}`);
    const data = (await res.json()) as DevToArticle[];
    return data.map(articleToMention).filter((m): m is Mention => m !== null);
  } finally {
    clearTimeout(timeout);
  }
}

function articleToMention(a: DevToArticle): Mention | null {
  const raw = (a.description ?? a.body_markdown ?? a.title).trim();
  if (!raw) return null;
  return buildMention({
    source:       'devto',
    url:          a.url,
    authorHandle: a.user.username,
    rawExcerpt:   raw,
    postedAt:     a.published_at,
    score:        (a.positive_reactions_count ?? 0) + (a.comments_count ?? 0) || null,
  });
}

export const devtoClient: SourceClient = {
  source:       'devto',
  cacheKey:     'community-pulse-devto',
  isConfigured: () => true,
  search: async (query, options = {}) => {
    const log = logger.child({ module: 'FreeComposite/DevTo' });
    return cachedFetch<Mention[]>({
      provider:    'community-pulse-devto',
      queryKey:    query.toLowerCase().trim().replace(/\s+/g, ' '),
      bypassCache: options.bypassCache ?? false,
      fetch:       async () => {
        try {
          return await liveSearch(query);
        } catch (err) {
          log.warn('[FreeComposite] Dev.to search failed', {
            query,
            message: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },
    });
  },
};
