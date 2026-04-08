// client/src/app/api/conversations/[conversationId]/route.ts
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { handleApiError, ErrorResponses, NotFoundError } from "@/lib/api-error";
import { noContentResponse } from "@/lib/api-response";
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
} from "@/lib/validation/server-helpers";
import { z } from "zod";

const conversationIdSchema = z.object({
  conversationId: z.string().cuid(),
});

/**
 * DELETE /api/conversations/[conversationId]
 *
 * Removes a conversation and (via cascade) its linked messages,
 * discovery session, and downstream artefacts.
 *
 * The previous GET handler was removed during the codebase cleanup —
 * it had no callers and referenced the soon-to-be-deleted LandingPage
 * model. The transcript view at /chat/[conversationId] does its own
 * server-side query rather than going through this route.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  try {
    enforceSameOrigin(req);
    const session = await auth();
    if (!session?.user?.id) {
      return ErrorResponses.unauthorized();
    }

    await rateLimitByUser(session.user.id, "conversation-delete", RATE_LIMITS.API_AUTHENTICATED);

    const params = await context.params;
    const validation = conversationIdSchema.safeParse(params);
    if (!validation.success) {
      return ErrorResponses.badRequest("Invalid conversation ID");
    }

    const { conversationId } = validation.data;

    // updateMany-style ownership filter — does not throw on missing
    // rows, returns count instead. We translate count=0 into a 404.
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
    if (error instanceof HttpError) return httpErrorToResponse(error);
    return handleApiError(error, "DELETE /api/conversations/[conversationId]");
  }
}
