// src/lib/ai/with-model-fallback.ts
import 'server-only';
import { logger } from '@/lib/logger';

/**
 * Shared model-fallback helper for every generateObject call site in
 * the codebase.
 *
 * Background — production incident on 2026-04-08:
 *
 *   The discovery turn route 500'd with AI_RetryError 'Failed after
 *   3 attempts. Last error: Overloaded' under sustained Anthropic
 *   Sonnet overload. Investigation revealed 5 of 10 generateObject
 *   call sites had no fallback model AT ALL — when their primary
 *   model was overloaded, the entire founder flow died.
 *
 *   The streaming question/response generators already had a chain
 *   via question-stream-fallback.ts. The pushback engine and
 *   distribution-generator had bespoke retry shims. But synthesis,
 *   roadmap, check-in, validation interpreter, validation page
 *   generator, and the context extractor all ran straight against
 *   their primary model with no second chance.
 *
 *   This helper consolidates the pattern. Every generateObject call
 *   site wraps its work in withModelFallback() and gets:
 *     - Single immediate retry against a smaller fallback model on
 *       any 'overloaded' error class (AI_RetryError + AI_APICallError)
 *     - Structured logging at the warn level so we can see how often
 *       Anthropic overload affects production
 *     - The same call shape for every site so future audits don't
 *       have to remember which sites have it and which don't
 *
 * The helper is intentionally narrow: it only catches errors that
 * are clearly 'transient overload' shapes. Genuine schema bugs,
 * 4xx errors, network failures, and any other AI SDK error class
 * still surface immediately so the route's error handler can
 * surface them and the central httpErrorToResponse can log them.
 */

/**
 * Detect transient Anthropic overload errors that justify a fallback
 * to a smaller model on the same vendor (or a different vendor).
 *
 * Recognised shapes:
 *   - Vercel AI SDK: AI_RetryError, AI_APICallError, AI_NoObjectGeneratedError
 *     with 'overload' in the message
 *   - Anthropic SDK direct: APIError, OverloadedError, or any error with
 *     status / statusCode === 529 (Anthropic's canonical overload status)
 *   - Generic 'overloaded' detection on the message as a final fallthrough
 *
 * We deliberately do NOT match arbitrary 5xx errors here — only 529
 * (Anthropic's specific overload code) and explicit 'overload' messages.
 * 503 / 502 / 500 from upstream usually mean something genuinely broken
 * rather than transient capacity, and we want those to surface.
 */
export function isAnthropicOverload(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // Status-based detection (raw Anthropic SDK + AI SDK both may set these)
  const errAny = err as { status?: number; statusCode?: number; cause?: { status?: number } };
  const status = errAny.status ?? errAny.statusCode ?? errAny.cause?.status;
  if (status === 529) return true;

  // Name-based detection on the AI SDK error classes
  const knownNames = new Set([
    'AI_RetryError',
    'AI_APICallError',
    'AI_NoObjectGeneratedError',
    'APIError',
    'OverloadedError',
  ]);
  if (knownNames.has(err.name) && /overload/i.test(err.message)) {
    return true;
  }

  // Final fallthrough: any error whose message names overload explicitly
  return /overloaded/i.test(err.message);
}

/**
 * Run a generateObject (or any LLM-shaped) call against a primary
 * model, then transparently fall back to a smaller model on Anthropic
 * overload. Caller passes a factory taking the model id so we can
 * re-issue the exact same call against the fallback on the second
 * attempt without duplicating prompt/schema construction.
 *
 * Usage:
 *
 *   const result = await withModelFallback(
 *     'moduleName:functionName',
 *     { primary: MODELS.SYNTHESIS, fallback: MODELS.INTERVIEW },
 *     async (modelId) => {
 *       const { object } = await generateObject({
 *         model: aiSdkAnthropic(modelId),
 *         schema: MySchema,
 *         messages: [...],
 *       });
 *       return object;
 *     },
 *   );
 *
 * The single retry never includes a delay — by the time Anthropic
 * has thrown, we are already at least one round-trip in. Adding a
 * sleep here would push into the route's maxDuration budget. The
 * smaller model is on different infrastructure (Sonnet vs Opus, or
 * Haiku vs Sonnet) so jumping to it bypasses whatever was causing
 * the primary's overload.
 */
export interface WithModelFallbackConfig {
  /** Primary model id — tried first */
  primary: string;
  /** Fallback model id — tried once if primary throws an overload error */
  fallback: string;
}

export async function withModelFallback<T>(
  callsite: string,
  config: WithModelFallbackConfig,
  run: (modelId: string) => Promise<T>,
): Promise<T> {
  const log = logger.child({ module: 'WithModelFallback', callsite });
  try {
    return await run(config.primary);
  } catch (err) {
    if (!isAnthropicOverload(err)) throw err;
    log.warn(
      `[${callsite}] ${config.primary} overloaded — falling back to ${config.fallback}`,
    );
    return await run(config.fallback);
  }
}
