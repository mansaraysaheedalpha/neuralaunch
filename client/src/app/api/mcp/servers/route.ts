// src/app/api/mcp/servers/route.ts
/**
 * MCP Server Management API
 * Allows users to connect/disconnect MCP servers
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { mcpClient } from "@/lib/agents/tools";
import { toolRegistry } from "@/lib/agents/tools/base-tool";
import { createApiLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";
import { z } from "zod";

const connectServerSchema = z.object({
  serverUrl: z.string().url(),
  serverName: z.string().optional(),
});

/**
 * POST /api/mcp/servers
 * Connect to an MCP server
 */
export async function POST(req: NextRequest) {
  const logger = createApiLogger({
    path: "/api/mcp/servers",
    method: "POST",
  });

  try {
    // 1. Authenticate
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Validate request
    const body = connectServerSchema.parse(await req.json() as unknown);
    const { serverUrl } = body;

    logger.info("Connecting to MCP server", { serverUrl });

    // 3. Connect to MCP server
    const tools = await mcpClient.connectToServer(serverUrl);

    // 4. Register tools
    for (const tool of tools) {
      toolRegistry.register(tool);
    }

    // 5. Store in user preferences
    const existingPrefs = await prisma.userPreferences.findUnique({
      where: { userId: session.user.id },
    });

    const currentServers = existingPrefs?.mcpServers
      ? (existingPrefs.mcpServers as string[])
      : [];

    // Avoid duplicates
    if (!currentServers.includes(serverUrl)) {
      await prisma.userPreferences.upsert({
        where: { userId: session.user.id },
        create: {
          userId: session.user.id,
          mcpServers: [serverUrl],
        },
        update: {
          mcpServers: [...currentServers, serverUrl],
        },
      });
    }

    logger.info("MCP server connected", {
      serverUrl,
      toolCount: tools.length,
    });

    return NextResponse.json({
      success: true,
      message: `Connected to MCP server`,
      serverUrl,
      toolsLoaded: tools.length,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("Invalid request", { errors: error.issues });
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    logger.error("MCP connection error", error as Error);
    return NextResponse.json(
      {
        error: "Failed to connect to MCP server",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/mcp/servers
 * List connected MCP servers
 */
export async function GET(_req: NextRequest) {
  const logger = createApiLogger({
    path: "/api/mcp/servers",
    method: "GET",
  });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const servers = mcpClient.getConnectedServers();
    const allTools = mcpClient.getAllTools();

    return NextResponse.json({
      servers: servers.map((s) => ({
        name: s.name,
        url: s.url,
        description: s.description,
        capabilities: s.capabilities,
        toolCount: s.tools.length,
      })),
      totalTools: allTools.length,
    });
  } catch (error) {
    logger.error("Get MCP servers error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/mcp/servers
 * Disconnect from an MCP server
 */
export async function DELETE(req: NextRequest) {
  const logger = createApiLogger({
    path: "/api/mcp/servers",
    method: "DELETE",
  });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const serverName = searchParams.get("serverName");

    if (!serverName) {
      return NextResponse.json(
        { error: "serverName is required" },
        { status: 400 }
      );
    }

    // Get server details before disconnecting
    const servers = mcpClient.getConnectedServers();
    const server = servers.find((s) => s.name === serverName);

    mcpClient.disconnectFromServer(serverName);

    // Remove from user preferences
    if (server?.url) {
      const existingPrefs = await prisma.userPreferences.findUnique({
        where: { userId: session.user.id },
      });

      if (existingPrefs?.mcpServers) {
        const currentServers = existingPrefs.mcpServers as string[];
        const updatedServers = currentServers.filter(
          (url) => url !== server.url
        );

        await prisma.userPreferences.update({
          where: { userId: session.user.id },
          data: {
            mcpServers: updatedServers,
          },
        });
      }
    }

    logger.info("MCP server disconnected", { serverName });

    return NextResponse.json({
      success: true,
      message: `Disconnected from ${serverName}`,
    });
  } catch (error) {
    logger.error("MCP disconnect error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
