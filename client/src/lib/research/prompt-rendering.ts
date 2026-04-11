// src/lib/research/prompt-rendering.ts
//
// Pure helpers for rendering research findings into a prompt-ready
// block. The block is wrapped in [[[ ]]] delimiters by the
// renderUserContent helper so any LLM that consumes it treats the
// content as opaque DATA, not instructions. This is the prompt-
// injection defence boundary for everything Tavily returns.

import 'server-only';
import { renderUserContent, sanitizeForPrompt } from '@/lib/validation/server-helpers';
import {
  MAX_SOURCES_PER_QUERY,
  MAX_SOURCE_CONTENT_CHARS,
  MAX_ANSWER_CHARS,
  SOURCES_PER_HIT_TITLE_CHARS,
  MAX_FINDINGS_CHARS,
} from './constants';
import type { TavilyHit } from './tavily-client';
import type { ResearchSource } from './types';

/**
 * One rendered query block — the per-query section of the final
 * findings string. Includes the query itself (sanitised), the
 * synthesised answer (delimiter-wrapped), and the top sources.
 */
export function renderQueryBlock(input: {
  query:      string;
  answer:     string | undefined;
  freshHits:  TavilyHit[];
}): string {
  const { query, answer, freshHits } = input;

  const topSources = freshHits
    .map(h => {
      const title   = sanitizeForPrompt(h.title ?? '', SOURCES_PER_HIT_TITLE_CHARS);
      const content = sanitizeForPrompt(h.content ?? '', MAX_SOURCE_CONTENT_CHARS);
      return `- ${title}: ${content}`;
    })
    .join('\n');

  const safeQuery   = sanitizeForPrompt(query, 400);
  const safeAnswer  = renderUserContent(answer ?? 'No summary', MAX_ANSWER_CHARS);

  return `QUERY: ${safeQuery}\nSUMMARY: ${safeAnswer}\nSOURCES:\n${topSources || '(no fresh sources after dedupe)'}`;
}

/**
 * Pure dedup over the hit set, scoped to one cross-query call. Tavily
 * sometimes returns the same article in multiple queries; we keep
 * each URL once. Falls back to title when URL is missing.
 *
 * Mutates `seenUrls` in place so a single Set can be threaded across
 * an entire batch of queries inside one runResearchQueries call.
 */
export function dedupHits(hits: TavilyHit[], seenUrls: Set<string>): TavilyHit[] {
  const fresh: TavilyHit[] = [];
  for (const h of hits) {
    const key = (h.url ?? h.title ?? '').trim();
    if (!key) continue;
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    fresh.push(h);
    if (fresh.length >= MAX_SOURCES_PER_QUERY) break;
  }
  return fresh;
}

/**
 * Map a TavilyHit into the canonical ResearchSource shape we persist
 * to JSONB. Stripped of nullable fields so the row schema is stable.
 */
export function toResearchSource(hit: TavilyHit): ResearchSource {
  return {
    title:   hit.title   ?? '',
    url:     hit.url     ?? '',
    snippet: hit.content ?? '',
  };
}

/**
 * Join an array of rendered query blocks into the final findings
 * string and apply the global hard cap. Hard truncation is preferred
 * over progressive shortening because it keeps the per-query blocks
 * structurally complete (the prompt parses them by section).
 */
export function joinAndCapFindings(sections: string[]): string {
  const joined = sections.join('\n\n---\n\n');
  if (joined.length <= MAX_FINDINGS_CHARS) return joined;
  return joined.slice(0, MAX_FINDINGS_CHARS) + '\n\n[truncated]';
}
