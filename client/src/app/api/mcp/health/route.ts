// src/app/api/mcp/health/route.ts
/**
 * MCP Health Check Endpoint
 * Returns the health status of all configured MCP servers
 */

import { NextRequest, NextResponse } from "next/server";
import { loadMCPConfig, validateMCPConfiguration, getMCPStatistics } from "@/lib/mcp-config-loader";
import { mcpClient } from "@/lib/agents/tools";
import { createApiLogger } from "@/lib/logger";

/**
 * GET /api/mcp/health
 * Check health of all MCP servers
 */
export async function GET(req: NextRequest) {
  const logger = createApiLogger({
    path: "/api/mcp/health",
    method: "GET",
  });

  try {
    // Load MCP configuration
    const config = loadMCPConfig();

    if (!config) {
      return NextResponse.json(
        {
          status: "no_config",
          message: "MCP configuration file not found",
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    // Validate configuration
    const validation = validateMCPConfiguration(config);
    
    // Get statistics
    const stats = getMCPStatistics(config);

    // Get connected servers from MCP client
    const connectedServers = mcpClient.getConnectedServers();

    // Build health response
    const serversHealth = config.servers
      .filter((s) => s.enabled)
      .map((server) => {
        const isConnected = connectedServers.some((cs) => cs.name === server.name);
        
        // Check if auth token is available
        const hasAuth = server.authentication.type === "none" || 
          (server.authentication.envVar && !!process.env[server.authentication.envVar]);

        return {
          name: server.name,
          status: isConnected ? "connected" : hasAuth ? "disconnected" : "no_auth",
          enabled: server.enabled,
          protocol: server.protocol,
          capabilities: server.capabilities,
          agents: server.agents,
          hasAuthentication: hasAuth,
        };
      });

    // Determine overall status
    const allEnabled = serversHealth.filter((s) => s.status !== "no_auth");
    const connected = allEnabled.filter((s) => s.status === "connected");
    const overallStatus =
      connected.length === 0
        ? "no_connections"
        : connected.length === allEnabled.length
        ? "healthy"
        : "degraded";

    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      configuration: {
        version: config.version,
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      },
      statistics: stats,
      servers: serversHealth,
      summary: {
        total: stats.enabledServers,
        connected: connected.length,
        disconnected: allEnabled.length - connected.length,
        noAuth: serversHealth.filter((s) => s.status === "no_auth").length,
      },
    };

    logger.info("MCP health check completed", {
      status: overallStatus,
      connectedServers: connected.length,
      totalServers: stats.enabledServers,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      "MCP health check failed",
      error instanceof Error ? error : new Error(String(error))
    );

    return NextResponse.json(
      {
        status: "error",
        message: "Failed to check MCP health",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
