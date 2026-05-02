// client/src/app/api/conversations/[conversationId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';

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
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'conversation-delete', RATE_LIMITS.API_AUTHENTICATED);

    const params = await context.params;
    const validation = conversationIdSchema.safeParse(params);
    if (!validation.success) {
      throw new HttpError(400, 'Invalid conversation ID');
    }

    const { conversationId } = validation.data;

    // updateMany-style ownership filter — does not throw on missing
    // rows, returns count instead. We translate count=0 into a 404.
    const deleteResult = await prisma.conversation.deleteMany({
      where: {
        id: conversationId,
        userId,
      },
    });

    if (deleteResult.count === 0) {
      throw new HttpError(404, 'Conversation not found');
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return httpErrorToResponse(error);
  }
}
