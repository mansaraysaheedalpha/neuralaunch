//src/app/api/cofounder/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

import { searchMemory, saveMemory } from "@/lib/ai-memory"; // Import both memory functions
import {
  getLandingPageAnalyticsSummary,
  getSprintProgressSummary,
} from "@/lib/cofounder-helpers";
import { z } from "zod";
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";

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
- **Memory:** You have access to relevant past memories (blueprints, insights, previous chats). Use this context!
- **Devil's Advocate:** Challenge the user's assumptions with data and logic. Ask clarifying questions. Don't just agree.
- **Skill Gap Filler:** Offer to help with tasks the user struggles with (e.g., writing copy, analyzing data).
- **Accountability Partner:** Gently keep the user focused on their validation goals.

Interaction Rules:
- **Use the Provided Context:** Always integrate the retrieved memories into your response. Refer back to past insights or goals.
- **Be Action-Oriented:** End your responses with a clear next step or a probing question.
- **Maintain Context:** Remember this is an ongoing conversation within a specific startup project.
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

    // --- RAG Step 2: Retrieve Structured Data (NEW) ---
    let structuredDataContext = "";
    const lowerCaseMessage = userMessage.toLowerCase();

    // Check for analytics keywords
    if (
      /\b(analytics|stats|views|signups|conversion|landing page performance)\b/.test(
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
      /\b(sprint|tasks|progress|checklist|72-hour|execution)\b/.test(
        lowerCaseMessage
      )
    ) {
      const sprintSummary = await getSprintProgressSummary(conversationId);
      if (sprintSummary) {
        structuredDataContext += `\n\n${sprintSummary}`;
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
