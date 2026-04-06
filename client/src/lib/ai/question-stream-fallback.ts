// src/lib/ai/question-stream-fallback.ts
import 'server-only';
import { streamText, type ModelMessage, type LanguageModel } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { google as aiSdkGoogle }       from '@ai-sdk/google';
import { logger }                       from '@/lib/logger';
import { env }                          from '@/lib/env';
import { MODELS, QUESTION_MAX_TOKENS } from '@/lib/discovery/constants';

// ---------------------------------------------------------------------------
// Provider chain — primary + two fallbacks for question generation only.
//
// Synthesis (recommendation, roadmap, interpretation, build brief, pushback)
// MUST NOT use this helper. A failed synthesis is surfaced to the founder
// with an explicit retry, never silently downgraded to a smaller model.
// ---------------------------------------------------------------------------

export type ProviderId =
  | 'anthropic-sonnet'
  | 'anthropic-haiku'
  | 'google-gemini-flash';

interface ProviderEntry {
  id:        ProviderId;
  model:     LanguageModel;
  modelName: string;
  enabled:   boolean;
}

function buildProviderChain(): ProviderEntry[] {
  const chain: ProviderEntry[] = [
    {
      id:        'anthropic-sonnet',
      model:     aiSdkAnthropic(MODELS.INTERVIEW),
      modelName: MODELS.INTERVIEW,
      enabled:   true,
    },
    {
      id:        'anthropic-haiku',
      model:     aiSdkAnthropic(MODELS.INTERVIEW_FALLBACK_1),
      modelName: MODELS.INTERVIEW_FALLBACK_1,
      enabled:   true,
    },
  ];
  // Gemini is only added when GOOGLE_AI_API_KEY is configured. The
  // @ai-sdk/google provider reads the key from env at call time, so we
  // gate inclusion in the chain rather than instantiating an unusable
  // model.
  if (env.GOOGLE_AI_API_KEY) {
    chain.push({
      id:        'google-gemini-flash',
      model:     aiSdkGoogle(MODELS.INTERVIEW_FALLBACK_2),
      modelName: MODELS.INTERVIEW_FALLBACK_2,
      enabled:   true,
    });
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Backoff schedule
// ---------------------------------------------------------------------------

/**
 * Backoff between RETRIES on the same provider. The first attempt has
 * no delay; the second waits 2s, the third waits 8s, the fourth (which
 * triggers fallback to the next provider) waits 30s. Schedule per the
 * resilience spec.
 */
const RETRY_DELAYS_MS = [0, 2_000, 8_000, 30_000] as const;

/**
 * Decide whether an error from a streaming call is worth retrying. We
 * retry on 5xx, 429 (rate limit), 529 (overloaded), and any network
 * error that has no status. We do NOT retry on 4xx (auth, schema) —
 * those won't go away on a retry.
 */
function isRetryable(err: unknown): boolean {
  if (err == null) return false;
  const errAny = err as { status?: number; statusCode?: number; cause?: { status?: number }; name?: string; message?: string };
  const status = errAny.status ?? errAny.statusCode ?? errAny.cause?.status;
  if (typeof status === 'number') {
    if (status === 408 || status === 425 || status === 429 || status === 529) return true;
    if (status >= 500 && status < 600) return true;
    return false;
  }
  // No status — likely a network error or aborted request
  const message = (errAny.message ?? '').toLowerCase();
  if (message.includes('overload')) return true;
  if (message.includes('timeout')) return true;
  if (message.includes('network')) return true;
  if (message.includes('fetch failed')) return true;
  if (errAny.name === 'AbortError') return false; // explicit abort, not a retry
  // Conservative default: retry once if we can't classify
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FallbackStreamRequest {
  /** A label used in logs to identify which call site fired this stream. */
  callsite: string;
  system:   string;
  messages: ModelMessage[];
}

export interface FallbackStreamResult {
  /**
   * A ReadableStream<string> that emits text chunks from the first
   * provider that successfully delivers content. The consumer reads it
   * the same way it reads any AI SDK textStream — passthrough to the
   * client, tee for persistence, etc.
   */
  textStream: ReadableStream<string>;

  /**
   * Resolves once the first successful chunk has been emitted, with
   * the provider id that won. Used for logging modelUsed on the
   * Message row. Rejects if every provider failed.
   */
  modelUsed: Promise<ProviderId>;
}

/**
 * streamQuestionWithFallback
 *
 * Wraps every question/response generator. Tries the primary provider
 * (Sonnet) up to 4 attempts with 2s/8s/30s backoff, then falls back to
 * Haiku with the same backoff schedule, then to Gemini Flash. The
 * underlying AI SDK calls are streamText with maxOutputTokens capped
 * at QUESTION_MAX_TOKENS (1000) so a degraded provider does not hang
 * waiting for an oversized response.
 *
 * The returned stream is single-consumer. Tee it before reading from
 * multiple places.
 *
 * If every provider fails, the stream errors and the modelUsed promise
 * rejects with the last error from the chain.
 */
export function streamQuestionWithFallback(
  req: FallbackStreamRequest,
): FallbackStreamResult {
  const log     = logger.child({ module: 'QuestionFallback', callsite: req.callsite });
  const chain   = buildProviderChain();
  if (chain.length === 0) {
    // Defensive: should never happen, the primary is hardcoded
    throw new Error('No question-generation providers configured');
  }

  let resolveModelUsed: (id: ProviderId) => void;
  let rejectModelUsed:  (err: unknown)  => void;
  const modelUsed = new Promise<ProviderId>((res, rej) => {
    resolveModelUsed = res;
    rejectModelUsed  = rej;
  });

  const textStream = new ReadableStream<string>({
    async start(controller) {
      let lastError: unknown = null;

      for (let providerIdx = 0; providerIdx < chain.length; providerIdx++) {
        const provider = chain[providerIdx];
        if (!provider.enabled) continue;

        for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
          if (RETRY_DELAYS_MS[attempt] > 0) {
            log.warn('[Fallback] Backing off before retry', {
              providerId: provider.id,
              attempt,
              delayMs:    RETRY_DELAYS_MS[attempt],
            });
            await sleep(RETRY_DELAYS_MS[attempt]);
          }

          try {
            log.info('[Fallback] Attempting stream', {
              providerId:  provider.id,
              modelName:   provider.modelName,
              attempt,
            });

            const result = streamText({
              model:           provider.model,
              system:          req.system,
              messages:        req.messages,
              maxOutputTokens: QUESTION_MAX_TOKENS,
            });

            // Pump chunks. The first successful read confirms the
            // provider — at that point we resolve modelUsed and commit
            // to this provider for the rest of the response.
            let receivedAnyChunk = false;
            try {
              for await (const chunk of result.textStream) {
                if (!receivedAnyChunk) {
                  receivedAnyChunk = true;
                  resolveModelUsed(provider.id);
                  log.info('[Fallback] First chunk received — committed to provider', {
                    providerId: provider.id,
                  });
                }
                controller.enqueue(chunk);
              }
            } catch (streamErr) {
              // Mid-stream failure. If we already received any chunk
              // we cannot safely fall back — the founder is reading a
              // partial message and switching providers would produce
              // a Frankenstein response. Surface the cut to the
              // client; the in-conversation retry UI handles it.
              if (receivedAnyChunk) {
                log.error(
                  '[Fallback] Mid-stream failure after first chunk — surfacing cut',
                  streamErr instanceof Error ? streamErr : new Error(String(streamErr)),
                  { providerId: provider.id },
                );
                controller.error(streamErr);
                return;
              }
              // No chunks yet — this attempt failed cleanly, retry/fall back
              throw streamErr;
            }

            // Success — close the stream
            controller.close();
            return;
          } catch (err) {
            lastError = err;
            const message = err instanceof Error ? err.message : String(err);
            const retryable = isRetryable(err);
            log.warn('[Fallback] Attempt failed', {
              providerId: provider.id,
              attempt,
              message,
              retryable,
            });
            if (!retryable) {
              // Non-retryable on this provider (e.g. 401 auth) — break
              // out of the retry loop and try the next provider.
              break;
            }
            // Otherwise, loop back and let the backoff schedule run
            // the next retry on the same provider, OR fall through
            // to the next provider when the schedule is exhausted.
          }
        }

        log.warn('[Fallback] Provider exhausted, falling back', {
          providerId: provider.id,
        });
      }

      // Every provider exhausted
      log.error(
        '[Fallback] All providers exhausted',
        lastError instanceof Error ? lastError : new Error(String(lastError)),
      );
      rejectModelUsed(lastError ?? new Error('All providers exhausted'));
      controller.error(lastError ?? new Error('All providers exhausted'));
    },
  });

  return { textStream, modelUsed };
}
