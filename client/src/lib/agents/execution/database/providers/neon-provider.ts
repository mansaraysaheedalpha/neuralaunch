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
  // Note: These arrays are returned at the top level of the response, not nested in project
  connection_uris?: Array<{
    connection_uri: string;
    connection_parameters: {
      host: string;
      database: string;
      role: string;
      password: string;
    };
  }>;
  roles?: Array<{
    name: string;
    password: string;
  }>;
  // Branches are returned at top level, not in project object
  branches?: Array<{
    id: string;
    name: string;
    project_id: string;
    current_state: string;
  }>;
  // Databases at top level
  databases?: Array<{
    id: number;
    name: string;
    owner_name: string;
    branch_id: string;
  }>;
  // Endpoints at top level
  endpoints?: Array<{
    id: string;
    host: string;
    type: string;
    branch_id: string;
  }>;
}

interface NeonProjectStatusResponse {
  project: {
    id: string;
    name: string;
    current_state: string;
  };
}

// Response for listing projects (idempotency check)
interface NeonListProjectsResponse {
  projects: Array<{
    id: string;
    name: string;
    region_id: string;
    created_at: string;
    current_state: string;
  }>;
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
    const sanitizedName = this.sanitizeName(options.projectName);

    try {
      // ===== IDEMPOTENCY CHECK =====
      // Before creating a new project, check if one with the same name already exists
      // This prevents duplicate database creation if the agent is run twice
      const existingProject = await this.findProjectByName(sanitizedName);

      if (existingProject) {
        logger.warn(`[${this.providerName}] Project with name '${sanitizedName}' already exists`, {
          existingProjectId: existingProject.id,
          existingRegion: existingProject.region_id,
        });

        // Return error asking for manual intervention
        // We can't return credentials because we don't have the password
        return {
          success: false,
          estimatedMonthlyCost: 0,
          provisioningTimeMs: Date.now() - startTime,
          warnings: [`Existing project found: ${existingProject.id}`],
          error: `A Neon project named '${sanitizedName}' already exists (ID: ${existingProject.id}). ` +
                 `To avoid duplicate databases, please either: ` +
                 `1) Delete the existing project at https://console.neon.tech/app/projects/${existingProject.id}, or ` +
                 `2) Use a different project name.`,
        };
      }

      logger.info(`[${this.providerName}] Provisioning database`, {
        projectName: sanitizedName,
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
              ...(this.config.orgId && { org_id: this.config.orgId }), // Required for org accounts
            },
          }),
        },
        "createProject"
      );

      const project = response.project;

      // Log response structure for debugging (without sensitive data)
      logger.debug(`[${this.providerName}] API response structure`, {
        hasProject: !!project,
        projectId: project?.id,
        hasConnectionUris: !!response.connection_uris,
        connectionUrisCount: response.connection_uris?.length || 0,
        hasRoles: !!response.roles,
        rolesCount: response.roles?.length || 0,
        hasBranches: !!response.branches,
        branchesCount: response.branches?.length || 0,
        hasProjectBranches: !!project?.branches,
        projectBranchesCount: project?.branches?.length || 0,
      });

      // Validate response - project must exist
      if (!project || !project.id) {
        return {
          success: false,
          estimatedMonthlyCost: 0,
          provisioningTimeMs: Date.now() - startTime,
          warnings,
          error: "Neon API returned invalid response: missing project data.",
        };
      }

      // Validate response arrays before accessing
      if (!response.connection_uris || response.connection_uris.length === 0) {
        return {
          success: false,
          estimatedMonthlyCost: 0,
          provisioningTimeMs: Date.now() - startTime,
          warnings,
          error: `Neon API returned no connection URIs for project ${project.id}. Project may have failed to initialize.`,
        };
      }

      if (!response.roles || response.roles.length === 0) {
        return {
          success: false,
          estimatedMonthlyCost: 0,
          provisioningTimeMs: Date.now() - startTime,
          warnings,
          error: `Neon API returned no database roles for project ${project.id}. Project may have failed to initialize.`,
        };
      }

      const connectionUri = response.connection_uris[0];
      const role = response.roles.find(r => r.name !== "postgres") || response.roles[0];

      // Parse connection parameters
      const connParams = connectionUri.connection_parameters;

      // Get branch ID from top-level response (not from project object)
      // Neon API returns branches at the response root level
      const branchId = response.branches?.[0]?.id ||
                       project.branches?.[0]?.id || // Fallback to project.branches if present
                       "";

      if (!branchId) {
        logger.warn(`[${this.providerName}] No branch ID found in response, using empty string`);
      }

      // ===== FIX #1: Handle Neon V2 API password behavior =====
      // In V2 API, roles array often returns password: null for security reasons.
      // We must use connParams.password as primary, with role.password as fallback.
      const password = connParams.password || role.password;

      if (!password) {
        return {
          success: false,
          estimatedMonthlyCost: 0,
          provisioningTimeMs: Date.now() - startTime,
          warnings,
          error: `Neon API returned no password for database role. Project ${project.id} may require manual password reset.`,
        };
      }

      // ===== FIX #2: Handle Neon V2 connection pooling correctly =====
      // In V2 API, the default host returned is the POOLER host (contains "-pooler").
      // For Prisma's directUrl, we need the NON-POOLER host.
      // Pooler host: ep-xxxx-pooler.region.aws.neon.tech
      // Direct host: ep-xxxx.region.aws.neon.tech
      const poolerHost = connParams.host;
      const isPoolerHost = poolerHost.includes("-pooler");
      const directHost = isPoolerHost
        ? poolerHost.replace("-pooler", "")
        : poolerHost;

      logger.debug(`[${this.providerName}] Connection hosts`, {
        poolerHost,
        directHost,
        isPoolerHost,
      });

      // Build connection strings
      // - connectionString: Uses pooler for connection pooling (default for app)
      // - directUrl: Uses direct connection for Prisma migrations (no pgbouncer)
      const connectionString = connectionUri.connection_uri;

      // Construct directUrl with non-pooler host for Prisma migrations
      // This ensures migrations don't go through pgbouncer which can cause issues
      const directUrl = `postgresql://${connParams.role}:${password}@${directHost}:5432/${connParams.database}?sslmode=require`;

      // Build credentials
      const credentials: DatabaseCredentials = {
        provider: "neon",
        databaseType: "postgresql",
        host: poolerHost, // Use pooler host as default (better for connection pooling)
        port: 5432,
        username: connParams.role,
        password,
        database: connParams.database,
        sslMode: "require",
        connectionString,
        directUrl,
        additionalEnvVars: {
          NEON_PROJECT_ID: project.id,
          NEON_BRANCH_ID: branchId,
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

  /**
   * Validates credentials format (does NOT test actual database connectivity).
   * Note: Actual connection testing would require a PostgreSQL client (pg).
   * This method only validates that the credentials have the expected format.
   */
  testConnection(credentials: DatabaseCredentials): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
    try {
      const startTime = Date.now();

      // Verify required fields
      if (!credentials.host || !credentials.password || !credentials.database) {
        return Promise.resolve({ success: false, error: "Missing required credentials" });
      }

      // Verify host format (should be *.neon.tech)
      if (!credentials.host.includes(".neon.tech")) {
        return Promise.resolve({ success: false, error: "Invalid Neon host format" });
      }

      // Verify connection string exists
      if (!credentials.connectionString) {
        return Promise.resolve({ success: false, error: "Missing connection string" });
      }

      const latencyMs = Date.now() - startTime;

      return Promise.resolve({
        success: true,
        latencyMs,
      });
    } catch (error) {
      return Promise.resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
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

  /**
   * Find an existing project by name (for idempotency check)
   * Returns the project if found, null otherwise
   */
  private async findProjectByName(
    projectName: string
  ): Promise<{ id: string; name: string; region_id: string } | null> {
    if (!this.config?.apiKey) {
      return null;
    }

    try {
      logger.debug(`[${this.providerName}] Checking for existing project`, { projectName });

      // List all projects and find one with matching name
      // Include org_id if configured (required for organization accounts)
      const url = this.config.orgId
        ? `${NEON_API_BASE}/projects?org_id=${this.config.orgId}`
        : `${NEON_API_BASE}/projects`;

      const response = await this.fetchWithRetry<NeonListProjectsResponse>(
        url,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        },
        "listProjects"
      );

      // Find project with exact name match (case-insensitive for safety)
      const existingProject = response.projects.find(
        (p) => p.name.toLowerCase() === projectName.toLowerCase()
      );

      if (existingProject) {
        logger.debug(`[${this.providerName}] Found existing project`, {
          projectId: existingProject.id,
          projectName: existingProject.name,
        });
        return {
          id: existingProject.id,
          name: existingProject.name,
          region_id: existingProject.region_id,
        };
      }

      return null;
    } catch (error) {
      // If we can't check for existing projects, log warning and proceed
      // This is a non-critical check, so we don't want to fail provisioning
      logger.warn(`[${this.providerName}] Could not check for existing projects`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

export const neonProvider = new NeonProvider();
