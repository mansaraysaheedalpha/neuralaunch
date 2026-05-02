// client/src/app/api/conversations/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  enforceSameOrigin,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';

export async function GET(request: Request) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId(request);
    await rateLimitByUser(userId, 'conversations-list', RATE_LIMITS.API_READ);

    // Pagination cap: the sidebar shows recent conversations, not the
    // founder's entire history. 100 is well above the visual fold and
    // prevents an unbounded payload from a power user with hundreds of
    // past sessions. Stage 7.2 scalability bound.
    const conversations = await prisma.conversation.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    100,
      select: {
        id:        true,
        title:     true,
        createdAt: true,
        updatedAt: true,
        // Surface the linked discovery session status so the sidebar
        // can route in-progress sessions to /discovery (live interview)
        // instead of /chat/[id] (read-only transcript).
        discoverySession: {
          select: { status: true },
        },
      },
    });

    // Flatten the relation for the client — the sidebar component
    // does not need a nested object.
    const shaped = conversations.map(c => ({
      id:              c.id,
      title:           c.title,
      createdAt:       c.createdAt,
      updatedAt:       c.updatedAt,
      discoveryStatus: c.discoverySession?.status ?? null,
    }));

    return NextResponse.json(shaped);
  } catch (error) {
    return httpErrorToResponse(error);
  }
}
