// client/src/app/api/conversations/route.ts
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { handleApiError, ErrorResponses } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";

export async function GET() {
  try {
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
      },
    });

    return successResponse(conversations);
  } catch (error) {
    return handleApiError(error, "GET /api/conversations");
  }
}
