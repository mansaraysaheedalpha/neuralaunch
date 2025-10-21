// client/src/app/api/conversations/[conversationId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

const MESSAGES_PER_PAGE = 20;

export async function GET(
  req: NextRequest,
  { params }: { params: { conversationId: string } } // <-- CORRECTED SIGNATURE
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { conversationId } = params; // <-- CORRECTED ACCESS
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
      take: MESSAGES_PER_PAGE + 1, // Take one extra to check for next page
      ...(cursor && {
        skip: 1, // Skip the cursor item itself
        cursor: {
          id: cursor,
        },
      }),
      orderBy: { createdAt: "asc" }, // Order chronologically
    });

    let nextCursor = null;
    // If we fetched more items than the page size, there's a next page
    if (messages.length > MESSAGES_PER_PAGE) {
      const nextItem = messages.pop(); // Remove the extra item from the end
      nextCursor = nextItem!.id; // Use its ID as the cursor for the next request
    }

    // IMPORTANT: Reverse messages *before* sending if you want newest first in UI
    // Or handle ordering on the client-side
    // For infinite scrolling *up* (loading older messages), 'asc' order is usually correct.

    return NextResponse.json({
      ...conversation,
      messages, // These are currently oldest first
      nextCursor,
    });
  } catch (error) {
    console.error("[CONVERSATION_GET_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { conversationId: string } } // <-- CORRECTED SIGNATURE
) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { conversationId } = params; // <-- CORRECTED ACCESS

    // Use deleteMany to ensure only the owner can delete, avoids fetching first
    const deleteResult = await prisma.conversation.deleteMany({
      where: {
        id: conversationId,
        userId: session.user.id, // Security check: Only allow user to delete their own
      },
    });

    // Check if any record was actually deleted
    if (deleteResult.count === 0) {
      return new NextResponse("Conversation not found or access denied", {
        status: 404,
      });
    }

    // Successfully deleted
    return new NextResponse(null, { status: 204 }); // 204 No Content is standard for successful DELETE
  } catch (error) {
    console.error("[CONVERSATION_DELETE_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
