// src/lib/ai-orchestrator.ts
/**
 * Centralized AI Orchestration Service
 * Routes AI tasks to the most appropriate model based on task type and requirements.
 */

import {
  GoogleGenerativeAI,
  FunctionCallingMode,
  type ModelParams,
} from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { AI_MODELS } from "./models";
import { ExternalServiceError, withTimeout } from "./api-error";
import { logger } from "./logger";

// ==================== TASK TYPE DEFINITIONS ====================

/**
 * Enum defining all distinct AI task types in the application
 */
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

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build",
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ==================== ROUTING LOGIC ====================

/**
 * Routes a task to the appropriate AI model based on task type
 */
function routeTaskToModel(
  taskType: AITaskType,
  payload?: unknown
): {
  modelId: string;
  provider: AIProvider;
  enableSearchTool?: boolean;
} {
  switch (taskType) {
    case AITaskType.BLUEPRINT_GENERATION:
      console.log(
        `🎯 Routing ${taskType} to ${AI_MODELS.PRIMARY} (Gemini 2.5 Pro - complex generation)`
      );
      return { modelId: AI_MODELS.PRIMARY, provider: "GOOGLE" };

    case AITaskType.TITLE_GENERATION:
      console.log(
        `🎯 Routing ${taskType} to ${AI_MODELS.FAST} (Gemini Flash - speed)`
      );
      return { modelId: AI_MODELS.FAST, provider: "GOOGLE" };

    case AITaskType.AGENT_PLANNING:
      console.log(`🎯 Routing ${taskType} to ${AI_MODELS.PRIMARY}`);
      return { modelId: AI_MODELS.PRIMARY, provider: "GOOGLE" };

    case AITaskType.AGENT_EXECUTE_STEP:
      console.log(`🎯 Routing ${taskType} to ${AI_MODELS.CLAUDE}`);
      return { modelId: AI_MODELS.CLAUDE, provider: "ANTHROPIC" };

    case AITaskType.AGENT_DEBUG_COMMAND:
      console.log(`🎯 Routing ${taskType} to ${AI_MODELS.OPENAI}`);
      return { modelId: AI_MODELS.OPENAI, provider: "OPENAI" };

    // --- NEW CASE for Guidance ---
    case AITaskType.GET_API_KEY_GUIDANCE:
      logger.debug(
        `🎯 Routing ${taskType} to ${AI_MODELS.PRIMARY} (Google) with Search Tool`
      );
      // Route to a Gemini model that supports Function Calling/Tools
      return {
        modelId: AI_MODELS.PRIMARY, // Use Pro for reliable tool use
        provider: "GOOGLE",
        enableSearchTool: true, // Signal that the search tool should be enabled
      };

    case AITaskType.LANDING_PAGE_COPY:
    case AITaskType.SURVEY_QUESTION_GENERATION:
    case AITaskType.PRICING_TIER_GENERATION:
      console.log(
        `🎯 Routing ${taskType} to ${AI_MODELS.FAST} (Gemini Flash - speed/efficiency for structured output)`
      );
      return { modelId: AI_MODELS.FAST, provider: "GOOGLE" };

    case AITaskType.COFOUNDER_CHAT_RESPONSE:
      console.log(
        `🎯 Routing ${taskType} to ${AI_MODELS.CLAUDE} (Sonnet - nuance, safety, better chat)`
      );
      return { modelId: AI_MODELS.CLAUDE, provider: "ANTHROPIC" };

    case AITaskType.BLUEPRINT_PARSING:
      // Strong reasoning/JSON handling - use OpenAI
      console.log(
        `🎯 Routing ${taskType} to ${AI_MODELS.OPENAI} (GPT-4o - strong reasoning/JSON handling)`
      );
      return { modelId: AI_MODELS.OPENAI, provider: "OPENAI" };

    case AITaskType.SPRINT_TASK_ASSISTANCE: {
      // Check if the task is code-related based on payload
      const taskPayload = payload as
        | { taskType?: string; description?: string }
        | undefined;
      const description = taskPayload?.description?.toLowerCase() || "";
      const codeKeywords = [
        "code",
        "script",
        "function",
        "html",
        "css",
        "javascript",
        "react",
        "component",
        "python",
        "api",
      ];

      if (codeKeywords.some((keyword) => description.includes(keyword))) {
        console.log(
          `🎯 Routing ${taskType} (code-related) to ${AI_MODELS.OPENAI} (GPT-4o - coding abilities)`
        );
        return { modelId: AI_MODELS.OPENAI, provider: "OPENAI" };
      }

      console.log(
        `🎯 Routing ${taskType} (general) to ${AI_MODELS.CLAUDE} (Sonnet - general tasks)`
      );
      return { modelId: AI_MODELS.CLAUDE, provider: "ANTHROPIC" };
    }

    case AITaskType.CODE_GENERATION_MVP:
      console.log(
        `🎯 Routing ${taskType} to ${AI_MODELS.OPENAI} (GPT-4o - strong coding abilities)`
      );
      return { modelId: AI_MODELS.OPENAI, provider: "OPENAI" };

    default: {
      const _exhaustiveCheck: never = taskType;
      console.log(
        `⚠️ Unknown task type ${String(_exhaustiveCheck)}, defaulting to ${AI_MODELS.PRIMARY}`
      );
      return { modelId: AI_MODELS.PRIMARY, provider: "GOOGLE" };
    }
  }
}

// ==================== PROVIDER HELPER FUNCTIONS ====================

/**
 * Call Google Generative AI (Gemini) - UPDATED FOR TOOL USE
 */
async function callGemini(
  modelId: string,
  prompt: string,
  systemInstruction?: string,
  stream?: boolean, // Stream not typically used with tool calls
  enableSearchTool?: boolean // NEW parameter
): Promise<string> {
  // Removed stream return type for simplicity with tool calls
  if (stream && enableSearchTool) {
    logger.warn(
      "Streaming is not directly supported with tool calls in this implementation. Returning non-streamed result."
    );
  }
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    throw new Error(
      "Google API Key (GEMINI_API_KEY or GOOGLE_API_KEY) is missing."
    );
  }

  try {
    const modelConfig: ModelParams = {
      model: modelId,
      ...(systemInstruction && { systemInstruction }),
    };

    // --- Configure Tools ---
    if (enableSearchTool) {
      modelConfig.tools = [{ googleSearchRetrieval: {} }]; // Use Google Search tool
      // Mode 'AUTO' lets the model decide when to use the tool based on the prompt.
      modelConfig.toolConfig = {
        functionCallingConfig: { mode: FunctionCallingMode.AUTO },
      };
      logger.info(
        `[callGemini] Enabling Google Search tool for model ${modelId}.`
      );
    }

    const model = genAI.getGenerativeModel(modelConfig);

    // --- Generate Content ---
    // Tool calls require generateContent, not generateContentStream usually
    const result = await withTimeout(
      model.generateContent(prompt),
      90000, // Slightly longer timeout for potential tool calls
      `Gemini generation (${modelId}) ${enableSearchTool ? "with Search" : ""}`
    );

    const response = result.response;
    const responseText = response.text(); // Get the final text response after tool execution

    if (!responseText) {
      // Log function calls if needed for debugging, but don't return them
      const functionCalls = response.functionCalls();
      if (functionCalls && functionCalls.length > 0) {
        logger.warn(
          `[callGemini] Model returned function calls but no final text response for prompt related to "${prompt.substring(0, 50)}..."`
        );
        // You might want more sophisticated handling if the tool call itself is the desired output
        return "The AI needed to search but didn't provide a final answer.";
      }
      logger.warn(
        `[callGemini] Model returned an empty text response for prompt related to "${prompt.substring(0, 50)}..."`
      );
      return ""; // Return empty string if no text
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
    // Check for specific API key errors if possible
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("API key not valid")) {
      throw new ExternalServiceError(
        "Google",
        "Invalid Google API Key provided."
      ); // Use default status
    }
    throw new ExternalServiceError("Google", errorMessage);
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string,
  responseFormat?: { type: "json_object" },
  stream?: boolean
): Promise<string | AsyncIterable<string>> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY environment variable is required for OpenAI operations"
    );
  }

  try {
    const messageArray = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;

    if (stream) {
      // ... (streaming logic remains the same) ...
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
    throw new ExternalServiceError("OpenAI", errorMessage);
  }
}

/**
 * Call Anthropic Claude API
 */
async function callClaude(
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string,
  stream?: boolean
): Promise<string | AsyncIterable<string>> {
  if (!process.env.ANTHROPIC_API_KEY) {
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
      // ... (streaming logic remains the same) ...
      const response = anthropic.messages.stream({
        model: modelId,
        max_tokens: 8192, // Consider adjusting based on task
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
        max_tokens: 8192, // Consider adjusting
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
    throw new ExternalServiceError("Claude", errorMessage);
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
    [key: string]: unknown; // Allow extra properties if needed by specific callers
  }
): Promise<string | AsyncIterable<string>> {
  // Return type might simplify if guidance doesn't stream

  // Destructure enableSearchTool from routing result
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
        // Pass enableSearchTool flag to callGemini
        // Note: callGemini now only returns string when tools are potentially involved
        result = await callGemini(
          modelId,
          prompt,
          payload.systemInstruction,
          payload.stream, // Pass stream flag but callGemini might ignore it if tool enabled
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
      default: {
        const _exhaustiveCheck: never = provider;
        throw new Error(`Unknown provider: ${String(_exhaustiveCheck)}`);
      }
    }

    // Logging remains the same
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

    // Fallback mechanism remains the same (Optional: disable fallback for guidance task?)
    if (provider !== "GOOGLE") {
      // ... (Fallback logic - unchanged) ...
      logger.info(
        `Attempting fallback to ${AI_MODELS.PRIMARY} (Google) for ${taskType}`
      );
      try {
        const prompt =
          payload.prompt ||
          payload.messages?.map((m) => m.content).join("\n") ||
          "";
        // Fallback won't use search tool unless explicitly configured
        const fallbackResult = await callGemini(
          AI_MODELS.PRIMARY,
          prompt,
          payload.systemInstruction,
          payload.stream,
          false // Explicitly disable search for basic fallback
        );
        logger.info(`Fallback successful for ${taskType}`);
        return fallbackResult;
      } catch (fallbackError) {
        logger.error(
          `Fallback also failed for ${taskType}`,
          fallbackError instanceof Error ? fallbackError : undefined
        );
        throw fallbackError; // Re-throw the fallback error
      }
    }
    throw error; // Re-throw original error if initial provider was Google or fallback failed
  }
}

// ==================== CONVENIENCE FUNCTIONS ====================
// --- executeAITaskStream and executeAITaskSimple remain unchanged ---
// Note: executeAITaskSimple will now correctly receive string from callGemini even with tools

/**
 * Execute a task that requires streaming response
 */
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
    // This might happen if callGemini ignored streaming due to tool use
    logger.warn(
      `executeAITaskStream received string for task ${taskType}, potentially due to tool use. Returning as single-item async iterable.`
    );
    // Convert string to an async iterable yielding a single chunk
    return (async function* () {
      // Ensure at least one await to satisfy async generator requirements
      await Promise.resolve();
      yield result;
    })();
  }
  return result;
}

/**
 * Execute a task that expects a simple string response
 */
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
    // This case should be less likely now, maybe only if streaming errors occur?
    logger.error(
      `executeAITaskSimple received stream for task ${taskType}. Attempting to collect.`
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
        `Stream collection failed in simple task execution: ${streamError instanceof Error ? streamError.message : String(streamError)}`
      );
    }
    return collected;
  }
  return result;
}
