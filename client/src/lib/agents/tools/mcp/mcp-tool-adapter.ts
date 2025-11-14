// src/lib/agents/tools/mcp/mcp-tool-adapter.ts
/**
 * MCP Tool Adapter
 * Wraps Model Context Protocol (MCP) tools as NeuraLaunch tools
 * Enables dynamic tool discovery from external MCP servers
 */

import { BaseTool, ToolParameter, ToolResult, ToolContext } from "../base-tool";
import { logger } from "@/lib/logger";
import { toError } from "@/lib/error-utils";
import { env } from "@/lib/env";

// ==========================================
// MCP TYPES (Based on Anthropic's MCP spec)
// ==========================================

type MCPParameterType = "string" | "number" | "boolean" | "object" | "array";

export interface MCPInputProperty {
  type: MCPParameterType | string;
  description?: string;
  enum?: string[];
  required?: boolean;
}

export interface MCPInputSchema {
  type: "object";
  properties?: Record<string, MCPInputProperty>;
  required?: string[];
}

export interface MCPToolSchema {
  name: string;
  description: string;
  inputSchema: MCPInputSchema;
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
  arguments: Record<string, unknown>;
}

export interface MCPToolExecutionResponseContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  [key: string]: unknown;
}

export interface MCPToolExecutionResponse {
  content: MCPToolExecutionResponseContent[];
  isError?: boolean;
}

export type MCPParsedResponse =
  | { type: "text"; content: string }
  | { type: "image" | "resource"; data: string; mimeType?: string }
  | { type: "raw"; data: MCPToolExecutionResponseContent };

const VALID_PARAMETER_TYPES: readonly MCPParameterType[] = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isMCPInputProperty(value: unknown): value is MCPInputProperty {
  if (!isRecord(value)) {
    return false;
  }

  if ("type" in value && typeof value.type !== "string") {
    return false;
  }

  if ("description" in value && typeof value.description !== "string") {
    return false;
  }

  if ("enum" in value && !isStringArray(value.enum)) {
    return false;
  }

  if ("required" in value && typeof value.required !== "boolean") {
    return false;
  }

  return true;
}

function isMCPInputSchema(value: unknown): value is MCPInputSchema {
  if (!isRecord(value) || value.type !== "object") {
    return false;
  }

  if ("required" in value && value.required !== undefined && !isStringArray(value.required)) {
    return false;
  }

  if (value.properties === undefined) {
    return true;
  }

  if (!isRecord(value.properties)) {
    return false;
  }

  return Object.values(value.properties).every(isMCPInputProperty);
}

function isMCPToolSchema(value: unknown): value is MCPToolSchema {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.name !== "string" || typeof value.description !== "string") {
    return false;
  }

  return isMCPInputSchema(value.inputSchema);
}

function isMCPToolExecutionResponseContent(
  value: unknown
): value is MCPToolExecutionResponseContent {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.type !== "string") {
    return false;
  }

  if ("text" in value && value.text !== undefined && typeof value.text !== "string") {
    return false;
  }

  if ("data" in value && value.data !== undefined && typeof value.data !== "string") {
    return false;
  }

  if (
    "mimeType" in value &&
    value.mimeType !== undefined &&
    typeof value.mimeType !== "string"
  ) {
    return false;
  }

  return true;
}

function isMCPToolExecutionResponse(
  value: unknown
): value is MCPToolExecutionResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (!Array.isArray(value.content)) {
    return false;
  }

  if ("isError" in value && value.isError !== undefined && typeof value.isError !== "boolean") {
    return false;
  }

  return value.content.every(isMCPToolExecutionResponseContent);
}

function normalizeParameterType(type: string | undefined): MCPParameterType {
  return VALID_PARAMETER_TYPES.includes(type as MCPParameterType)
    ? (type as MCPParameterType)
    : "string";
}

function parseExecutionResponse(data: unknown): MCPToolExecutionResponse {
  if (!isMCPToolExecutionResponse(data)) {
    throw new Error("Invalid MCP tool execution response format");
  }

  return data;
}

function parseServerResponse(data: unknown, serverUrl: string): MCPServer {
  if (!isRecord(data)) {
    throw new Error("Invalid MCP server response format");
  }

  const { name, description, capabilities, tools } = data;

  if (typeof name !== "string") {
    throw new Error("MCP server response is missing a name");
  }

  if (!Array.isArray(tools) || !tools.every(isMCPToolSchema)) {
    throw new Error("MCP server response contains invalid tool definitions");
  }

  const normalizedCapabilities = isStringArray(capabilities) ? capabilities : [];

  return {
    name,
    url: serverUrl,
    description: typeof description === "string" ? description : undefined,
    capabilities: normalizedCapabilities,
    tools: tools.map((tool) => ({
      ...tool,
      inputSchema: {
        ...tool.inputSchema,
        properties: tool.inputSchema.properties ?? {},
        required: tool.inputSchema.required ?? [],
      },
    })),
  };
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
    const properties = schema.properties ?? {};

    for (const [paramName, paramDef] of Object.entries(properties)) {
      const parameterType = normalizeParameterType(
        typeof paramDef.type === "string" ? paramDef.type : undefined
      );

      params.push({
        name: paramName,
        type: parameterType,
        description: typeof paramDef.description === "string" ? paramDef.description : "",
        required: schema.required?.includes(paramName) ?? false,
        enum: paramDef.enum,
      });
    }

    return params;
  }

  /**
   * Execute MCP tool
   */
  async execute(
    params: Record<string, unknown>,
    _context: ToolContext
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

      logger.error(`[MCP Tool] Execution failed`, toError(error));

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
    params: Record<string, unknown>
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

    const payload = await response.json();
    return parseExecutionResponse(payload);
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
  private parseMCPResponse(response: MCPToolExecutionResponse): MCPParsedResponse {
    if (response.isError) {
      const firstContent = response.content[0];
      const message =
        firstContent && typeof firstContent.text === "string"
          ? firstContent.text
          : "MCP tool execution failed";
      throw new Error(message);
    }

    const [content] = response.content;

    if (!content) {
      return { type: "text", content: "" };
    }

    if (content.type === "text") {
      return { type: "text", content: content.text ?? "" };
    }

    if (content.type === "image" || content.type === "resource") {
      return {
        type: content.type,
        data: content.data ?? "",
        mimeType: content.mimeType,
      };
    }

    return { type: "raw", data: content };
  }

  /**
   * Validate parameters against MCP schema
   */
  private validateParams(params: Record<string, unknown>): void {
    const schema = this.mcpSchema.inputSchema;
    const properties = schema.properties ?? {};

    // Check required parameters
    for (const required of schema.required || []) {
      if (!(required in params)) {
        throw new Error(`Missing required parameter: ${required}`);
      }
    }

    // Validate parameter types
    for (const [paramName, paramValue] of Object.entries(params)) {
      const paramSchema = properties[paramName];
      if (!paramSchema) {
        logger.warn(`[MCP Tool] Unknown parameter: ${paramName}`);
        continue;
      }

      // Type validation
      const actualType = Array.isArray(paramValue) ? "array" : typeof paramValue;
      const expectedType = normalizeParameterType(
        typeof paramSchema.type === "string" ? paramSchema.type : undefined
      );

      if (paramValue !== undefined && actualType !== expectedType) {
        throw new Error(
          `Parameter ${paramName} has wrong type: expected ${expectedType}, got ${actualType}`
        );
      }

      // Enum validation
      if (
        paramSchema.enum &&
        typeof paramValue === "string" &&
        !paramSchema.enum.includes(paramValue)
      ) {
        throw new Error(
          `Parameter ${paramName} must be one of: ${paramSchema.enum.join(", ")}`
        );
      }
    }
  }

  protected getExamples(): string[] {
    // Generate examples from MCP schema
    const exampleParams: Record<string, unknown> = {};
    const properties = this.mcpSchema.inputSchema.properties ?? {};

    for (const [paramName, paramDef] of Object.entries(properties)) {
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

      const payload = await response.json();
      const server = parseServerResponse(payload, serverUrl);

      // Store server info
      this.servers.set(server.name, server);

      logger.info(`[MCP Client] Connected to ${server.name}`, {
        toolCount: server.tools.length,
        capabilities: server.capabilities,
      });

      // Create tool adapters for each MCP tool
      const adapters = server.tools.map(
        (toolSchema) => new MCPToolAdapter(toolSchema, server.url, server.name)
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
