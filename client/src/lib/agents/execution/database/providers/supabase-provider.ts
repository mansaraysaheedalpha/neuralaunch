// src/lib/agents/execution/database/providers/supabase-provider.ts
/**
 * Supabase Database Provider
 * PostgreSQL with built-in auth, realtime, and storage
 * https://supabase.com/docs/reference/api
 */

import { logger } from "@/lib/logger";
import { BaseDatabaseProvider } from "./base-provider";
import type {
  DatabaseCredentials,
  ProvisioningOptions,
  ProvisioningResult,
  ProviderConfig,
} from "../types";

const SUPABASE_API_BASE = "https://api.supabase.com/v1";

// Valid Supabase regions (as of 2024)
const VALID_SUPABASE_REGIONS = [
  "us-west-1",      // West US (North California)
  "us-west-2",      // West US (Oregon)
  "us-east-1",      // East US (North Virginia)
  "us-east-2",      // East US (Ohio)
  "ca-central-1",   // Canada
  "eu-west-1",      // Ireland
  "eu-west-2",      // London
  "eu-west-3",      // Paris
  "eu-central-1",   // Frankfurt
  "eu-central-2",   // Zurich
  "eu-north-1",     // Stockholm
  "ap-south-1",     // Mumbai
  "ap-southeast-1", // Singapore
  "ap-southeast-2", // Sydney
  "ap-northeast-1", // Tokyo
  "ap-northeast-2", // Seoul
  "sa-east-1",      // São Paulo
];

// Default region with failover chain for resilience
const DEFAULT_SUPABASE_REGION = "us-west-1";

// Failover regions in order of preference
// If primary region fails with 503, try these in order
const SUPABASE_REGION_FAILOVER_CHAIN: Record<string, string[]> = {
  "us-west-1": ["us-east-1", "us-west-2", "us-east-2"],
  "us-west-2": ["us-east-1", "us-west-1", "us-east-2"],
  "us-east-1": ["us-east-2", "us-west-1", "us-west-2"],
  "us-east-2": ["us-east-1", "us-west-1", "us-west-2"],
  "eu-west-1": ["eu-west-2", "eu-central-1", "eu-west-3"],
  "eu-west-2": ["eu-west-1", "eu-central-1", "eu-west-3"],
  "eu-central-1": ["eu-west-1", "eu-west-2", "eu-north-1"],
  "ap-southeast-1": ["ap-southeast-2", "ap-northeast-1", "ap-south-1"],
  "ap-southeast-2": ["ap-southeast-1", "ap-northeast-1", "ap-south-1"],
};

interface SupabaseProjectResponse {
  id: string;
  name: string;
  region: string;
  status: string;
  database: {
    host: string;
    version: string;
  };
}

interface SupabaseApiKeysResponse {
  anon_key: string;
  service_role_key: string;
}

export class SupabaseProvider extends BaseDatabaseProvider {
  protected readonly providerName = "supabase" as const;
  protected readonly databaseType = "postgresql" as const;

  initialize(config: ProviderConfig): void {
    this.config = config;
    logger.info(`[${this.providerName}] Provider initialized`);
  }

  isConfigured(): boolean {
    // Supabase requires both API key AND organization ID
    return !!this.config?.apiKey && !!this.config?.orgId;
  }

  async provision(options: ProvisioningOptions): Promise<ProvisioningResult> {
    if (!this.config?.apiKey) {
      return {
        success: false,
        estimatedMonthlyCost: 0,
        provisioningTimeMs: 0,
        warnings: [],
        error: "Supabase API key not configured. Set SUPABASE_API_KEY environment variable.",
      };
    }

    // Supabase requires organization ID for project creation
    if (!this.config?.orgId) {
      return {
        success: false,
        estimatedMonthlyCost: 0,
        provisioningTimeMs: 0,
        warnings: [],
        error: "Supabase organization ID not configured. Set SUPABASE_ORG_ID environment variable. You can find your org ID in the Supabase dashboard URL: https://supabase.com/dashboard/org/[your-org-id]",
      };
    }

    const startTime = Date.now();
    const warnings: string[] = [];

    // Validate and normalize region
    let primaryRegion = options.region || DEFAULT_SUPABASE_REGION;
    if (!VALID_SUPABASE_REGIONS.includes(primaryRegion)) {
      logger.warn(`[${this.providerName}] Invalid region '${primaryRegion}', falling back to ${DEFAULT_SUPABASE_REGION}`);
      primaryRegion = DEFAULT_SUPABASE_REGION;
    }

    // Build region attempt list: primary + failover regions
    const failoverRegions = SUPABASE_REGION_FAILOVER_CHAIN[primaryRegion] || ["us-east-1", "us-west-2"];
    const regionsToTry = [primaryRegion, ...failoverRegions];

    // Generate a secure database password (same across all attempts)
    const dbPassword = this.generatePassword(24);

    let lastError = "";

    // Try each region in order until one succeeds
    for (let i = 0; i < regionsToTry.length; i++) {
      const region = regionsToTry[i];
      const isFailover = i > 0;

      if (isFailover) {
        logger.warn(`[${this.providerName}] Attempting failover to region: ${region}`);
        warnings.push(`Primary region ${primaryRegion} failed, using failover region ${region}`);
      }

      try {
        logger.info(`[${this.providerName}] Provisioning database`, {
          projectName: options.projectName,
          region,
          attempt: i + 1,
          isFailover,
        });

        // Create project via Supabase Management API
        const projectResponse = await this.createProjectInRegion(
          options.projectName,
          region,
          options.tier || "free",
          dbPassword
        );

        // Wait for project to be ready with dynamic polling
        // Supabase can take up to 10 minutes, use exponential backoff to reduce API calls
        const readyResult = await this.waitForReady(projectResponse.id, 600000, {
          initialIntervalMs: 5000,   // Start at 5s
          maxIntervalMs: 30000,       // Cap at 30s (reduces API calls significantly)
          backoffMultiplier: 1.5,     // Gradual backoff
        });

        if (!readyResult.ready) {
          warnings.push(`Database may not be fully ready: ${readyResult.error}`);
        }

        // Get API keys
        let anonKey = "";
        let serviceRoleKey = "";
        try {
          const keysResponse = await this.fetchWithRetry<SupabaseApiKeysResponse>(
            `${SUPABASE_API_BASE}/projects/${projectResponse.id}/api-keys`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${this.config.apiKey}`,
              },
            },
            "getApiKeys"
          );
          anonKey = keysResponse.anon_key;
          serviceRoleKey = keysResponse.service_role_key;
        } catch {
          warnings.push("Could not retrieve API keys automatically");
        }

        // Build credentials
        const credentials: DatabaseCredentials = {
          provider: "supabase",
          databaseType: "postgresql",
          host: projectResponse.database?.host || `db.${projectResponse.id}.supabase.co`,
          port: 5432,
          username: "postgres",
          password: dbPassword,
          database: "postgres",
          sslMode: "require",
          connectionString: `postgresql://postgres:${dbPassword}@db.${projectResponse.id}.supabase.co:5432/postgres`,
          directUrl: `postgresql://postgres:${dbPassword}@db.${projectResponse.id}.supabase.co:5432/postgres?pgbouncer=false`,
          additionalEnvVars: {
            SUPABASE_URL: `https://${projectResponse.id}.supabase.co`,
            SUPABASE_ANON_KEY: anonKey,
            SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
            NEXT_PUBLIC_SUPABASE_URL: `https://${projectResponse.id}.supabase.co`,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
          },
        };

        const provisioningTimeMs = Date.now() - startTime;

        logger.info(`[${this.providerName}] Database provisioned successfully`, {
          projectId: projectResponse.id,
          region,
          provisioningTimeMs,
          usedFailover: isFailover,
        });

        return {
          success: true,
          credentials,
          resourceId: projectResponse.id,
          resourceUrl: `https://supabase.com/dashboard/project/${projectResponse.id}`,
          estimatedMonthlyCost: options.tier === "free" ? 0 : 25, // Free or Pro
          provisioningTimeMs,
          warnings,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastError = errorMessage;

        // Check if this is a region-specific error (503) that should trigger failover
        const isRegionError = errorMessage.includes("503") ||
                             errorMessage.includes("service unavailable") ||
                             errorMessage.includes("region") ||
                             errorMessage.includes("capacity");

        if (isRegionError && i < regionsToTry.length - 1) {
          logger.warn(`[${this.providerName}] Region ${region} failed with recoverable error, will try failover`, {
            error: errorMessage,
            nextRegion: regionsToTry[i + 1],
          });
          continue; // Try next region
        }

        // Non-recoverable error or last region - fail
        logger.error(`[${this.providerName}] Provisioning failed`, undefined, {
          error: errorMessage,
          region,
          attempt: i + 1,
        });
      }
    }

    // All regions failed
    return {
      success: false,
      estimatedMonthlyCost: 0,
      provisioningTimeMs: Date.now() - startTime,
      warnings,
      error: `All regions failed. Last error: ${lastError}`,
    };
  }

  /**
   * Create a project in a specific region
   * Separated to allow region failover logic
   */
  private async createProjectInRegion(
    projectName: string,
    region: string,
    tier: string,
    dbPassword: string
  ): Promise<SupabaseProjectResponse> {
    return this.fetchWithRetry<SupabaseProjectResponse>(
      `${SUPABASE_API_BASE}/projects`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config!.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: this.sanitizeName(projectName),
          organization_id: this.config!.orgId,
          region,
          plan: tier === "free" ? "free" : "pro",
          db_pass: dbPassword,
        }),
      },
      "createProject"
    );
  }

  async delete(resourceId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.config?.apiKey) {
      return { success: false, error: "Supabase API key not configured" };
    }

    try {
      logger.info(`[${this.providerName}] Deleting database`, { resourceId });

      await this.fetchWithRetry(
        `${SUPABASE_API_BASE}/projects/${resourceId}`,
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
      const startTime = Date.now();

      // Verify required fields
      if (!credentials.host || !credentials.password) {
        return { success: false, error: "Missing required credentials" };
      }

      // Safely access additionalEnvVars with null check
      const envVars = credentials.additionalEnvVars || {};
      const supabaseUrl = envVars.SUPABASE_URL;

      // Verify Supabase URL format and test connection
      if (supabaseUrl) {
        const healthUrl = `${supabaseUrl}/rest/v1/`;
        const response = await fetch(healthUrl, {
          method: "HEAD",
          headers: {
            apikey: envVars.SUPABASE_ANON_KEY || "",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok && response.status !== 401) {
          return { success: false, error: `Health check failed: ${response.status}` };
        }
      }

      return {
        success: true,
        latencyMs: Date.now() - startTime,
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
      const response = await this.fetchWithRetry<SupabaseProjectResponse>(
        `${SUPABASE_API_BASE}/projects/${resourceId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        },
        "getProjectStatus"
      );

      const ready = response.status === "ACTIVE_HEALTHY";

      return {
        ready,
        status: response.status,
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

export const supabaseProvider = new SupabaseProvider();
