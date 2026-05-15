// src/lib/research/free-composite/clients/lemmy.ts
//
// Lemmy search — restricted to programming.dev. The brief is
// explicit about NOT touching lemmy.world / lemmy.ml: those are
// general-population Lemmys with mixed content quality and
// moderation patterns that aren't aligned with what Pain Scout
// is looking for. programming.dev is dev-niche and the signal is
// higher.
//
// Endpoint:   https://programming.dev/api/v3/search
// Docs:       https://join-lemmy.org/api/
// Cache TTL:  10 min

import 'server-only';
import { logger } from '@/lib/logger';
import { cachedFetch } from '../../cache';
import { buildMention } from '../normalize';
import type { Mention, SourceClient } from '../types';

const INSTANCE      = 'https://programming.dev';
const ENDPOINT      = `${INSTANCE}/api/v3/search`;
const TIMEOUT_MS    = 8_000;
const LIMIT         = 20;

interface LemmyPost {
  post: {
    id:      number;
    name:    string;
    body?:   string;
    url?:    string;
    ap_id:   string;
    published: string;
  };
  creator: {
    name:   string;
  };
  counts: {
    score?:    number;
    upvotes?:  number;
  };
}

interface LemmyComment {
  comment: {
    id:        number;
    content:   string;
    ap_id:     string;
    published: string;
  };
  creator: { name: string };
  post:    { id: number };
  counts: { score?: number };
}

interface LemmySearchResponse {
  posts?:    LemmyPost[];
  comments?: LemmyComment[];
}

async function liveSearch(query: string): Promise<Mention[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('q',           query);
  url.searchParams.set('type_',       'All');
  url.searchParams.set('sort',        'TopWeek');
  url.searchParams.set('listing_type', 'All');
  url.searchParams.set('limit',       String(LIMIT));

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new Error(`Lemmy programming.dev returned ${res.status}`);
    const data = (await res.json()) as LemmySearchResponse;

    const out: Mention[] = [];
    for (const p of data.posts ?? []) {
      const m = postToMention(p);
      if (m) out.push(m);
    }
    for (const c of data.comments ?? []) {
      const m = commentToMention(c);
      if (m) out.push(m);
    }
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

function postToMention(p: LemmyPost): Mention | null {
  const raw = (p.post.body ?? p.post.name).trim();
  if (!raw) return null;
  return buildMention({
    source:       'lemmy',
    url:          p.post.url ?? p.post.ap_id,
    authorHandle: p.creator.name,
    rawExcerpt:   raw,
    postedAt:     p.post.published,
    score:        p.counts.score ?? p.counts.upvotes ?? null,
  });
}

function commentToMention(c: LemmyComment): Mention | null {
  const raw = c.comment.content.trim();
  if (!raw) return null;
  return buildMention({
    source:       'lemmy',
    url:          c.comment.ap_id,
    authorHandle: c.creator.name,
    rawExcerpt:   raw,
    postedAt:     c.comment.published,
    score:        c.counts.score ?? null,
  });
}

export const lemmyClient: SourceClient = {
  source:       'lemmy',
  cacheKey:     'community-pulse-lemmy',
  isConfigured: () => true,
  search: async (query, options = {}) => {
    const log = logger.child({ module: 'FreeComposite/Lemmy' });
    return cachedFetch<Mention[]>({
      provider:    'community-pulse-lemmy',
      queryKey:    query.toLowerCase().trim().replace(/\s+/g, ' '),
      bypassCache: options.bypassCache ?? false,
      fetch:       async () => {
        try {
          return await liveSearch(query);
        } catch (err) {
          log.warn('[FreeComposite] Lemmy search failed', {
            query,
            message: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },
    });
  },
};
