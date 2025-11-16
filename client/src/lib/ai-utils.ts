// src/lib/ai-utils.ts
/**
 * AI Utilities with Timeout and Caching
 *
 * Wraps AI API calls with:
 * - Automatic timeouts to prevent hanging
 * - Optional caching to reduce costs
 * - Error handling and retry logic
 */

import { withTimeout, TIMEOUTS } from "./timeout";
import { getCachedOrCompute, CACHE_TTL, generateCacheKey } from "./cache";
import { logger } from "./logger";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { env } from "./env";

// ==========================================
// AI CLIENT INSTANCES
// ==========================================

let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;
let googleAIClient: GoogleGenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: TIMEOUTS.AI_GENERATION,
      maxRetries: 2,
    });
  }
  return openaiClient;
}

export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      timeout: TIMEOUTS.AI_GENERATION,
      maxRetries: 2,
    });
  }
  return anthropicClient;
}

export function getGoogleAIClient(): GoogleGenAI {
  if (!googleAIClient) {
    googleAIClient = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY });
  }
  return googleAIClient;
}

// ==========================================
// CACHED AI OPERATIONS
// ==========================================

export interface CachedAIOptions {
  /**
   * Enable caching (default: true)
   */
  useCache?: boolean;

  /**
   * Cache TTL in seconds (default: 1 hour)
   */
  cacheTTL?: number;

  /**
   * Timeout in milliseconds (default: AI_GENERATION timeout)
   */
  timeout?: number;
}

/**
 * Cached OpenAI Chat Completion
 *
 * @example
 * ```typescript
 * const response = await cachedChatCompletion({
 *   model: "gpt-4",
 *   messages: [{ role: "user", content: "Hello" }],
 * });
 * ```
 */
export async function cachedChatCompletion(
  params: OpenAI.Chat.ChatCompletionCreateParams,
  options: CachedAIOptions = {}
): Promise<OpenAI.Chat.ChatCompletion> {
  const {
    useCache = true,
    cacheTTL = CACHE_TTL.AI_CHAT_RESPONSE,
    timeout = TIMEOUTS.AI_GENERATION,
  } = options;

  const cacheKey = generateCacheKey("openai:chat", {
    model: params.model,
    messages: params.messages,
    temperature: params.temperature,
    max_tokens: params.max_tokens,
  });

  const executeFn = async () => {
    const openai = getOpenAIClient();
    return withTimeout(
      () => openai.chat.completions.create({ ...params, stream: false }),
      timeout,
      `OpenAI chat completion (${params.model})`
    );
  };

  if (useCache) {
    return getCachedOrCompute(cacheKey, executeFn, {
      ttl: cacheTTL,
      prefix: "ai",
    });
  }

  return executeFn();
}

/**
 * Cached OpenAI Embedding
 *
 * @example
 * ```typescript
 * const embedding = await cachedEmbedding("text to embed");
 * ```
 */
export async function cachedEmbedding(
  text: string,
  model = "text-embedding-3-small",
  options: CachedAIOptions = {}
): Promise<number[]> {
  const {
    useCache = true,
    cacheTTL = CACHE_TTL.AI_EMBEDDING,
    timeout = TIMEOUTS.AI_EMBEDDING,
  } = options;

  const cacheKey = generateCacheKey("openai:embedding", { text, model });

  const executeFn = async () => {
    const openai = getOpenAIClient();
    const response = await withTimeout(
      () => openai.embeddings.create({ input: text, model }),
      timeout,
      `OpenAI embedding (${model})`
    );
    return response.data[0].embedding;
  };

  if (useCache) {
    return getCachedOrCompute(cacheKey, executeFn, {
      ttl: cacheTTL,
      prefix: "ai",
    });
  }

  return executeFn();
}

/**
 * Cached Anthropic Message
 *
 * @example
 * ```typescript
 * const response = await cachedAnthropicMessage({
 *   model: "claude-3-5-sonnet-20241022",
 *   max_tokens: 1024,
 *   messages: [{ role: "user", content: "Hello" }],
 * });
 * ```
 */
export async function cachedAnthropicMessage(
  params: Anthropic.MessageCreateParams,
  options: CachedAIOptions = {}
): Promise<Anthropic.Message> {
  const {
    useCache = true,
    cacheTTL = CACHE_TTL.AI_CHAT_RESPONSE,
    timeout = TIMEOUTS.AI_GENERATION,
  } = options;

  const cacheKey = generateCacheKey("anthropic:message", {
    model: params.model,
    messages: params.messages,
    max_tokens: params.max_tokens,
    temperature: params.temperature,
  });

  const executeFn = async () => {
    const anthropic = getAnthropicClient();
    return withTimeout(
      () => anthropic.messages.create({ ...params, stream: false }),
      timeout,
      `Anthropic message (${params.model})`
    );
  };

  if (useCache) {
    return getCachedOrCompute(cacheKey, executeFn, {
      ttl: cacheTTL,
      prefix: "ai",
    });
  }

  return executeFn();
}

/**
 * Cached Google AI Generation
 *
 * @example
 * ```typescript
 * const response = await cachedGoogleGenerate("gemini-pro", "Hello");
 * ```
 */
export async function cachedGoogleGenerate(
  modelName: string,
  prompt: string,
  options: CachedAIOptions = {}
): Promise<string> {
  const {
    useCache = true,
    cacheTTL = CACHE_TTL.AI_CHAT_RESPONSE,
    timeout = TIMEOUTS.AI_GENERATION,
  } = options;

  const cacheKey = generateCacheKey("google:generate", { modelName, prompt });

  const executeFn = async () => {
    const genAI = getGoogleAIClient();

    const result = await withTimeout(
      () => genAI.models.generateContent({
        model: modelName,
        contents: [{ parts: [{ text: prompt }] }],
      }),
      timeout,
      `Google AI generation (${modelName})`
    );

    return result.text || "";
  };

  if (useCache) {
    return getCachedOrCompute(cacheKey, executeFn, {
      ttl: cacheTTL,
      prefix: "ai",
    });
  }

  return executeFn();
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Safely execute an AI operation with error handling
 */
export async function safeAICall<T>(
  fn: () => Promise<T>,
  fallback: T,
  operation = "AI operation"
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logger.error(`Failed ${operation}`, error as Error);
    return fallback;
  }
}

/**
 * Execute multiple AI calls in parallel with timeout
 */
export async function parallelAICalls<T>(
  calls: Array<() => Promise<T>>,
  timeout = TIMEOUTS.AI_GENERATION
): Promise<T[]> {
  return withTimeout(
    () => Promise.all(calls.map((call) => call())),
    timeout,
    "Parallel AI calls"
  );
}
