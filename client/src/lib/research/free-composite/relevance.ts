// src/lib/research/free-composite/relevance.ts
//
// Re-rank the deduped Mention[] by relevance to the original query.
// Cheap keyword + length-normalised tf-idf-ish score combined with
// the platform engagement signal (score field). NO LLM in this
// path — relevance.ts must stay fast and free. Semantic re-ranking
// via Exa embeddings is exposed as a SEPARATE opt-in function the
// orchestrator can call when the agent specifically asks for it.

import 'server-only';
import type { Mention } from './types';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'for',
  'on', 'with', 'is', 'are', 'be', 'was', 'were', 'this', 'that',
  'it', 'as', 'at', 'by', 'from', 'up', 'about', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'i',
  'me', 'my', 'we', 'our', 'you', 'your', 'they', 'them', 'their',
]);

function tokenise(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Keyword-overlap score: fraction of query tokens that appear in the
 * mention's excerpt. Length-normalised so a 280-char excerpt that
 * contains every query token doesn't artificially outrank a 50-char
 * pithy comment that nails the topic.
 */
function keywordScore(queryTokens: ReadonlyArray<string>, excerpt: string): number {
  if (queryTokens.length === 0) return 0;
  const excerptTokens = new Set(tokenise(excerpt));
  let hits = 0;
  for (const t of queryTokens) {
    if (excerptTokens.has(t)) hits++;
  }
  return hits / queryTokens.length;
}

/**
 * Log-normalised engagement score so a viral HN comment doesn't
 * crowd out a precise but lightly-upvoted Bluesky post. Score in
 * [0, 1] approximately; saturates around 1 for very-high-engagement
 * mentions.
 */
function engagementScore(rawScore: number | null): number {
  if (rawScore === null || rawScore <= 0) return 0;
  // log10(1 + score) / 4 caps at roughly 1.0 for scores around 10k.
  return Math.min(Math.log10(1 + rawScore) / 4, 1);
}

/**
 * Combined relevance score. Keyword weight 0.7 (the topic match
 * matters more than the engagement), engagement weight 0.3.
 */
export function combinedRelevance(query: string, m: Mention): number {
  const qTokens = tokenise(query);
  return 0.7 * keywordScore(qTokens, m.excerpt) + 0.3 * engagementScore(m.score);
}

/**
 * Sort the deduped mentions by combinedRelevance, descending. Stable
 * sort preserves the original (fan-out) order for ties. Returns a
 * new array; never mutates the input.
 */
export function rankByRelevance(query: string, mentions: ReadonlyArray<Mention>): Mention[] {
  const scored = mentions.map((m) => ({ m, s: combinedRelevance(query, m) }));
  scored.sort((a, b) => b.s - a.s);
  return scored.map(({ m }) => m);
}

// Exported for tests.
export const __testInternals = {
  tokenise,
  keywordScore,
  engagementScore,
};
