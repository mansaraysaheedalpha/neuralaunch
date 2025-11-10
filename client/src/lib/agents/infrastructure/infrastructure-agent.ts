// src/lib/agents/infrastructure/infrastructure-agent.ts
// src/lib/agents/execution/infrastructure-agent.ts
/**
 * Infrastructure Agent - WITH FIX MODE
 * Now supports fixing infrastructure issues
 */

import {
  BaseAgent,
  AgentExecutionInput,
  AgentExecutionOutput,
} from "../base/base-agent";
import { AI_MODELS } from "@/lib/models";
import { logger } from "@/lib/logger";

export class InfrastructureAgent extends BaseAgent {
  constructor() {
    super({
      name: "InfrastructureAgent",
      category: "execution",
      description:
        "Generic infrastructure setup - adapts to any tech stack and task requirements",
      supportedTaskTypes: ["infrastructure", "devops", "deployment_config"],
      requiredTools: [
        "filesystem",
        "command",
        "web_search",
        "code_analysis",
        "context_loader",
      ],
      modelName: AI_MODELS.OPENAI,
    });
  }

  async executeTask(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const { taskId, projectId, userId, taskDetails, context } = input;

    // ✅ Check if this is a fix request
    const isFixMode = taskDetails.mode === "fix";

    if (isFixMode) {
      logger.info(
        `[${this.config.name}] FIX MODE: Fixing infrastructure issues`,
        {
          attempt: taskDetails.attempt,
          issuesCount: taskDetails.issuesToFix?.length || 0,
        }
      );

      return await this.executeFixMode(input);
    }

    // Normal execution mode
    logger.info(`[${this.config.name}] Starting infrastructure task`, {
      taskId,
      title: taskDetails.title,
    });

    try {
      if (this.tools.has("context_loader")) {
        await this.loadProjectContext(input);
      }

      const prompt = this.buildTaskPrompt(taskDetails, context);

      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();

      const generatedFiles = this.parseGeneratedFiles(responseText);

      const writtenFiles: string[] = [];
      for (const file of generatedFiles) {
        await this.executeTool(
          "filesystem",
          {
            operation: "write",
            path: file.path,
            content: file.content,
          },
          { projectId, userId }
        );
        writtenFiles.push(file.path);
      }

      logger.info(`[${this.config.name}] Infrastructure task complete`, {
        filesCreated: writtenFiles.length,
      });

      return {
        success: true,
        message: `Created ${writtenFiles.length} infrastructure files`,
        iterations: 1,
        durationMs: 0,
        data: {
          filesCreated: writtenFiles,
          files: generatedFiles,
        },
      };
    } catch (error) {
      logger.error(`[${this.config.name}] Infrastructure task failed`, error);

      return {
        success: false,
        message: "Infrastructure task failed",
        iterations: 1,
        durationMs: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * ✅ NEW: Execute in fix mode for infrastructure
   */
  private async executeFixMode(
    input: AgentExecutionInput
  ): Promise<AgentExecutionOutput> {
    const { taskId, projectId, userId, taskDetails, context } = input;

    try {
      // Step 1: Load infrastructure files that need fixing
      const filesToFix = taskDetails.issuesToFix.map(
        (issue: any) => issue.file
      );
      const uniqueFiles = Array.from(new Set(filesToFix));

      logger.info(
        `[${this.config.name}] Loading ${uniqueFiles.length} config files to fix`
      );

      const existingFiles = await this.loadFilesToFix(
        projectId,
        userId,
        uniqueFiles
      );

      // Step 2: Generate fixes
      const fixPrompt = this.buildInfraFixPrompt(
        taskDetails.issuesToFix,
        existingFiles,
        taskDetails.attempt,
        context
      );

      const result = await this.model.generateContent(fixPrompt);
      const responseText = result.response.text();

      const fixes = this.parseGeneratedFiles(responseText);

      if (!fixes || fixes.length === 0) {
        return {
          success: false,
          message: "Failed to generate infrastructure fixes",
          iterations: 1,
          durationMs: 0,
          error: "AI could not generate fixes",
        };
      }

      // Step 3: Apply fixes
      const writtenFiles: string[] = [];
      for (const file of fixes) {
        await this.executeTool(
          "filesystem",
          {
            operation: "write",
            path: file.path,
            content: file.content,
          },
          { projectId, userId }
        );
        writtenFiles.push(file.path);
      }

      logger.info(`[${this.config.name}] Infrastructure fixes applied`, {
        filesFixed: writtenFiles.length,
        issuesAddressed: taskDetails.issuesToFix.length,
      });

      return {
        success: true,
        message: `Fixed ${taskDetails.issuesToFix.length} infrastructure issues`,
        iterations: 1,
        durationMs: 0,
        data: {
          filesCreated: writtenFiles,
          issuesFixed: taskDetails.issuesToFix.length,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(`[${this.config.name}] Infrastructure fix failed`, error);

      return {
        success: false,
        message: "Infrastructure fix attempt failed",
        iterations: 1,
        durationMs: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Load infrastructure files to fix
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

        if (result.success && result.data?.content) {
          files.push({
            path: filePath,
            content: result.data.content,
          });
        }
      } catch (error) {
        logger.warn(
          `[${this.config.name}] Failed to load file: ${filePath}`,
          error
        );
      }
    }

    return files;
  }

  /**
   * Build infrastructure fix prompt
   */
  private buildInfraFixPrompt(
    issues: any[],
    existingFiles: Array<{ path: string; content: string }>,
    attempt: number,
    context: any
  ): string {
    const issuesSummary = issues
      .map(
        (issue, i) => `
**Issue ${i + 1}:**
- File: ${issue.file}
- Severity: ${issue.severity}
- Problem: ${issue.message}
- Suggestion: ${issue.suggestion}
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
You are the Infrastructure Agent in FIX MODE. Fix configuration issues found by the Critic Agent.

**FIX ATTEMPT: ${attempt}**

**ISSUES TO FIX:**
${issuesSummary}

**EXISTING CONFIG FILES:**
${filesSummary}

**TECH STACK:**
\`\`\`json
${JSON.stringify(context.techStack, null, 2)}
\`\`\`

**FIX STRATEGIES:**

For **Docker Issues**:
- Fix base image vulnerabilities (use specific versions)
- Add proper USER directive (don't run as root)
- Multi-stage builds for smaller images
- Proper .dockerignore

For **CI/CD Issues**:
- Fix workflow syntax errors
- Add proper environment variables
- Correct deployment steps
- Add security scanning

For **Environment Variable Issues**:
- Remove hardcoded secrets
- Add all required variables to .env.example
- Document variable purposes
- Use proper naming conventions

For **Security Issues**:
- Remove exposed secrets
- Add proper permissions
- Use secure defaults
- Add security headers

**OUTPUT FORMAT (JSON only):**

\`\`\`json
{
  "files": [
    {
      "path": "exact/path/to/config",
      "content": "COMPLETE FIXED FILE CONTENT",
      "description": "What was fixed"
    }
  ],
  "explanation": "Summary of infrastructure fixes applied"
}
\`\`\`

Generate the fixed infrastructure configurations now.
`.trim();
  }

  /**
   * Build AI prompt based on SPECIFIC task requirements
   * Adapts to whatever the Planning Agent requested
   */
  private buildTaskPrompt(taskDetails: any, context: any): string {
    return `
You are an expert DevOps engineer. Generate infrastructure configuration files for this SPECIFIC task.

**TASK:**
Title: ${taskDetails.title}
Description: ${taskDetails.description}

**FILES TO CREATE:**
${taskDetails.technicalDetails?.files?.join(", ") || "Determine based on task"}

**TECHNOLOGIES:**
${taskDetails.technicalDetails?.technologies?.join(", ") || "Determine from context"}

**TECH STACK (for context):**
${JSON.stringify(context.techStack, null, 2)}

**ARCHITECTURE (for context):**
${JSON.stringify(context.architecture, null, 2)}

**EXISTING PROJECT CONTEXT:**
${context._existingFiles ? `Files already exist: ${Object.keys(context._existingFiles).join(", ")}` : "Starting fresh"}

**ACCEPTANCE CRITERIA:**
${taskDetails.acceptanceCriteria?.map((c: string) => `- ${c}`).join("\n") || "Not specified"}

**CRITICAL INSTRUCTIONS:**

1. **Generate ONLY what's asked** - Don't create files not mentioned in the task
2. **Adapt to the actual tech stack** - If it's Python, don't generate Node.js configs
3. **Check existing files** - Don't overwrite existing configurations
4. **Follow best practices** - Production-ready configurations
5. **Be specific** - Use actual project details, not placeholders

**OUTPUT FORMAT (JSON only):**

\`\`\`json
{
  "files": [
    {
      "path": "exact/path/to/file",
      "content": "complete file content here",
      "description": "Brief description of what this file does"
    }
  ],
  "explanation": "Brief explanation of what was generated and why"
}
\`\`\`

**EXAMPLES:**

If task is "Create Dockerfile for Node.js API":
- Generate ONLY Dockerfile (and maybe .dockerignore)
- Use Node.js base image
- Adapt to package manager (npm/yarn/pnpm)
- Don't create docker-compose unless explicitly asked

If task is "Setup environment variables":
- Generate .env.example with actual variables from project
- Don't create Dockerfile or other unrelated files

If task is "Configure GitHub Actions for Python":
- Generate .github/workflows/ci.yml
- Use Python-specific steps (pytest, black, etc.)
- Don't create Node.js workflows

Generate the requested infrastructure configuration now.
`.trim();
  }

  /**
   * Parse AI response into file objects
   */
  private parseGeneratedFiles(responseText: string): Array<{
    path: string;
    content: string;
    description: string;
  }> {
    try {
      const cleaned = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const parsed = JSON.parse(cleaned);

      return parsed.files || [];
    } catch (error) {
      logger.error(`[${this.config.name}] Failed to parse AI response`, error);
      throw new Error("Failed to parse infrastructure configuration");
    }
  }

  /**
   * Load existing project context to avoid overwriting
   */
  private async loadProjectContext(input: AgentExecutionInput): Promise<void> {
    try {
      const contextResult = await this.executeTool(
        "context_loader",
        {
          operation: "smart_load",
          taskDescription: input.taskDetails.title,
          maxFiles: 50,
          maxSize: 500000,
        },
        {
          projectId: input.projectId,
          userId: input.userId,
        }
      );

      if (contextResult.success && contextResult.data) {
        input.context._existingFiles = contextResult.data.existingFiles || {};
        input.context._projectStructure = contextResult.data.structure;
        input.context._dependencies = contextResult.data.dependencies;
      }
    } catch (error) {
      logger.warn(
        `[${this.config.name}] Failed to load project context`,
        error
      );
    }
  }
}

export const infrastructureAgent = new InfrastructureAgent();
