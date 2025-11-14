// src/lib/agents/tools/index.ts
/**
 * Tool Registry Index
 * Initializes and exports all available tools
 * Supports MCP (Model Context Protocol) for external tool integration
 */

import { toolRegistry, type ToolResult } from "./base-tool";
import { FileSystemTool } from "./filesystem-tool";
import { GitTool } from "./git-tool";
import { WebSearchTool } from "./web-search-tool";
import { CommandTool } from "./command-tool";
import { CodeAnalysisTool } from "./code-analysis-tool";
import { ContextLoaderTool } from "./context-loader-tool";
import { BrowserAutomationTool } from "./browser-automation-tool";
import { ClaudeSkillsTool } from "./claude-skills-tool";
import { logger } from "@/lib/logger";

// ✅ MCP Support (optional - only loads if MCP servers configured)
import { mcpClient } from "./mcp/mcp-tool-adapter";
import { env } from "@/lib/env";

// ==========================================
// INITIALIZE CORE TOOLS
// ==========================================

let initialized = false;

export function initializeTools(): void {
  if (initialized) {
    logger.warn("[ToolRegistry] Tools already initialized");
    return;
  }

  logger.info("[ToolRegistry] Initializing core tools...");

  // Register all core tools
  toolRegistry.register(new FileSystemTool());
  toolRegistry.register(new GitTool());
  toolRegistry.register(new CommandTool());
  toolRegistry.register(new WebSearchTool());
  toolRegistry.register(new CodeAnalysisTool());
  toolRegistry.register(new ContextLoaderTool());
  toolRegistry.register(new BrowserAutomationTool());
  toolRegistry.register(new ClaudeSkillsTool());

  initialized = true;

  logger.info("[ToolRegistry] Core tools registered:", {
    count: toolRegistry.getAll().length,
    tools: toolRegistry.getAll().map((t) => t.name),
  });

  async function loadMCPToolsAsync(): Promise<void> {
    // ✅ Support both comma-separated URLs and named servers
    const mcpServersEnv = env.MCP_SERVERS || "";

    if (!mcpServersEnv.trim()) {
      logger.info("[ToolRegistry] No MCP servers configured");
      return;
    }

    const mcpServers = mcpServersEnv.split(",").filter((s) => s.trim());

    logger.info(
      `[ToolRegistry] Loading tools from ${mcpServers.length} MCP server(s)...`
    );

    let totalToolsLoaded = 0;
    const failedServers: string[] = [];

    for (const serverUrl of mcpServers) {
      try {
        const trimmedUrl = serverUrl.trim();
        logger.info(`[ToolRegistry] Connecting to MCP server: ${trimmedUrl}`);

        // ✅ Add timeout for MCP connections (10 seconds)
        const tools = await Promise.race([
          mcpClient.connectToServer(trimmedUrl),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("MCP connection timeout")), 10000)
          ),
        ]);

        // Register all MCP tools
        for (const tool of tools) {
          toolRegistry.register(tool);
          totalToolsLoaded++;
        }

        logger.info(
          `[ToolRegistry] ✅ Loaded ${tools.length} tools from ${trimmedUrl}`,
          {
            tools: tools.map((t) => t.name),
          }
        );
      } catch (error) {
        failedServers.push(serverUrl);
        logger.warn(
          `[ToolRegistry] ⚠️ Failed to connect to MCP server: ${serverUrl}`,
          {
            error: error instanceof Error ? error.message : "Unknown error",
            note: "Continuing with remaining servers...",
          }
        );
        // Continue with other servers even if one fails
      }
    }

    // Summary log
    if (totalToolsLoaded > 0) {
      logger.info(`[ToolRegistry] ✅ MCP integration complete`, {
        totalMCPTools: totalToolsLoaded,
        totalTools: toolRegistry.getAll().length,
        successfulServers: mcpServers.length - failedServers.length,
        failedServers: failedServers.length,
      });
    } else if (failedServers.length > 0) {
      logger.warn(`[ToolRegistry] ⚠️ All MCP servers failed to connect`, {
        failedServers,
        note: "Using core tools only",
      });
    }
  }

  void loadMCPToolsAsync();
}

// Auto-initialize on import
initializeTools();

// ==========================================
// EXPORTS
// ==========================================

export { toolRegistry } from "./base-tool";
export { FileSystemTool } from "./filesystem-tool";
export { GitTool } from "./git-tool";
export { CommandTool } from "./command-tool";
export { WebSearchTool } from "./web-search-tool";
export { CodeAnalysisTool } from "./code-analysis-tool";
export { ContextLoaderTool } from "./context-loader-tool";
export { BrowserAutomationTool } from "./browser-automation-tool";
export { ClaudeSkillsTool } from "./claude-skills-tool";

// ✅ Export MCP client for programmatic access
export { mcpClient } from "./mcp/mcp-tool-adapter";

export type { ITool, ToolResult, ToolContext } from "./base-tool";

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Get tool descriptions for AI prompt
 */
export function getToolsForPrompt(): string {
  return toolRegistry.getToolsMetadata();
}

/**
 * Execute a tool by name
 */
export async function executeTool(
  toolName: string,
  params: Record<string, unknown>,
  context: { projectId: string; userId: string; conversationId?: string }
): Promise<ToolResult> {
  return await toolRegistry.execute(toolName, params, context);
}

/**
 * Get all available tool names
 */
export function getAvailableTools(): string[] {
  return toolRegistry.getAll().map((t) => t.name);
}

/**
 * Get core tools (non-MCP)
 */
export function getCoreTools(): string[] {
  return toolRegistry
    .getAll()
    .filter((t) => !t.name.startsWith("mcp_"))
    .map((t) => t.name);
}

/**
 * Get MCP tools only
 */
export function getMCPTools(): string[] {
  return toolRegistry
    .getAll()
    .filter((t) => t.name.startsWith("mcp_"))
    .map((t) => t.name);
}

/**
 * Check if MCP is enabled
 */
export function isMCPEnabled(): boolean {
  return getMCPTools().length > 0;
}

/**
 * Get tool registry statistics
 */
export function getToolStats() {
  const allTools = toolRegistry.getAll();
  const mcpTools = getMCPTools();
  const coreTools = getCoreTools();

  return {
    total: allTools.length,
    core: coreTools.length,
    mcp: mcpTools.length,
    mcpEnabled: isMCPEnabled(),
  };
}
