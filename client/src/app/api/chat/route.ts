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

export async function GET() {
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
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id; // This will be undefined if not logged in

    const body = await req.json();
    const { messages, conversationId } = body;

    if (!messages) {
      return new NextResponse("Messages are required", { status: 400 });
    }

    let currentConversationId = conversationId;

    // --- LOGIC FOR AUTHENTICATED USERS ---
    if (userId) {
      let conversation = conversationId
        ? await prisma.conversation.findUnique({
            where: { id: conversationId },
          })
        : null;

      if (!conversation) {
        const initialContent = messages[messages.length - 1].content;
        const title =
          initialContent.trim().replace(/\s+/g, " ").substring(0, 50) ||
          "New Conversation";
        conversation = await prisma.conversation.create({
          data: { userId, title },
        });
        currentConversationId = conversation.id;
      }

      const lastUserMessage = messages[messages.length - 1];
      await prisma.message.create({
        data: {
          conversationId: currentConversationId,
          role: "user",
          content: lastUserMessage.content,
        },
      });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro", // Using a faster model can be good for logged-out users
      systemInstruction: SYSTEM_PROMPT,
    });

    const chat = model.startChat({
      history: messages.slice(0, -1).map((msg: any) => ({
        role: msg.role,
        parts: [{ text: msg.content }],
      })),
    });

    const result = await chat.sendMessageStream(
      messages[messages.length - 1].content
    );

    let fullModelResponse = "";
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          fullModelResponse += chunkText;
          controller.enqueue(new TextEncoder().encode(chunkText));
        }

        // --- SAVE RESPONSE ONLY IF AUTHENTICATED ---
        if (userId && currentConversationId) {
          await prisma.message.create({
            data: {
              conversationId: currentConversationId,
              role: "model",
              content: fullModelResponse,
            },
          });
        }
        controller.close();
      },
    });

    const headers = new Headers();
    if (userId && currentConversationId) {
      headers.set("X-Conversation-Id", currentConversationId);
    }

    return new Response(stream, { headers });
  } catch (error) {
    console.error("[CHAT_POST_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
