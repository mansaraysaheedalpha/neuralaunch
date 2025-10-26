// src/app/api/cofounder/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

// Validation schema for query parameters
const messagesQuerySchema = z.object({
  conversationId: z.string().cuid("Invalid Conversation ID."),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const userId = session.user.id;

    // Get conversationId from query params
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    // Validate input
    const validation = messagesQuerySchema.safeParse({ conversationId });
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: validation.error.format() },
        { status: 400 }
      );
    }

    // Verify conversation ownership
    const conversation = await prisma.conversation.findUnique({
      where: {
        id: validation.data.conversationId,
        userId: userId,
      },
    });

    if (!conversation) {
      return new NextResponse("Conversation not found", { status: 404 });
    }

    // Fetch cofounder messages for this conversation
    const messages = await prisma.cofounderMessage.findMany({
      where: {
        conversationId: validation.data.conversationId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        content: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ messages });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ [COFOUNDER_MESSAGES_GET_ERROR]", message);
    return NextResponse.json(
      { error: `Failed to fetch messages: ${message}` },
      { status: 500 }
    );
  }
}
