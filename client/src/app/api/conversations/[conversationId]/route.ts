// client/src/app/api/conversations/[conversationId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

const MESSAGES_PER_PAGE = 20;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { conversationId } = await context.params;
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId, userId: session.user.id },
      include: {
        landingPage: { select: { id: true } },
      },
    });

    if (!conversation) {
      return new NextResponse("Conversation not found", { status: 404 });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId },
      take: MESSAGES_PER_PAGE + 1,
      ...(cursor && {
        skip: 1,
        cursor: {
          id: cursor,
        },
      }),
      orderBy: { createdAt: "asc" },
    });

    let nextCursor = null;
    if (messages.length === MESSAGES_PER_PAGE) {
     const nextItem = messages.shift(); // Remove the oldest item (extra one)
     nextCursor = nextItem!.id;
    }

    return NextResponse.json({
      ...conversation,
      messages,
      nextCursor,
    });
  } catch (error) {
    console.error("[CONVERSATION_GET_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: { conversationId: string } }
) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { conversationId } = context.params;

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
