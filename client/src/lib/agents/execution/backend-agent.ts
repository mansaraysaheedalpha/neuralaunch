// src/lib/agents/execution/backend-agent-v2.ts
/**
 * Backend Agent V2 - WITH FIX MODE
 * Now supports fixing issues found by Critic Agent
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

export class BackendAgent extends BaseAgent {
  constructor() {
    super({
      name: "BackendAgent",
      category: "execution",
      description:
        "Specialized in backend implementation: APIs, business logic, database operations",
      supportedTaskTypes: ["backend", "api", "database", "business-logic"],
      requiredTools: [
        "filesystem",
        "git",
        "command",
        "web_search", // ✅ Now actually used
        "code_analysis",
        "context_loader",
      ],
      modelName: AI_MODELS.CLAUDE,
    });
  }

  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const {
      taskId: _taskId,
      projectId,
      userId,
      taskDetails,
      context: _context,
    } = input;

    // Check if this is a fix request
    const isFixMode = taskDetails.mode === "fix";

    if (isFixMode) {
      return await this.executeFixMode(input);
    }

    // Normal execution mode
    logger.info(
      `[${this.config.name}] Executing backend task: "${taskDetails.title}"`
    );

    try {
      // ✅ 1. Research & Generate (Now includes Web Search logic)
      const implementation = await this.generateImplementation(input);

      if (!implementation) {
        return {
          success: false,
          message: "Failed to generate implementation",
          iterations: 1,
          durationMs: 0,
          error: "AI generation failed",
        };
      }

      // ✅ 2. Write Files (Building on top of codebase)
      const filesResult = await this.writeFiles(implementation.files, {
        projectId,
        userId,
      });

      if (!filesResult.success) {
        return {
          success: false,
          message: "Failed to write files",
          iterations: 1,
          durationMs: 0,
          error: filesResult.error,
          data: {
            filesCreated: filesResult.files,
            filesData: filesResult.filesData,
          },
        };
      }

      // ✅ 3. Run Commands (Terminal Operations)
      const commandsResult = await this.runCommands(implementation.commands, {
        projectId,
        userId,
      });

      if (!commandsResult.success) {
        return {
          success: false,
          message: "Failed to execute commands",
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

      // ✅ 4. Self-Verification
      const verification = this.verifyImplementation(
        filesResult.files,
        commandsResult.commands,
        taskDetails
      );

      if (!verification.passed) {
        return {
          success: false,
          message: "Verification failed",
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
        message: `Backend task completed: ${taskDetails.title}`,
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
        message: "Task execution failed",
        iterations: 1,
        durationMs: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * ✅ NEW: Execute in fix mode
   */
  private async executeFixMode(
    input: AgentExecutionInput
  ): Promise<AgentExecutionOutput> {
    const { taskId: _taskId, projectId, userId, taskDetails, context } = input;

    try {
      // Step 1: Load the files that need fixing
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

      // Step 2: Generate fixes using AI
      const fixPrompt = this.buildFixPrompt(
        issuesToFix.map((issue) => ({
          file: issue.file,
          line: undefined,
          severity: "unknown",
          category: "unknown",
          message: issue.issue,
          suggestion: "",
          codeSnippet: undefined,
        })),
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
          message: "Failed to generate fixes",
          iterations: 1,
          durationMs: 0,
          error: "AI could not generate fixes",
        };
      }

      // Step 3: Apply fixes
      const filesResult = await this.writeFiles(fixes.files, {
        projectId,
        userId,
      });

      if (!filesResult.success) {
        return {
          success: false,
          message: "Failed to write fixed files",
          iterations: 1,
          durationMs: 0,
          error: filesResult.error,
          data: {
            filesCreated: filesResult.files,
            filesData: filesResult.filesData,
          },
        };
      }

      // Step 4: Run any necessary commands after fixes
      const commandsResult = await this.runCommands(fixes.commands || [], {
        projectId,
        userId,
      });

      logger.info(
        `[${this.config.name}] Fix attempt ${String(taskDetails.attempt)} complete`,
        {
          filesFixed: filesResult.files.length,
          issuesAddressed: issuesToFix.length,
        }
      );

      return {
        success: true,
        message: `Fixed ${issuesToFix.length} issues in ${filesResult.files.length} files`,
        iterations: 1,
        durationMs: 0,
        data: {
          filesCreated: filesResult.files,
          filesData: filesResult.filesData,
          commands: commandsResult.commands,
          issuesFixed: issuesToFix.length,
          fixExplanation: fixes.explanation,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[${this.config.name}] Fix mode failed`, toError(error));

      return {
        success: false,
        message: "Fix attempt failed",
        iterations: 1,
        durationMs: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Load existing files that need fixing
   */
  private async loadFilesToFix(
    projectId: string,
    userId: string,
    filePaths: string[]
  ): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];

    for (const filePath of filePaths) {
      try {
        const result = await this.executeTool(
          "filesystem",
          { operation: "read", path: filePath },
          { projectId, userId }
        );

        const data = result.data as { content?: string };
        if (result.success && data?.content) {
          files.push({
            path: filePath,
            content: data.content,
          });
        }
      } catch (error) {
        logger.warn(`[${this.config.name}] Failed to load file: ${filePath}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return files;
  }

  /**
   * Build fix prompt for AI
   */
  private buildFixPrompt(
    issues: Array<{
      file: string;
      line?: number;
      severity: string;
      category: string;
      message: string;
      suggestion: string;
      codeSnippet?: string;
    }>,
    existingFiles: Array<{ path: string; content: string }>,
    attempt: number,
    context: Record<string, unknown>
  ): string {
    const issuesSummary = issues
      .map(
        (issue, i) => `
**Issue ${i + 1}:**
- File: ${issue.file}
- Line: ${issue.line || "N/A"}
- Severity: ${issue.severity}
- Category: ${issue.category}
- Problem: ${issue.message}
- Suggestion: ${issue.suggestion}
${issue.codeSnippet ? `- Code Snippet:\n\`\`\`\n${issue.codeSnippet}\n\`\`\`` : ""}
    `
      )
      .join("\n");

    const filesSummary = existingFiles
      .map(
        (file) => `
**File: ${file.path}**
\`\`\`
${file.content}
\`\`\`
    `
      )
      .join("\n");

    return `
You are the Backend Agent in FIX MODE. Your job is to fix the issues found by the Critic Agent.

**FIX ATTEMPT: ${attempt}**

**ISSUES TO FIX:**
${issuesSummary}

**EXISTING FILES (with issues):**
${filesSummary}

**TECH STACK:**
\`\`\`json
${JSON.stringify(context.techStack, null, 2)}
\`\`\`

**CRITICAL INSTRUCTIONS:**

1. **FIX ALL ISSUES** - Address every issue listed above
2. **MAINTAIN FUNCTIONALITY** - Don't break existing working code
3. **FOLLOW BEST PRACTICES** - Use the suggestions provided
4. **COMPLETE FILES** - Return the FULL fixed file content (not just patches)
5. **EXPLAIN CHANGES** - Briefly explain what you fixed and why

**FIX STRATEGIES:**

For **Security Issues** (SQL Injection, XSS, etc.):
- Use parameterized queries
- Sanitize user input
- Use environment variables for secrets
- Apply proper escaping

For **Type Safety Issues**:
- Add proper TypeScript types
- Fix type mismatches
- Add type assertions where appropriate

For **Performance Issues** (N+1 queries, etc.):
- Use batch queries
- Add proper indexing
- Optimize loops and iterations

For **Code Quality Issues**:
- Follow DRY principles
- Improve naming
- Add proper error handling
- Add documentation

**OUTPUT FORMAT (JSON only):**

\`\`\`json
{
  "files": [
    {
      "path": "exact/path/to/file.ts",
      "content": "COMPLETE FIXED FILE CONTENT HERE"
    }
  ],
  "commands": [
    "npm install <new-package> (if needed for fix)"
  ],
  "explanation": "Brief explanation of what was fixed and why"
}
\`\`\`

**IMPORTANT:**
- NO markdown code blocks around JSON
- Files must contain COMPLETE content (not diffs)
- Fix ALL issues, not just some
- Maintain backward compatibility
- Test your fixes mentally before responding

Generate the fixes now.
`.trim();
  }

  /**
   * Parse fix response from AI
   */
  private parseFixResponse(responseText: string): {
    files: Array<{ path: string; content: string }>;
    commands: string[];
    explanation: string;
  } | null {
    try {
      let cleaned = responseText.trim();
      cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "");

      const parsed = JSON.parse(cleaned) as {
        files?: Array<{ path: string; content: string }>;
        commands?: string[];
        explanation?: string;
      };

      return {
        files: parsed.files || [],
        commands: parsed.commands || [],
        explanation: parsed.explanation || "No explanation provided",
      };
    } catch (error) {
      logger.error(
        `[${this.config.name}] Failed to parse fix response`,
        error instanceof Error ? error : new Error(String(error)),
        { preview: responseText.substring(0, 500) }
      );
      return null;
    }
  }

  /**
   * ✅ Load existing project context with HIGHER LIMITS (Consistency Update)
   */
  private async loadExistingContext(input: AgentExecutionInput): Promise<{
    structure: string;
    existingFiles: Array<{ path: string; content: string }>;
    dependencies: string;
  }> {
    const { projectId, userId, taskDetails } = input;

    try {
      // Step 1: Scan project structure (Full Tree)
      const structureResult = await this.executeTool(
        "context_loader",
        { operation: "scan_structure" },
        { projectId, userId }
      );

      // Step 2: Load relevant files (Increased to 50 / 1MB)
      const filesResult = await this.executeTool(
        "context_loader",
        {
          operation: "smart_load",
          taskDescription: taskDetails.description,
          pattern: "src/**/*.ts",
          maxFiles: 50, // ✅ INCREASED from 20
          maxSize: 1000000, // ✅ INCREASED from 500kb
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
          ? (
              filesResult.data as {
                files?: Array<{ path: string; content: string }>;
              }
            ).files || []
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

  /**
   * ✅ NEW: Dedicated Research Phase
   * Searches for documentation if the task seems to require it.
   */
  private async conductResearch(
    input: AgentExecutionInput
  ): Promise<string | null> {
    const { taskDetails, projectId, userId } = input;
    const description = taskDetails.description.toLowerCase();

    // Simple heuristic: Does this task look like it needs external docs?
    // You can make this smarter later.
    const needsResearch =
      description.includes("integrate") ||
      description.includes("api") ||
      description.includes("library") ||
      description.includes("sdk") ||
      description.includes("setup");

    if (!needsResearch) return null;

    logger.info(
      `[${this.config.name}] Conducting research for: ${taskDetails.title}`
    );

    try {
      const result = await this.executeTool(
        "web_search",
        {
          query: `${taskDetails.title} ${taskDetails.description} best practices documentation example`,
          maxResults: 3,
        },
        { projectId, userId }
      );

      if (result.success && result.data) {
        const searchData = result.data as {
          results: Array<{ title: string; description: string }>;
        };
        const summary = searchData.results
          .map((r) => `Title: ${r.title}\nInfo: ${r.description}`)
          .join("\n\n");
        return `\n**🔍 RESEARCH NOTES (Documentation):**\n${summary}\n`;
      }
    } catch {
      logger.warn(
        `[${this.config.name}] Research failed, proceeding without it.`
      );
    }
    return null;
  }

  /**
   * Generate implementation using AI
   */
  private async generateImplementation(input: AgentExecutionInput): Promise<{
    files: Array<{ path: string; content: string }>;
    commands: string[];
    explanation: string;
  } | null> {
    this.validateContext(input.context);

    // 1. Load Codebase Context
    const existingContext = await this.loadExistingContext(input);

    // 2. ✅ Perform Research (Web Search)
    const researchNotes = await this.conductResearch(input);

    // 3. Build Prompt (Injecting Research)
    const prompt = this.buildImplementationPrompt(
      input,
      existingContext,
      researchNotes
    );

    try {
      // 4. Generate Code (Tools Disabled to protect JSON)
      const responseText = await this.generateContent(
        prompt,
        undefined,
        false, // Keep false for stability
        {
          projectId: input.projectId,
          userId: input.userId,
        }
      );

      return this.parseImplementation(responseText);
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
      warnings.push(
        "Tech stack is missing - will use Next.js + Prisma defaults"
      );
    } else {
      if (!context.techStack.backend?.framework) {
        warnings.push(
          "Backend framework not specified - will assume Next.js API Routes"
        );
      }
      if (!context.techStack.database?.type) {
        warnings.push(
          "Database not specified - will assume PostgreSQL with Prisma"
        );
      }
    }

    // Check architecture (warnings only)
    if (!context.architecture) {
      warnings.push(
        "Architecture information is missing - will use RESTful API defaults"
      );
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
   * Build implementation prompt
   * ✅ Updated to accept Research Notes
   */
  private buildImplementationPrompt(
    input: AgentExecutionInput,
    existingContext: {
      structure: string;
      existingFiles: Array<{ path: string; content: string }>;
      dependencies: string;
    },
    researchNotes: string | null // <--- New Parameter
  ): string {
    const { taskDetails, context } = input;

    return `
You are the Backend Agent, specialized in implementing backend code.

**🎯 CRITICAL: BUILD ON EXISTING CODE, DON'T START FROM SCRATCH**
You are working on a project that may already have code from previous development waves.
Review the "Existing Codebase" section below carefully.

**Task:**
- Title: ${taskDetails.title}
- Description: ${taskDetails.description}

**Files to Create/Modify:**
${Array.isArray(taskDetails.files) ? taskDetails.files.map((f: string) => `- ${f}`).join("\n") : "Determine appropriate files"}

${researchNotes ? researchNotes : ""}

**Tech Stack:**
\`\`\`json
${JSON.stringify(context.techStack, null, 2)}
\`\`\`

**Architecture:**
\`\`\`json
${JSON.stringify(context.architecture, null, 2)}
\`\`\`

**📂 EXISTING CODEBASE (from previous waves):**
${
  existingContext.existingFiles.length > 0
    ? `
**Project Structure:**
${existingContext.structure}

**Dependencies:**
${existingContext.dependencies}

**Existing Files (${existingContext.existingFiles.length} files):**
${existingContext.existingFiles
  .map(
    (file, idx) => `
[File ${idx + 1}]: ${file.path}
\`\`\`typescript
${file.content.length > 3000 ? file.content.substring(0, 3000) + "\n... (truncated)" : file.content}
\`\`\`
`
  )
  .join("\n")}
`
    : "**No existing code found - you're starting fresh!**\n"
}

**Available Tools:**
${this.getToolsDescription()}

**CRITICAL REQUIREMENTS:**
1. **ATOMIC** - Implement ONLY this specific task.
2. **PRODUCTION QUALITY** - TypeScript, error handling, validation.
3. **COMPLETE FILES** - Provide full, runnable code.
4. **NO INTERACTIVE COMMANDS** - Use flags like --yes.

**OUTPUT FORMAT:**
Respond with ONLY valid JSON (no markdown, no explanations outside JSON):

\`\`\`json
{
  "files": [
    {
      "path": "src/app/api/users/route.ts",
      "content": "// COMPLETE FILE CONTENT HERE"
    }
  ],
  "commands": [
    "npm install zod"
  ],
  "explanation": "Brief explanation of implementation"
}
\`\`\`
`.trim();
  }

  /**
   * Parse AI implementation response
   */
  private parseImplementation(responseText: string): {
    files: Array<{ path: string; content: string }>;
    commands: string[];
    explanation: string;
  } | null {
    try {
      // Clean response
      let cleaned = responseText.trim();
      cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "");

      const parsed = JSON.parse(cleaned) as {
        files?: Array<{ path: string; content: string }>;
        commands?: string[];
        explanation?: string;
      };

      return {
        files: parsed.files || [],
        commands: parsed.commands || [],
        explanation: parsed.explanation || "No explanation provided",
      };
    } catch (error) {
      logger.error(
        `[${this.config.name}] Failed to parse AI response`,
        error instanceof Error ? error : new Error(String(error)),
        { preview: responseText.substring(0, 500) }
      );
      return null;
    }
  }

  /**
   * Write files using filesystem tool
   */
  private async writeFiles(
    files: Array<{ path: string; content: string }>,
    context: { projectId: string; userId: string }
  ): Promise<{
    success: boolean;
    files: Array<{ path: string; lines: number; success: boolean }>;
    filesData: Array<{ path: string; content: string; linesOfCode: number }>;
    error?: string;
  }> {
    const results: Array<{ path: string; lines: number; success: boolean }> =
      [];
    const filesData: Array<{
      path: string;
      content: string;
      linesOfCode: number;
    }> = [];

    for (const file of files) {
      try {
        const result = await this.executeTool(
          "filesystem",
          {
            operation: "write",
            path: file.path,
            content: file.content,
          },
          context
        );

        const linesOfCode = file.content.split("\n").length;

        results.push({
          path: file.path,
          lines: linesOfCode,
          success: result.success,
        });

        // Store full file data for UI
        if (result.success) {
          filesData.push({
            path: file.path,
            content: file.content,
            linesOfCode,
          });
        }

        if (!result.success) {
          logger.warn(`[${this.config.name}] File write failed: ${file.path}`, {
            error: result.error,
          });
        }
      } catch (error) {
        logger.error(
          `[${this.config.name}] File write error: ${file.path}`,
          error instanceof Error ? error : new Error(String(error))
        );
        results.push({
          path: file.path,
          lines: 0,
          success: false,
        });
      }
    }

    const allSuccess = results.every((r) => r.success);

    return {
      success: allSuccess,
      files: results,
      filesData,
      error: allSuccess ? undefined : "Some files failed to write",
    };
  }

  /**
   * Run commands using command tool
   */
  private async runCommands(
    commands: string[],
    context: { projectId: string; userId: string }
  ): Promise<{
    success: boolean;
    commands: Array<{
      command: string;
      success: boolean;
      output: string;
      exitCode: number;
    }>;
    error?: string;
  }> {
    const results: Array<{
      command: string;
      success: boolean;
      output: string;
      exitCode: number;
    }> = [];

    for (const command of commands) {
      try {
        // Skip dangerous commands
        if (this.isDangerousCommand(command)) {
          logger.warn(
            `[${this.config.name}] Skipped dangerous command: ${command}`
          );
          continue;
        }

        const result = await this.executeTool(
          "command",
          {
            command,
            timeout: 300,
          },
          context
        );

        const data = result.data as { stdout?: string; stderr?: string };
        results.push({
          command,
          success: result.success,
          output: data?.stdout || data?.stderr || result.error || "",
          exitCode: result.success ? 0 : 1, // 0 for success, 1 for failure
        });

        if (!result.success) {
          logger.warn(`[${this.config.name}] Command failed: ${command}`, {
            error: result.error,
          });
        }
      } catch (error) {
        logger.error(
          `[${this.config.name}] Command error: ${command}`,
          toError(error)
        );
        results.push({
          command,
          success: false,
          output: error instanceof Error ? error.message : "Unknown error",
          exitCode: 1, // Non-zero exit code for errors
        });
      }
    }

    const allSuccess = results.every((r) => r.success);

    return {
      success: allSuccess,
      commands: results,
      error: allSuccess ? undefined : "Some commands failed",
    };
  }

  /**
   * Verify implementation meets requirements
   */
  private verifyImplementation(
    files: Array<{ path: string; lines: number; success: boolean }>,
    commands: Array<{ command: string; success: boolean; output: string }>,
    taskDetails: AgentExecutionInput["taskDetails"]
  ): {
    passed: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check 1: All files created
    const failedFiles = files.filter((f) => !f.success);
    if (failedFiles.length > 0) {
      issues.push(`Failed to create ${failedFiles.length} file(s)`);
    }

    // Check 2: All commands succeeded
    const failedCommands = commands.filter((c) => !c.success);
    if (failedCommands.length > 0) {
      issues.push(`${failedCommands.length} command(s) failed`);
    }

    // Check 3: Line count within limits
    const totalLines = files.reduce((sum, f) => sum + f.lines, 0);
    const maxLines = taskDetails.estimatedLines * 1.5; // Allow 50% buffer

    if (totalLines > maxLines) {
      issues.push(`Code too large: ${totalLines} lines (limit: ${maxLines})`);
    }

    // Check 4: Minimum lines (ensure not empty)
    if (totalLines < 10) {
      issues.push(`Code too small: ${totalLines} lines (suspicious)`);
    }

    return {
      passed: issues.length === 0,
      issues,
    };
  }

  /**
   * Check if command is dangerous
   */
  private isDangerousCommand(command: string): boolean {
    const dangerous = [
      "rm -rf /",
      "rm -rf *",
      "del /f",
      "format",
      "DROP DATABASE",
      "DROP TABLE",
      "prisma db push", // No database access in sandbox
      "prisma migrate",
      "> /dev/",
      "dd if=",
    ];

    return dangerous.some((d) =>
      command.toLowerCase().includes(d.toLowerCase())
    );
  }
}

// ==========================================
// EXPORT SINGLETON
// ==========================================

export const backendAgent = new BackendAgent();
