// client/src/app/api/conversations/[conversationId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";

const prisma = new PrismaClient();

// CORRECTED GET FUNCTION
export async function GET(
  req: NextRequest,
  context: { params: { conversationId: string } } // THE FIX IS HERE
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { conversationId } = context.params; // AND HERE

    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
        userId: session.user.id,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
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

// CORRECTED DELETE FUNCTION
export async function DELETE(
  req: NextRequest,
  context: { params: { conversationId: string } } // THE FIX IS HERE
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { conversationId } = context.params; // AND HERE

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
