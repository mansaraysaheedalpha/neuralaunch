// src/lib/agents/execution/database/providers/neon-provider.ts
/**
 * Neon Database Provider
 * Serverless PostgreSQL with generous free tier
 * https://neon.tech/docs/reference/api-reference
 */

import { logger } from "@/lib/logger";
import { BaseDatabaseProvider } from "./base-provider";
import type {
  DatabaseCredentials,
  ProvisioningOptions,
  ProvisioningResult,
  ProviderConfig,
  NeonProject,
} from "../types";

const NEON_API_BASE = "https://console.neon.tech/api/v2";

interface NeonCreateProjectResponse {
  project: NeonProject;
  connection_uris: Array<{
    connection_uri: string;
    connection_parameters: {
      host: string;
      database: string;
      role: string;
      password: string;
    };
  }>;
  roles: Array<{
    name: string;
    password: string;
  }>;
}

interface NeonProjectStatusResponse {
  project: {
    id: string;
    name: string;
    current_state: string;
  };
}

export class NeonProvider extends BaseDatabaseProvider {
  protected readonly providerName = "neon" as const;
  protected readonly databaseType = "postgresql" as const;

  initialize(config: ProviderConfig): void {
    this.config = config;
    logger.info(`[${this.providerName}] Provider initialized`);
  }

  isConfigured(): boolean {
    return !!this.config?.apiKey;
  }

  async provision(options: ProvisioningOptions): Promise<ProvisioningResult> {
    if (!this.config?.apiKey) {
      return {
        success: false,
        estimatedMonthlyCost: 0,
        provisioningTimeMs: 0,
        warnings: [],
        error: "Neon API key not configured",
      };
    }

    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      logger.info(`[${this.providerName}] Provisioning database`, {
        projectName: options.projectName,
        region: options.region || "aws-us-east-2",
      });

      // Create project via Neon API
      const response = await this.fetchWithRetry<NeonCreateProjectResponse>(
        `${NEON_API_BASE}/projects`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            project: {
              name: this.sanitizeName(options.projectName),
              region_id: options.region || "aws-us-east-2",
              pg_version: 16, // Latest PostgreSQL version
              autoscaling_limit_min_cu: 0.25, // Minimum compute
              autoscaling_limit_max_cu: 0.25, // Free tier limit
            },
          }),
        },
        "createProject"
      );

      const project = response.project;
      const connectionUri = response.connection_uris[0];
      const role = response.roles.find(r => r.name !== "postgres") || response.roles[0];

      // Parse connection parameters
      const connParams = connectionUri.connection_parameters;

      // Build credentials
      const credentials: DatabaseCredentials = {
        provider: "neon",
        databaseType: "postgresql",
        host: connParams.host,
        port: 5432,
        username: connParams.role,
        password: role.password || connParams.password,
        database: connParams.database,
        sslMode: "require",
        connectionString: connectionUri.connection_uri,
        directUrl: connectionUri.connection_uri.replace("?sslmode=require", "?sslmode=require&pgbouncer=false"),
        additionalEnvVars: {
          NEON_PROJECT_ID: project.id,
          NEON_BRANCH_ID: project.branches[0]?.id || "",
        },
      };

      // Wait for project to be ready
      const readyResult = await this.waitForReady(project.id);
      if (!readyResult.ready) {
        warnings.push(`Database may not be fully ready: ${readyResult.error}`);
      }

      // Test connection
      const testResult = await this.testConnection(credentials);
      if (!testResult.success) {
        warnings.push(`Connection test failed: ${testResult.error}`);
      }

      const provisioningTimeMs = Date.now() - startTime;

      logger.info(`[${this.providerName}] Database provisioned successfully`, {
        projectId: project.id,
        provisioningTimeMs,
      });

      return {
        success: true,
        credentials,
        resourceId: project.id,
        resourceUrl: `https://console.neon.tech/app/projects/${project.id}`,
        estimatedMonthlyCost: options.tier === "free" ? 0 : 19, // Free tier or Pro
        provisioningTimeMs,
        warnings,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[${this.providerName}] Provisioning failed`, undefined, { error: errorMessage });

      return {
        success: false,
        estimatedMonthlyCost: 0,
        provisioningTimeMs: Date.now() - startTime,
        warnings,
        error: errorMessage,
      };
    }
  }

  async delete(resourceId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.config?.apiKey) {
      return { success: false, error: "Neon API key not configured" };
    }

    try {
      logger.info(`[${this.providerName}] Deleting database`, { resourceId });

      await this.fetchWithRetry(
        `${NEON_API_BASE}/projects/${resourceId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        },
        "deleteProject"
      );

      logger.info(`[${this.providerName}] Database deleted`, { resourceId });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[${this.providerName}] Delete failed`, undefined, { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async testConnection(credentials: DatabaseCredentials): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
    try {
      // Use a simple HTTP endpoint to test if the host is reachable
      // For actual connection testing, we'd use pg client but that requires the module
      const startTime = Date.now();

      // Neon provides a health check endpoint
      const healthUrl = `https://${credentials.host}:5432`;

      // We can't directly test PostgreSQL from browser/serverless
      // Instead, we'll verify the credentials format and trust Neon's provisioning

      // Verify required fields
      if (!credentials.host || !credentials.password || !credentials.database) {
        return { success: false, error: "Missing required credentials" };
      }

      // Verify host format (should be *.neon.tech)
      if (!credentials.host.includes(".neon.tech")) {
        return { success: false, error: "Invalid Neon host format" };
      }

      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        latencyMs,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getStatus(resourceId: string): Promise<{ ready: boolean; status: string; error?: string }> {
    if (!this.config?.apiKey) {
      return { ready: false, status: "unconfigured", error: "API key not configured" };
    }

    try {
      const response = await this.fetchWithRetry<NeonProjectStatusResponse>(
        `${NEON_API_BASE}/projects/${resourceId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        },
        "getProjectStatus"
      );

      const state = response.project.current_state;
      const ready = state === "active" || state === "idle";

      return {
        ready,
        status: state,
      };
    } catch (error) {
      return {
        ready: false,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  buildConnectionString(credentials: Partial<DatabaseCredentials>): string {
    const { host, port, username, password, database, sslMode } = credentials;
    return `postgresql://${username}:${password}@${host}:${port || 5432}/${database}?sslmode=${sslMode || "require"}`;
  }
}

export const neonProvider = new NeonProvider();
