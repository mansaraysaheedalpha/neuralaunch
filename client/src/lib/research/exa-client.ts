// src/lib/research/exa-client.ts
//
// Pure Exa transport. Owns the SDK, the timeout, the retry, and
// nothing else. The agent-facing AI SDK tool wrapper lives in tools.ts.
//
// Mirrors the shape of tavily-client.ts so the two providers are
// structurally interchangeable from the orchestrator's perspective.

import 'server-only';
import Exa from 'exa-js';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  RESEARCH_QUERY_TIMEOUT_MS,
  RESEARCH_MAX_ATTEMPTS,
  RESEARCH_RETRY_BACKOFF_MS,
} from './constants';

/**
 * The shape Exa returns from one neural search call. Re-declared as
 * a structural type so the rest of the codebase doesn't have to
 * depend on the exa-js types directly — keeps the vendor surface
 * contained to this one file.
 *
 * Exa returns more fields than this (image, favicon, entities,
 * publishedDate, etc.) but we only persist title + url + a short
 * snippet, so the structural type is intentionally narrow.
 */
export interface ExaHit {
  title?: string | null;
  url:    string;
  text?:  string;
  score?: number;
  publishedDate?: string;
}

export interface ExaSearchResult {
  results: ExaHit[];
}

/**
 * Wrap a promise with a hard wall-clock timeout.
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
 * Lazy singleton — Exa SDK construction is cheap but doing it once
 * per call would be wasteful and creates new HTTPS state each time
 * on cold paths.
 */
let cachedClient: Exa | null = null;

function getClient(): Exa | null {
  if (!env.EXA_API_KEY) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new Exa(env.EXA_API_KEY);
  return cachedClient;
}

/**
 * Returns true when Exa is configured for the running environment.
 * Callers MUST check this before invoking searchOnce — the function
 * throws when the key is missing rather than silently returning
 * empty results, so the agent's tool list shrinks at registration
 * time and the model never sees a tool it cannot actually call.
 */
export function isExaConfigured(): boolean {
  return Boolean(env.EXA_API_KEY);
}

/**
 * Single Exa neural search with timeout + linear-backoff retry.
 *
 * - Uses Exa's default neural prompt-engineered search via .search().
 * - text contents enabled (truncated to 800 chars per hit) so the
 *   tool's resultSummary has enough material to render a useful
 *   prompt-ready block.
 * - numResults defaults to 5 (matches the agent tool's default) and
 *   can be tuned per call by the agent.
 *
 * Throws after RESEARCH_MAX_ATTEMPTS failures so the calling tool
 * execute function can return a structured "search failed" string
 * to the model rather than crashing the whole agent loop.
 */
export async function exaSearchOnce(
  query:      string,
  numResults: number,
  log:        ReturnType<typeof logger.child>,
): Promise<ExaSearchResult> {
  const client = getClient();
  if (!client) {
    throw new Error('Exa not configured — EXA_API_KEY missing');
  }

  let lastErr: unknown;
  for (let i = 0; i < RESEARCH_MAX_ATTEMPTS; i++) {
    try {
      const result = await withTimeout(
        client.search(query, {
          numResults,
          contents: { text: { maxCharacters: 800 } },
        }),
        RESEARCH_QUERY_TIMEOUT_MS,
        `Exa query attempt ${i + 1}`,
      );
      if (i > 0) log.info('[Research] Exa query succeeded on retry', { attempt: i + 1 });
      // exa-js returns a typed SearchResponse — we narrow to our
      // structural ExaSearchResult shape so the rest of the codebase
      // doesn't see vendor types.
      return {
        results: result.results.map(r => ({
          title:         r.title ?? null,
          url:           r.url,
          text:          'text' in r ? (r.text ?? undefined) : undefined,
          score:         r.score,
          publishedDate: r.publishedDate,
        })),
      };
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      log.warn('[Research] Exa query attempt failed', { attempt: i + 1, message });
      if (i < RESEARCH_MAX_ATTEMPTS - 1) {
        await new Promise(r => setTimeout(r, RESEARCH_RETRY_BACKOFF_MS * (i + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Exa query failed after retries');
}
