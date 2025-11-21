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
    return !!this.config?.apiKey;
  }

  async provision(options: ProvisioningOptions): Promise<ProvisioningResult> {
    if (!this.config?.apiKey) {
      return {
        success: false,
        estimatedMonthlyCost: 0,
        provisioningTimeMs: 0,
        warnings: [],
        error: "Supabase API key not configured",
      };
    }

    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      logger.info(`[${this.providerName}] Provisioning database`, {
        projectName: options.projectName,
        region: options.region || "us-east-1",
      });

      // Generate a secure database password
      const dbPassword = this.generatePassword(24);

      // Create project via Supabase Management API
      const projectResponse = await this.fetchWithRetry<SupabaseProjectResponse>(
        `${SUPABASE_API_BASE}/projects`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: this.sanitizeName(options.projectName),
            organization_id: this.config.baseUrl, // Organization ID passed via baseUrl
            region: options.region || "us-east-1",
            plan: options.tier === "free" ? "free" : "pro",
            db_pass: dbPassword,
          }),
        },
        "createProject"
      );

      // Wait for project to be ready
      const readyResult = await this.waitForReady(projectResponse.id, 600000); // 10 min for Supabase
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
        provisioningTimeMs,
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
