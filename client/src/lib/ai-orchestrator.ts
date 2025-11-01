// src/lib/ai-orchestrator.ts

// *** FIX: Import from the new '@google/genai' package ***
import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  Tool,
} from "@google/genai";
// ******************************************************
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
  CODE_GENERATION_MVP = "CODE_GENERATION_MVP",
  AGENT_PLANNING = "AGENT_PLANNING",
  AGENT_EXECUTE_STEP = "AGENT_EXECUTE_STEP",
  AGENT_DEBUG_COMMAND = "AGENT_DEBUG_COMMAND",
  GET_API_KEY_GUIDANCE = "GET_API_KEY_GUIDANCE",
}

// ==================== PROVIDER TYPE ====================
type AIProvider = "GOOGLE" | "OPENAI" | "ANTHROPIC";

// ==================== CLIENT INITIALIZATION ====================
// The new SDK uses 'new GoogleGenAI()'
const genAI = new GoogleGenAI({
  apiKey: env.GOOGLE_API_KEY || ""
});
const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY || "dummy-key-for-build",
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
    case AITaskType.AGENT_PLANNING:
      logger.debug(`🎯 Routing ${taskType} to ${AI_MODELS.PRIMARY} (Google)`);
      return { modelId: AI_MODELS.PRIMARY, provider: "GOOGLE" };

    case AITaskType.TITLE_GENERATION:
    case AITaskType.LANDING_PAGE_COPY:
    case AITaskType.SURVEY_QUESTION_GENERATION:
    case AITaskType.PRICING_TIER_GENERATION:
      logger.debug(`🎯 Routing ${taskType} to ${AI_MODELS.FAST} (Google)`);
      return { modelId: AI_MODELS.FAST, provider: "GOOGLE" };

    case AITaskType.COFOUNDER_CHAT_RESPONSE:
    case AITaskType.AGENT_EXECUTE_STEP:
      logger.debug(`🎯 Routing ${taskType} to ${AI_MODELS.CLAUDE} (Anthropic)`);
      return { modelId: AI_MODELS.CLAUDE, provider: "ANTHROPIC" };

    case AITaskType.BLUEPRINT_PARSING:
    case AITaskType.CODE_GENERATION_MVP:
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

async function callGemini(
  modelId: string,
  prompt: string,
  systemInstruction?: string,
  stream?: boolean,
  enableSearchTool?: boolean
): Promise<string> {
  if (stream && enableSearchTool) {
    logger.warn(
      "[callGemini] Streaming is not supported with tool calls. Returning non-streamed result."
    );
  }
  if (!env.GOOGLE_API_KEY) {
    throw new Error(
      "Google API Key (GEMINI_API_KEY or GOOGLE_API_KEY) is missing."
    );
  }

  try {
    const modelConfig: {
      model: string;
      systemInstruction?: string;
      tools?: Tool[]; // <-- This type is now correctly imported
      toolConfig?: { functionCallingConfig: { mode: FunctionCallingConfigMode } };
    } = {
      model: modelId,
      ...(systemInstruction && { systemInstruction }),
    };

    if (enableSearchTool) {
      // The tool is an object literal conforming to the Tool type
      modelConfig.tools = [{ googleSearch: {} }];
      modelConfig.toolConfig = {
        functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
      };
      logger.info(
        `[callGemini] Enabling Google Search tool for model ${modelId}.`
      );
    }

    const result = await withTimeout(
      genAI.models.generateContent({
        model: modelConfig.model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        ...(modelConfig.systemInstruction && { systemInstruction: modelConfig.systemInstruction }),
        ...(modelConfig.tools && { tools: modelConfig.tools }),
        ...(modelConfig.toolConfig && { toolConfig: modelConfig.toolConfig }),
      }),
      90000,
      `Gemini generation (${modelId}) ${enableSearchTool ? "with Search" : ""}`
    );

    const responseText = result.text;

    if (!responseText) {
      const functionCalls = result.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        logger.warn(
          `[callGemini] Model returned function calls but no final text response.`
        );
        return "The AI needed to search but didn't provide a final answer.";
      }
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
    if (errorMessage.includes("API key not valid")) {
      throw new ExternalServiceError(
        "Google",
        "Invalid Google API Key provided."
      );
    }
    if (errorMessage.includes("400 Bad Request")) {
      throw new ExternalServiceError("Google", errorMessage);
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
      60000,
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
        max_tokens: 8192,
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
        max_tokens: 8192,
        messages: claudeMessages,
        ...(systemPrompt && { system: systemPrompt }),
      }),
      60000,
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
          enableSearchTool
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

    // Fallback mechanism
    if (provider !== "GOOGLE") {
      logger.info(
        `Attempting fallback to ${AI_MODELS.PRIMARY} (Google) for ${taskType}`
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
          false
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
