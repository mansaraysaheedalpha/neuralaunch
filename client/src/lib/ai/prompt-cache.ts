import 'server-only';
import type { ModelMessage, SystemModelMessage, UserModelMessage } from 'ai';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Prompt Caching helpers.
 *
 * Anthropic caches the stable prefix of a prompt for 5 minutes on the
 * server side. A cache hit pays 0.1× the normal input-token price, so
 * any stable prefix ≥ CACHE_MIN_TOKENS that we send more than once in
 * a five-minute window is a direct cost and latency win.
 *
 * Place one breakpoint at the end of the stable content — Anthropic
 * caches everything up to and including the marker. The volatile
 * suffix (the founder's current turn) is NOT marked, so it stays
 * fresh each call.
 *
 * This module exposes four tiny helpers:
 *   - cachedUserMessages()      for Vercel AI SDK generateObject / generateText / streamText
 *   - cachedSystem()            for Vercel AI SDK calls that use the `system` parameter
 *   - cachedAnthropicContent()  for raw @anthropic-ai/sdk messages
 *   - cachedAnthropicSystem()   for raw @anthropic-ai/sdk system blocks
 *
 * Each helper falls back to an un-cached single-block form when the
 * stable prefix is below CACHE_MIN_TOKENS — Anthropic rejects
 * breakpoints on short prefixes anyway.
 */

/**
 * Minimum stable prefix that Anthropic will accept as a cache breakpoint.
 * Sonnet / Opus require ≥ 1024 tokens, Haiku ≥ 2048. We use 1024 as the
 * project-wide floor; callers that know they're on Haiku can pass a
 * higher `minTokens` override.
 */
export const CACHE_MIN_TOKENS = 1024;

/**
 * Quick character-to-token estimate. 1 token ≈ 4 characters for English
 * text. Never perfectly accurate but good enough for "should I bother
 * inserting a breakpoint" decisions. We err on the side of inserting
 * one — a no-op breakpoint is cheap; a missed cache is not.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build a two-message array for Vercel AI SDK calls.
 *
 * Replace:
 *     messages: [{ role: 'user', content: whole_prompt }]
 * with:
 *     messages: cachedUserMessages(STABLE_PREFIX, VOLATILE_TURN)
 *
 * The first message carries the stable prefix (system rules, tool
 * guidance, schema descriptions, recommendation context) and is
 * marked with cache_control. The second carries the current turn's
 * volatile content (the founder's latest message, the current task,
 * whatever changed since last call).
 */
export function cachedUserMessages(
  stable: string,
  volatile: string,
  options?: { minTokens?: number },
): UserModelMessage[] {
  const minTokens = options?.minTokens ?? CACHE_MIN_TOKENS;
  if (estimateTokens(stable) < minTokens) {
    return [{ role: 'user', content: `${stable}\n\n${volatile}` }];
  }
  return [
    {
      role: 'user',
      content: stable,
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    },
    { role: 'user', content: volatile },
  ];
}

/**
 * Wrap a system prompt for Vercel AI SDK calls in a form that carries
 * cache_control. Returns a plain string when the prompt is too short
 * to cache, otherwise returns the content-block form.
 *
 *     const system = cachedSystem(BIG_SYSTEM_RULES);
 *     // …later…
 *     await generateText({ model, system, messages });
 */
export function cachedSystem(
  text: string,
  options?: { minTokens?: number },
): string | SystemModelMessage {
  const minTokens = options?.minTokens ?? CACHE_MIN_TOKENS;
  if (estimateTokens(text) < minTokens) return text;
  return {
    role: 'system',
    content: text,
    providerOptions: {
      anthropic: { cacheControl: { type: 'ephemeral' } },
    },
  };
}

/**
 * Vercel AI SDK helper that combines cachedSystem + cachedUserMessages
 * into the `messages` array. Useful when the SDK version being used
 * doesn't accept a cached system message on the top-level `system`
 * field — we splice the system block into `messages` instead.
 */
export function cachedMessages(
  system: string,
  stableUserPrefix: string,
  volatileTurn: string,
  options?: { minTokens?: number },
): ModelMessage[] {
  const minTokens = options?.minTokens ?? CACHE_MIN_TOKENS;
  const cacheSystem = estimateTokens(system) >= minTokens;
  const cacheStable = estimateTokens(stableUserPrefix) >= minTokens;

  const messages: ModelMessage[] = [];

  if (cacheSystem) {
    messages.push({
      role: 'system',
      content: system,
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    });
  } else if (system.length > 0) {
    messages.push({ role: 'system', content: system });
  }

  if (cacheStable) {
    messages.push({
      role: 'user',
      content: stableUserPrefix,
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    });
    messages.push({ role: 'user', content: volatileTurn });
  } else {
    messages.push({
      role: 'user',
      content: stableUserPrefix.length > 0
        ? `${stableUserPrefix}\n\n${volatileTurn}`
        : volatileTurn,
    });
  }

  return messages;
}

/* ------------------------------------------------------------------
 * Raw @anthropic-ai/sdk helpers — used by synthesis-engine and a few
 * others that call anthropic.messages.create() directly.
 * ------------------------------------------------------------------ */

/**
 * Build the `content` field for a single user message in a raw
 * Anthropic SDK call, marking the stable prefix as cached.
 *
 *     await anthropicClient.messages.create({
 *       model,
 *       max_tokens: 1024,
 *       messages: [
 *         { role: 'user', content: cachedAnthropicContent(STABLE, VOLATILE) },
 *       ],
 *     });
 */
export function cachedAnthropicContent(
  stable: string,
  volatile: string,
  options?: { minTokens?: number },
): Anthropic.Messages.TextBlockParam[] {
  const minTokens = options?.minTokens ?? CACHE_MIN_TOKENS;
  if (estimateTokens(stable) < minTokens) {
    return [{ type: 'text', text: `${stable}\n\n${volatile}` }];
  }
  return [
    { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: volatile },
  ];
}

/**
 * Wrap a system prompt for a raw Anthropic SDK call in a form that
 * carries cache_control.
 *
 *     await anthropicClient.messages.create({
 *       model,
 *       system: cachedAnthropicSystem(SYSTEM_RULES),
 *       messages: [...],
 *     });
 */
export function cachedAnthropicSystem(
  text: string,
  options?: { minTokens?: number },
): string | Anthropic.Messages.TextBlockParam[] {
  const minTokens = options?.minTokens ?? CACHE_MIN_TOKENS;
  if (estimateTokens(text) < minTokens) return text;
  return [
    { type: 'text', text, cache_control: { type: 'ephemeral' } },
  ];
}
