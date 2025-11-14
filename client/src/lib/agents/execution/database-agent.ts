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
        "claude_skills", // Advanced schema design, query optimization, and migrations
      ],
      modelName: AI_MODELS.PRIMARY,
    });
  }

  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const { taskId, projectId, userId, taskDetails, context } = input;

    // Check if this is a fix request
    const isFixMode = taskDetails.mode === "fix";

    if (isFixMode) {
      logger.info(
        `[${this.config.name}] FIX MODE: Fixing database issues for task "${taskDetails.originalTaskId}"`,
        {
          attempt: taskDetails.attempt,
          issuesCount: Array.isArray(taskDetails.issuesToFix) ? taskDetails.issuesToFix.length : 0,
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
          data: { filesCreated: filesResult.files },
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
            commandsRun: commandsResult.commands,
          },
        };
      }

      // Verify the database implementation
      const verification = await this.verifyImplementation(
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
            commandsRun: commandsResult.commands,
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
          commandsRun: commandsResult.commands,
          explanation: implementation.explanation,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[${this.config.name}] Task execution failed`, toError(error));

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
      const issuesToFix = taskDetails.issuesToFix as Array<{ file: string; issue: string }>;
      const filesToFix = issuesToFix.map((issue) => issue.file);
      const uniqueFiles = Array.from(new Set(filesToFix));

      logger.info(`[${this.config.name}] Loading ${uniqueFiles.length} files to fix`);

      const existingFiles = await this.loadFilesToFix(
        projectId,
        userId,
        uniqueFiles as string[]
      );

      // Generate fixes using AI
      const fixPrompt = this.buildFixPrompt(
        issuesToFix,
        existingFiles,
        taskDetails.attempt as number,
        context
      );

      const result = await this.model.generateContent(fixPrompt);
      const responseText = result.response.text();

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
          data: { filesCreated: filesResult.files },
        };
      }

      // Run fix commands if needed
      const commandsResult = await this.runCommands(fixes.commands || [], {
        projectId,
        userId,
      });

      return {
        success: true,
        message: `Database fixes applied (Attempt ${taskDetails.attempt})`,
        iterations: 1,
        durationMs: 0,
        data: {
          filesCreated: filesResult.files,
          commandsRun: commandsResult.commands,
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
  private async generateImplementation(input: AgentExecutionInput): Promise<{
    files: Array<{ path: string; content: string }>;
    commands: Array<{ command: string; description: string }>;
    explanation: string;
  } | null> {
    const { taskDetails, context } = input;

    const prompt = this.buildDatabasePrompt(taskDetails, context);

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

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
   * Build database-specific prompt
   */
  private buildDatabasePrompt(
    taskDetails: any,
    context: any
  ): string {
    const techStack = context.techStack || {};
    const architecture = context.architecture || {};
    const existingFiles = context._existingFiles || {};
    const memoryContext = context._memoryContext || "";

    return `You are DatabaseAgent, a specialized AI agent for database design and implementation.

# Task
${taskDetails.title}

## Description
${taskDetails.description}

## Project Context
**Tech Stack:**
- Database: ${techStack.database?.type || "PostgreSQL"}
- ORM: ${techStack.database?.orm || "Prisma"}
- Language: ${techStack.language || "TypeScript"}

**Architecture:**
${JSON.stringify(architecture, null, 2)}

${memoryContext ? `\n## Past Experience (Vector Memory)\n${memoryContext}\n` : ""}

${
  Object.keys(existingFiles).length > 0
    ? `\n## Existing Files\n${Object.entries(existingFiles)
        .map(([path, content]) => `### ${path}\n\`\`\`\n${content}\n\`\`\``)
        .join("\n\n")}\n`
    : ""
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
    issuesToFix: any[],
    existingFiles: Record<string, string>,
    attempt: number,
    context: any
  ): string {
    return `You are DatabaseAgent in FIX MODE (Attempt ${attempt}).

# Issues to Fix
${issuesToFix.map((issue, i) => `${i + 1}. **${issue.file}** (${issue.severity}): ${issue.message}`).join("\n")}

# Current Files
${Object.entries(existingFiles)
  .map(([path, content]) => `## ${path}\n\`\`\`\n${content}\n\`\`\``)
  .join("\n\n")}

${context._errorSolution ? `\n# Potential Solutions\n${context._errorSolution}\n` : ""}
${context._typeErrors ? `\n# Type Errors\n${context._typeErrors}\n` : ""}

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
      // Extract JSON from markdown code blocks
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
      if (!jsonMatch) {
        logger.error(`[${this.config.name}] No JSON found in response`);
        return null;
      }

      const parsed = JSON.parse(jsonMatch[1]);

      return {
        files: parsed.files || [],
        commands: parsed.commands || [],
        explanation: parsed.explanation || "",
      };
    } catch (error) {
      logger.error(`[${this.config.name}] Failed to parse response`, toError(error));
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
    error?: string;
  }> {
    const writtenFiles: string[] = [];

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
        } else {
          return {
            success: false,
            files: writtenFiles,
            error: `Failed to write ${file.path}: ${result.error}`,
          };
        }
      }

      return { success: true, files: writtenFiles };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        files: writtenFiles,
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
    commands: string[];
    error?: string;
  }> {
    const executedCommands: string[] = [];

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

        if (result.success) {
          executedCommands.push(cmd.command);
        } else {
          return {
            success: false,
            commands: executedCommands,
            error: `Command failed: ${cmd.command} - ${result.error}`,
          };
        }
      }

      return { success: true, commands: executedCommands };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        commands: executedCommands,
        error: errorMessage,
      };
    }
  }

  /**
   * Verify database implementation
   */
  private async verifyImplementation(
    files: string[],
    commands: string[],
    taskDetails: any
  ): Promise<{ passed: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check if schema file exists
    const hasSchema = files.some((f) => f.includes("schema.prisma"));
    if (!hasSchema && taskDetails.description.toLowerCase().includes("schema")) {
      issues.push("No Prisma schema file generated");
    }

    // Check if Prisma generate was run
    const ranGenerate = commands.some((c) => c.includes("prisma generate"));
    if (hasSchema && !ranGenerate) {
      issues.push("Prisma generate command not executed");
    }

    // Check if migration was created (for schema changes)
    const ranMigration = commands.some(
      (c) => c.includes("prisma migrate") || c.includes("prisma db push")
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
