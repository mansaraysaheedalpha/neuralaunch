// client/src/app/api/conversations/[conversationId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma"; // Use the singleton

export async function GET(
  req: NextRequest,
  // FIX: The context now contains a Promise of params
  context: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // FIX: `await` the context.params to get the values
    const { conversationId } = await context.params;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId, userId: session.user.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        landingPage: { select: { id: true } },
      },
    });

    if (!conversation) {
      return new NextResponse("Conversation not found", { status: 404 });
    }

    return NextResponse.json(conversation);
  } catch (error) {
    console.error("[CONVERSATION_GET_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { conversationId } = await context.params;

    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
        userId: session.user.id,
      },
    });

    if (!conversation) {
      return new NextResponse("Conversation not found or access denied", {
        status: 404,
      });
    }

    await prisma.conversation.delete({
      where: {
        id: conversationId,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[CONVERSATION_DELETE_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
