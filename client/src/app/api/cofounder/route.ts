//src/app/api/cofounder/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

import { searchMemory, saveMemory } from "@/lib/ai-memory"; // Import both memory functions
import {
  getLandingPageAnalyticsSummary,
  getSprintProgressSummary,
  getBlueprintSummary,
  getValidationHubSummary,
  getSprintTasksDetails,
  getUserAchievements,
} from "@/lib/cofounder-helpers";
import { z } from "zod";
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";
import {
  checkRateLimit,
  RATE_LIMITS,
  getRequestIdentifier,
  getClientIp,
} from "@/lib/rate-limit";

// --- Input Validation ---
const cofounderRequestSchema = z.object({
  message: z.string().min(1, "Message cannot be empty."),
  conversationId: z.string().cuid("Invalid Conversation ID."),
});

// --- Cofounder System Prompt ---
// This defines the AI's personality and goals
const COFOUNDER_SYSTEM_PROMPT = `
You are the NeuraLaunch AI Cofounder. You are a persistent, conversational AI agent acting as a strategic partner for the user throughout their startup journey.

Your Core Identity:
- You are **NOT** just a chatbot. You maintain the full context of the user's project.
- You are a blend of YC partner, lean startup expert, and execution strategist.
- Your goal is to help the user validate their startup idea rigorously and efficiently.

Your Capabilities:
- **Full Context Awareness:** You have access to the complete project data:
  * The original startup blueprint/idea generated
  * Validation scores (Market Demand, Problem Validation, Execution scores)
  * Landing page analytics (views, signups, conversion rates, feedback, smoke tests)
  * 72-hour sprint progress and detailed task list
  * User achievements and milestones
  * Relevant past memories from conversations (RAG)
- **Devil's Advocate:** Challenge the user's assumptions with data and logic. Ask clarifying questions. Don't just agree.
- **Data-Driven Insights:** Reference specific metrics when giving advice (e.g., "Your 5% conversion rate suggests...")
- **Skill Gap Filler:** Offer to help with tasks the user struggles with (e.g., writing copy, analyzing data).
- **Accountability Partner:** Gently keep the user focused on their validation goals.

Interaction Rules:
- **Use the Provided Context:** Always integrate ALL the context provided (blueprint, scores, analytics, tasks, memories) into your response. Reference specific data points.
- **Be Action-Oriented:** End your responses with a clear next step or a probing question.
- **Maintain Context:** Remember this is an ongoing conversation within a specific startup project.
- **Connect the Dots:** Help users see patterns across their data (e.g., low conversion + no customer interviews = need more validation)
- **Tone:** Be direct, insightful, strategic, and supportive but firm ("tough love"). Avoid being overly enthusiastic or generic.

DO NOT:
- Forget past context provided.
- Give generic, non-actionable advice.
- Act like a simple question-answering bot.

Begin your response directly. Do not include pleasantries like "Hello!" or "How can I help?". Get straight to the strategic point.
`;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const userId = session.user.id;

    // Rate limiting
    const clientIp = getClientIp(req.headers);
    const rateLimitId = getRequestIdentifier(userId, clientIp);
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMITS.AI_GENERATION,
      identifier: rateLimitId,
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: `Too many requests. Please try again in ${rateLimitResult.retryAfter} seconds.`,
          retryAfter: rateLimitResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimitResult.retryAfter?.toString() || "60",
            "X-RateLimit-Limit": RATE_LIMITS.AI_GENERATION.maxRequests.toString(),
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Reset": new Date(rateLimitResult.resetAt).toISOString(),
          },
        }
      );
    }

    const body: unknown = await req.json();

    // 1. Validate Input
    const validation = cofounderRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: validation.error.format() },
        { status: 400 }
      );
    }
    const { message: userMessage, conversationId } = validation.data;

    // --- RAG Step 1: Retrieve Relevant Memories ---
    console.log(`🤖 Cofounder searching memory for query: "${userMessage}"`);
    const relevantMemories = await searchMemory({
      query: userMessage,
      conversationId,
      userId,
      limit: 5, // Retrieve top 5 relevant memories
    });

    // --- RAG Step 2: Augment the Prompt ---
    let vectorContext = "No relevant memories found.";
    if (relevantMemories.length > 0) {
      vectorContext = `
Relevant Context from Past Memories:
---
${relevantMemories.join("\n---\n")}
---
      `;
    }

    // --- RAG Step 2: Retrieve Structured Data (ENHANCED) ---
    let structuredDataContext = "";
    const lowerCaseMessage = userMessage.toLowerCase();

    // Always include blueprint summary for full context
    const blueprintSummary = await getBlueprintSummary(conversationId);
    if (blueprintSummary) {
      structuredDataContext += `\n\n${blueprintSummary}`;
    }

    // Check for validation/score keywords
    // Note: All patterns test against lowerCaseMessage (already converted to lowercase)
    // so case-insensitive flags are not needed
    if (
      /\b(validation|score|rating|progress|metric|performance)\b/.test(lowerCaseMessage) ||
      /how\s+am\s+i\s+doing/.test(lowerCaseMessage)
    ) {
      const validationSummary = await getValidationHubSummary(conversationId);
      if (validationSummary) {
        structuredDataContext += `\n\n${validationSummary}`;
      }
    }

    // Check for analytics keywords
    if (
      /\b(analytics|stats|views|signups|conversion|landing page|traffic|visitors)\b/.test(
        lowerCaseMessage
      )
    ) {
      const analyticsSummary =
        await getLandingPageAnalyticsSummary(conversationId);
      if (analyticsSummary) {
        structuredDataContext += `\n\n${analyticsSummary}`;
      }
    }

    // Check for sprint keywords
    if (
      /\b(sprint|tasks|progress|checklist|72-hour|execution|todo|what should i do)\b/.test(
        lowerCaseMessage
      )
    ) {
      const sprintSummary = await getSprintProgressSummary(conversationId);
      if (sprintSummary) {
        structuredDataContext += `\n\n${sprintSummary}`;
      }
      
      // Also include detailed task list if asking about tasks
      if (/\b(tasks|checklist|todo|what should i do)\b/.test(lowerCaseMessage)) {
        const taskDetails = await getSprintTasksDetails(conversationId);
        if (taskDetails) {
          structuredDataContext += `\n\n${taskDetails}`;
        }
      }
    }

    // Check for achievement keywords
    if (
      /\b(achievement|milestone|accomplishment|progress|unlock|badge|trophy)\b/.test(
        lowerCaseMessage
      )
    ) {
      const achievements = await getUserAchievements(conversationId, userId);
      if (achievements) {
        structuredDataContext += `\n\n${achievements}`;
      }
    }
    // --- RAG Step 3: Augment the Prompt ---
    // Combine vector context and structured data context
    const fullContext = vectorContext + structuredDataContext;
    const fullPrompt = `${fullContext}\n\nUser's Current Message: "${userMessage}"`;

    // --- Call the Main AI Model using orchestrator ---
    console.log(`🚀 Calling AI orchestrator for Cofounder response...`);
    const cofounderResponse = await executeAITaskSimple(
      AITaskType.COFOUNDER_CHAT_RESPONSE,
      {
        prompt: fullPrompt,
        systemInstruction: COFOUNDER_SYSTEM_PROMPT,
      }
    );

    // --- Save Messages to Database ---
    // Save both user message and cofounder response to the database
    await prisma.cofounderMessage.createMany({
      data: [
        {
          content: userMessage,
          role: "user",
          conversationId,
        },
        {
          content: cofounderResponse,
          role: "cofounder",
          conversationId,
        },
      ],
    });

    // --- Save Interaction to Memory ---
    // Save both the user's message and the AI's response as new memories
    // Run these without 'await' so they don't block the response
    void saveMemory({
      content: `User asked Cofounder: "${userMessage}"`,
      conversationId,
      userId,
    });
    void saveMemory({
      content: `Cofounder responded: "${cofounderResponse}"`,
      conversationId,
      userId,
    });

    // --- Return the Cofounder's Response ---
    return NextResponse.json({ response: cofounderResponse });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ [COFOUNDER_API_ERROR]", message);
    // Return a user-friendly error
    return NextResponse.json(
      { error: `Cofounder encountered an error: ${message}` },
      { status: 500 }
    );
  }
}
