// client/src/app/api/conversations/route.ts
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { handleApiError, ErrorResponses } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";
import { enforceSameOrigin, HttpError, httpErrorToResponse } from "@/lib/validation/server-helpers";

export async function GET(request: Request) {
  try {
    enforceSameOrigin(request);
    const session = await auth();
    if (!session?.user?.id) {
      return ErrorResponses.unauthorized();
    }
    const userId = session.user.id;

    const conversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        // Surface the linked discovery session status so the sidebar
        // can route in-progress sessions to /discovery (live interview)
        // instead of /chat/[id] (read-only transcript). Without this
        // the sidebar dropped founders into a transcript with no
        // input box and no way to continue.
        discoverySession: {
          select: { status: true },
        },
      },
    });

    // Flatten the relation for the client — the sidebar component
    // does not need a nested object.
    const shaped = conversations.map(c => ({
      id:                c.id,
      title:             c.title,
      createdAt:         c.createdAt,
      updatedAt:         c.updatedAt,
      discoveryStatus:   c.discoverySession?.status ?? null,
    }));

    return successResponse(shaped);
  } catch (error) {
    if (error instanceof HttpError) return httpErrorToResponse(error);
    return handleApiError(error, "GET /api/conversations");
  }
}
