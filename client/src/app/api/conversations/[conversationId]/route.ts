// client/src/app/api/conversations/[conversationId]/route.ts
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { handleApiError, ErrorResponses, NotFoundError } from "@/lib/api-error";
import { successResponse, noContentResponse } from "@/lib/api-response";
import { z } from "zod";

const MESSAGES_PER_PAGE = 20;

const conversationIdSchema = z.object({
  conversationId: z.string().cuid(),
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return ErrorResponses.unauthorized();
    }

    const params = await context.params;
    const validation = conversationIdSchema.safeParse(params);
    if (!validation.success) {
      return ErrorResponses.badRequest("Invalid conversation ID");
    }
    
    const { conversationId } = validation.data;
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId, userId: session.user.id },
      include: {
        landingPage: { select: { id: true } },
      },
    });

    if (!conversation) {
      throw new NotFoundError("Conversation");
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

    let nextCursor: string | null = null;
    if (messages.length > MESSAGES_PER_PAGE) {
      const nextItem = messages.pop();
      nextCursor = nextItem!.id;
    }

    return successResponse({
      ...conversation,
      messages,
      nextCursor,
    });
  } catch (error) {
    return handleApiError(error, "GET /api/conversations/[conversationId]");
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return ErrorResponses.unauthorized();
    }

    const params = await context.params;
    const validation = conversationIdSchema.safeParse(params);
    if (!validation.success) {
      return ErrorResponses.badRequest("Invalid conversation ID");
    }
    
    const { conversationId } = validation.data;

    const deleteResult = await prisma.conversation.deleteMany({
      where: {
        id: conversationId,
        userId: session.user.id,
      },
    });

    if (deleteResult.count === 0) {
      throw new NotFoundError("Conversation");
    }

    return noContentResponse();
  } catch (error) {
    return handleApiError(error, "DELETE /api/conversations/[conversationId]");
  }
}
