// src/lib/agents/execution/database/services/branch-service.ts
/**
 * Database Branch Service
 *
 * Manages database branches for preview deployments.
 * Supports Neon (native branching) and Supabase (via projects).
 *
 * Why branches are CRITICAL for previews:
 * - If Wave 1 modifies schema.prisma and adds a required column
 * - Deploying preview without migrations = 500 Internal Server Error
 * - Database branches allow running migrations on isolated copies
 *
 * Best Practice Flow:
 * 1. Create database branch for wave-N
 * 2. Run migrations on the branch
 * 3. Inject branch's DATABASE_URL into Vercel preview env
 * 4. Deploy preview
 * 5. Clean up branch when PR is merged/closed
 */

import { logger } from "@/lib/logger";
import type {
  DatabaseProvider,
  CreateBranchOptions,
  CreateBranchResult,
  DeleteBranchOptions,
  DeleteBranchResult,
  DatabaseBranch,
  BranchInfo,
} from "../types";

const NEON_API_BASE = "https://console.neon.tech/api/v2";
const SUPABASE_API_BASE = "https://api.supabase.com/v1";

// ==========================================
// NEON BRANCH TYPES
// ==========================================

interface NeonBranchResponse {
  branch: {
    id: string;
    name: string;
    project_id: string;
    parent_id: string;
    current_state: string;
    created_at: string;
  };
  endpoints?: Array<{
    id: string;
    host: string;
    branch_id: string;
  }>;
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
    password?: string;
  }>;
}

interface NeonEndpointResponse {
  endpoint: {
    id: string;
    host: string;
    branch_id: string;
    type: string;
    current_state: string;
  };
}

interface NeonListBranchesResponse {
  branches: Array<{
    id: string;
    name: string;
    parent_id: string;
    current_state: string;
  }>;
}

// ==========================================
// MAIN BRANCH SERVICE CLASS
// ==========================================

export class DatabaseBranchService {
  private readonly name = "DatabaseBranchService";

  /**
   * Create a database branch for preview deployment
   *
   * For Neon: Uses native branching (instant, copy-on-write)
   * For Supabase: Creates a linked project (slower but works)
   */
  async createBranch(options: CreateBranchOptions): Promise<CreateBranchResult> {
    const { provider, projectId, parentBranchId, branchName, apiKey } = options;

    logger.info(`[${this.name}] Creating database branch`, {
      provider,
      projectId,
      branchName,
    });

    try {
      switch (provider) {
        case "neon":
          return await this.createNeonBranch(projectId, parentBranchId, branchName, apiKey);

        case "supabase":
          // Supabase doesn't have native branching yet
          // We'll use their branching beta or skip for now
          return await this.createSupabaseBranch(projectId, branchName, apiKey);

        default:
          return {
            success: false,
            error: `Database branching not supported for provider: ${provider}`,
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[${this.name}] Failed to create branch`, undefined, { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Delete a database branch (cleanup after PR merge)
   */
  async deleteBranch(options: DeleteBranchOptions): Promise<DeleteBranchResult> {
    const { provider, projectId, branchId, apiKey } = options;

    logger.info(`[${this.name}] Deleting database branch`, {
      provider,
      projectId,
      branchId,
    });

    try {
      switch (provider) {
        case "neon":
          return await this.deleteNeonBranch(projectId, branchId, apiKey);

        case "supabase":
          return await this.deleteSupabaseBranch(branchId, apiKey);

        default:
          return {
            success: false,
            error: `Database branching not supported for provider: ${provider}`,
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[${this.name}] Failed to delete branch`, undefined, { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * List all branches for a project
   */
  async listBranches(
    provider: DatabaseProvider,
    projectId: string,
    apiKey: string
  ): Promise<BranchInfo[]> {
    switch (provider) {
      case "neon":
        return await this.listNeonBranches(projectId, apiKey);

      case "supabase":
        // Supabase branching is via separate projects
        return [];

      default:
        return [];
    }
  }

  /**
   * Get branch by name (for idempotency checks)
   */
  async getBranchByName(
    provider: DatabaseProvider,
    projectId: string,
    branchName: string,
    apiKey: string
  ): Promise<BranchInfo | null> {
    const branches = await this.listBranches(provider, projectId, apiKey);
    return branches.find(b => b.name === branchName) || null;
  }

  // ==========================================
  // NEON IMPLEMENTATION
  // ==========================================

  /**
   * Create a Neon database branch
   * Neon branches are instant copy-on-write forks
   */
  private async createNeonBranch(
    projectId: string,
    parentBranchId: string,
    branchName: string,
    apiKey: string
  ): Promise<CreateBranchResult> {
    // Step 1: Check if branch already exists (idempotency)
    const existingBranch = await this.getBranchByName("neon", projectId, branchName, apiKey);
    if (existingBranch) {
      logger.info(`[${this.name}] Branch already exists, reusing`, {
        branchId: existingBranch.id,
        branchName,
      });

      // Get connection string for existing branch
      const connectionString = existingBranch.connectionString ||
        await this.getNeonBranchConnectionString(projectId, existingBranch.id, apiKey);

      return {
        success: true,
        branch: {
          id: existingBranch.id,
          name: existingBranch.name,
          parentBranchId,
          projectId,
          provider: "neon",
          status: "ready",
          createdAt: new Date(),
        },
        connectionString,
      };
    }

    // Step 2: Create the branch
    logger.info(`[${this.name}] Creating Neon branch`, {
      projectId,
      parentBranchId,
      branchName,
    });

    const createResponse = await fetch(
      `${NEON_API_BASE}/projects/${projectId}/branches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branch: {
            name: branchName,
            parent_id: parentBranchId,
          },
          endpoints: [
            {
              type: "read_write",
              autoscaling_limit_min_cu: 0.25,
              autoscaling_limit_max_cu: 0.25,
            },
          ],
        }),
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Neon API error: ${createResponse.status} - ${errorText}`);
    }

    const response = (await createResponse.json()) as NeonBranchResponse;
    const branch = response.branch;

    // Step 3: Wait for branch to be ready
    await this.waitForNeonBranchReady(projectId, branch.id, apiKey);

    // Step 4: Get connection credentials
    // If connection_uris is in the response, use it
    let connectionString: string | undefined;
    let directUrl: string | undefined;

    if (response.connection_uris && response.connection_uris.length > 0) {
      connectionString = response.connection_uris[0].connection_uri;

      const connParams = response.connection_uris[0].connection_parameters;
      const password = connParams.password ||
        response.roles?.find(r => r.name === connParams.role)?.password;

      if (password && connParams.host) {
        // Build direct URL without pooler for migrations
        const directHost = connParams.host.replace("-pooler", "");
        directUrl = `postgresql://${connParams.role}:${password}@${directHost}:5432/${connParams.database}?sslmode=require`;
      }
    } else {
      // Fetch connection string separately
      connectionString = await this.getNeonBranchConnectionString(projectId, branch.id, apiKey);
    }

    const endpoint = response.endpoints?.[0];

    logger.info(`[${this.name}] Neon branch created successfully`, {
      branchId: branch.id,
      branchName: branch.name,
      hasConnectionString: !!connectionString,
    });

    return {
      success: true,
      branch: {
        id: branch.id,
        name: branch.name,
        parentBranchId: branch.parent_id,
        projectId,
        provider: "neon",
        status: "ready",
        createdAt: new Date(branch.created_at),
        endpoint: endpoint ? { id: endpoint.id, host: endpoint.host } : undefined,
      },
      connectionString,
      directUrl,
    };
  }

  /**
   * Wait for Neon branch to be ready
   */
  private async waitForNeonBranchReady(
    projectId: string,
    branchId: string,
    apiKey: string,
    maxWaitMs: number = 60000
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < maxWaitMs) {
      const response = await fetch(
        `${NEON_API_BASE}/projects/${projectId}/branches/${branchId}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (response.ok) {
        const data = (await response.json()) as { branch: { current_state: string } };
        if (data.branch.current_state === "ready") {
          return;
        }
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Neon branch did not become ready within ${maxWaitMs}ms`);
  }

  /**
   * Get connection string for an existing Neon branch
   */
  private async getNeonBranchConnectionString(
    projectId: string,
    branchId: string,
    apiKey: string
  ): Promise<string | undefined> {
    try {
      // Get endpoints for the branch
      const endpointsResponse = await fetch(
        `${NEON_API_BASE}/projects/${projectId}/branches/${branchId}/endpoints`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (!endpointsResponse.ok) {
        return undefined;
      }

      const endpointsData = (await endpointsResponse.json()) as {
        endpoints: Array<{ id: string; host: string }>;
      };

      const endpoint = endpointsData.endpoints?.[0];
      if (!endpoint) {
        return undefined;
      }

      // Get role/password info
      const rolesResponse = await fetch(
        `${NEON_API_BASE}/projects/${projectId}/branches/${branchId}/roles`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (!rolesResponse.ok) {
        return undefined;
      }

      const rolesData = (await rolesResponse.json()) as {
        roles: Array<{ name: string; password?: string }>;
      };

      const role = rolesData.roles?.find(r => r.name !== "postgres") || rolesData.roles?.[0];

      // Get database name
      const dbResponse = await fetch(
        `${NEON_API_BASE}/projects/${projectId}/branches/${branchId}/databases`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (!dbResponse.ok) {
        return undefined;
      }

      const dbData = (await dbResponse.json()) as {
        databases: Array<{ name: string }>;
      };

      const database = dbData.databases?.[0]?.name || "neondb";

      if (role && role.password && endpoint.host) {
        return `postgresql://${role.name}:${role.password}@${endpoint.host}:5432/${database}?sslmode=require`;
      }

      return undefined;
    } catch (error) {
      logger.warn(`[${this.name}] Failed to get connection string`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * List all Neon branches for a project
   */
  private async listNeonBranches(
    projectId: string,
    apiKey: string
  ): Promise<BranchInfo[]> {
    try {
      const response = await fetch(
        `${NEON_API_BASE}/projects/${projectId}/branches`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as NeonListBranchesResponse;

      return data.branches.map(b => ({
        id: b.id,
        name: b.name,
        ready: b.current_state === "ready",
      }));
    } catch {
      return [];
    }
  }

  /**
   * Delete a Neon branch
   */
  private async deleteNeonBranch(
    projectId: string,
    branchId: string,
    apiKey: string
  ): Promise<DeleteBranchResult> {
    // First, get the branch to check it's not the default/main branch
    const branchResponse = await fetch(
      `${NEON_API_BASE}/projects/${projectId}/branches/${branchId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!branchResponse.ok) {
      return {
        success: false,
        error: `Branch not found: ${branchId}`,
      };
    }

    const branchData = (await branchResponse.json()) as {
      branch: { name: string; parent_id?: string };
    };

    // Don't delete the main branch
    if (!branchData.branch.parent_id || branchData.branch.name === "main") {
      return {
        success: false,
        error: "Cannot delete the main branch",
      };
    }

    // Delete the branch
    const deleteResponse = await fetch(
      `${NEON_API_BASE}/projects/${projectId}/branches/${branchId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      return {
        success: false,
        error: `Failed to delete branch: ${errorText}`,
      };
    }

    logger.info(`[${this.name}] Neon branch deleted`, { branchId });
    return { success: true };
  }

  // ==========================================
  // SUPABASE IMPLEMENTATION
  // ==========================================

  /**
   * Create a Supabase branch
   * Note: Supabase branching is in beta. For now, we return an error
   * suggesting manual intervention or using the production DB.
   */
  private async createSupabaseBranch(
    projectId: string,
    branchName: string,
    apiKey: string
  ): Promise<CreateBranchResult> {
    // Supabase branching API (beta as of 2024)
    // https://supabase.com/docs/guides/platform/branching

    logger.info(`[${this.name}] Attempting Supabase branch creation`, {
      projectId,
      branchName,
    });

    try {
      // Try the branching API (beta)
      const response = await fetch(
        `${SUPABASE_API_BASE}/projects/${projectId}/branches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            branch_name: branchName,
            git_branch: branchName, // Link to git branch
          }),
        }
      );

      if (response.ok) {
        const data = (await response.json()) as {
          id: string;
          name: string;
          status: string;
          db_host: string;
          db_port: number;
          db_user: string;
          db_pass: string;
          db_name: string;
        };

        const connectionString = `postgresql://${data.db_user}:${data.db_pass}@${data.db_host}:${data.db_port}/${data.db_name}?sslmode=require`;

        return {
          success: true,
          branch: {
            id: data.id,
            name: data.name,
            parentBranchId: "main",
            projectId,
            provider: "supabase",
            status: "ready",
            createdAt: new Date(),
          },
          connectionString,
        };
      }

      // Branching not available or failed
      const errorText = await response.text();

      // Check if branching is not enabled for this project
      if (response.status === 404 || errorText.includes("branching")) {
        return {
          success: false,
          error:
            `Supabase database branching is not enabled for this project. ` +
            `Please enable branching in the Supabase dashboard (Project Settings > Branching) ` +
            `or use the main database with manual migration handling.`,
        };
      }

      return {
        success: false,
        error: `Supabase branch creation failed: ${errorText}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Provide helpful error for Supabase
      return {
        success: false,
        error:
          `Supabase branching unavailable: ${errorMessage}. ` +
          `Consider enabling Supabase branching in your project settings, ` +
          `or run migrations on the main database with caution.`,
      };
    }
  }

  /**
   * Delete a Supabase branch
   */
  private async deleteSupabaseBranch(
    branchId: string,
    apiKey: string
  ): Promise<DeleteBranchResult> {
    try {
      const response = await fetch(
        `${SUPABASE_API_BASE}/branches/${branchId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Failed to delete Supabase branch: ${errorText}`,
        };
      }

      logger.info(`[${this.name}] Supabase branch deleted`, { branchId });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Export singleton instance
export const databaseBranchService = new DatabaseBranchService();
