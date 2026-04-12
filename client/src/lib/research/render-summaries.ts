// src/lib/research/render-summaries.ts
//
// Pure renderers that turn raw provider responses into the short
// "result summary" string each tool execute function returns to the
// model. The same string is also persisted to researchLog.
//
// Two reasons this lives in its own file rather than alongside the
// transports:
//
//   1. The two providers have completely different response shapes
//      (Tavily has a synthesised answer + hits, Exa has hits with
//      embedded text and no answer) so the rendering logic is
//      necessarily provider-specific. Splitting the file lets each
//      renderer be its own pure function with no provider-class
//      imports.
//
//   2. Both tool execute functions need the same delimiter-wrapped
//      output discipline (renderUserContent for prompt-injection
//      defence) so the renderers share the same pattern even though
//      they receive different shapes.
//
// The output of these functions is what the MODEL sees as the tool
// result on the next step of its loop. It's prompt-shaped: short,
// structured, delimiter-wrapped, hard-capped.

import 'server-only';
import { renderUserContent, sanitizeForPrompt } from '@/lib/validation/server-helpers';
import {
  MAX_FINDINGS_CHARS,
  MAX_ANSWER_CHARS,
  MAX_SOURCES_PER_QUERY,
  MAX_SOURCE_CONTENT_CHARS,
  SOURCES_PER_HIT_TITLE_CHARS,
} from './constants';
import type { TavilySearchResult } from './tavily-client';
import type { ExaSearchResult } from './exa-client';

/**
 * Render a Tavily response as the short result summary the tool
 * execute function returns to the model. Includes the synthesised
 * answer (Tavily-specific feature) and the top sources.
 */
export function renderTavilySummary(query: string, result: TavilySearchResult): string {
  const safeQuery  = sanitizeForPrompt(query, 400);
  const safeAnswer = renderUserContent(result.answer ?? 'No synthesised answer.', MAX_ANSWER_CHARS);

  const topSources = (result.results ?? [])
    .slice(0, MAX_SOURCES_PER_QUERY)
    .map(h => {
      const title   = sanitizeForPrompt(h.title ?? '', SOURCES_PER_HIT_TITLE_CHARS);
      const content = sanitizeForPrompt(h.content ?? '', MAX_SOURCE_CONTENT_CHARS);
      return `- ${title}: ${content}`;
    })
    .join('\n');

  const block = [
    `TAVILY SEARCH RESULT for: ${safeQuery}`,
    `ANSWER: ${safeAnswer}`,
    `SOURCES:\n${topSources || '(no sources returned)'}`,
  ].join('\n');

  return capLength(block);
}

/**
 * Render an Exa response as the short result summary the tool
 * execute function returns to the model. Exa has no synthesised
 * answer field — it returns ranked hits with embedded text. The
 * renderer surfaces titles + URLs + the text snippet of each hit.
 */
export function renderExaSummary(query: string, result: ExaSearchResult): string {
  const safeQuery = sanitizeForPrompt(query, 400);

  const hits = (result.results ?? [])
    .slice(0, MAX_SOURCES_PER_QUERY)
    .map(h => {
      const title = sanitizeForPrompt(h.title ?? '', SOURCES_PER_HIT_TITLE_CHARS);
      const url   = sanitizeForPrompt(h.url ?? '', SOURCES_PER_HIT_TITLE_CHARS);
      const text  = sanitizeForPrompt(h.text ?? '', MAX_SOURCE_CONTENT_CHARS);
      return `- ${title} (${url}): ${text}`;
    })
    .join('\n');

  const block = [
    `EXA SEARCH RESULT for: ${safeQuery}`,
    `HITS:\n${hits || '(no hits returned)'}`,
  ].join('\n');

  return capLength(block);
}

/**
 * Render a per-tool error as a short string the model can read on
 * the next step. The model can decide whether to retry with a
 * different query, switch to the other tool, or proceed without
 * research. Failure summaries are NOT persisted to researchLog —
 * only successful searches end up in the audit trail.
 */
export function renderToolError(tool: 'exa_search' | 'tavily_search', query: string, err: unknown): string {
  const safeQuery = sanitizeForPrompt(query, 400);
  const message   = err instanceof Error ? err.message : String(err);
  return `${tool.toUpperCase()} ERROR for query "${safeQuery}": ${sanitizeForPrompt(message, 300)}`;
}

/**
 * Hard-cap the rendered block. The model is the consumer here and
 * we want to keep tool results bounded so they don't blow up the
 * context window. Truncation is preferred over progressive
 * shortening because it keeps the structurally-meaningful sections
 * (header / answer / sources) parseable.
 */
function capLength(block: string): string {
  if (block.length <= MAX_FINDINGS_CHARS) return block;
  return block.slice(0, MAX_FINDINGS_CHARS) + '\n\n[truncated]';
}
