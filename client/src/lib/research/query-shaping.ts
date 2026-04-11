// src/lib/research/query-shaping.ts
//
// Pure helpers for shaping research queries before they hit Tavily.
// No I/O, no LLM calls — these are deterministic string transforms.

import { TAVILY_MAX_QUERY_CHARS } from './constants';

/**
 * Truncate a string to max chars, cutting at the last word boundary
 * so we never end on a half-word. The query field of a research log
 * entry uses this so the audit trail is human-readable.
 */
export function trunc(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max).replace(/\s+\S*$/, '').trim();
}

/**
 * Build a query string by joining parts and hard-capping it to stay
 * under Tavily's 400-char limit. This is the canonical query
 * constructor — every callsite that builds a Tavily query goes
 * through here so the truncation is consistent.
 */
export function q(...parts: string[]): string {
  return trunc(parts.join(''), TAVILY_MAX_QUERY_CHARS);
}

/**
 * Dynamic year hint — NEVER hardcode the year. When the server runs
 * after a year rollover, queries should ask for "current" info, not
 * stale info pinned to a past year. Returns "(year-1) (year)" so
 * Tavily prefers content from the current year while still surfacing
 * relevant late-prior-year results.
 */
export function yearHint(): string {
  const now  = new Date();
  const year = now.getUTCFullYear();
  return `${year - 1} ${year}`;
}

/**
 * Heuristic capitalised-name extractor. Used by the recommendation
 * query builder (and the trigger pre-filter) to detect competitor /
 * tool / product names that the founder mentioned. Catches the
 * common case of "I tried [ProperNoun]" or "I want to use
 * [ProperNoun]".
 *
 * Not a true NER pass — it's a regex with a stop-word set. Acceptable
 * because the worst-case false positive is one wasted research query
 * (which we still log and can audit later). The spec rejected
 * heavyweight NER for the same reason.
 *
 * The COMMON_WORDS set is intentionally English-only and intentionally
 * does NOT include city / country names (Lagos, Accra, Sierra Leone)
 * because those are sometimes the most useful disambiguation context
 * for a follow-up query.
 */
const COMMON_WORDS = new Set([
  'The', 'This', 'That', 'What', 'When', 'Where', 'How', 'Why', 'Who', 'If', 'But', 'And',
  'For', 'Not', 'All', 'Can', 'Her', 'Was', 'One', 'Our', 'Out', 'Day', 'Had', 'Has', 'His',
  'New', 'Now', 'Old', 'See', 'Way', 'May', 'Say', 'She', 'Two', 'Use', 'Boy', 'Did', 'Its',
  'Let', 'Put', 'Top', 'Too', 'Any', 'First', 'Also', 'After', 'Before', 'Because', 'During',
  'Between', 'Through', 'About', 'Could', 'Would', 'Should', 'Which', 'Their', 'These',
  'Those', 'Other', 'Some', 'Every',
]);

const NAME_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;

/**
 * Extract capitalised noun candidates from one or more source strings.
 * Filters by minimum length and the COMMON_WORDS stop list. Returns
 * a Set so the caller can dedupe across sources without extra work.
 */
export function extractCapitalisedNames(...sources: string[]): Set<string> {
  const detected = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    const pattern = new RegExp(NAME_PATTERN.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const name = match[1];
      if (name.length >= 3 && !COMMON_WORDS.has(name)) {
        detected.add(name);
      }
    }
  }
  return detected;
}
