// src/lib/agents/execution/database-agent.ts
/**
 * Database Agent
 * Specialized in database schema design, migrations, and query optimization
 * ✅ Version Aware (Checks package.json for Prisma/Drizzle versions)
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
        "web_search", // ✅ Enabled for checking ORM docs
        "code_analysis",
        "context_loader",
      ],
      modelName: AI_MODELS.CLAUDE,
    });
  }

  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const { taskId: _taskId, projectId, userId, taskDetails, context } = input;

    // Check if this is a fix request
    const isFixMode = taskDetails.mode === "fix";

    if (isFixMode) {
      return await this.executeFixMode(input);
    }

    logger.info(
      `[${this.config.name}] Executing database task: "${taskDetails.title}"`
    );

    try {
      // ✅ FIXED: Call the validator here!
      this.validateContext(context);

      // 1. Load Context (Boosted to 50 files / 1MB)
      const existingContext = await this.loadProjectContextInternal(input);

      // 2. Detect Versions (Crucial for ORM compatibility)
      const versions = this.detectVersions(existingContext.dependencies);
      logger.info(`[${this.config.name}] Detected Environment`, versions);

      // 3. Conduct Research
      const researchNotes = await this.conductResearch(input, versions);

      // 4. Generate Implementation
      const prompt = this.buildDatabasePrompt(
        taskDetails,
        context,
        existingContext,
        researchNotes,
        versions
      );

      const responseText = await this.generateContent(
        prompt,
        undefined,
        false, // Tools disabled during generation to protect JSON
        { projectId, userId }
      );

      const result = this.parseImplementationResponse(responseText);

      if (!result) {
        return {
          success: false,
          message: "Failed to generate database implementation",
          iterations: 1,
          durationMs: 0,
          error: "AI generation failed",
        };
      }

      // 5. Write Files
      const filesResult = await this.writeFiles(result.files, {
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

      // 6. Run Commands
      const commandsResult = await this.runCommands(result.commands, {
        projectId,
        userId,
      });

      if (!commandsResult.success) {
        return {
          success: false,
          message: "Failed to execute database commands",
          iterations: 1,
          durationMs: 0,
          error: commandsResult.error || "Command execution failed",
          data: {
            filesCreated: filesResult.files,
            filesData: filesResult.filesData,
            commands: commandsResult.commands,
          },
        };
      }

      // 7. Verify
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
          explanation: result.explanation,
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

      // ✅ FIXED: Disable tools for fix generation
      const responseText = await this.generateContent(
        fixPrompt,
        undefined, // No system instruction
        false, // DISABLE tools - direct JSON output prevents empty responses
        { projectId, userId }
      );

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
          commands: commandsResult.commands.map((c) => ({ command: c.command })),
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
   * ✅ Version Detection Logic
   * Scans dependencies to find specific versions.
   */
  private detectVersions(dependencyString: string): Record<string, string> {
    const versions: Record<string, string> = {};

    const parsePackage = (name: string) => {
      const regex = new RegExp(`"${name}":\\s*"\\^?([0-9\\.]+)"`);
      const match = dependencyString.match(regex);
      return match ? match[1] : "unknown";
    };

    versions.next = parsePackage("next");
    versions.prisma = parsePackage("prisma");
    versions.drizzle = parsePackage("drizzle-orm");

    return versions;
  }

  /**
   * ✅ Research Phase
   */
  private async conductResearch(
    input: AgentExecutionInput,
    versions: Record<string, string>
  ): Promise<string | null> {
    const { taskDetails, projectId, userId } = input;

    // Research if we are doing complex DB operations or migrations
    const needsResearch =
      taskDetails.description.includes("optimize") ||
      taskDetails.description.includes("migration") ||
      taskDetails.description.includes("relationship") ||
      taskDetails.description.includes("index");

    if (!needsResearch) return null;

    const query = `${taskDetails.title} ${taskDetails.description} ${versions.prisma !== "unknown" ? "prisma" : "database"} best practices schema design`;

    logger.info(`[${this.config.name}] Researching: ${query}`);

    try {
      const result = await this.executeTool(
        "web_search",
        { query, maxResults: 2 },
        { projectId, userId }
      );

      if (result.success && result.data) {
        const searchData = result.data as {
          results: Array<{ title: string; description: string }>;
        };
        const summary = searchData.results
          .map((r) => `Title: ${r.title}\nInfo: ${r.description}`)
          .join("\n\n");
        return `\n**🔍 DB RESEARCH:**\n${summary}\n`;
      }
    } catch (e) {
      logger.warn(`[${this.config.name}] Research failed.`);
    }
    return null;
  }

  /**
   * ✅ Load existing project context with HIGHER LIMITS
   */
  private async loadProjectContextInternal(
    input: AgentExecutionInput
  ): Promise<{
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
          // ✅ Prioritize DB files, but allow viewing others
          pattern:
            "{prisma/**/*,src/db/**/*,drizzle/**/*,package.json,**/*.ts}",
          maxFiles: 50,
          maxSize: 1000000,
        },
        { projectId, userId }
      );

      const depsResult = await this.executeTool(
        "context_loader",
        { operation: "load_dependencies" },
        { projectId, userId }
      );

      const dependenciesData =
        depsResult.success && depsResult.data
          ? JSON.stringify(depsResult.data, null, 2)
          : "";

      return {
        structure: structureResult.success
          ? JSON.stringify(structureResult.data, null, 2)
          : "No structure available",
        existingFiles: filesResult.success
          ? (
              filesResult.data as {
                files?: Array<{ path: string; content: string }>;
              }
            ).files || []
          : [],
        dependencies: dependenciesData,
      };
    } catch (error) {
      logger.warn(
        `[${this.config.name}] Failed to load project context`,
        toLogContext(error)
      );
      return { structure: "", existingFiles: [], dependencies: "" };
    }
  }

  /**
   * ✅ Validate Context Method
   * Now this method is actually called at the start of executeTask
   */
  private validateContext(context: ProjectContext): {
    isValid: boolean;
    errors: string[];
  } {
    const warnings: string[] = [];

    if (!context.techStack) {
      warnings.push(
        "Tech stack is missing - will use PostgreSQL + Prisma defaults"
      );
    } else {
      if (!context.techStack.database?.type) {
        warnings.push(
          "Database type not specified - will assume PostgreSQL with Prisma"
        );
      }
    }

    if (!context.architecture) {
      warnings.push(
        "Architecture information is missing - will use Prisma defaults"
      );
    }

    if (!context.codebase) {
      warnings.push("Codebase information is missing - starting fresh");
    }

    if (warnings.length > 0) {
      logger.warn(
        `[${this.config.name}] Context has ${warnings.length} warning(s), using defaults:`,
        { warnings }
      );
    }

    return {
      isValid: true,
      errors: warnings,
    };
  }
  
  /**
   * Build Database Prompt
   * ✅ Injects Version Info & Research
   */
  private buildDatabasePrompt(
    taskDetails: AgentExecutionInput["taskDetails"],
    context: ProjectContext,
    existingContext: {
      structure: string;
      existingFiles: Array<{ path: string; content: string }>;
      dependencies: string;
    },
    researchNotes: string | null,
    versions: Record<string, string>
  ): string {
    const techStack = context.techStack || {};
    const architecture = context.architecture || {};
    const dbType = techStack.database?.type || "PostgreSQL";
    const dbOrm = (techStack.database as { orm?: string })?.orm || "Prisma";

    return `
You are DatabaseAgent, a specialized AI agent for database design and implementation.

**🎯 CRITICAL: BUILD ON EXISTING DATABASE SCHEMA, DON'T START FROM SCRATCH**
You are working on a project that may already have database models and migrations.
Review the "Existing Codebase" section below carefully.

# Task
${taskDetails.title}
${taskDetails.description}

**DETECTED ENVIRONMENT:**
- Prisma: ${versions.prisma}
- Drizzle: ${versions.drizzle}

${researchNotes ? researchNotes : ""}

## Project Context
**Tech Stack:**
- Database: ${dbType}
- ORM: ${dbOrm}

**Architecture:**
${JSON.stringify(architecture, null, 2)}

**📂 EXISTING CODEBASE (from previous waves):**
${
  existingContext.existingFiles.length > 0
    ? `
**Project Structure:**
${existingContext.structure}

**Dependencies:**
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
`
    : "**No existing database schema found - you're starting fresh!**\n"
}

# Your Responsibilities
1. **Schema Design**: Create/Update models with proper relationships.
2. **Migrations**: Generate safe migrations.
3. **Validation**: Include Zod schemas if applicable.
4. **Scripts**: Ensure seed scripts match package.json type (module vs commonjs).

# Response Format
Respond with a JSON object in this EXACT format:

\`\`\`json
{
  "files": [
    {
      "path": "prisma/schema.prisma",
      "content": "// Prisma schema content here"
    }
  ],
  "commands": [
    {
      "command": "npx prisma generate",
      "description": "Generate Prisma Client"
    }
  ],
  "explanation": "Brief explanation"
}
\`\`\`
`.trim();
  }

  /**
   * Build fix prompt for database issues
   */
  private buildFixPrompt(
    issuesToFix: Array<{
      file: string;
      issue: string;
      severity?: string;
      message?: string;
    }>,
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
${
  context._typeErrors
    ? `\n# Type Errors\n${
        typeof context._typeErrors === "string"
          ? context._typeErrors
          : JSON.stringify(context._typeErrors, null, 2)
      }\n`
    : ""
}

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

  private parseImplementationResponse(text: string): {
    files: Array<{ path: string; content: string }>;
    commands: string[];
    explanation: string;
  } | null {
    try {
      const cleaned = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      // Handle cases where there's text before/after the JSON
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned) as {
        files: Array<{ path: string; content: string }>;
        commands: string[];
        explanation: string;
      };
    } catch (_e) {
      return null;
    }
  }

  /**
   * Parse fix response
   */
  private parseFixResponse(responseText: string): {
    files: Array<{ path: string; content: string }>;
    commands: string[];
    explanation: string;
  } | null {
    return this.parseImplementationResponse(responseText);
  }

  private async writeFiles(
    files: Array<{ path: string; content: string }>,
    ctx: { projectId: string; userId: string }
  ): Promise<{
    success: boolean;
    files: string[];
    filesData: Array<{ path: string; content: string; linesOfCode: number }>;
    error?: string;
  }> {
    const results: Array<{ path: string; success: boolean }> = [];
    const filesData: Array<{ path: string; content: string; linesOfCode: number }> = [];
    for (const file of files) {
      const res = await this.executeTool(
        "filesystem",
        { operation: "write", path: file.path, content: file.content },
        ctx
      );
      results.push({ path: file.path, success: res.success });
      if (res.success)
        filesData.push({
          path: file.path,
          content: file.content,
          linesOfCode: file.content.split("\n").length,
        });
    }
    return {
      success: results.every((r) => r.success),
      files: results.map((r) => r.path),
      filesData,
    };
  }

  private async runCommands(
    cmds: string[] | Array<{ command: string }>,
    ctx: { projectId: string; userId: string }
  ): Promise<{
    success: boolean;
    commands: Array<{ command: string; success: boolean; output: string; exitCode: number }>;
    error?: string;
  }> {
    const results: Array<{ command: string; success: boolean; output: string; exitCode: number }> = [];
    for (const cmd of cmds) {
      const cmdStr = typeof cmd === "string" ? cmd : cmd.command;
      // Safety check
      if (cmdStr.includes("drop database") || cmdStr.includes("force")) {
        logger.warn(`Skipping dangerous command: ${cmdStr}`);
        continue;
      }
      const res = await this.executeTool("command", { command: cmdStr }, ctx);
      results.push({
        command: cmdStr,
        success: res.success,
        output: (res.data as { stdout?: string })?.stdout || "",
        exitCode: res.success ? 0 : 1,
      });
    }
    return { success: results.every((r) => r.success), commands: results };
  }

  /**
   * Verify database implementation
   */
  private verifyImplementation(
    files: string[],
    commands: Array<{
      command: string;
      success: boolean;
      output: string;
      exitCode: number;
    }>,
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
    const ranGenerate = commands.some((c) =>
      c.command.includes("prisma generate")
    );
    if (hasSchema && !ranGenerate) {
      issues.push("Prisma generate command not executed");
    }

    // Check if migration was created (for schema changes)
    const ranMigration = commands.some(
      (c) =>
        c.command.includes("prisma migrate") ||
        c.command.includes("prisma db push")
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
