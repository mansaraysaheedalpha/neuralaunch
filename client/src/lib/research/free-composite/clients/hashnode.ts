// src/lib/research/free-composite/clients/hashnode.ts
//
// Hashnode public GraphQL feed. No auth required for the search
// query we use; their docs note auth boosts rate limits but the
// unauth ceiling is comfortable for our volume.
//
// Endpoint:   https://gql.hashnode.com
// Docs:       https://apidocs.hashnode.com/
// Cache TTL:  10 min

import 'server-only';
import { logger } from '@/lib/logger';
import { cachedFetch } from '../../cache';
import { buildMention } from '../normalize';
import type { Mention, SourceClient } from '../types';

const ENDPOINT   = 'https://gql.hashnode.com';
const TIMEOUT_MS = 8_000;
const FIRST      = 20;

const SEARCH_QUERY = `
  query SearchPosts($query: String!, $first: Int!) {
    searchPostsOfPublication(
      first:  $first
      filter: { query: $query }
    ) {
      edges {
        node {
          id
          title
          brief
          url
          publishedAt
          author { username }
          reactionCount
          responseCount
        }
      }
    }
  }
`;

interface HashnodeEdge {
  node: {
    id:            string;
    title:         string;
    brief?:        string;
    url:           string;
    publishedAt:   string;
    author?:       { username: string };
    reactionCount?: number;
    responseCount?: number;
  };
}

interface HashnodeResponse {
  data?: {
    searchPostsOfPublication?: {
      edges: HashnodeEdge[];
    };
  };
}

async function liveSearch(query: string): Promise<Mention[]> {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method:  'POST',
      signal:  controller.signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body:    JSON.stringify({
        query: SEARCH_QUERY,
        variables: { query, first: FIRST },
      }),
    });
    if (!res.ok) throw new Error(`Hashnode GraphQL returned ${res.status}`);
    const data = (await res.json()) as HashnodeResponse;
    const edges = data.data?.searchPostsOfPublication?.edges ?? [];
    return edges.map(edgeToMention).filter((m): m is Mention => m !== null);
  } finally {
    clearTimeout(timeout);
  }
}

function edgeToMention(e: HashnodeEdge): Mention | null {
  const raw = (e.node.brief ?? e.node.title).trim();
  if (!raw) return null;
  return buildMention({
    source:       'hashnode',
    url:          e.node.url,
    authorHandle: e.node.author?.username ?? null,
    rawExcerpt:   raw,
    postedAt:     e.node.publishedAt,
    score:        (e.node.reactionCount ?? 0) + (e.node.responseCount ?? 0) || null,
  });
}

export const hashnodeClient: SourceClient = {
  source:       'hashnode',
  cacheKey:     'community-pulse-hashnode',
  isConfigured: () => true,
  search: async (query, options = {}) => {
    const log = logger.child({ module: 'FreeComposite/Hashnode' });
    return cachedFetch<Mention[]>({
      provider:    'community-pulse-hashnode',
      queryKey:    query.toLowerCase().trim().replace(/\s+/g, ' '),
      bypassCache: options.bypassCache ?? false,
      fetch:       async () => {
        try {
          return await liveSearch(query);
        } catch (err) {
          log.warn('[FreeComposite] Hashnode search failed', {
            query,
            message: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },
    });
  },
};
