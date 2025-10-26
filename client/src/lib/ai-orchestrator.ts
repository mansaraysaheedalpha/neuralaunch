// src/lib/ai-orchestrator.ts
/**
 * Centralized AI Orchestration Service
 * Routes AI tasks to the most appropriate model based on task type and requirements.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { AI_MODELS } from "./models";

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
}

// ==================== PROVIDER TYPE ====================

type AIProvider = "GOOGLE" | "OPENAI" | "ANTHROPIC";

// ==================== CLIENT INITIALIZATION ====================

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ==================== ROUTING LOGIC ====================

/**
 * Routes a task to the appropriate AI model based on task type
 */
function routeTaskToModel(taskType: AITaskType, payload?: unknown): {
  modelId: string;
  provider: AIProvider;
} {
  switch (taskType) {
    case AITaskType.BLUEPRINT_GENERATION:
      console.log(`🎯 Routing ${taskType} to ${AI_MODELS.PRIMARY} (Gemini 2.5 Pro - complex generation)`);
      return { modelId: AI_MODELS.PRIMARY, provider: "GOOGLE" };

    case AITaskType.TITLE_GENERATION:
      console.log(`🎯 Routing ${taskType} to ${AI_MODELS.FAST} (Gemini Flash - speed)`);
      return { modelId: AI_MODELS.FAST, provider: "GOOGLE" };

    case AITaskType.LANDING_PAGE_COPY:
    case AITaskType.SURVEY_QUESTION_GENERATION:
    case AITaskType.PRICING_TIER_GENERATION:
      console.log(`🎯 Routing ${taskType} to ${AI_MODELS.FAST} (Gemini Flash - speed/efficiency for structured output)`);
      return { modelId: AI_MODELS.FAST, provider: "GOOGLE" };

    case AITaskType.COFOUNDER_CHAT_RESPONSE:
      console.log(`🎯 Routing ${taskType} to ${AI_MODELS.CLAUDE} (Sonnet - nuance, safety, better chat)`);
      return { modelId: AI_MODELS.CLAUDE, provider: "ANTHROPIC" };

    case AITaskType.BLUEPRINT_PARSING:
      // Strong reasoning/JSON handling - use OpenAI
      console.log(`🎯 Routing ${taskType} to ${AI_MODELS.OPENAI} (GPT-4o - strong reasoning/JSON handling)`);
      return { modelId: AI_MODELS.OPENAI, provider: "OPENAI" };

    case AITaskType.SPRINT_TASK_ASSISTANCE: {
      // Check if the task is code-related based on payload
      const taskPayload = payload as { taskType?: string; description?: string } | undefined;
      const description = taskPayload?.description?.toLowerCase() || "";
      const codeKeywords = ["code", "script", "function", "html", "css", "javascript", "react", "component", "python", "api"];
      
      if (codeKeywords.some((keyword) => description.includes(keyword))) {
        console.log(`🎯 Routing ${taskType} (code-related) to ${AI_MODELS.OPENAI} (GPT-4o - coding abilities)`);
        return { modelId: AI_MODELS.OPENAI, provider: "OPENAI" };
      }
      
      console.log(`🎯 Routing ${taskType} (general) to ${AI_MODELS.CLAUDE} (Sonnet - general tasks)`);
      return { modelId: AI_MODELS.CLAUDE, provider: "ANTHROPIC" };
    }

    case AITaskType.CODE_GENERATION_MVP:
      console.log(`🎯 Routing ${taskType} to ${AI_MODELS.OPENAI} (GPT-4o - strong coding abilities)`);
      return { modelId: AI_MODELS.OPENAI, provider: "OPENAI" };

    default:
      console.log(`⚠️ Unknown task type ${taskType}, defaulting to ${AI_MODELS.PRIMARY}`);
      return { modelId: AI_MODELS.PRIMARY, provider: "GOOGLE" };
  }
}

// ==================== PROVIDER HELPER FUNCTIONS ====================

/**
 * Call Google Generative AI (Gemini)
 */
async function callGemini(
  modelId: string,
  prompt: string,
  systemInstruction?: string,
  stream?: boolean
): Promise<string | AsyncIterable<string>> {
  try {
    const model = genAI.getGenerativeModel({
      model: modelId,
      ...(systemInstruction && { systemInstruction }),
    });

    if (stream) {
      const result = await model.generateContentStream(prompt);
      return (async function* () {
        for await (const chunk of result.stream) {
          yield chunk.text();
        }
      })();
    }

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error(`❌ Gemini API error (${modelId}):`, error);
    throw error;
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
  try {
    const messageArray = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;

    if (stream) {
      const completion = await openai.chat.completions.create({
        model: modelId,
        messages: messageArray as OpenAI.Chat.ChatCompletionMessageParam[],
        stream: true,
      });
      
      return (async function* () {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            yield content;
          }
        }
      })();
    }

    const completion = await openai.chat.completions.create({
      model: modelId,
      messages: messageArray as OpenAI.Chat.ChatCompletionMessageParam[],
      ...(responseFormat && { response_format: { type: "json_object" as const } }),
    });

    return completion.choices[0]?.message?.content || "";
  } catch (error) {
    console.error(`❌ OpenAI API error (${modelId}):`, error);
    throw error;
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
  try {
    // Claude expects messages without system role in the messages array
    const claudeMessages = messages.map((msg) => ({
      role: msg.role === "model" || msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    })) as Array<{ role: "user" | "assistant"; content: string }>;

    if (stream) {
      const response = await anthropic.messages.stream({
        model: modelId,
        max_tokens: 8192,
        messages: claudeMessages,
        ...(systemPrompt && { system: systemPrompt }),
      });

      return (async function* () {
        for await (const chunk of response) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            yield chunk.delta.text;
          }
        }
      })();
    }

    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 8192,
      messages: claudeMessages,
      ...(systemPrompt && { system: systemPrompt }),
    });

    // Extract text content from the response
    const textContent = response.content.find((block) => block.type === "text");
    return textContent && "text" in textContent ? textContent.text : "";
  } catch (error) {
    console.error(`❌ Claude API error (${modelId}):`, error);
    throw error;
  }
}

// ==================== MAIN ORCHESTRATION FUNCTION ====================

/**
 * Main function to execute an AI task
 * Routes the task to the appropriate model and handles the API call
 */
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
  const { modelId, provider } = routeTaskToModel(taskType, payload);

  try {
    let result: string | AsyncIterable<string>;

    switch (provider) {
      case "GOOGLE": {
        const prompt = payload.prompt || payload.messages?.map((m) => m.content).join("\n") || "";
        result = await callGemini(modelId, prompt, payload.systemInstruction, payload.stream);
        break;
      }

      case "OPENAI": {
        const messages = payload.messages || [{ role: "user", content: payload.prompt || "" }];
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
        const messages = payload.messages || [{ role: "user", content: payload.prompt || "" }];
        result = await callClaude(modelId, messages, payload.systemInstruction, payload.stream);
        break;
      }

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    if (typeof result === "string") {
      console.log(`✅ ${provider} (${taskType}) completed successfully. Response length: ${result.length}`);
    } else {
      console.log(`✅ ${provider} (${taskType}) streaming started successfully.`);
    }

    return result;
  } catch (error) {
    console.error(`❌ Error executing task ${taskType} with ${provider}:`, error);

    // Implement fallback mechanism
    if (provider !== "GOOGLE") {
      console.log(`🔄 Attempting fallback to ${AI_MODELS.PRIMARY} (Gemini)`);
      try {
        const prompt = payload.prompt || payload.messages?.map((m) => m.content).join("\n") || "";
        const fallbackResult = await callGemini(AI_MODELS.PRIMARY, prompt, payload.systemInstruction, payload.stream);
        console.log(`✅ Fallback successful for ${taskType}`);
        return fallbackResult;
      } catch (fallbackError) {
        console.error(`❌ Fallback also failed for ${taskType}:`, fallbackError);
        throw fallbackError;
      }
    }

    throw error;
  }
}

// ==================== CONVENIENCE FUNCTIONS ====================

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
    throw new Error("Expected streaming response but got string");
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
    throw new Error("Expected string response but got stream");
  }
  return result;
}
