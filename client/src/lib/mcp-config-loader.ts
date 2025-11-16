// src/lib/mcp-config-loader.ts
/**
 * MCP Configuration Loader
 * Loads MCP server configuration from mcp-servers.config.json
 * and provides utilities for managing MCP connections
 */

import { logger } from "./logger";
import fs from "fs";
import path from "path";

export interface MCPServerConfig {
  name: string;
  enabled: boolean;
  description: string;
  url: string;
  protocol: "http" | "https" | "local" | "postgres";
  authentication: {
    type: "bearer" | "apiKey" | "connectionString" | "none";
    envVar?: string;
    header?: string;
  };
  capabilities: string[];
  agents: string[];
  rateLimits?: {
    requestsPerHour?: number;
    requestsPerMonth?: number;
    requestsPerSecond?: number;
    requestsPerMinute?: number;
    burstSize?: number;
    maxConnections?: number;
    queryTimeout?: number;
  };
  security?: {
    allowedPaths?: string[];
    deniedPaths?: string[];
  };
}

export interface MCPConfiguration {
  version: string;
  description: string;
  servers: MCPServerConfig[];
  defaultConfig: {
    timeout: number;
    retries: number;
    retryDelay: number;
    connectionPoolSize: number;
  };
  monitoring: {
    enableMetrics: boolean;
    enableTracing: boolean;
    logLevel: string;
  };
}

/**
 * Load MCP configuration from file and apply environment variable overrides
 */
export function loadMCPConfig(): MCPConfiguration | null {
  try {
    const configPath = path.join(
      process.cwd(),
      "mcp-servers.config.json"
    );

    if (!fs.existsSync(configPath)) {
      logger.warn(
        "[MCP Config] Configuration file not found: mcp-servers.config.json"
      );
      return null;
    }

    const configContent = fs.readFileSync(configPath, "utf-8");
    const parsedConfig = JSON.parse(configContent) as unknown;

    // Basic runtime type check for MCPConfiguration
    if (
      typeof parsedConfig !== "object" ||
      parsedConfig === null ||
      typeof ((parsedConfig as Record<string, unknown>)?.version) !== "string" ||
      !Array.isArray((parsedConfig as Record<string, unknown>).servers)
    ) {
      logger.error("[MCP Config] Invalid configuration file structure");
      return null;
    }

    const config: MCPConfiguration = parsedConfig as MCPConfiguration;

    // Apply environment variable overrides for URLs
    config.servers = config.servers.map((server) => {
      const serverCopy = { ...server };

      // Override Playwright URL from environment
      if (server.name === "playwright" && process.env.MCP_PLAYWRIGHT_URL) {
        serverCopy.url = process.env.MCP_PLAYWRIGHT_URL;
        logger.info("[MCP Config] Using Playwright URL from environment", {
          url: serverCopy.url,
        });
      }

      // Override Claude Skills URL from environment
      if (
        server.name === "claude-skills" &&
        process.env.MCP_CLAUDE_SKILLS_URL
      ) {
        serverCopy.url = process.env.MCP_CLAUDE_SKILLS_URL;
        logger.info("[MCP Config] Using Claude Skills URL from environment", {
          url: serverCopy.url,
        });
      }

      return serverCopy;
    });

    logger.info("[MCP Config] Configuration loaded successfully", {
      version: config.version,
      serversCount: config.servers.length,
    });

    return config;
  } catch (error) {
    logger.error(
      "[MCP Config] Failed to load configuration",
      error instanceof Error ? error : new Error(String(error))
    );
    return null;
  }
}

/**
 * Get enabled MCP servers from configuration
 */
export function getEnabledServers(config: MCPConfiguration): MCPServerConfig[] {
  return config.servers.filter((server) => server.enabled);
}

/**
 * Get MCP server URLs with authentication
 */
export function getMCPServerURLs(
  config: MCPConfiguration
): { name: string; url: string; token?: string }[] {
  const enabledServers = getEnabledServers(config);
  const serverURLs: { name: string; url: string; token?: string }[] = [];

  for (const server of enabledServers) {
    // Skip local filesystem server (handled internally)
    if (server.protocol === "local") {
      continue;
    }

    let token: string | undefined;

    // Get authentication token from environment
    if (server.authentication.type !== "none" && server.authentication.envVar) {
      token = process.env[server.authentication.envVar];

      if (!token) {
        logger.warn(
          `[MCP Config] Authentication token not found for ${server.name}`,
          {
            envVar: server.authentication.envVar,
            note: "Server will be skipped",
          }
        );
        continue;
      }
    }

    serverURLs.push({
      name: server.name,
      url: server.url,
      token,
    });
  }

  return serverURLs;
}

/**
 * Get MCP servers for a specific agent
 */
export function getServersForAgent(
  config: MCPConfiguration,
  agentName: string
): MCPServerConfig[] {
  const enabledServers = getEnabledServers(config);
  return enabledServers.filter((server) =>
    server.agents.includes(agentName)
  );
}

/**
 * Check if MCP is properly configured
 */
export function validateMCPConfiguration(
  config: MCPConfiguration
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for at least one enabled server
  const enabledServers = getEnabledServers(config);
  if (enabledServers.length === 0) {
    warnings.push("No MCP servers enabled");
  }

  // Check for missing environment variables
  for (const server of enabledServers) {
    if (server.authentication.type !== "none" && server.authentication.envVar) {
      const token = process.env[server.authentication.envVar];
      if (!token) {
        errors.push(
          `Missing environment variable: ${server.authentication.envVar} for ${server.name}`
        );
      }
    }
  }

  // Check for invalid URLs and localhost in production
  for (const server of enabledServers) {
    if (server.protocol === "http" || server.protocol === "https") {
      try {
        const url = new URL(server.url);

        // Warn about localhost URLs in production
        if (
          process.env.NODE_ENV === "production" &&
          (url.hostname === "localhost" || url.hostname === "127.0.0.1")
        ) {
          errors.push(
            `Production environment detected but ${server.name} is using localhost URL: ${server.url}. ` +
              `Set ${server.name === "playwright" ? "MCP_PLAYWRIGHT_URL" : server.name === "claude-skills" ? "MCP_CLAUDE_SKILLS_URL" : "appropriate"} environment variable.`
          );
        }
      } catch {
        errors.push(`Invalid URL for ${server.name}: ${server.url}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get MCP statistics
 */
export function getMCPStatistics(
  config: MCPConfiguration
): {
  totalServers: number;
  enabledServers: number;
  disabledServers: number;
  serversWithAuth: number;
  serversWithoutAuth: number;
  capabilities: string[];
} {
  const enabledServers = getEnabledServers(config);
  const disabledServers = config.servers.filter((s) => !s.enabled);
  const serversWithAuth = config.servers.filter(
    (s) => s.authentication.type !== "none"
  );
  const serversWithoutAuth = config.servers.filter(
    (s) => s.authentication.type === "none"
  );

  const allCapabilities = new Set<string>();
  config.servers.forEach((server) => {
    server.capabilities.forEach((cap) => allCapabilities.add(cap));
  });

  return {
    totalServers: config.servers.length,
    enabledServers: enabledServers.length,
    disabledServers: disabledServers.length,
    serversWithAuth: serversWithAuth.length,
    serversWithoutAuth: serversWithoutAuth.length,
    capabilities: Array.from(allCapabilities),
  };
}
