// src/app/api/projects/[projectId]/agent/events/route.ts

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { registerClient, unregisterClient } from "@/lib/agent-events";
import { logger } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  // 1. --- Authentication ---
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Optional: Check if user has access to this projectId.
  // For simplicity, we assume if they are logged in, they can connect.
  // A robust check would query the DB to verify ownership.

  const { projectId } = params;

  // 2. --- Create a TransformStream for SSE ---
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const clientId = `${session.user.id}-${Date.now()}`;

  // 3. --- Register the client to receive events ---
  registerClient(projectId, clientId, (data) => {
    try {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      writer.write(encoder.encode(message));
    } catch (e) {
      logger.error(
        `[Agent Events] Error writing to SSE stream for client ${clientId}:`,
        e
      );
      unregisterClient(projectId, clientId);
      writer.close();
    }
  });

  // 4. --- Handle client disconnection ---
  req.signal.addEventListener("abort", () => {
    logger.info(`[Agent Events] Client ${clientId} disconnected from project ${projectId}.`);
    unregisterClient(projectId, clientId);
    writer.close();
  });

  // 5. --- Send an initial connection confirmation event ---
  try {
    const welcomeMessage = `data: ${JSON.stringify({
      type: "connected",
      message: "Successfully connected to event stream.",
    })}\n\n`;
    writer.write(encoder.encode(welcomeMessage));
  } catch (e) {
    logger.error(`[Agent Events] Failed to send welcome message for client ${clientId}:`, e);
  }

  // 6. --- Return the readable side of the stream as the response ---
  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
