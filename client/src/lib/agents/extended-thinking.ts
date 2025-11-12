// lib/agents/extended-thinking.ts
/**
 * Extended Thinking Integration
 * Uses Claude's Extended Thinking feature to extract real AI reasoning
 */

import Anthropic from "@anthropic-ai/sdk";
import { ThoughtStream } from "./thought-stream";
import { logger } from "@/lib/logger";

interface ExtendedThinkingOptions {
  thoughts: ThoughtStream;
  prompt: string;
  thinkingBudget?: number;
  parseSteps?: boolean; // If true, break down reasoning into steps
}

interface ExtendedThinkingResult {
  thinking: string; // Raw AI reasoning
  answer: string; // Final answer
  thinkingTokens: number;
  outputTokens: number;
}

/**
 * Execute AI call with Extended Thinking enabled
 * Returns both the AI's internal reasoning AND the final answer
 */
export async function executeWithExtendedThinking(
  options: ExtendedThinkingOptions
): Promise<ExtendedThinkingResult> {
  const {
    thoughts,
    prompt,
    thinkingBudget = 8000,
    parseSteps = true,
  } = options;

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 30 * 60 * 1000,
    maxRetries: 2,
  });

  try {
    await thoughts.thinking(
      "Engaging extended thinking mode for deeper analysis"
    );

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      thinking: {
        type: "enabled",
        budget_tokens: thinkingBudget,
      },
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Extract thinking and answer content
    let thinkingContent = "";
    let answerContent = "";

    for (const block of response.content) {
      if (block.type === "thinking") {
        thinkingContent = block.thinking;
      } else if (block.type === "text") {
        answerContent = block.text;
      }
    }

    logger.info(
      `[ExtendedThinking] Extracted ${thinkingContent.length} chars of reasoning`
    );

    // Parse and emit thinking steps if enabled
    if (thinkingContent && parseSteps) {
      await parseAndEmitThinkingSteps(thinkingContent, thoughts);
    } else if (thinkingContent) {
      // Emit as single deep reasoning block
      await thoughts.emitDeepReasoning(
        thinkingContent,
        "Claude's Internal Reasoning"
      );
    }

    return {
      thinking: thinkingContent,
      answer: answerContent,
      thinkingTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (error) {
    await thoughts.error("Failed to execute extended thinking", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Parse AI's thinking content and emit as individual thoughts
 * Breaks down raw reasoning into discrete steps
 */
async function parseAndEmitThinkingSteps(
  thinkingContent: string,
  thoughts: ThoughtStream
): Promise<void> {
  // Split by paragraphs or reasoning markers
  const steps = thinkingContent
    .split(/\n\n+/)
    .filter((step) => step.trim().length > 10)
    .map((step) => step.trim());

  logger.info(`[ExtendedThinking] Parsed ${steps.length} reasoning steps`);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const type = classifyThinkingStep(step);

    // Create curated message from raw reasoning
    const curatedMessage = summarizeStep(step);

    // Emit both curated and raw
    await thoughts.emitBoth(type, curatedMessage, step);

    // Small delay to show progression
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

/**
 * Classify a thinking step into a thought type
 */
function classifyThinkingStep(
  step: string
): "thinking" | "analyzing" | "deciding" | "executing" {
  const lower = step.toLowerCase();

  // Pattern matching for different reasoning types
  if (
    lower.includes("let me think") ||
    lower.includes("consider") ||
    lower.includes("hmm") ||
    lower.includes("pondering") ||
    lower.includes("reflect")
  ) {
    return "thinking";
  }

  if (
    lower.includes("analyz") ||
    lower.includes("look at") ||
    lower.includes("examin") ||
    lower.includes("review") ||
    lower.includes("evaluat")
  ) {
    return "analyzing";
  }

  if (
    lower.includes("decid") ||
    lower.includes("choos") ||
    lower.includes("select") ||
    lower.includes("determin") ||
    lower.includes("conclud") ||
    lower.includes("should") ||
    lower.includes("will go with") ||
    lower.includes("best option")
  ) {
    return "deciding";
  }

  if (
    lower.includes("implement") ||
    lower.includes("creat") ||
    lower.includes("build") ||
    lower.includes("develop")
  ) {
    return "executing";
  }

  return "thinking";
}

/**
 * Summarize a raw thinking step into a user-friendly message
 */
function summarizeStep(step: string): string {
  // Take first sentence or first ~100 chars
  const firstSentence = step.match(/^[^.!?]+[.!?]/)?.[0];

  if (firstSentence && firstSentence.length < 150) {
    return firstSentence.trim();
  }

  // Fallback: truncate to 120 chars
  const truncated = step.substring(0, 120).trim();
  return truncated + (step.length > 120 ? "..." : "");
}

/**
 * ✅ Chain-of-Thought wrapper (forces AI to reason step-by-step)
 */
export function buildChainOfThoughtPrompt(
  basePrompt: string,
  domain: string = "software planning"
): string {
  return `You are an expert in ${domain}. Think through this problem step-by-step.

For each step of your reasoning, use these prefixes:
- [ANALYZING]: When examining data or requirements
- [CONSIDERING]: When weighing different options
- [DECIDING]: When making a choice
- [PLANNING]: When outlining next steps

Show your complete reasoning process before providing the final answer.

${basePrompt}

Think step-by-step:`;
}

/**
 * Parse chain-of-thought response and emit thoughts
 */
export async function parseChainOfThought(
  response: string,
  thoughts: ThoughtStream
): Promise<string> {
  const lines = response.split("\n");
  let finalAnswer = "";
  let currentReasoning = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("[ANALYZING]")) {
      const message = trimmed.replace("[ANALYZING]", "").trim();
      await thoughts.analyzing(message);
      currentReasoning += message + "\n";
    } else if (trimmed.startsWith("[CONSIDERING]")) {
      const message = trimmed.replace("[CONSIDERING]", "").trim();
      await thoughts.thinking(message);
      currentReasoning += message + "\n";
    } else if (trimmed.startsWith("[DECIDING]")) {
      const message = trimmed.replace("[DECIDING]", "").trim();
      await thoughts.deciding(message);
      currentReasoning += message + "\n";
    } else if (trimmed.startsWith("[PLANNING]")) {
      const message = trimmed.replace("[PLANNING]", "").trim();
      await thoughts.executing(message);
      currentReasoning += message + "\n";
    } else if (trimmed.length > 0) {
      finalAnswer += trimmed + "\n";
    }
  }

  // Emit raw reasoning as deep dive
  if (currentReasoning) {
    await thoughts.emitDeepReasoning(
      currentReasoning,
      "Chain of Thought Reasoning"
    );
  }

  return finalAnswer.trim();
}
