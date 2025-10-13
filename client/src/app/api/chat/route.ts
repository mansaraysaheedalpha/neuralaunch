// client/src/app/api/chat/route.ts
// client/src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route"; // Adjust path if needed

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// UPGRADE: Define the System Prompt constant
const SYSTEM_PROMPT = `
You are IdeaSpark, an enthusiastic startup mentor from the future who transforms skills into viable startup ideas.

## Your Mission
Generate ONE creative, market-ready startup idea based on the user's skills/interests.

## Output Format (STRICT)
Respond in this exact Markdown structure:

# ✨ [Creative Startup Name]

**The Pitch:** [One compelling sentence that sells the vision]

**The Problem:** [2-3 sentences about the pain point or market gap]

**The Solution:** [2-4 sentences on how the startup solves it, emphasizing unique value]

**Business Model:** [1-2 sentences on revenue generation - be specific]

**Why This Works For You:** [2-3 sentences connecting to user's skills]

**Next Steps:**
- [Actionable step 1]
- [Actionable step 2]
- [Actionable step 3]

## Quality Standards
✅ Specific and detailed (not generic)
✅ Directly leverages user's stated skills
✅ Solves a real, relatable problem
✅ Clear revenue model (SaaS, marketplace, freemium, etc.)
✅ Feasible to start within 6-12 months
✅ Includes concrete next steps
✅ 200-350 words total

## Tone
- Enthusiastic and encouraging
- Clear and accessible (avoid jargon)
- Confident in the idea's potential
- Action-oriented and empowering

## Avoid
❌ Multiple ideas (generate ONE only)
❌ Vague or generic concepts
❌ Ideas requiring massive capital
❌ Unclear business models
❌ Ignoring user's specific skills

Remember: Make the user feel excited, capable, and ready to start building! 🚀
`;

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const userId = session.user.id;

    // Find the user's most recent conversation
    const conversation = await prisma.conversation.findFirst({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(null, { status: 200 });
    }

    return NextResponse.json(conversation);
  } catch (error) {
    console.error("[CHAT_GET_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Get the authenticated user
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const userId = session.user.id;

    // 2. Parse the incoming messages from the request body
    const body = await req.json();
    const { messages, conversationId } = body;

    if (!messages) {
      return new NextResponse("Messages are required", { status: 400 });
    }

    // 3. Find or create a conversation
    let conversation = conversationId
      ? await prisma.conversation.findUnique({ where: { id: conversationId } })
      : null;

    if (!conversation) {
      const initialContent = messages[messages.length - 1].content;

      // Trim, remove extra whitespace, and take the first 50 chars for the title.
      // Default to "New Conversation" if the result is empty.
      const title =
        initialContent.trim().replace(/\s+/g, " ").substring(0, 50) ||
        "New Conversation";

      conversation = await prisma.conversation.create({
        data: {
          userId,
          title,
        },
      });
    }

    // 4. Save the new user message
    const lastUserMessage = messages[messages.length - 1];
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: lastUserMessage.content,
      },
    });

    // 5. Prepare history for the AI model
    // UPGRADE: Pass the system prompt during model initialization
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      systemInstruction: SYSTEM_PROMPT,
    });

    const chat = model.startChat({
      history: messages
        .slice(0, -1)
        .map((msg: { role: string; content: string }) => ({
          role: msg.role,
          parts: [{ text: msg.content }],
        })),
    });

    // 6. Call the AI and stream the response
    const result = await chat.sendMessageStream(lastUserMessage.content);
    let fullModelResponse = "";
    
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          fullModelResponse += chunkText;
          controller.enqueue(chunkText);
        }

        // 7. After the stream is finished, save the full model response
        await prisma.message.create({
          data: {
            conversationId: conversation!.id,
            role: "model",
            content: fullModelResponse,
          },
        });

        controller.close();
      },
    });

    // Add the new conversation ID to the headers
    return new Response(stream, {
        headers: { "X-Conversation-Id": conversation.id }
    });

  } catch (error) {
    console.error("[CHAT_POST_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}