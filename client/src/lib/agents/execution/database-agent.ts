// src/lib/agents/execution/database-agent.ts
/**
 * Database Agent
 * Specialized in database schema design, migrations, and query optimization
 */

import { AI_MODELS } from "@/lib/models";
import {
  BaseAgent,
  AgentExecutionInput,
  AgentExecutionOutput,
} from "../base/base-agent";
import type { ProjectContext } from "../types/common";
import { logger } from "@/lib/logger";
import { toError, toLogContext } from "@/lib/error-utils";

export class DatabaseAgent extends BaseAgent {
  constructor() {
    super({
      name: "DatabaseAgent",
      category: "execution",
      description:
        "Specialized in database schema design, migrations, Prisma models, and query optimization",
      supportedTaskTypes: [
        "database",
        "schema",
        "migration",
        "prisma",
        "queries",
      ],
      requiredTools: [
        "filesystem",
        "git",
        "command",
        "web_search",
        "code_analysis",
        "context_loader",
      ],
      modelName: AI_MODELS.CLAUDE, // Claude Sonnet 4.5 for superior database design and reasoning
    });
  }

  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const { projectId, userId, taskDetails, context: _context } = input;

    // Check if this is a fix request
    const isFixMode = taskDetails.mode === "fix";

    if (isFixMode) {
      logger.info(
        `[${this.config.name}] FIX MODE: Fixing database issues for task "${
          typeof taskDetails.originalTaskId === "string" ||
          typeof taskDetails.originalTaskId === "number"
            ? taskDetails.originalTaskId
            : taskDetails.originalTaskId
              ? JSON.stringify(taskDetails.originalTaskId)
              : ""
        }"`,
        {
          attempt: taskDetails.attempt,
          issuesCount: Array.isArray(taskDetails.issuesToFix)
            ? taskDetails.issuesToFix.length
            : 0,
        }
      );

      return await this.executeFixMode(input);
    }

    // Normal execution mode
    logger.info(
      `[${this.config.name}] Executing database task: "${taskDetails.title}"`
    );

    try {
      const implementation = await this.generateImplementation(input);

      if (!implementation) {
        return {
          success: false,
          message: "Failed to generate database implementation",
          iterations: 1,
          durationMs: 0,
          error: "AI generation failed",
        };
      }

      // Write schema/migration files
      const filesResult = await this.writeFiles(implementation.files, {
        projectId,
        userId,
      });

      if (!filesResult.success) {
        return {
          success: false,
          message: "Failed to write database files",
          iterations: 1,
          durationMs: 0,
          error: filesResult.error,
          data: {
            filesCreated: filesResult.files,
            filesData: filesResult.filesData,
          },
        };
      }

      // Run Prisma/database commands (migrations, generate, etc.)
      const commandsResult = await this.runCommands(implementation.commands, {
        projectId,
        userId,
      });

      if (!commandsResult.success) {
        return {
          success: false,
          message: "Failed to execute database commands",
          iterations: 1,
          durationMs: 0,
          error: commandsResult.error,
          data: {
            filesCreated: filesResult.files,
            filesData: filesResult.filesData,
            commands: commandsResult.commands,
          },
        };
      }

      // Verify the database implementation
      const verification = this.verifyImplementation(
        filesResult.files,
        commandsResult.commands,
        taskDetails
      );

      if (!verification.passed) {
        return {
          success: false,
          message: "Database verification failed",
          iterations: 1,
          durationMs: 0,
          error: verification.issues.join("; "),
          data: {
            filesCreated: filesResult.files,
            filesData: filesResult.filesData,
            commands: commandsResult.commands,
          },
        };
      }

      return {
        success: true,
        message: `Database task completed: ${taskDetails.title}`,
        iterations: 1,
        durationMs: 0,
        data: {
          filesCreated: filesResult.files,
          filesData: filesResult.filesData,
          commands: commandsResult.commands,
          explanation: implementation.explanation,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        `[${this.config.name}] Task execution failed`,
        toError(error)
      );

      return {
        success: false,
        message: "Database task execution failed",
        iterations: 1,
        durationMs: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute in fix mode - fix database issues found by critic
   */
  private async executeFixMode(
    input: AgentExecutionInput
  ): Promise<AgentExecutionOutput> {
    const { projectId, userId, taskDetails, context } = input;

    try {
      // Load files that need fixing
      const issuesToFix = taskDetails.issuesToFix as Array<{
        file: string;
        issue: string;
      }>;
      const filesToFix = issuesToFix.map((issue) => issue.file);
      const uniqueFiles = Array.from(new Set(filesToFix));

      logger.info(
        `[${this.config.name}] Loading ${uniqueFiles.length} files to fix`
      );

      const existingFiles = await this.loadFilesToFix(
        projectId,
        userId,
        uniqueFiles
      );

      // Generate fixes using AI
      const fixPrompt = this.buildFixPrompt(
        issuesToFix,
        existingFiles,
        taskDetails.attempt as number,
        context
      );

      const responseText = await this.generateContent(fixPrompt);

      const fixes = this.parseFixResponse(responseText);

      if (!fixes || fixes.files.length === 0) {
        return {
          success: false,
          message: "Failed to generate database fixes",
          iterations: 1,
          durationMs: 0,
          error: "AI could not generate fixes",
        };
      }

      // Apply fixes
      const filesResult = await this.writeFiles(fixes.files, {
        projectId,
        userId,
      });

      if (!filesResult.success) {
        return {
          success: false,
          message: "Failed to apply database fixes",
          iterations: 1,
          durationMs: 0,
          error: filesResult.error,
          data: {
            filesCreated: filesResult.files,
            filesData: filesResult.filesData,
          },
        };
      }

      // Run fix commands if needed
      const commandsResult = await this.runCommands(fixes.commands || [], {
        projectId,
        userId,
      });

      return {
        success: true,
        message: `Database fixes applied (Attempt ${String(taskDetails.attempt)})`,
        iterations: 1,
        durationMs: 0,
        data: {
          filesCreated: filesResult.files,
          filesData: filesResult.filesData,
          commands: commandsResult.commands.map(c => ({ command: c })),
          fixesApplied: fixes.explanation,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[${this.config.name}] Fix mode failed`, toError(error));

      return {
        success: false,
        message: "Database fix mode failed",
        iterations: 1,
        durationMs: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Generate database implementation using AI
   */
  /**
   * ✅ Load existing project context from previous waves
   */
  private async loadExistingContext(input: AgentExecutionInput): Promise<{
    structure: string;
    existingFiles: Array<{ path: string; content: string }>;
    dependencies: string;
  }> {
    const { projectId, userId, taskDetails } = input;

    try {
      const structureResult = await this.executeTool(
        "context_loader",
        { operation: "scan_structure" },
        { projectId, userId }
      );

      const filesResult = await this.executeTool(
        "context_loader",
        {
          operation: "smart_load",
          taskDescription: taskDetails.description,
          pattern: "**/{prisma,*.prisma,migrations}/**/*", // Database-related files
          maxFiles: 10, // ✅ REDUCED from 20 to prevent oversized prompts
          maxSize: 200000, // ✅ REDUCED from 500KB to 200KB to prevent timeout
        },
        { projectId, userId }
      );

      const depsResult = await this.executeTool(
        "context_loader",
        { operation: "load_dependencies" },
        { projectId, userId }
      );

      return {
        structure: structureResult.success
          ? JSON.stringify(structureResult.data, null, 2)
          : "No structure available",
        existingFiles: filesResult.success
          ? (filesResult.data as { files?: Array<{ path: string; content: string }> }).files || []
          : [],
        dependencies: depsResult.success
          ? JSON.stringify(depsResult.data, null, 2)
          : "No dependencies loaded",
      };
    } catch (error) {
      logger.warn(
        `[${this.config.name}] Failed to load existing context`,
        toLogContext(error)
      );
      return { structure: "", existingFiles: [], dependencies: "" };
    }
  }

  private async generateImplementation(input: AgentExecutionInput): Promise<{
    files: Array<{ path: string; content: string }>;
    commands: Array<{ command: string; description: string }>;
    explanation: string;
  } | null> {
    const { taskDetails, context } = input;

    // ✅ VALIDATE CONTEXT BEFORE GENERATION
    // This will log warnings if context is incomplete but won't block generation
    this.validateContext(context);

    // ✅ FIXED: Load existing context BEFORE generating
    // This ensures continuity between waves - agent sees what previous waves created
    const existingContext = await this.loadExistingContext(input);
    const prompt = this.buildDatabasePrompt(taskDetails, context, existingContext);

    try {
      // ✅ FIXED: Disable tool use for schema generation
      // Database schema design is straightforward - just needs JSON output
      // Tool calling causes empty responses as Claude enters tool loops
      // Context is already loaded via loadExistingContext() before this call
      const responseText = await this.generateContent(
        prompt,
        undefined, // No system instruction
        false, // DISABLE tools - direct JSON output prevents empty responses
        {
          projectId: input.projectId,
          userId: input.userId,
        }
      );

      return this.parseImplementationResponse(responseText);
    } catch (error) {
      logger.error(
        `[${this.config.name}] AI generation failed`,
        toError(error)
      );
      return null;
    }
  }

  /**
   * ✅ NEW: Validate that context has minimum required information
   * Changed to warnings instead of hard failures - agent will use defaults
   */
  private validateContext(context: ProjectContext): {
    isValid: boolean;
    errors: string[];
  } {
    const warnings: string[] = [];

    // Check tech stack (warnings only - we'll use defaults)
    if (!context.techStack) {
      warnings.push("Tech stack is missing - will use PostgreSQL + Prisma defaults");
    } else {
      if (!context.techStack.database?.type) {
        warnings.push("Database type not specified - will assume PostgreSQL with Prisma");
      }
    }

    // Check architecture (warnings only)
    if (!context.architecture) {
      warnings.push("Architecture information is missing - will use Prisma defaults");
    }

    // Check codebase info (warning only)
    if (!context.codebase) {
      warnings.push("Codebase information is missing - starting fresh");
    }

    // Log warnings but allow generation to proceed
    if (warnings.length > 0) {
      logger.warn(
        `[${this.config.name}] Context has ${warnings.length} warning(s), using defaults:`,
        { warnings }
      );
    }

    // Always return valid - we'll use defaults and the prompt has fallback instructions
    return {
      isValid: true,
      errors: warnings, // These are now just warnings
    };
  }

  /**
   * Build database-specific prompt
   */
  private buildDatabasePrompt(
    taskDetails: AgentExecutionInput["taskDetails"],
    context: ProjectContext,
    existingContext: {
      structure: string;
      existingFiles: Array<{ path: string; content: string }>;
      dependencies: string;
    }
  ): string {
    const techStack = context.techStack || {};
    const architecture = context.architecture || {};
    const memoryContext = context._memoryContext || "";

    // ✅ FIXED: Safe property access with proper type handling
    const dbType = techStack.database?.type || "PostgreSQL";
    const dbOrm = (techStack.database as { orm?: string })?.orm || "Prisma";
    const lang = techStack.language || "TypeScript";

    return `You are DatabaseAgent, a specialized AI agent for database design and implementation.

**🎯 CRITICAL: BUILD ON EXISTING DATABASE SCHEMA, DON'T START FROM SCRATCH**
You are working on a project that may already have database models and migrations from previous development waves.
Review the "Existing Codebase" section below carefully to understand what database schema already exists.
Your new models must integrate seamlessly with existing schema, maintain referential integrity, and follow existing naming patterns.

# Task
${taskDetails.title}

## Description
${taskDetails.description}

## Project Context
**Tech Stack:**
- Database: ${dbType}
- ORM: ${dbOrm}
- Language: ${lang}
${!context.techStack || !context.techStack.database?.type ? `

⚠️ **TECH STACK IS INCOMPLETE!**
Since specific database details are missing, make reasonable assumptions:
- Use **PostgreSQL** as the database (industry standard, scalable)
- Use **Prisma** as the ORM (TypeScript-first, type-safe)
- Use **@prisma/client** for database access
- Follow **Prisma best practices** for schema design
- Include **proper indexes** for performance
` : ""}

**Architecture:**
${JSON.stringify(architecture, null, 2)}
${!context.architecture || Object.keys(architecture).length === 0 ? `

⚠️ **ARCHITECTURE IS INCOMPLETE!**
Since specific patterns are missing, follow these defaults:
- **Schema Location**: prisma/schema.prisma
- **Client Location**: src/lib/prisma.ts
- **Migrations**: Use Prisma Migrate (prisma migrate dev)
- **Naming**: camelCase for fields, PascalCase for models
- **Relations**: Use @relation with proper foreign keys
` : ""}

${memoryContext ? `\n## Past Experience (Vector Memory)\n${typeof memoryContext === "string" ? memoryContext : JSON.stringify(memoryContext, null, 2)}\n` : ""}

**📂 EXISTING CODEBASE (from previous waves):**
${
  existingContext.existingFiles.length > 0
    ? `
**Project Structure:**
${existingContext.structure}

**Installed Dependencies:**
${existingContext.dependencies}

**Existing Database Files (${existingContext.existingFiles.length} files):**
${existingContext.existingFiles
  .map(
    (file, idx) => `
[File ${idx + 1}]: ${file.path}
\`\`\`prisma
${file.content.length > 3000 ? file.content.substring(0, 3000) + "\n... (truncated)" : file.content}
\`\`\`
`
  )
  .join("\n")}

**INTEGRATION REQUIREMENTS:**
1. Review existing Prisma schema models carefully
2. Add new models that reference existing models appropriately
3. Use existing enum types where applicable
4. Follow existing naming conventions (camelCase, PascalCase)
5. Maintain referential integrity with @relation directives
6. Don't recreate models or fields that already exist
7. If modifying existing models, ensure backward compatibility
`
    : "**No existing database schema found - you're starting fresh!**\n"
}

# Your Responsibilities
1. **Schema Design**: Create Prisma schema models with proper relationships
2. **Migrations**: Generate safe database migrations
3. **Indexes**: Add appropriate indexes for performance
4. **Validation**: Include Zod schemas for runtime validation
5. **Queries**: Write optimized database queries
6. **Types**: Generate TypeScript types from Prisma schema

# Available Tools
${this.getToolsDescription()}

# Response Format
Respond with a JSON object in this EXACT format:

\`\`\`json
{
  "files": [
    {
      "path": "prisma/schema.prisma",
      "content": "// Prisma schema content here"
    },
    {
      "path": "src/lib/db/schemas/user.schema.ts",
      "content": "// Zod validation schemas"
    }
  ],
  "commands": [
    {
      "command": "npx prisma generate",
      "description": "Generate Prisma Client"
    },
    {
      "command": "npx prisma migrate dev --name init",
      "description": "Create and apply migration"
    }
  ],
  "explanation": "Brief explanation of the database implementation"
}
\`\`\`

# Database Best Practices
1. **Always** use proper indexing for foreign keys and frequently queried fields
2. **Always** include created_at and updated_at timestamps
3. **Always** use cascading deletes for dependent data
4. **Always** validate data with Zod before database operations
5. **Never** store sensitive data without encryption
6. **Never** use SELECT * in production queries
7. **Optimize** queries with proper joins and indexes
8. **Use** transactions for multi-step operations

# Prisma Schema Guidelines
- Use @id for primary keys
- Use @unique for unique constraints
- Use @index for performance-critical fields
- Use @@index for composite indexes
- Use proper relation fields (@relation)
- Use enum types for fixed value sets

Generate a production-ready database implementation now.`;
  }

  /**
   * Build fix prompt for database issues
   */
  private buildFixPrompt(
    issuesToFix: Array<{ file: string; issue: string; severity?: string; message?: string }>,
    existingFiles: Record<string, string>,
    attempt: number,
    context: Record<string, unknown>
  ): string {
    return `You are DatabaseAgent in FIX MODE (Attempt ${attempt}).

# Issues to Fix
${issuesToFix.map((issue, i) => `${i + 1}. **${issue.file}** (${issue.severity}): ${issue.message}`).join("\n")}

# Current Files
${Object.entries(existingFiles)
  .map(([path, content]) => `## ${path}\n\`\`\`\n${content}\n\`\`\``)
  .join("\n\n")}

${context._errorSolution ? `\n# Potential Solutions\n${typeof context._errorSolution === "string" ? context._errorSolution : JSON.stringify(context._errorSolution, null, 2)}\n` : ""}
${context._typeErrors
  ? `\n# Type Errors\n${
      typeof context._typeErrors === "string"
        ? context._typeErrors
        : JSON.stringify(context._typeErrors, null, 2)
    }\n`
  : ""}

# Fix Requirements
1. Fix ALL listed issues
2. Maintain existing functionality
3. Follow database best practices
4. Ensure migrations are reversible
5. Add comments explaining fixes

# Response Format
\`\`\`json
{
  "files": [
    {
      "path": "path/to/file",
      "content": "COMPLETE fixed file content"
    }
  ],
  "commands": [
    {
      "command": "command to run",
      "description": "what it does"
    }
  ],
  "explanation": "Summary of fixes applied"
}
\`\`\`

Generate the fixes now.`;
  }

  /**
   * Parse AI implementation response
   */
  private parseImplementationResponse(responseText: string): {
    files: Array<{ path: string; content: string }>;
    commands: Array<{ command: string; description: string }>;
    explanation: string;
  } | null {
    try {
      // ✅ ENHANCED: Try multiple JSON extraction patterns
      let jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);

      if (!jsonMatch) {
        // Try without newlines after json
        jsonMatch = responseText.match(/```json([\s\S]*?)```/);
      }

      if (!jsonMatch) {
        // Try to find raw JSON object containing "files" key
        jsonMatch = responseText.match(/(\{[\s\S]*?"files"[\s\S]*?\})\s*$/m);
      }

      if (!jsonMatch) {
        logger.error(
          `[${this.config.name}] No JSON found in response`,
          new Error("JSON parsing failed"),
          {
            responseLength: responseText.length,
            responsePreview: responseText.substring(0, 500),
            hasJsonKeyword: responseText.includes('"files"'),
          }
        );
        return null;
      }

      const parsed = JSON.parse(jsonMatch[1].trim()) as {
        files: Array<{ path: string; content: string }>;
        commands: Array<{ command: string; description: string }>;
        explanation: string;
      };

      return {
        files: parsed.files || [],
        commands: parsed.commands || [],
        explanation: parsed.explanation || "",
      };
    } catch (error) {
      logger.error(
        `[${this.config.name}] Failed to parse response`,
        toError(error),
        {
          responseLength: responseText.length,
          responseStart: responseText.substring(0, 200),
        }
      );
      return null;
    }
  }

  /**
   * Parse fix response
   */
  private parseFixResponse(responseText: string): {
    files: Array<{ path: string; content: string }>;
    commands: Array<{ command: string; description: string }>;
    explanation: string;
  } | null {
    return this.parseImplementationResponse(responseText);
  }

  /**
   * Write files to disk
   */
  private async writeFiles(
    files: Array<{ path: string; content: string }>,
    context: { projectId: string; userId: string }
  ): Promise<{
    success: boolean;
    files: string[];
    filesData: Array<{ path: string; content: string; linesOfCode: number }>;
    error?: string;
  }> {
    const writtenFiles: string[] = [];
    const filesData: Array<{ path: string; content: string; linesOfCode: number }> = [];

    try {
      for (const file of files) {
        const result = await this.executeTool(
          "filesystem",
          {
            operation: "write",
            path: file.path,
            content: file.content,
          },
          context
        );

        if (result.success) {
          writtenFiles.push(file.path);
          // Store full file data for UI
          filesData.push({
            path: file.path,
            content: file.content,
            linesOfCode: file.content.split("\n").length,
          });
        } else {
          return {
            success: false,
            files: writtenFiles,
            filesData,
            error: `Failed to write ${file.path}: ${result.error}`,
          };
        }
      }

      return { success: true, files: writtenFiles, filesData };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        files: writtenFiles,
        filesData,
        error: errorMessage,
      };
    }
  }

  /**
   * Run database commands
   */
  private async runCommands(
    commands: Array<{ command: string; description: string }>,
    context: { projectId: string; userId: string }
  ): Promise<{
    success: boolean;
    commands: Array<{ command: string; success: boolean; output: string; exitCode: number }>;
    error?: string;
  }> {
    const results: Array<{
      command: string;
      success: boolean;
      output: string;
      exitCode: number;
    }> = [];

    try {
      for (const cmd of commands) {
        logger.info(`[${this.config.name}] Running: ${cmd.command}`);

        const result = await this.executeTool(
          "command",
          {
            command: cmd.command,
            description: cmd.description,
          },
          context
        );

        const data = result.data as { stdout?: string; stderr?: string };
        results.push({
          command: cmd.command,
          success: result.success,
          output: data?.stdout || data?.stderr || result.error || "",
          exitCode: result.success ? 0 : 1,
        });

        if (!result.success) {
          return {
            success: false,
            commands: results,
            error: `Command failed: ${cmd.command} - ${result.error}`,
          };
        }
      }

      return { success: true, commands: results };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        commands: results,
        error: errorMessage,
      };
    }
  }

  /**
   * Verify database implementation
   */
  private verifyImplementation(
    files: string[],
    commands: Array<{ command: string; success: boolean; output: string; exitCode: number }>,
    taskDetails: AgentExecutionInput["taskDetails"]
  ): { passed: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check if schema file exists
    const hasSchema = files.some((f) => f.includes("schema.prisma"));
    if (
      !hasSchema &&
      taskDetails.description.toLowerCase().includes("schema")
    ) {
      issues.push("No Prisma schema file generated");
    }

    // Check if Prisma generate was run
    const ranGenerate = commands.some((c) => c.command.includes("prisma generate"));
    if (hasSchema && !ranGenerate) {
      issues.push("Prisma generate command not executed");
    }

    // Check if migration was created (for schema changes)
    const ranMigration = commands.some(
      (c) => c.command.includes("prisma migrate") || c.command.includes("prisma db push")
    );
    if (
      hasSchema &&
      !ranMigration &&
      taskDetails.description.toLowerCase().includes("migration")
    ) {
      issues.push("Migration command not executed");
    }

    return {
      passed: issues.length === 0,
      issues,
    };
  }

  /**
   * Load files that need fixing
   */
  private async loadFilesToFix(
    projectId: string,
    userId: string,
    files: string[]
  ): Promise<Record<string, string>> {
    const loadedFiles: Record<string, string> = {};

    for (const filePath of files) {
      try {
        const result = await this.executeTool(
          "filesystem",
          {
            operation: "read",
            path: filePath,
          },
          { projectId, userId }
        );

        const data = result.data as { content?: string };
        if (result.success && data?.content) {
          loadedFiles[filePath] = data.content;
        }
      } catch (error) {
        logger.warn(
          `[${this.config.name}] Failed to load ${filePath}`,
          toLogContext(error)
        );
      }
    }

    return loadedFiles;
  }
}

// Export singleton instance
export const databaseAgent = new DatabaseAgent();
