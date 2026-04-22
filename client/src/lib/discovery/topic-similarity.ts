// src/lib/discovery/topic-similarity.ts
//
// Lightweight word-overlap similarity used by the discovery turn
// route to deduplicate follow-up topics. Without dedup, the extractor
// flags emotionally-rich answers as follow-up-worthy every turn —
// each with a slightly different topic phrasing — and the engine
// loops on the same thread indefinitely (2026-04-22 Amara incident:
// "what's your deeper fear" asked three times consecutively with
// minor rewording each time).
//
// Jaccard-on-word-sets is deliberately simple: no embedding calls,
// no API cost, deterministic, fast enough to run every turn. Good
// enough to catch the egregious cases where the extractor reuses
// 30-50% of the same words; a true semantic match would need a
// smarter model but that's not worth the complexity right now.

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'to', 'of', 'and', 'or', 'but', 'in', 'on', 'at',
  'for', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'it', 'its', 'that', 'this', 'these', 'those', 'as', 'by', 'with',
  'from', 'about', 'into', 'over', 'her', 'his', 'their', 'she', 'he',
  'they', 'them', 'you', 'your', 'yours', 'our', 'ours',
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

/**
 * Jaccard similarity between two topic strings' content-word sets.
 * Returns 0 when either side is empty (no overlap to measure).
 */
export function topicSimilarity(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.size === 0 || B.size === 0) return 0;
  let intersection = 0;
  for (const w of A) if (B.has(w)) intersection++;
  const union = A.size + B.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Threshold above which two follow-up topics are considered duplicates
 * for the purpose of suppressing a re-arm of pendingFollowUp. Tuned
 * against the Amara transcript — "what's your deeper fear" variants
 * score 0.45-0.6 against each other, clearly different topics like
 * "OnLocum competitor" vs "your engineer friend Kip" score < 0.1.
 */
export const FOLLOW_UP_DUPLICATE_THRESHOLD = 0.35;

/**
 * Number of completed questions that must pass between any two
 * follow-ups. Three normal questions is enough room for the
 * conversation to land somewhere new; the cooldown shuts off the
 * "every turn is a follow-up" loop without disabling the feature.
 */
export const FOLLOW_UP_COOLDOWN_QUESTIONS = 3;
