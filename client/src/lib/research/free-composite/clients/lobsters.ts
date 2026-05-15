// src/lib/research/free-composite/clients/lobsters.ts
//
// Lobste.rs search via RSS. Politeness budget is ~1 req/s — easily
// satisfied at our volume since one scout-run hits this endpoint
// at most once.
//
// Endpoint:   https://lobste.rs/search.rss?q=...
// Docs:       no official docs; RSS is the well-known interface
// Cache TTL:  10 min

import 'server-only';
import { logger } from '@/lib/logger';
import { cachedFetch } from '../../cache';
import { buildMention } from '../normalize';
import type { Mention, SourceClient } from '../types';

const ENDPOINT   = 'https://lobste.rs/search.rss';
const TIMEOUT_MS = 8_000;

interface ParsedItem {
  title:    string;
  link:     string;
  pubDate:  string;
  description: string;
  author?:  string;
}

/**
 * Minimal RSS parser tuned for Lobste.rs's well-formed feed. We
 * parse the <item> blocks with regex rather than pulling in a full
 * XML parser dependency — the feed shape has been stable for years
 * and any breakage would be a hard error we'd notice immediately.
 *
 * If Lobste.rs ever ships malformed XML or switches schemas, the
 * fail-open path in the orchestrator catches it and we patch here.
 */
function parseRss(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const block of itemBlocks) {
    const title       = extractTag(block, 'title');
    const link        = extractTag(block, 'link');
    const pubDate     = extractTag(block, 'pubDate');
    const description = extractTag(block, 'description');
    const author      = extractTag(block, 'author') || extractTag(block, 'dc:creator');
    if (title && link) {
      items.push({
        title,
        link,
        pubDate:     pubDate     || new Date().toUTCString(),
        description: description || '',
        author:      author      || undefined,
      });
    }
  }
  return items;
}

function extractTag(block: string, tag: string): string {
  // Allow either CDATA or plain text content. The tag may appear with
  // a namespace prefix (e.g. dc:creator) which we accept as the
  // literal string in the regex.
  const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re  = new RegExp(`<${esc}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${esc}>`, 'i');
  const m   = block.match(re);
  return m ? m[1].trim() : '';
}

async function liveSearch(query: string): Promise<Mention[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('q',     query);
  url.searchParams.set('what',  'stories');
  url.searchParams.set('order', 'relevance');

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal:  controller.signal,
      headers: { 'Accept': 'application/rss+xml,application/xml' },
    });
    if (!res.ok) throw new Error(`Lobste.rs RSS returned ${res.status}`);
    const xml = await res.text();
    const items = parseRss(xml);
    return items.map(itemToMention).filter((m): m is Mention => m !== null);
  } finally {
    clearTimeout(timeout);
  }
}

function itemToMention(i: ParsedItem): Mention | null {
  const raw = (i.description.replace(/<[^>]*>/g, '').trim() || i.title).trim();
  if (!raw) return null;
  return buildMention({
    source:       'lobsters',
    url:          i.link,
    authorHandle: i.author ?? null,
    rawExcerpt:   raw,
    postedAt:     new Date(i.pubDate).toISOString(),
    score:        null,
  });
}

export const lobstersClient: SourceClient = {
  source:       'lobsters',
  cacheKey:     'community-pulse-lobsters',
  isConfigured: () => true,
  search: async (query, options = {}) => {
    const log = logger.child({ module: 'FreeComposite/Lobsters' });
    return cachedFetch<Mention[]>({
      provider:    'community-pulse-lobsters',
      queryKey:    query.toLowerCase().trim().replace(/\s+/g, ' '),
      bypassCache: options.bypassCache ?? false,
      fetch:       async () => {
        try {
          return await liveSearch(query);
        } catch (err) {
          log.warn('[FreeComposite] Lobste.rs search failed', {
            query,
            message: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },
    });
  },
};
