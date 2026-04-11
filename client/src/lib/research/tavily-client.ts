// src/lib/research/tavily-client.ts
//
// Pure Tavily transport. Owns the SDK, the timeout, the retry, and
// nothing else. Higher-level concerns (query construction, result
// dedup, prompt rendering, agent budgets) live elsewhere.

import 'server-only';
import { tavily } from '@tavily/core';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  RESEARCH_QUERY_TIMEOUT_MS,
  RESEARCH_MAX_ATTEMPTS,
  RESEARCH_RETRY_BACKOFF_MS,
} from './constants';

/**
 * The shape Tavily returns from a single search call. Re-declared
 * here as a structural type so the rest of the codebase doesn't
 * have to depend on the @tavily/core types directly — keeps the
 * vendor surface contained to this one file.
 */
export interface TavilyHit {
  title?:   string;
  url?:     string;
  content?: string;
}

export interface TavilySearchResult {
  answer?: string;
  results: TavilyHit[];
}

/**
 * Wrap a promise with a hard wall-clock timeout. The error message
 * names the operation so timeout failures are diagnosable in logs.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Lazy singleton — Tavily client construction is cheap but doing it
 * once per call would be wasteful and creates a new HTTPS agent each
 * time on cold paths.
 */
let cachedClient: ReturnType<typeof tavily> | null = null;

function getClient(): ReturnType<typeof tavily> | null {
  if (!env.TAVILY_API_KEY) return null;
  if (cachedClient) return cachedClient;
  cachedClient = tavily({ apiKey: env.TAVILY_API_KEY });
  return cachedClient;
}

/**
 * Returns true when Tavily is configured for the running environment.
 * Callers MUST check this before invoking searchOnce — the function
 * throws when the key is missing rather than silently returning empty
 * results, because a missing key in production is a configuration
 * error worth surfacing.
 */
export function isResearchConfigured(): boolean {
  return Boolean(env.TAVILY_API_KEY);
}

/**
 * Single Tavily search with timeout + linear-backoff retry.
 *
 * - searchDepth='advanced' (2 credits / query) for higher source quality.
 *   Free tier is 1000 credits / month — at the per-agent budgets in
 *   constants.ts, that supports comfortable early-stage volume and
 *   the quality uplift is worth the cost.
 * - includeAnswer=true so Tavily synthesises a one-paragraph summary
 *   we can quote directly into the prompt block.
 * - maxResults=5 with downstream dedup to MAX_SOURCES_PER_QUERY.
 *
 * Throws after RESEARCH_MAX_ATTEMPTS failures so the caller can
 * decide whether to fail open (Recommendation, Continuation) or
 * skip the agent (Interview, Pushback, Check-in).
 */
export async function searchOnce(
  query: string,
  log:   ReturnType<typeof logger.child>,
): Promise<TavilySearchResult> {
  const client = getClient();
  if (!client) {
    throw new Error('Tavily not configured — TAVILY_API_KEY missing');
  }

  let lastErr: unknown;
  for (let i = 0; i < RESEARCH_MAX_ATTEMPTS; i++) {
    try {
      const result = await withTimeout(
        client.search(query, {
          searchDepth:   'advanced',
          maxResults:    5,
          includeAnswer: true,
        }),
        RESEARCH_QUERY_TIMEOUT_MS,
        `Tavily query attempt ${i + 1}`,
      );
      if (i > 0) log.info('[Research] Tavily query succeeded on retry', { attempt: i + 1 });
      return result as TavilySearchResult;
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      log.warn('[Research] Tavily query attempt failed', { attempt: i + 1, message });
      if (i < RESEARCH_MAX_ATTEMPTS - 1) {
        await new Promise(r => setTimeout(r, RESEARCH_RETRY_BACKOFF_MS * (i + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Tavily query failed after retries');
}
