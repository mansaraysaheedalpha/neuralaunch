// src/lib/agents/tools/mcp/mcp-tool-adapter.ts
/**
 * MCP Tool Adapter
 * Wraps Model Context Protocol (MCP) tools as NeuraLaunch tools
 * Enables dynamic tool discovery from external MCP servers
 */

import { BaseTool, ToolParameter, ToolResult, ToolContext } from "../base-tool";
import { logger } from "@/lib/logger";
import { toError, toLogContext } from "@/lib/error-utils";
import { env } from "@/lib/env";

// ==========================================
// MCP TYPES (Based on Anthropic's MCP spec)
// ==========================================

export interface MCPToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        enum?: string[];
        required?: boolean;
      }
    >;
    required?: string[];
  };
}

export interface MCPServer {
  name: string;
  url: string;
  description?: string;
  capabilities: string[];
  tools: MCPToolSchema[];
}

export interface MCPToolExecutionRequest {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolExecutionResponse {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// ==========================================
// MCP TOOL ADAPTER CLASS
// ==========================================

/**
 * Adapts an MCP tool to NeuraLaunch's tool interface
 */
export class MCPToolAdapter extends BaseTool {
  public readonly name: string;
  public readonly description: string;
  public readonly parameters: ToolParameter[];
  private mcpSchema: MCPToolSchema;
  private serverUrl: string;
  private serverName: string;

  constructor(mcpSchema: MCPToolSchema, serverUrl: string, serverName: string) {
    super();
    this.name = `mcp_${serverName}_${mcpSchema.name}`;
    this.description = `[MCP: ${serverName}] ${mcpSchema.description}`;
    this.mcpSchema = mcpSchema;
    this.serverUrl = serverUrl;
    this.serverName = serverName;
    this.parameters = this.getParameters();
  }

  /**
   * Get tool parameters from MCP schema
   */
  private getParameters(): ToolParameter[] {
    const params: ToolParameter[] = [];
    const schema = this.mcpSchema.inputSchema;

    for (const [paramName, paramDef] of Object.entries(
      schema.properties || {}
    )) {
      params.push({
        name: paramName,
        type: paramDef.type as "string" | "number" | "boolean" | "object",
        description: paramDef.description || "",
        required: schema.required?.includes(paramName) || false,
        enum: paramDef.enum,
      });
    }

    return params;
  }

  /**
   * Execute MCP tool
   */
  async execute(
    params: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      logger.info(`[MCP Tool] Executing ${this.name}`, {
        server: this.serverName,
        params,
      });

      // Validate parameters against schema
      this.validateParams(params);

      // Call MCP server
      const response = await this.callMCPServer(params);

      // Parse response
      const result = this.parseMCPResponse(response);

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: result,
        duration,
        metadata: {
          server: this.serverName,
          tool: this.mcpSchema.name,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      logger.error(`[MCP Tool] Execution failed`, error as any);

      return {
        success: false,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Call MCP server via HTTP with authentication
   */
  private async callMCPServer(
    params: Record<string, any>
  ): Promise<MCPToolExecutionResponse> {
    const request: MCPToolExecutionRequest = {
      name: this.mcpSchema.name,
      arguments: params,
    };

    // ✅ Get authentication token for this server
    const authToken = this.getAuthTokenForServer(this.serverName);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "MCP-Version": "2025.11", // Updated version
    };

    // Add authentication if available
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${this.serverUrl}/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(
        `MCP server error: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  }

  /**
   * Get authentication token for MCP server
   */
  private getAuthTokenForServer(serverName: string): string | null {
    // Map server names to environment variables
    const tokenMap: Record<string, string> = {
      github: env.GITHUB_MCP_TOKEN || env.GITHUB_TOKEN || "",
      brave: env.BRAVE_SEARCH_API_KEY || "",
      "claude-skills": env.ANTHROPIC_API_KEY || "",
      playwright: "", // No auth needed
      filesystem: "", // No auth needed
    };

    return tokenMap[serverName.toLowerCase()] || null;
  }

  /**
   * Parse MCP response into NeuraLaunch format
   */
  private parseMCPResponse(response: MCPToolExecutionResponse): any {
    if (response.isError) {
      throw new Error(response.content[0]?.text || "MCP tool execution failed");
    }

    // Handle different content types
    const content = response.content[0];

    switch (content.type) {
      case "text":
        return {
          type: "text",
          content: content.text,
        };

      case "image":
        return {
          type: "image",
          data: content.data,
          mimeType: content.mimeType,
        };

      case "resource":
        return {
          type: "resource",
          data: content.data,
          mimeType: content.mimeType,
        };

      default:
        return content;
    }
  }

  /**
   * Validate parameters against MCP schema
   */
  private validateParams(params: Record<string, any>): void {
    const schema = this.mcpSchema.inputSchema;

    // Check required parameters
    for (const required of schema.required || []) {
      if (!(required in params)) {
        throw new Error(`Missing required parameter: ${required}`);
      }
    }

    // Validate parameter types
    for (const [paramName, paramValue] of Object.entries(params)) {
      const paramSchema = schema.properties[paramName];
      if (!paramSchema) {
        logger.warn(`[MCP Tool] Unknown parameter: ${paramName}`);
        continue;
      }

      // Type validation
      const actualType = typeof paramValue;
      const expectedType = paramSchema.type;

      if (actualType !== expectedType) {
        throw new Error(
          `Parameter ${paramName} has wrong type: expected ${expectedType}, got ${actualType}`
        );
      }

      // Enum validation
      if (paramSchema.enum && !paramSchema.enum.includes(paramValue)) {
        throw new Error(
          `Parameter ${paramName} must be one of: ${paramSchema.enum.join(", ")}`
        );
      }
    }
  }

  protected getExamples(): string[] {
    // Generate examples from MCP schema
    const exampleParams: Record<string, any> = {};

    for (const [paramName, paramDef] of Object.entries(
      this.mcpSchema.inputSchema.properties || {}
    )) {
      if (paramDef.enum) {
        exampleParams[paramName] = paramDef.enum[0];
      } else {
        switch (paramDef.type) {
          case "string":
            exampleParams[paramName] = "example";
            break;
          case "number":
            exampleParams[paramName] = 42;
            break;
          case "boolean":
            exampleParams[paramName] = true;
            break;
          default:
            exampleParams[paramName] = null;
        }
      }
    }

    return [
      `// Execute ${this.name}\n${JSON.stringify(
        { operation: this.mcpSchema.name, params: exampleParams },
        null,
        2
      )}`,
    ];
  }
}

// ==========================================
// MCP CLIENT
// ==========================================

/**
 * Client for discovering and connecting to MCP servers
 */
export class MCPClient {
  private servers: Map<string, MCPServer> = new Map();

  /**
   * Connect to an MCP server and discover its tools
   */
  async connectToServer(serverUrl: string): Promise<MCPToolAdapter[]> {
    logger.info(`[MCP Client] Connecting to server: ${serverUrl}`);

    try {
      // Discover server capabilities
      const response = await fetch(`${serverUrl}/discover`, {
        method: "GET",
        headers: {
          "MCP-Version": "1.0",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to connect to MCP server: ${response.statusText}`
        );
      }

      const server: MCPServer = await response.json();

      // Validate server response
      if (!server.name || !server.tools || !Array.isArray(server.tools)) {
        throw new Error("Invalid MCP server response format");
      }

      // Store server info
      this.servers.set(server.name, server);

      logger.info(`[MCP Client] Connected to ${server.name}`, {
        toolCount: server.tools.length,
        capabilities: server.capabilities,
      });

      // Create tool adapters for each MCP tool
      const adapters = server.tools.map(
        (toolSchema) => new MCPToolAdapter(toolSchema, serverUrl, server.name)
      );

      return adapters;
    } catch (error) {
      logger.error(`[MCP Client] Connection failed`, toError(error));
      throw error;
    }
  }

  /**
   * Disconnect from a server
   */
  disconnectFromServer(serverName: string): void {
    this.servers.delete(serverName);
    logger.info(`[MCP Client] Disconnected from ${serverName}`);
  }

  /**
   * Get list of connected servers
   */
  getConnectedServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get all tools from all connected servers
   */
  getAllTools(): MCPToolSchema[] {
    const tools: MCPToolSchema[] = [];

    for (const server of this.servers.values()) {
      tools.push(...server.tools);
    }

    return tools;
  }
}

// ==========================================
// EXPORT SINGLETON
// ==========================================

export const mcpClient = new MCPClient();
