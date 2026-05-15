// src/lib/research/free-composite/clients/github-issues.ts
//
// GitHub Issues + Discussions search — the "people complaining
// about a tool" source. Requires a PAT (env.GITHUB_PAT) with
// public_repo scope for the higher rate limit (5000/hour vs 60/hour
// unauthenticated).
//
// Endpoint:   https://api.github.com/search/issues
// Docs:       https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests
// Cache TTL:  10 min

import 'server-only';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { cachedFetch } from '../../cache';
import { buildMention } from '../normalize';
import type { Mention, SourceClient } from '../types';

const ENDPOINT    = 'https://api.github.com/search/issues';
const TIMEOUT_MS  = 8_000;
const PER_PAGE    = 20;

interface GhIssueItem {
  url:       string;
  html_url:  string;
  number:    number;
  title:     string;
  body?:     string | null;
  user?:     { login: string };
  created_at: string;
  reactions?: {
    total_count: number;
    '+1'?:        number;
  };
  comments?: number;
}

interface GhSearchResponse {
  items: GhIssueItem[];
}

function isConfigured(): boolean {
  return Boolean(env.GITHUB_PAT);
}

async function liveSearch(query: string): Promise<Mention[]> {
  if (!isConfigured()) {
    throw new Error('GITHUB_PAT missing — GitHub Issues client cannot run');
  }

  // GitHub search syntax — we restrict to issues + filter to ones
  // with negative-sentiment phrasing in the search. The agent
  // provides the query verbatim; we just append `is:issue` so we
  // don't pick up pull requests.
  const q = `${query} is:issue`;

  const url = new URL(ENDPOINT);
  url.searchParams.set('q',        q);
  url.searchParams.set('per_page', String(PER_PAGE));
  url.searchParams.set('sort',     'reactions');
  url.searchParams.set('order',    'desc');

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal:  controller.signal,
      headers: {
        'Accept':        'application/vnd.github+json',
        'Authorization': `Bearer ${env.GITHUB_PAT}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) throw new Error(`GitHub search returned ${res.status}`);
    const data = (await res.json()) as GhSearchResponse;
    return data.items.map(itemToMention).filter((m): m is Mention => m !== null);
  } finally {
    clearTimeout(timeout);
  }
}

function itemToMention(item: GhIssueItem): Mention | null {
  const raw = (item.body ?? item.title).trim();
  if (!raw) return null;
  const reactions = item.reactions?.total_count ?? 0;
  const comments  = item.comments              ?? 0;
  return buildMention({
    source:       'github',
    url:          item.html_url,
    authorHandle: item.user?.login ?? null,
    rawExcerpt:   raw,
    postedAt:     item.created_at,
    score:        reactions + comments || null,
  });
}

export const githubIssuesClient: SourceClient = {
  source:       'github',
  cacheKey:     'community-pulse-github-issues',
  isConfigured,
  search: async (query, options = {}) => {
    const log = logger.child({ module: 'FreeComposite/GitHubIssues' });
    return cachedFetch<Mention[]>({
      provider:    'community-pulse-github-issues',
      queryKey:    query.toLowerCase().trim().replace(/\s+/g, ' '),
      bypassCache: options.bypassCache ?? false,
      fetch:       async () => {
        try {
          return await liveSearch(query);
        } catch (err) {
          log.warn('[FreeComposite] GitHub Issues search failed', {
            query,
            message: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },
    });
  },
};
