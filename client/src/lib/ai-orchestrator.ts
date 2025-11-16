// src/lib/ai-orchestrator.ts
/**
 * Centralized AI Orchestration Service
 * Routes AI tasks to the most appropriate model based on task type and requirements.
 *
 * ✅ MIGRATED TO @google/genai (NEW UNIFIED SDK)
 */

import { GoogleGenAI } from "@google/genai";
import { env } from "./env";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { AI_MODELS } from "./models";
import { ExternalServiceError, withTimeout } from "./api-error";
import { logger } from "./logger";

// ==================== TASK TYPE DEFINITIONS ====================
export enum AITaskType {
  BLUEPRINT_GENERATION = "BLUEPRINT_GENERATION",
  TITLE_GENERATION = "TITLE_GENERATION",
  LANDING_PAGE_COPY = "LANDING_PAGE_COPY",
  SURVEY_QUESTION_GENERATION = "SURVEY_QUESTION_GENERATION",
  PRICING_TIER_GENERATION = "PRICING_TIER_GENERATION",
  COFOUNDER_CHAT_RESPONSE = "COFOUNDER_CHAT_RESPONSE",
  BLUEPRINT_PARSING = "BLUEPRINT_PARSING",
  SPRINT_TASK_ASSISTANCE = "SPRINT_TASK_ASSISTANCE",
  AGENT_PLANNING = "AGENT_PLANNING",
  AGENT_EXECUTE_STEP = "AGENT_EXECUTE_STEP",
  AGENT_DEBUG_COMMAND = "AGENT_DEBUG_COMMAND",
  GET_API_KEY_GUIDANCE = "GET_API_KEY_GUIDANCE",
  // Autonomous task types
  AGENT_VERIFY_STEP = "AGENT_VERIFY_STEP",
  AGENT_READ_WORKSPACE = "AGENT_READ_WORKSPACE",
  AGENT_DEBUG_FULL = "AGENT_DEBUG_FULL",
  AGENT_REFLECT = "AGENT_REFLECT",
  AGENT_ARCHITECT_ANALYZE = "AGENT_ARCHITECT_ANALYZE",
  AGENT_TECH_RESEARCHER = "AGENT_TECH_RESEARCHER",
}

// ==================== PROVIDER TYPE ====================
type AIProvider = "GOOGLE" | "OPENAI" | "ANTHROPIC";

// ==================== CLIENT INITIALIZATION ====================
// ✅ NEW: Client-centric initialization with @google/genai
const ai = new GoogleGenAI({
  apiKey: env.GOOGLE_API_KEY,
});

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

// ==================== ROUTING LOGIC ====================
function routeTaskToModel(
  taskType: AITaskType,
  _payload?: unknown
): {
  modelId: string;
  provider: AIProvider;
  enableSearchTool?: boolean;
} {
  switch (taskType) {
    case AITaskType.BLUEPRINT_GENERATION:
      logger.debug(`🎯 Routing ${taskType} to ${AI_MODELS.PRIMARY} (Google)`);
      return {
        modelId: AI_MODELS.PRIMARY,
        provider: "GOOGLE",
        enableSearchTool: false,
      };

    case AITaskType.AGENT_PLANNING:
    case AITaskType.AGENT_ARCHITECT_ANALYZE:
      logger.debug(`🎯 Routing ${taskType} to ${AI_MODELS.CLAUDE} (Anthropic)`);
      return { modelId: AI_MODELS.CLAUDE, provider: "ANTHROPIC" };

    case AITaskType.AGENT_TECH_RESEARCHER:
      logger.debug(
        `🎯 Routing ${taskType} to ${AI_MODELS.PRIMARY} (Google) with Search`
      );
      return {
        modelId: AI_MODELS.PRIMARY,
        provider: "GOOGLE",
        enableSearchTool: true,
      };

    case AITaskType.TITLE_GENERATION:
    case AITaskType.LANDING_PAGE_COPY:
    case AITaskType.SURVEY_QUESTION_GENERATION:
    case AITaskType.PRICING_TIER_GENERATION:
      logger.debug(`🎯 Routing ${taskType} to ${AI_MODELS.FAST} (Google)`);
      return { modelId: AI_MODELS.FAST, provider: "GOOGLE" };

    case AITaskType.COFOUNDER_CHAT_RESPONSE:
    case AITaskType.AGENT_EXECUTE_STEP:
    case AITaskType.AGENT_VERIFY_STEP:
    case AITaskType.AGENT_READ_WORKSPACE:
    case AITaskType.AGENT_DEBUG_FULL:
    case AITaskType.AGENT_REFLECT:
      logger.debug(`🎯 Routing ${taskType} to ${AI_MODELS.CLAUDE} (Anthropic)`);
      return { modelId: AI_MODELS.CLAUDE, provider: "ANTHROPIC" };

    case AITaskType.BLUEPRINT_PARSING:
    case AITaskType.AGENT_DEBUG_COMMAND:
      logger.debug(`🎯 Routing ${taskType} to ${AI_MODELS.OPENAI} (OpenAI)`);
      return { modelId: AI_MODELS.OPENAI, provider: "OPENAI" };

    case AITaskType.SPRINT_TASK_ASSISTANCE:
      logger.debug(
        `🎯 Routing ${taskType} (general) to ${AI_MODELS.CLAUDE} (Anthropic)`
      );
      return { modelId: AI_MODELS.CLAUDE, provider: "ANTHROPIC" };

    case AITaskType.GET_API_KEY_GUIDANCE:
      logger.debug(
        `🎯 Routing ${taskType} to ${AI_MODELS.PRIMARY} (Google) with Search Tool`
      );
      return {
        modelId: AI_MODELS.PRIMARY,
        provider: "GOOGLE",
        enableSearchTool: true,
      };

    default: {
      const _exhaustiveCheck: never = taskType;
      logger.warn(
        `⚠️ Unknown task type ${String(_exhaustiveCheck)}, defaulting to ${AI_MODELS.PRIMARY}`
      );
      return { modelId: AI_MODELS.PRIMARY, provider: "GOOGLE" };
    }
  }
}

// ==================== PROVIDER HELPER FUNCTIONS ====================

/**
 * ✅ UPDATED: Call Google Generative AI using NEW @google/genai SDK
 * - Stateless, client-centric architecture
 * - All config passed per-request in declarative object
 * - Simplified response handling
 * - ✅ FIXED: Using 'googleSearch' instead of 'googleSearchRetrieval'
 */
async function callGemini(
  modelId: string,
  prompt: string,
  systemInstruction?: string,
  stream?: boolean,
  enableSearchTool?: boolean,
  json?: boolean
): Promise<string | AsyncIterable<string>> {
  if (!env.GOOGLE_API_KEY) {
    throw new Error("Google API Key is missing.");
  }

  try {
    // ✅ NEW: Build the stateless, declarative request object
    const requestPayload: {
      model: string;
      contents: Array<{ parts: Array<{ text: string }> }>;
      generationConfig?: {
        responseMimeType?: string;
      };
      systemInstruction?: {
        parts: Array<{ text: string }>;
      };
      tools?: Array<{ googleSearch: Record<string, never> }>; // ✅ CHANGED FROM googleSearchRetrieval
    } = {
      model: modelId,
      contents: [{ parts: [{ text: prompt }] }],
    };

    // ✅ NEW: Add JSON mode via generationConfig
    if (json) {
      requestPayload.generationConfig = {
        responseMimeType: "application/json",
      };
      logger.info(`[callGemini] Forcing JSON output mode for ${modelId}.`);
    }

    // ✅ NEW: Add system instruction to request (was in getGenerativeModel)
    if (systemInstruction) {
      requestPayload.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    // ✅ FIXED: Using 'googleSearch' instead of 'googleSearchRetrieval'
    if (enableSearchTool) {
      requestPayload.tools = [{ googleSearch: {} }]; // ✅ CHANGED HERE
      logger.info(
        `[callGemini] Enabling Google Search tool for model ${modelId}.`
      );
    }

    // ==================== STREAMING ====================
    if (stream && !enableSearchTool) {
      logger.info(`[callGemini] Starting stream for model ${modelId}`);

      const response = await withTimeout(
        ai.models.generateContentStream(requestPayload),
        90000,
        `Gemini streaming (${modelId})`
      );

      return (async function* () {
        try {
          for await (const chunk of response) {
            const chunkText = chunk.text;
            if (chunkText) {
              yield chunkText;
            }
          }
        } catch (streamError) {
          logger.error(
            `Gemini stream error (${modelId})`,
            streamError instanceof Error ? streamError : undefined
          );
          throw new ExternalServiceError(
            "Google",
            `Streaming failed: ${streamError instanceof Error ? streamError.message : String(streamError)}`
          );
        }
      })();
    }

    // ==================== NON-STREAMING ====================
    if (stream && enableSearchTool) {
      logger.warn(
        "[callGemini] Search tool enabled, streaming is disabled. Returning full response."
      );
    }

    logger.info(
      `[callGemini] Generating non-streamed content for model ${modelId}${enableSearchTool ? " with Search" : ""}`
    );

    const response = await withTimeout(
      ai.models.generateContent(requestPayload),
      180000,
      `Gemini generation (${modelId}) ${enableSearchTool ? "with Search" : ""}`
    );

    const responseText = response.text;

    if (!responseText) {
      logger.warn(`[callGemini] Model returned an empty text response.`);
      return "";
    }

    return responseText;
  } catch (error) {
    logger.error(
      `Gemini API error (${modelId})`,
      error instanceof Error ? error : undefined
    );
    if (error instanceof ExternalServiceError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Enhanced error handling
    if (errorMessage.includes("API key not valid")) {
      throw new ExternalServiceError(
        "Google",
        "Invalid Google API Key provided."
      );
    }

    // ✅ UPDATED: Better error message for tool issues
    if (
      errorMessage.includes("google_search_retrieval") ||
      errorMessage.includes("googleSearchRetrieval") ||
      errorMessage.includes("not supported")
    ) {
      logger.error(
        `[callGemini] Search tool error: ${errorMessage}. Ensure you're using 'googleSearch' (not 'googleSearchRetrieval') with @google/genai SDK.`
      );
      throw new ExternalServiceError(
        "Google",
        "Search tool configuration error. The new @google/genai SDK requires 'googleSearch' instead of 'googleSearchRetrieval'."
      );
    }

    if (errorMessage.includes("400") || errorMessage.includes("tool")) {
      logger.error(`[callGemini] Tool configuration error: ${errorMessage}.`);
      throw new ExternalServiceError(
        "Google",
        "Search tool configuration error. Please check your @google/genai SDK version."
      );
    }

    throw new ExternalServiceError(
      "Google",
      `Gemini API request failed: ${errorMessage}`
    );
  }
}

async function callOpenAI(
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string,
  responseFormat?: { type: "json_object" },
  stream?: boolean
): Promise<string | AsyncIterable<string>> {
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY environment variable is required for OpenAI operations"
    );
  }

  try {
    const messageArray = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;

    if (stream) {
      const completion = await withTimeout(
        openai.chat.completions.create({
          model: modelId,
          messages: messageArray as OpenAI.Chat.ChatCompletionMessageParam[],
          stream: true,
        }),
        120000,
        `OpenAI streaming (${modelId})`
      );

      return (async function* () {
        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              yield content;
            }
          }
        } catch (streamError) {
          logger.error(
            `OpenAI stream error (${modelId})`,
            streamError instanceof Error ? streamError : undefined
          );
          throw new ExternalServiceError(
            "OpenAI",
            `Streaming failed: ${streamError instanceof Error ? streamError.message : String(streamError)}`
          );
        }
      })();
    }

    const completion = await withTimeout(
      openai.chat.completions.create({
        model: modelId,
        messages: messageArray as OpenAI.Chat.ChatCompletionMessageParam[],
        ...(responseFormat && {
          response_format: { type: "json_object" as const },
        }),
      }),
      90000,
      `OpenAI generation (${modelId})`
    );

    return completion.choices[0]?.message?.content || "";
  } catch (error) {
    logger.error(
      `OpenAI API error (${modelId})`,
      error instanceof Error ? error : undefined
    );
    if (error instanceof ExternalServiceError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("Incorrect API key")) {
      throw new ExternalServiceError(
        "OpenAI",
        "Invalid OpenAI API Key provided."
      );
    }
    throw new ExternalServiceError(
      "OpenAI",
      `OpenAI API request failed: ${errorMessage}`
    );
  }
}

async function callClaude(
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string,
  stream?: boolean
): Promise<string | AsyncIterable<string>> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required for Claude operations"
    );
  }
  try {
    const claudeMessages = messages.map((msg) => ({
      role:
        msg.role === "model" || msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    })) as Array<{ role: "user" | "assistant"; content: string }>;

    if (stream) {
      const response = anthropic.messages.stream({
        model: modelId,
        max_tokens: 16384,
        messages: claudeMessages,
        ...(systemPrompt && { system: systemPrompt }),
      });

      return (async function* () {
        try {
          for await (const chunk of response) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              yield chunk.delta.text;
            }
          }
        } catch (streamError) {
          logger.error(
            `Claude stream error (${modelId})`,
            streamError instanceof Error ? streamError : undefined
          );
          throw new ExternalServiceError(
            "Claude",
            `Streaming failed: ${streamError instanceof Error ? streamError.message : String(streamError)}`
          );
        }
      })();
    }

    const response = await withTimeout(
      anthropic.messages.create({
        model: modelId,
        max_tokens: 16384,
        messages: claudeMessages,
        ...(systemPrompt && { system: systemPrompt }),
      }),
      600000,
      `Claude generation (${modelId})`
    );

    const textContent = response.content.find((block) => block.type === "text");
    return textContent && "text" in textContent ? textContent.text : "";
  } catch (error) {
    logger.error(
      `Claude API error (${modelId})`,
      error instanceof Error ? error : undefined
    );
    if (error instanceof ExternalServiceError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("Invalid API Key")) {
      throw new ExternalServiceError(
        "Claude",
        "Invalid Anthropic API Key provided."
      );
    }
    throw new ExternalServiceError(
      "Claude",
      `Claude API request failed: ${errorMessage}`
    );
  }
}

// ==================== MAIN ORCHESTRATION FUNCTION ====================
export async function executeAITask(
  taskType: AITaskType,
  payload: {
    prompt?: string;
    messages?: Array<{ role: string; content: string }>;
    systemInstruction?: string;
    stream?: boolean;
    responseFormat?: { type: "json_object" };
    [key: string]: unknown;
  }
): Promise<string | AsyncIterable<string>> {
  const { modelId, provider, enableSearchTool } = routeTaskToModel(
    taskType,
    payload
  );

  try {
    let result: string | AsyncIterable<string>;

    switch (provider) {
      case "GOOGLE": {
        const prompt =
          payload.prompt ||
          payload.messages?.map((m) => m.content).join("\n") ||
          "";
        result = await callGemini(
          modelId,
          prompt,
          payload.systemInstruction,
          payload.stream,
          enableSearchTool,
          !!payload.responseFormat
        );
        break;
      }
      case "OPENAI": {
        const messages = payload.messages || [
          { role: "user", content: payload.prompt || "" },
        ];
        result = await callOpenAI(
          modelId,
          messages,
          payload.systemInstruction,
          payload.responseFormat,
          payload.stream
        );
        break;
      }
      case "ANTHROPIC": {
        const messages = payload.messages || [
          { role: "user", content: payload.prompt || "" },
        ];
        result = await callClaude(
          modelId,
          messages,
          payload.systemInstruction,
          payload.stream
        );
        break;
      }
      default:
        throw new Error(`Unknown provider: ${String(provider)}`);
    }

    if (typeof result === "string") {
      logger.info(`${provider} (${taskType}) completed successfully`, {
        responseLength: result.length,
      });
    } else {
      logger.info(`${provider} (${taskType}) streaming started successfully`);
    }
    return result;
  } catch (error) {
    logger.error(
      `Error executing task ${taskType} with ${provider}`,
      error instanceof Error ? error : undefined,
      { taskType, provider }
    );

    // Fallback mechanism - but disable search on fallback
    if (
      (provider !== "GOOGLE" || enableSearchTool) &&
      taskType !== AITaskType.AGENT_EXECUTE_STEP &&
      taskType !== AITaskType.AGENT_DEBUG_COMMAND
    ) {
      logger.info(
        `Attempting fallback to ${AI_MODELS.PRIMARY} (Google) WITHOUT search for ${taskType}`
      );
      try {
        const prompt =
          payload.prompt ||
          payload.messages?.map((m) => m.content).join("\n") ||
          "";
        const fallbackResult = await callGemini(
          AI_MODELS.PRIMARY,
          prompt,
          payload.systemInstruction,
          payload.stream,
          false, // No search on fallback
          !!payload.responseFormat
        );
        logger.info(`Fallback successful for ${taskType}`);
        return fallbackResult;
      } catch (fallbackError) {
        logger.error(
          `Fallback also failed for ${taskType}`,
          fallbackError instanceof Error ? fallbackError : undefined
        );
        throw fallbackError;
      }
    }
    throw error;
  }
}

// ==================== CONVENIENCE FUNCTIONS ====================
export async function executeAITaskStream(
  taskType: AITaskType,
  payload: {
    prompt?: string;
    messages?: Array<{ role: string; content: string }>;
    systemInstruction?: string;
    [key: string]: unknown;
  }
): Promise<AsyncIterable<string>> {
  const result = await executeAITask(taskType, { ...payload, stream: true });
  if (typeof result === "string") {
    logger.warn(
      `executeAITaskStream received string for task ${taskType}, converting to async iterable.`
    );
    return (async function* () {
      yield await Promise.resolve(result);
    })();
  }
  return result;
}

export async function executeAITaskSimple(
  taskType: AITaskType,
  payload: {
    prompt?: string;
    messages?: Array<{ role: string; content: string }>;
    systemInstruction?: string;
    responseFormat?: { type: "json_object" };
    [key: string]: unknown;
  }
): Promise<string> {
  const result = await executeAITask(taskType, { ...payload, stream: false });
  if (typeof result !== "string") {
    logger.error(
      `executeAITaskSimple received stream for task ${taskType}. Collecting...`
    );
    let collected = "";
    try {
      for await (const chunk of result) {
        collected += chunk;
      }
    } catch (streamError) {
      logger.error(
        `Error collecting stream in executeAITaskSimple for task ${taskType}`,
        streamError instanceof Error ? streamError : undefined
      );
      throw new Error(
        `Stream collection failed: ${streamError instanceof Error ? streamError.message : String(streamError)}`
      );
    }
    return collected;
  }
  return result;
}
