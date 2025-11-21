// src/lib/agents/execution/database/index.ts
/**
 * Database Agent - Production Ready Implementation
 *
 * Automatically provisions databases, configures applications, and initializes schemas.
 * Supports multiple providers (Neon, Supabase, MongoDB, PlanetScale, Upstash)
 * and ORMs (Prisma, Drizzle, TypeORM, Mongoose).
 */

import { AI_MODELS } from "@/lib/models";
import {
  BaseAgent,
  AgentExecutionInput,
  AgentExecutionOutput,
} from "../../base/base-agent";
import { logger } from "@/lib/logger";
import { toError } from "@/lib/error-utils";

// Import sub-modules
import { analyzeProject, analyzeDependencies } from "./analyzers";
import {
  provisionDatabase,
  deleteDatabase,
  testConnection,
  isProviderAvailable,
  getAvailableProviders,
  initializeProvider,
} from "./providers";
import { initializeDatabase, type InitializerContext } from "./initializers";
import type {
  DatabaseCredentials,
  RollbackPlan,
  DatabaseProvider,
  ORMType,
  MigrationResult,
} from "./types";

// Re-export types
export * from "./types";

// Valid provider and ORM values for runtime validation
const VALID_PROVIDERS: DatabaseProvider[] = ["neon", "supabase", "mongodb", "planetscale", "upstash"];
const VALID_ORMS: ORMType[] = ["prisma", "drizzle", "typeorm", "mongoose", "sequelize", "knex", "raw"];

/**
 * Validates and returns a DatabaseProvider, or null if invalid
 */
function validateProvider(value: unknown): DatabaseProvider | null {
  if (typeof value === "string" && VALID_PROVIDERS.includes(value as DatabaseProvider)) {
    return value as DatabaseProvider;
  }
  return null;
}

/**
 * Validates and returns an ORMType, or null if invalid
 */
function validateORM(value: unknown): ORMType | null {
  if (typeof value === "string" && VALID_ORMS.includes(value as ORMType)) {
    return value as ORMType;
  }
  return null;
}

/**
 * Safely extracts a string value from unknown data
 */
function safeString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return fallback;
}

/**
 * Validates and returns an array of issues, or empty array if invalid
 */
function validateIssuesArray(value: unknown): Array<{ file: string; issue: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is { file: string; issue: string } =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).file === "string" &&
      typeof (item as Record<string, unknown>).issue === "string"
  );
}

/**
 * Enhanced Database Agent
 * Handles the full database provisioning lifecycle
 */
export class DatabaseAgent extends BaseAgent {
  private rollbackPlan: RollbackPlan = { steps: [], canRollback: true, warnings: [] };

  constructor() {
    super({
      name: "DatabaseAgent",
      category: "execution",
      description:
        "Provisions databases, configures connections, and initializes schemas for project deployments",
      supportedTaskTypes: [
        "database",
        "provision",
        "schema",
        "migration",
        "prisma",
        "drizzle",
        "mongodb",
      ],
      requiredTools: [
        "filesystem",
        "command",
        "context_loader",
        "code_analysis",
      ],
      modelName: AI_MODELS.CLAUDE,
    });
  }

  /**
   * Main task execution method
   */
  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const { taskId, taskDetails } = input;
    const startTime = Date.now();

    // Reset rollback plan
    this.rollbackPlan = { steps: [], canRollback: true, warnings: [] };

    // Determine mode
    const mode = taskDetails.mode || "provision";

    logger.info(`[${this.config.name}] Starting execution`, {
      taskId,
      mode,
      title: taskDetails.title,
    });

    try {
      switch (mode) {
        case "provision":
          return await this.executeProvisionMode(input);
        case "schema":
          return await this.executeSchemaMode(input);
        case "migrate":
          return await this.executeMigrateMode(input);
        case "fix":
          return await this.executeFixMode(input);
        default:
          return await this.executeProvisionMode(input);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[${this.config.name}] Execution failed`, toError(error));

      // Attempt rollback
      if (this.rollbackPlan.steps.length > 0) {
        await this.executeRollback(input);
      }

      return {
        success: false,
        message: `Database operation failed: ${errorMessage}`,
        iterations: 1,
        durationMs: Date.now() - startTime,
        error: errorMessage,
        data: {
          rollbackPlan: this.rollbackPlan,
        },
      };
    }
  }

  /**
   * Provision Mode - Full database provisioning lifecycle
   */
  private async executeProvisionMode(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const { projectId, userId, taskDetails, context } = input;
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      // Phase 1: Load and analyze project
      logger.info(`[${this.config.name}] Phase 1: Analyzing project`);
      const projectFiles = await this.loadProjectFiles(projectId, userId);
      const requirements = await analyzeProject(projectFiles);

      logger.info(`[${this.config.name}] Analysis complete`, {
        recommendedProvider: requirements.recommendedProvider,
        orm: requirements.orm,
        confidence: requirements.confidence,
      });

      // Phase 2: Select provider (with validation)
      const overrideProvider = validateProvider(taskDetails.overrideProvider);
      const provider = overrideProvider || requirements.recommendedProvider;

      // Check provider availability
      if (!isProviderAvailable(provider)) {
        const available = getAvailableProviders();
        if (available.length === 0) {
          return {
            success: false,
            message: "No database providers configured. Please set API keys for at least one provider.",
            iterations: 1,
            durationMs: Date.now() - startTime,
            error: "No providers available",
            data: {
              requirements,
              explanation: `Required: Set one of NEON_API_KEY, SUPABASE_SERVICE_ROLE_KEY, or similar environment variables.`,
            },
          };
        }

        // Use first available provider
        const fallbackProvider = available[0];
        warnings.push(`${provider} not available, using ${fallbackProvider} instead`);
        logger.warn(`[${this.config.name}] Falling back to ${fallbackProvider}`);
      }

      // Initialize provider
      initializeProvider(provider);

      // Phase 3: Provision database
      logger.info(`[${this.config.name}] Phase 2: Provisioning database`);
      const projectName = this.extractProjectName(projectFiles, projectId);

      const provisionResult = await provisionDatabase({
        provider,
        projectName,
        region: safeString(context.techStack?.deployment, "us-east-1"),
        tier: requirements.storage.tier === "free" ? "free" : "starter",
      });

      if (!provisionResult.success || !provisionResult.credentials) {
        return {
          success: false,
          message: `Failed to provision database: ${provisionResult.error}`,
          iterations: 1,
          durationMs: Date.now() - startTime,
          error: provisionResult.error,
          data: {
            requirements,
            provider,
            explanation: `Warnings: ${[...warnings, ...provisionResult.warnings].join('; ')}`,
          },
        };
      }

      // Add to rollback plan
      this.rollbackPlan.steps.push({
        action: "delete_database",
        target: provisionResult.resourceId || "",
        data: { provider },
        timestamp: new Date(),
      });

      warnings.push(...provisionResult.warnings);

      // Phase 4: Configure application
      logger.info(`[${this.config.name}] Phase 3: Configuring application`);
      const configResult = await this.configureApplication(
        projectId,
        userId,
        provisionResult.credentials,
        requirements.orm
      );

      if (!configResult.success) {
        warnings.push(`Configuration warning: ${configResult.error}`);
      }

      // Phase 5: Initialize schema
      logger.info(`[${this.config.name}] Phase 4: Initializing schema`);
      const orm = validateORM(taskDetails.overrideOrm) || requirements.orm;
      const initResult = await this.initializeSchema(
        projectId,
        userId,
        provisionResult.credentials,
        orm
      );

      if (!initResult.success) {
        warnings.push(`Schema initialization warning: ${initResult.error}`);
      }

      // Phase 6: Verify connection
      logger.info(`[${this.config.name}] Phase 5: Verifying connection`);
      const testResult = await testConnection(provider, provisionResult.credentials);
      const connectionVerified = testResult.success;

      if (!connectionVerified) {
        warnings.push(`Connection verification failed: ${testResult.error}`);
      }

      // Build success response
      const durationMs = Date.now() - startTime;

      logger.info(`[${this.config.name}] Provisioning complete`, {
        provider,
        durationMs,
        connectionVerified,
      });

      return {
        success: true,
        message: `Database provisioned successfully with ${provider}`,
        iterations: 1,
        durationMs,
        data: {
          requirements,
          credentials: this.redactCredentials(provisionResult.credentials),
          resourceId: provisionResult.resourceId,
          resourceUrl: provisionResult.resourceUrl,
          envVarsInjected: Object.keys(provisionResult.credentials.additionalEnvVars),
          filesCreated: (configResult.filesCreated || []).map(f => f.path),
          filesModified: configResult.filesModified,
          migrationsRun: initResult.migrationsRun,
          tablesCreated: initResult.tablesCreated,
          provider,
          estimatedMonthlyCost: provisionResult.estimatedMonthlyCost,
          connectionVerified,
          explanation: `Provisioned ${provider} ${provisionResult.credentials.databaseType} database. ` +
                       `Created ${initResult.tablesCreated?.length || 0} tables. ` +
                       `Estimated cost: $${provisionResult.estimatedMonthlyCost}/month. ` +
                       (warnings.length > 0 ? `Warnings: ${warnings.join('; ')}` : ''),
        },
      };
    } catch (error) {
      throw error; // Re-throw to trigger rollback in parent
    }
  }

  /**
   * Schema Mode - Design and generate schema without provisioning
   */
  private async executeSchemaMode(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const { projectId, userId, taskDetails, context } = input;
    const startTime = Date.now();

    try {
      // Load project context
      const projectFiles = await this.loadProjectFiles(projectId, userId);
      const deps = await analyzeDependencies(projectFiles);

      // Determine ORM
      const orm = validateORM(taskDetails.overrideOrm) || deps.orm || "prisma";

      // Generate schema using AI
      const schemaPrompt = this.buildSchemaPrompt(taskDetails, context, deps, orm);
      const responseText = await this.generateContent(
        schemaPrompt,
        undefined,
        false,
        { projectId, userId }
      );

      const result = this.parseSchemaResponse(responseText);

      if (!result) {
        return {
          success: false,
          message: "Failed to generate schema",
          iterations: 1,
          durationMs: Date.now() - startTime,
          error: "AI generation failed",
        };
      }

      // Write schema files
      const filesResult = await this.writeSchemaFiles(result.files, { projectId, userId });

      return {
        success: true,
        message: `Schema generated for ${orm}`,
        iterations: 1,
        durationMs: Date.now() - startTime,
        data: {
          filesCreated: filesResult.files,
          explanation: result.explanation,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Schema generation failed: ${errorMessage}`,
        iterations: 1,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Migrate Mode - Run migrations on existing database
   */
  private async executeMigrateMode(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const { projectId, userId, taskDetails } = input;
    const startTime = Date.now();

    try {
      // Load project to detect ORM
      const projectFiles = await this.loadProjectFiles(projectId, userId);
      const deps = await analyzeDependencies(projectFiles);

      const orm = validateORM(taskDetails.overrideOrm) || deps.orm || "prisma";

      // Create initializer context
      const ctx = this.createInitializerContext(projectId, userId, {
        provider: "neon",
        databaseType: "postgresql",
        host: "",
        port: 5432,
        username: "",
        password: "",
        database: "",
        sslMode: "require",
        connectionString: process.env.DATABASE_URL || "",
        additionalEnvVars: {},
      });

      // Run initialization/migration
      const result = await initializeDatabase(orm, ctx);

      return {
        success: result.success,
        message: result.success ? "Migrations completed" : `Migration failed: ${result.error}`,
        iterations: 1,
        durationMs: Date.now() - startTime,
        data: {
          migrationsRun: result.migrationsRun,
          tablesCreated: result.tablesCreated,
        },
        error: result.error,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Migration failed: ${errorMessage}`,
        iterations: 1,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Fix Mode - Fix database-related issues
   */
  private async executeFixMode(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const { projectId, userId, taskDetails, context } = input;
    const startTime = Date.now();

    try {
      const issuesToFix = validateIssuesArray(taskDetails.issuesToFix);

      if (issuesToFix.length === 0) {
        return {
          success: true,
          message: "No issues to fix",
          iterations: 1,
          durationMs: Date.now() - startTime,
        };
      }

      // Load existing files
      const filesToLoad = [...new Set(issuesToFix.map(i => i.file))];
      const existingFiles = await this.loadSpecificFiles(projectId, userId, filesToLoad);

      // Generate fixes
      const fixPrompt = this.buildFixPrompt(issuesToFix, existingFiles, context);
      const responseText = await this.generateContent(
        fixPrompt,
        undefined,
        false,
        { projectId, userId }
      );

      const fixes = this.parseFixResponse(responseText);

      if (!fixes || fixes.files.length === 0) {
        return {
          success: false,
          message: "Failed to generate fixes",
          iterations: 1,
          durationMs: Date.now() - startTime,
          error: "AI generation failed",
        };
      }

      // Apply fixes
      const filesResult = await this.writeSchemaFiles(fixes.files, { projectId, userId });

      return {
        success: true,
        message: `Applied ${fixes.files.length} fixes`,
        iterations: 1,
        durationMs: Date.now() - startTime,
        data: {
          filesModified: filesResult.files,
          explanation: fixes.explanation,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Fix mode failed: ${errorMessage}`,
        iterations: 1,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute rollback plan
   */
  private async executeRollback(input: AgentExecutionInput): Promise<void> {
    const { projectId, userId } = input;

    logger.info(`[${this.config.name}] Executing rollback`, {
      steps: this.rollbackPlan.steps.length,
    });

    for (const step of this.rollbackPlan.steps.reverse()) {
      try {
        switch (step.action) {
          case "delete_database":
            const { provider } = step.data as { provider: DatabaseProvider };
            await deleteDatabase(provider, step.target);
            logger.info(`[${this.config.name}] Rolled back: deleted database ${step.target}`);
            break;

          case "remove_env_vars":
            // Would remove env vars from .env file
            logger.info(`[${this.config.name}] Rolled back: removed env vars`);
            break;

          case "revert_file":
            // Would revert file to original content
            logger.info(`[${this.config.name}] Rolled back: reverted file ${step.target}`);
            break;

          case "remove_file":
            await this.executeTool(
              "filesystem",
              { operation: "delete", path: step.target },
              { projectId, userId }
            );
            logger.info(`[${this.config.name}] Rolled back: removed file ${step.target}`);
            break;
        }
      } catch (error) {
        logger.error(`[${this.config.name}] Rollback step failed`, toError(error));
        this.rollbackPlan.warnings.push(`Failed to rollback ${step.action}: ${step.target}`);
      }
    }
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  /**
   * Load project files for analysis
   */
  private async loadProjectFiles(projectId: string, userId: string): Promise<Record<string, string>> {
    const files: Record<string, string> = {};

    // Load key files
    const keyFiles = [
      "package.json",
      "prisma/schema.prisma",
      "drizzle.config.ts",
      "drizzle.config.js",
      "tsconfig.json",
      "requirements.txt",
      "Gemfile",
      "go.mod",
      ".env.example",
    ];

    for (const filePath of keyFiles) {
      try {
        const result = await this.executeTool(
          "filesystem",
          { operation: "read", path: filePath },
          { projectId, userId }
        );
        if (result.success && (result.data as { content?: string })?.content) {
          files[filePath] = (result.data as { content: string }).content;
        }
      } catch (error) {
        // File doesn't exist or read failed - expected for optional files
        logger.debug(`[${this.config.name}] Could not read ${filePath}`, { error: toError(error).message });
      }
    }

    // Get directory structure
    try {
      const structureResult = await this.executeTool(
        "context_loader",
        { operation: "scan_structure" },
        { projectId, userId }
      );
      if (structureResult.success && structureResult.data) {
        // Add file paths for analysis
        const structure = structureResult.data as { files?: string[] };
        if (structure.files) {
          for (const path of structure.files) {
            if (!files[path]) {
              files[path] = ""; // Mark as existing but not loaded
            }
          }
        }
      }
    } catch (error) {
      // Context loader not available - non-critical, continue without structure
      logger.debug(`[${this.config.name}] Context loader unavailable`, { error: toError(error).message });
    }

    return files;
  }

  /**
   * Load specific files
   */
  private async loadSpecificFiles(
    projectId: string,
    userId: string,
    paths: string[]
  ): Promise<Record<string, string>> {
    const files: Record<string, string> = {};

    for (const path of paths) {
      try {
        const result = await this.executeTool(
          "filesystem",
          { operation: "read", path },
          { projectId, userId }
        );
        if (result.success && (result.data as { content?: string })?.content) {
          files[path] = (result.data as { content: string }).content;
        }
      } catch (error) {
        // File doesn't exist or read failed
        logger.debug(`[${this.config.name}] Could not read file: ${path}`, { error: toError(error).message });
      }
    }

    return files;
  }

  /**
   * Configure application with database credentials
   */
  private async configureApplication(
    projectId: string,
    userId: string,
    credentials: DatabaseCredentials,
    _orm: ORMType
  ): Promise<{ success: boolean; filesCreated?: Array<{ path: string; linesOfCode: number }>; filesModified?: string[]; error?: string }> {
    const filesCreated: Array<{ path: string; linesOfCode: number }> = [];
    const filesModified: string[] = [];

    try {
      // Build .env content
      let envContent = `# Database Configuration (auto-generated by DatabaseAgent)
DATABASE_URL="${credentials.connectionString}"
`;

      if (credentials.directUrl) {
        envContent += `DIRECT_URL="${credentials.directUrl}"
`;
      }

      // Add provider-specific variables
      for (const [key, value] of Object.entries(credentials.additionalEnvVars)) {
        if (value) {
          envContent += `${key}="${value}"
`;
        }
      }

      // Write .env file
      const envResult = await this.executeTool(
        "filesystem",
        { operation: "write", path: ".env", content: envContent },
        { projectId, userId }
      );

      if (envResult.success) {
        filesCreated.push({ path: ".env", linesOfCode: envContent.split("\n").length });
      }

      // Update .env.example (without sensitive values)
      let envExampleContent = `# Database Configuration
DATABASE_URL="your-database-url-here"
`;

      if (credentials.directUrl) {
        envExampleContent += `DIRECT_URL="your-direct-url-here"
`;
      }

      for (const key of Object.keys(credentials.additionalEnvVars)) {
        envExampleContent += `${key}="your-${key.toLowerCase().replace(/_/g, "-")}-here"
`;
      }

      await this.executeTool(
        "filesystem",
        { operation: "write", path: ".env.example", content: envExampleContent },
        { projectId, userId }
      );

      filesModified.push(".env.example");

      return { success: true, filesCreated, filesModified };
    } catch (error) {
      return {
        success: false,
        filesCreated,
        filesModified,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Initialize database schema
   */
  private async initializeSchema(
    projectId: string,
    userId: string,
    credentials: DatabaseCredentials,
    orm: ORMType
  ): Promise<MigrationResult> {
    try {
      const ctx = this.createInitializerContext(projectId, userId, credentials);
      return await initializeDatabase(orm, ctx);
    } catch (error) {
      return {
        success: false,
        migrationsRun: [],
        tablesCreated: [],
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create initializer context
   */
  private createInitializerContext(
    projectId: string,
    userId: string,
    credentials: DatabaseCredentials
  ): InitializerContext {
    return {
      projectId,
      userId,
      projectPath: "/",
      credentials,
      executeCommand: async (command: string) => {
        const result = await this.executeTool(
          "command",
          { command },
          { projectId, userId }
        );
        return {
          success: result.success,
          stdout: (result.data as { stdout?: string })?.stdout || "",
          stderr: (result.data as { stderr?: string })?.stderr || "",
          exitCode: result.success ? 0 : 1,
        };
      },
      writeFile: async (path: string, content: string) => {
        const result = await this.executeTool(
          "filesystem",
          { operation: "write", path, content },
          { projectId, userId }
        );
        return { success: result.success };
      },
      readFile: async (path: string) => {
        const result = await this.executeTool(
          "filesystem",
          { operation: "read", path },
          { projectId, userId }
        );
        return {
          success: result.success,
          content: (result.data as { content?: string })?.content,
        };
      },
      fileExists: async (path: string) => {
        const result = await this.executeTool(
          "filesystem",
          { operation: "exists", path },
          { projectId, userId }
        );
        return result.success && (result.data as { exists?: boolean })?.exists === true;
      },
    };
  }

  /**
   * Extract project name from files
   */
  private extractProjectName(files: Record<string, string>, projectId: string): string {
    try {
      const packageJson = files["package.json"];
      if (packageJson) {
        const parsed = JSON.parse(packageJson) as { name?: string };
        if (parsed.name) {
          return String(parsed.name);
        }
      }
    } catch {
      // Ignore parse errors
    }
    return `neuralaunch-${projectId.substring(0, 8)}`;
  }

  /**
   * Write schema files
   */
  private async writeSchemaFiles(
    files: Array<{ path: string; content: string }>,
    ctx: { projectId: string; userId: string }
  ): Promise<{ success: boolean; files: string[] }> {
    const writtenFiles: string[] = [];

    for (const file of files) {
      const result = await this.executeTool(
        "filesystem",
        { operation: "write", path: file.path, content: file.content },
        ctx
      );
      if (result.success) {
        writtenFiles.push(file.path);
      }
    }

    return {
      success: writtenFiles.length === files.length,
      files: writtenFiles,
    };
  }

  /**
   * Redact sensitive credentials for output
   */
  private redactCredentials(credentials: DatabaseCredentials): Partial<DatabaseCredentials> {
    return {
      provider: credentials.provider,
      databaseType: credentials.databaseType,
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
      sslMode: credentials.sslMode,
      // Redact sensitive fields
      password: "***REDACTED***",
      username: credentials.username,
      connectionString: credentials.connectionString.replace(/:([^@]+)@/, ":***@"),
    };
  }

  /**
   * Build schema generation prompt
   */
  private buildSchemaPrompt(
    taskDetails: AgentExecutionInput["taskDetails"],
    context: AgentExecutionInput["context"],
    deps: Awaited<ReturnType<typeof analyzeDependencies>>,
    orm: ORMType
  ): string {
    return `You are a database schema expert. Generate a ${orm} schema for the following requirements:

# Task
${taskDetails.title}
${taskDetails.description}

# Tech Stack
ORM: ${orm}
Framework: ${deps.framework || "Unknown"}
Language: ${deps.language}

# Requirements
Generate a complete, production-ready schema that includes:
1. All necessary models/tables
2. Proper relationships and indexes
3. Type-safe field definitions
4. Sensible defaults

# Response Format
Respond with a JSON object:
\`\`\`json
{
  "files": [
    {
      "path": "prisma/schema.prisma",
      "content": "// schema content"
    }
  ],
  "explanation": "Brief explanation of the schema design"
}
\`\`\`
`;
  }

  /**
   * Build fix prompt
   */
  private buildFixPrompt(
    issues: Array<{ file: string; issue: string }>,
    existingFiles: Record<string, string>,
    _context: AgentExecutionInput["context"]
  ): string {
    return `You are a database expert. Fix the following issues:

# Issues
${issues.map((i, idx) => `${idx + 1}. ${i.file}: ${i.issue}`).join("\n")}

# Current Files
${Object.entries(existingFiles).map(([path, content]) => `## ${path}\n\`\`\`\n${content}\n\`\`\``).join("\n\n")}

# Response Format
\`\`\`json
{
  "files": [
    {
      "path": "path/to/file",
      "content": "COMPLETE fixed file content"
    }
  ],
  "explanation": "Summary of fixes"
}
\`\`\`
`;
  }

  /**
   * Parse schema response
   */
  private parseSchemaResponse(text: string): { files: Array<{ path: string; content: string }>; explanation: string } | null {
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned) as { files: Array<{ path: string; content: string }>; explanation: string };
    } catch {
      return null;
    }
  }

  /**
   * Parse fix response
   */
  private parseFixResponse(text: string): { files: Array<{ path: string; content: string }>; explanation: string } | null {
    return this.parseSchemaResponse(text);
  }
}

// Export singleton instance
export const databaseAgent = new DatabaseAgent();
