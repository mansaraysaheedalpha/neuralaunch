import { inngest } from "./client";
import prisma from "@/lib/prisma";
import { SandboxService } from "@/lib/services/sandbox-service";
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";
import { logger } from "@/lib/logger";
// ✅ FIX 1: Import the correct, detailed types from your agent-schemas file
import type { ActionableTask, StepResult } from "@/types/agent-schemas";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { Octokit } from "@octokit/rest";

// --- Zod Schema for AI JSON Response ---
const aiExecutionResponseSchema = z.object({
  files_to_write: z
    .array(
      z.object({
        path: z
          .string()
          .min(1, "File path cannot be empty.")
          .refine(
            (p) => !p.startsWith("/"),
            "Path must be relative (cannot start with '/')."
          )
          .refine(
            (p) => !p.split("/").includes(".."),
            "Path cannot contain '..' as a path segment."
          ),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
  commands_to_run: z
    .array(z.string().min(1, "Command cannot be empty."))
    .optional()
    .default([]),
  summary: z.string().min(1, "Summary cannot be empty."),
});
type AiExecutionResponse = z.infer<typeof aiExecutionResponseSchema>;

// --- ❌ REMOVED Unused Schemas ---
// Removed `_aiDebugResponseSchema` and `aiWorkspaceReadResponseSchema`
// as they were defined but not used in the execution flow.

// --- Schemas for Autonomous Functions ---

const aiVerificationResponseSchema = z.object({
  verified: z.boolean(),
  issues: z.array(z.string()).optional().default([]),
  needsFix: z.boolean(),
  suggestedFixes: z
    .array(
      z.object({
        file: z.string(),
        issue: z.string(),
        fix: z.string(),
      })
    )
    .optional()
    .default([]),
  summary: z.string(),
});
type AiVerificationResponse = z.infer<typeof aiVerificationResponseSchema>;

const aiDebugFullResponseSchema = z.object({
  root_cause: z.string(),
  affected_files: z.array(z.string()),
  fixes: z.array(
    z.object({
      path: z.string(),
      content: z.string(),
      reason: z.string(),
    })
  ),
  confidence: z.enum(["low", "medium", "high"]),
  summary: z.string(),
});
type AiDebugFullResponse = z.infer<typeof aiDebugFullResponseSchema>;

const aiReflectionResponseSchema = z.object({
  review_passed: z.boolean(),
  identified_issues: z.array(
    z.object({
      type: z.enum([
        "schema_inconsistency",
        "missing_import",
        "api_incomplete",
        "file_overwrite",
        "other",
      ]),
      description: z.string(),
      severity: z.enum(["critical", "warning", "info"]),
    })
  ),
  corrected_output: z
    .object({
      files_to_write: z.array(
        z.object({
          path: z.string(),
          content: z.string(),
        })
      ),
      commands_to_run: z.array(z.string()),
      summary: z.string(),
    })
    .optional(),
  needs_iteration: z.boolean(),
});
type AiReflectionResponse = z.infer<typeof aiReflectionResponseSchema>;

// --- Autonomous Helper Functions ---

/**
 * Reads multiple files from the workspace and returns their content.
 */
async function readWorkspaceFiles(
  projectId: string,
  userId: string,
  filePaths: string[],
  step: any, // Inngest step tools
  log: typeof logger
): Promise<Record<string, string>> {
  const fileContents: Record<string, string> = {};

  for (const filePath of filePaths) {
    const readResult = await step.run(
      `read-workspace-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`,
      async () => {
        return await SandboxService.readFile(projectId, userId, filePath);
      }
    );

    if (readResult.status === "success" && readResult.content) {
      fileContents[filePath] = readResult.content;
      log.info(`Read ${filePath}: ${readResult.content.length} bytes`);
    } else {
      fileContents[filePath] = "[FILE NOT FOUND OR EMPTY]";
      log.warn(
        `Could not read ${filePath}: ${readResult.message || "unknown error"}`
      );
    }
  }

  return fileContents;
}

/**
 * AI verifies its own work after execution.
 */
async function aiVerifyOwnWork(
  writtenFiles: Array<{ path: string; content: string }>,
  workspaceState: Record<string, string>,
  taskDescription: string,
  step: any,
  log: typeof logger
): Promise<AiVerificationResponse> {
  log.info("AI is verifying its own work...");

  const verificationPrompt = `
You are an autonomous AI agent verifying your own work.
**Task You Were Assigned:**
${taskDescription}
**Files You Just Wrote:**
${writtenFiles.map((f) => `- ${f.path} (${f.content.length} chars)`).join("\n")}
**Current Workspace State (Key Files):**
${Object.entries(workspaceState)
  .map(
    ([path, content]) => `
--- ${path} ---
${content.substring(0, 1000)}${content.length > 1000 ? "...(truncated)" : ""}
`
  )
  .join("\n")}
**Your Job: Verify Your Own Work**
Check for these common issues:
1. **File Overwrites**: Did you accidentally overwrite package.json or schema.prisma instead of adding to them?
2. **Schema Consistency**: If you used fields like \`task.priority\` in code, did you add them to the Prisma schema?
3. **Component Imports**: If you created a component, did you import it in the parent page?
4. **API Completeness**: If you created a POST endpoint, did you also create the GET endpoint?
5. **Missing Dependencies**: If you used a package, did you add it to package.json?
Return JSON:
\`\`\`json
{
  "verified": true/false,
  "issues": ["List any problems you found"],
  "needsFix": true/false,
  "suggestedFixes": [
    {
      "file": "path/to/file",
      "issue": "What's wrong",
      "fix": "How to fix it"
    }
  ],
  "summary": "One sentence: Is the work correct or what needs fixing?"
}
\`\`\`
`;

  const verificationJson = await step.run("ai-verify-work", async () => {
    return await executeAITaskSimple(AITaskType.AGENT_VERIFY_STEP, {
      prompt: verificationPrompt,
      responseFormat: { type: "json_object" },
    });
  });

  try {
    const parsed = JSON.parse(verificationJson) as unknown;
    const validated = aiVerificationResponseSchema.parse(parsed);
    if (validated.needsFix) {
      log.warn(`AI found ${validated.issues.length} issues in its own work`);
    } else {
      log.info("AI verified: Work is correct!");
    }
    return validated;
  } catch (parseError) {
    log.error(
      "Failed to parse AI verification response",
      parseError instanceof Error ? parseError : undefined
    );
    return {
      verified: false,
      issues: ["Failed to parse verification response"],
      needsFix: true,
      summary: "Verification response was malformed",
    };
  }
}

/**
 * AI debugs a full failure with context.
 */
async function aiDebugWithContext(
  error: { command?: string; stderr?: string; exitCode?: number },
  workspaceState: Record<string, string>,
  taskDescription: string,
  step: any,
  log: typeof logger
): Promise<AiDebugFullResponse> {
  log.info("AI is debugging with full context...");

  const debugPrompt = `
You are an autonomous AI agent debugging your own error.
**Task You Were Working On:**
${taskDescription}
**Error That Occurred:**
${error.command ? `Command: ${error.command}` : ""}
${error.stderr ? `Error Output:\n${error.stderr.substring(0, 1000)}` : ""}
${error.exitCode ? `Exit Code: ${error.exitCode}` : ""}
**Current Workspace State (Key Files):**
${Object.entries(workspaceState)
  .map(
    ([path, content]) => `
--- ${path} ---
${content.substring(0, 1500)}${content.length > 1500 ? "...(truncated)" : ""}
`
  )
  .join("\n")}
**Your Job: Debug and Fix**
1. **Diagnose**: What is the root cause of this error?
2. **Identify**: Which files need to be fixed?
3. **Fix**: Provide the complete, corrected content for each file.
4. **Confidence**: How confident are you this will work?
Return JSON:
\`\`\`json
{
  "root_cause": "Explain what went wrong",
  "affected_files": ["list", "of", "files"],
  "fixes": [
    {
      "path": "path/to/file",
      "content": "COMPLETE corrected file content",
      "reason": "Why this fix is needed"
    }
  ],
  "confidence": "low" | "medium" | "high",
  "summary": "One sentence summary of the fix"
}
\`\`\`
`;

  const debugJson = await step.run("ai-debug-full-context", async () => {
    return await executeAITaskSimple(AITaskType.AGENT_DEBUG_FULL, {
      prompt: debugPrompt,
      responseFormat: { type: "json_object" },
    });
  });

  try {
    const parsed = JSON.parse(debugJson) as unknown;
    const validated = aiDebugFullResponseSchema.parse(parsed);
    log.info(
      `AI diagnosis: ${validated.root_cause} (confidence: ${validated.confidence})`
    );
    return validated;
  } catch (parseError) {
    log.error(
      "Failed to parse AI debug response",
      parseError instanceof Error ? parseError : undefined
    );
    throw new Error("AI could not provide a valid debug response");
  }
}

/**
 * AI reflects on its initial output *before* execution.
 */
async function aiReflectOnOutput(
  initialOutput: AiExecutionResponse,
  workspaceState: Record<string, string>,
  taskDescription: string,
  step: any,
  log: typeof logger
): Promise<AiReflectionResponse> {
  log.info("AI is reflecting on its initial output...");

  const reflectionPrompt = `
You are an autonomous AI agent reviewing your own proposed changes BEFORE executing them.
**Task:**
${taskDescription}
**Your Proposed Changes:**
Files to write: ${initialOutput.files_to_write.length}
${initialOutput.files_to_write.map((f) => `- ${f.path}`).join("\n")}
Commands to run: ${initialOutput.commands_to_run.length}
${initialOutput.commands_to_run.join("\n")}
**Current Workspace State:**
${Object.entries(workspaceState)
  .map(
    ([path, content]) => `
--- ${path} ---
${content.substring(0, 800)}${content.length > 800 ? "...(truncated)" : ""}
`
  )
  .join("\n")}
**Your Job: Review and Correct**
Before these changes are executed, check for:
1. **Schema Consistency**: Will the code use fields that don't exist in schema.prisma?
2. **File Overwrites**: Are you about to overwrite package.json or schema.prisma instead of updating them?
3. **Missing Imports**: Did you create components but forget to import them?
4. **API Incomplete**: Did you create POST without GET?
If you find issues, provide corrected output. If everything looks good, approve.
Return JSON:
\`\`\`json
{
  "review_passed": true/false,
  "identified_issues": [
    {
      "type": "schema_inconsistency" | "missing_import" | "api_incomplete" | "file_overwrite" | "other",
      "description": "What's wrong",
      "severity": "critical" | "warning" | "info"
    }
  ],
  "corrected_output": {
    "files_to_write": [...],
    "commands_to_run": [...],
    "summary": "..."
  },
  "needs_iteration": true/false
}
\`\`\`
`;

  const reflectionJson = await step.run("ai-reflect", async () => {
    return await executeAITaskSimple(AITaskType.AGENT_REFLECT, {
      prompt: reflectionPrompt,
      responseFormat: { type: "json_object" },
    });
  });

  try {
    const parsed = JSON.parse(reflectionJson) as unknown;
    const validated = aiReflectionResponseSchema.parse(parsed);
    if (!validated.review_passed) {
      log.warn(
        `AI reflection found ${validated.identified_issues.length} issues before execution`
      );
    } else {
      log.info("AI reflection: Output looks good!");
    }
    return validated;
  } catch (parseError) {
    log.error(
      "Failed to parse AI reflection response",
      parseError instanceof Error ? parseError : undefined
    );
    return {
      review_passed: true,
      identified_issues: [],
      needs_iteration: false,
    };
  }
}

// --- Inngest Function Definition ---
export const executeAgentStep = inngest.createFunction(
  {
    id: "execute-agent-step",
    name: "Execute AI Agent Build Step",
    retries: 2,
    timeouts: { start: "30m" },
  },
  { event: "agent/execute.step.requested" },
  async ({ event, step }) => {
    // --- Extract data from the incoming event ---
    const {
      projectId,
      userId,
      stepIndex,
      taskDescription,
      blueprintSummary,
      userResponses,
      githubToken,
      githubRepoUrl,
      currentHistoryLength,
    } = event.data;

    // --- Setup contextual logging ---
    const log = logger.child({
      inngestFunction: "executeAgentStep",
      projectId,
      userId,
      stepIndex,
      runId: event.id,
    });

    log.info(`Executing step ${stepIndex}: "${taskDescription}"`);

    // ✅ FIX 2: Correctly type stepResult and currentHistory
    // This adds `metadata` as an optional `any` type to `StepResult`
    // without modifying the base schema, fixing the TS error.
    type StepResultWithMetadata = StepResult & { metadata?: any };

    const startTime = new Date();
    let stepResult: Partial<StepResultWithMetadata> = {
      startTime: startTime.toISOString(),
      taskIndex: stepIndex,
      taskDescription: taskDescription,
      status: "error",
      filesWritten: [],
      commandsRun: [],
      summary: "Execution did not complete successfully.",
      prUrl: null,
      metadata: {
        totalIterations: 0,
        selfCorrections: 0,
        autonomousMode: true,
      },
    };
    let currentHistory: StepResultWithMetadata[] = [];

    // ✅ FIX 3: Initialize workspaceState at the top of the try block
    // This object will be populated by `readWorkspaceFiles`
    const workspaceState: Record<string, string> = {};

    try {
      // --- Fetch Fresh Project State ---
      currentHistory = await step.run("fetch-history", async () => {
        const projectState = await prisma.landingPage.findUnique({
          where: { id: projectId, userId: userId },
          select: { agentExecutionHistory: true },
        });
        if (!projectState) {
          throw new Error(
            `Project not found or user ${userId} does not have access.`
          );
        }
        return (
          (projectState.agentExecutionHistory as
            | StepResultWithMetadata[]
            | null) || []
        );
      });

      if (currentHistory.length !== currentHistoryLength) {
        log.warn(
          `History length mismatch. Event data: ${currentHistoryLength}, DB: ${currentHistory.length}. Proceeding.`
        );
      }

      // --- Verify Sandbox Health ---
      await step.run("verify-sandbox-health", async () => {
        log.info("Verifying sandbox health before execution...");
        try {
          const healthCheck = await SandboxService.execCommand(
            projectId,
            userId,
            "echo 'health-check'",
            5 // 5 second timeout
          );
          if (healthCheck.status === "error") {
            throw new Error(
              `Sandbox health check failed: ${healthCheck.stderr}`
            );
          }
          log.info("Sandbox health check passed.");
          return { healthy: true };
        } catch (error) {
          log.error(
            "Sandbox health check failed:",
            error instanceof Error ? error : undefined
          );
          throw new Error(
            `Sandbox is not reachable: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      });

      // --- Update Status to EXECUTING ---
      await step.run("update-status-executing", async () => {
        return await prisma.landingPage.update({
          where: { id: projectId, userId: userId },
          data: { agentStatus: "EXECUTING" },
        });
      });

      // --- Git Operations: Init, Remote, .gitignore ---
      await step.run("git-init-repository", async () => {
        log.info("Ensuring Git repository is initialized...");
        const initResult = await SandboxService.gitInitIfNeeded(
          projectId,
          userId
        );
        if (!initResult.success) {
          throw new Error(
            `Failed to initialize git repository: ${initResult.details}`
          );
        }
        log.info("Git repository initialized successfully.");
      });

      if (githubRepoUrl && githubToken) {
        await step.run("git-setup-remote", async () => {
          log.info("Configuring Git remote 'origin'...");
          const authenticatedUrl = githubRepoUrl.replace(
            "https://",
            `https://${githubToken}@`
          );
          const remoteCmd = `git remote remove origin 2>/dev/null || true && git remote add origin "${authenticatedUrl}"`;
          const remoteResult = await SandboxService.execCommand(
            projectId,
            userId,
            remoteCmd,
            60
          );
          if (remoteResult.status === "error") {
            throw new Error(
              `Failed to configure git remote: ${remoteResult.stderr}`
            );
          }
          log.info("Git remote 'origin' configured successfully.");
        });
      }

      const gitignoreContent = `
# Dependencies
node_modules
.pnpm-store
# Build outputs
.next
dist
.output
# Local environment variables
.env
.env.local
.env.development
.env.test
.env.production
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*
# Misc
.DS_Store
`;
      await step.run("ensure-gitignore", async () => {
        log.info("Ensuring .gitignore exists...");
        return await SandboxService.writeFile(
          projectId,
          userId,
          ".gitignore",
          gitignoreContent
        );
      });

      // --- Git Branching Logic ---
      const safeTaskDesc = taskDescription
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, "-")
        .substring(0, 40);
      const branchName = `feat/step-${stepIndex + 1}-${
        safeTaskDesc || "agent-update"
      }`;
      log.info(`Using Git branch: ${branchName}`);

      await step.run("git-create-branch", async () => {
        log.info(`Attempting to create/checkout branch: ${branchName}`);
        const branchResult = await SandboxService.gitCreateBranch(
          projectId,
          userId,
          branchName
        );

        if (
          !branchResult.success &&
          (branchResult.details?.includes("origin/main' is not a commit") ||
            branchResult.details?.includes(
              "does not appear to be a git repository"
            ))
        ) {
          log.warn(
            "Remote 'origin/main' not found. Repo appears to be empty. Creating initial commit."
          );
          const addResult = await SandboxService.gitAddAll(projectId, userId);
          if (!addResult.success) {
            throw new Error(
              `Failed to git add .gitignore: ${addResult.details}`
            );
          }
          const commitResult = await SandboxService.gitCommit(
            projectId,
            userId,
            "Initial commit: Add .gitignore"
          );
          if (!commitResult.success || !commitResult.committed) {
            log.warn(
              `Initial commit failed or was empty: ${commitResult.details}`
            );
          }
          if (githubRepoUrl && githubToken) {
            const pushMain = await SandboxService.gitPushToBranch(
              projectId,
              userId,
              githubRepoUrl,
              githubToken,
              "main"
            );
            if (!pushMain.success) {
              throw new Error(
                `Failed to push initial 'main' branch: ${pushMain.message}`
              );
            }
            log.info("Successfully pushed initial 'main' branch.");
          }
          const secondAttempt = await SandboxService.gitCreateBranch(
            projectId,
            userId,
            branchName
          );
          if (!secondAttempt.success) {
            throw new Error(
              `Failed to create feature branch after initial commit: ${secondAttempt.details}`
            );
          }
        } else if (!branchResult.success) {
          throw new Error(
            `Failed to create git branch '${branchName}': ${branchResult.details}`
          );
        }
        log.info(`Successfully on branch: ${branchName}`);
      });

      // --- Construct AI Execution Prompt ---
      const previousStepsSummary =
        currentHistory.length > 0
          ? "Previous Steps Completed Summary:\n" +
            currentHistory
              .map((h, i) => `- Step ${i + 1}: ${h.summary} (${h.status})`)
              .join("\n")
          : "This is the first step.";
      const executionPrompt = `
You are an AI Software Engineer executing a single step to build a web application.
Project Blueprint Summary:
---
${blueprintSummary}
---
User Preferences/Answers:
---
${userResponses ? JSON.stringify(userResponses, null, 2) : "None provided."}
---
Plan Context:
${previousStepsSummary}
Your Current Task (Step ${stepIndex + 1}): ${taskDescription}

**Instructions:**
1. Determine the code modifications OR shell commands required to COMPLETE **only this specific task**.
2. Assume root directory '/workspace' of a standard Next.js + Prisma project.
3. **CRITICAL: Keep your response CONCISE. Do NOT include full file contents for large files like package.json or node_modules. Only include the MINIMAL code changes needed.**
4. **IMPORTANT DATABASE RULE: DO NOT run 'npx prisma db push' or 'npx prisma migrate'. The sandbox does not have database access. Only run 'npx prisma generate' to generate Prisma Client types.**
5. **PRISMA SCHEMA RULE: When defining a '@relation', valid 'onDelete' and 'onUpdate' actions are 'Cascade', 'Restrict', 'NoAction', 'SetNull', or 'SetDefault'. Do NOT use 'List' or any other value.**
6. Provide your response ONLY as a valid JSON object matching the following structure:
\`\`\`json
{
  "files_to_write": [
    {
      "path": "src/components/NewComponent.tsx",
      "content": "Full file content here..."
    }
  ],
  "commands_to_run": [
    "npm install zod",
    "npx prisma generate"
  ],
  "summary": "Brief summary (1-2 sentences) of actions taken for this step."
}
\`\`\`
7. CRITICAL: All file paths MUST be relative from '/workspace' root. Do NOT use '../' or absolute paths starting with '/'. 
  Examples of VALID paths: "src/app/page.tsx", "package.json", "lib/auth.ts"
  Examples of INVALID paths: "/src/app/page.tsx", "../package.json", "./src/../app/page.tsx"
8. If no files need writing, provide an empty \`"files_to_write": []\`.
9. If no commands need running, provide an empty \`"commands_to_run": []\`.
10. Ensure the \`summary\` is present and accurately reflects the changes.
11. Focus ONLY on the current task. Ensure the JSON is perfectly valid and complete.
12. **IMPORTANT: Ensure your JSON response ends with the closing brace }. Do not let your response be truncated.**
`;

      // ==================== AUTONOMOUS REFLECTIVE EXECUTION LOOP ====================

      const MAX_ITERATIONS = 5;
      let iteration = 0;
      let stepSuccess = false;
      let aiParsedResponse: AiExecutionResponse | null = null; // Can be null if reflection fails

      while (!stepSuccess && iteration < MAX_ITERATIONS) {
        iteration++;
        log.info(`
========================================
AUTONOMOUS ITERATION ${iteration}/${MAX_ITERATIONS}
========================================
`);

        // --- PHASE 1: AI GENERATES INITIAL OUTPUT ---
        const aiResponseJson = await step.run(
          `call-ai-iteration-${iteration}`,
          async () => {
            return await executeAITaskSimple(AITaskType.AGENT_EXECUTE_STEP, {
              prompt: executionPrompt,
              responseFormat: { type: "json_object" },
            });
          }
        );

        // --- Parse AI Response ---
        try {
          let cleanedJson = aiResponseJson.trim();
          if (cleanedJson.startsWith("```json")) {
            cleanedJson = cleanedJson
              .replace(/^```json\s*\n?/, "")
              .replace(/\n?```\s*$/, "");
          } else if (cleanedJson.startsWith("```")) {
            cleanedJson = cleanedJson
              .replace(/^```\s*\n?/, "")
              .replace(/\n?```\s*$/, "");
          }

          if (!cleanedJson.trim().endsWith("}")) {
            log.warn(
              "Detected potentially truncated JSON. Attempting repair..."
            );
            const unclosedStringMatch = cleanedJson.match(/"([^"\\]|\\.)*$/);
            if (unclosedStringMatch) {
              cleanedJson =
                cleanedJson.substring(0, unclosedStringMatch.index) + '"';
            }
            const openBraces = (cleanedJson.match(/\{/g) || []).length;
            const closeBraces = (cleanedJson.match(/\}/g) || []).length;
            const openBrackets = (cleanedJson.match(/\[/g) || []).length;
            const closeBrackets = (cleanedJson.match(/\]/g) || []).length;
            cleanedJson += "]".repeat(
              Math.max(0, openBrackets - closeBrackets)
            );
            cleanedJson += "}".repeat(Math.max(0, openBraces - closeBraces));
          }

          const rawJson = JSON.parse(cleanedJson) as unknown;
          aiParsedResponse = aiExecutionResponseSchema.parse(rawJson);
          log.info(
            `AI generated: ${aiParsedResponse.files_to_write.length} files, ${aiParsedResponse.commands_to_run.length} commands`
          );
        } catch (parseError) {
          log.error(
            "Failed to parse AI JSON response",
            parseError instanceof Error ? parseError : undefined
          );
          if (iteration >= MAX_ITERATIONS) {
            throw new Error(
              `AI returned invalid JSON after ${MAX_ITERATIONS} attempts: ${
                parseError instanceof Error
                  ? parseError.message
                  : "Unknown error"
              }`
            );
          }
          log.warn(`Parse failed, will retry (iteration ${iteration + 1})`);
          continue; // Try again
        }

        // --- Filter rogue commands ---
        const originalCommandCount = aiParsedResponse.commands_to_run.length;
        aiParsedResponse.commands_to_run =
          aiParsedResponse.commands_to_run.filter(
            (cmd) => !cmd.trim().startsWith("git ")
          );
        aiParsedResponse.commands_to_run =
          aiParsedResponse.commands_to_run.filter((cmd) => {
            const lowerCmd = cmd.toLowerCase();
            const isDatabaseCommand =
              lowerCmd.includes("prisma db push") ||
              lowerCmd.includes("prisma migrate") ||
              lowerCmd.includes("DATABASE_URL=");
            if (isDatabaseCommand) {
              log.warn(`Filtered database command: ${cmd}`);
            }
            return !isDatabaseCommand;
          });
        const filteredCount = aiParsedResponse.commands_to_run.length;
        if (originalCommandCount !== filteredCount) {
          log.warn(`Filtered ${originalCommandCount - filteredCount} commands`);
        }

        // ✅ FIX 4: Read workspace *before* reflection
        const filesToReadForReflection = [
          "package.json",
          "prisma/schema.prisma",
          ...aiParsedResponse.files_to_write.map((f) => f.path),
        ];
        const currentWorkspaceState = await readWorkspaceFiles(
          projectId,
          userId,
          [...new Set(filesToReadForReflection)], // Remove duplicates
          step,
          log
        );
        // Populate the workspaceState object
        Object.assign(workspaceState, currentWorkspaceState);

        // --- PHASE 2: AI REFLECTS ON ITS OUTPUT (PRE-FLIGHT CHECK) ---
        const reflection = await aiReflectOnOutput(
          aiParsedResponse,
          workspaceState, // Now this contains data
          taskDescription,
          step,
          log
        );

        if (!reflection.review_passed && reflection.corrected_output) {
          log.info("AI reflection found issues. Using corrected output.");
          aiParsedResponse = {
            files_to_write: reflection.corrected_output.files_to_write,
            commands_to_run: reflection.corrected_output.commands_to_run,
            summary: reflection.corrected_output.summary,
          };
        }

        const criticalIssues = reflection.identified_issues.filter(
          (i) => i.severity === "critical"
        );
        if (criticalIssues.length > 0) {
          log.warn(
            `Critical issues identified: ${criticalIssues
              .map((i) => i.description)
              .join(", ")}`
          );
        }

        // --- PHASE 3: EXECUTE - WRITE FILES ---
        let writeErrors: string[] = [];
        for (const fileToWrite of aiParsedResponse.files_to_write) {
          const fileStepId = `write-file-iter${iteration}-${fileToWrite.path
            .replace(/[^a-zA-Z0-9]/g, "-")
            .substring(0, 50)}`;

          const writeOpResult = await step.run(fileStepId, async () => {
            log.debug(`Writing: ${fileToWrite.path}`);
            return await SandboxService.writeFile(
              projectId,
              userId,
              fileToWrite.path,
              fileToWrite.content
            );
          });

          stepResult.filesWritten!.push({
            path: fileToWrite.path,
            success: writeOpResult.status === "success",
            message: writeOpResult.message,
          });

          if (writeOpResult.status === "error") {
            writeErrors.push(`${fileToWrite.path}: ${writeOpResult.message}`);
          }
        }

        if (writeErrors.length > 0) {
          log.error(`File write errors: ${writeErrors.join("; ")}`);
          if (iteration < MAX_ITERATIONS) {
            const currentFiles = await readWorkspaceFiles(
              projectId,
              userId,
              ["package.json", "prisma/schema.prisma"],
              step,
              log
            );
            const debugResult = await aiDebugWithContext(
              { stderr: writeErrors.join("\n") },
              currentFiles,
              taskDescription,
              step,
              log
            );
            if (debugResult.confidence !== "low") {
              log.info("AI will retry with fixes...");
              for (const fix of debugResult.fixes) {
                workspaceState[fix.path] = fix.content;
              }
              continue;
            }
          }
          throw new Error(`Failed to write files: ${writeErrors.join("; ")}`);
        }

        // --- PHASE 4: EXECUTE - RUN COMMANDS ---
        let commandErrors: Array<{
          command: string;
          stderr: string;
          exitCode: number;
        }> = [];

        for (let i = 0; i < aiParsedResponse.commands_to_run.length; i++) {
          const command = aiParsedResponse.commands_to_run[i];
          const commandStepId = `exec-cmd-iter${iteration}-cmd${i}`;
          log.debug(`Executing: ${command}`);

          const execOpResult = await step.run(commandStepId, async () => {
            return await SandboxService.execCommand(
              projectId,
              userId,
              command,
              900
            );
          });

          stepResult.commandsRun!.push({
            command,
            attempt: iteration,
            exitCode: execOpResult.exitCode,
            stdout: execOpResult.stdout,
            stderr: execOpResult.stderr,
          });

          if (execOpResult.status === "error") {
            commandErrors.push({
              command,
              stderr: execOpResult.stderr,
              exitCode: execOpResult.exitCode,
            });
          }
        }

        if (commandErrors.length > 0) {
          log.warn(
            `${commandErrors.length} commands failed in iteration ${iteration}`
          );
          if (iteration < MAX_ITERATIONS) {
            const filesToRead = ["package.json", "prisma/schema.prisma"];
            filesToRead.push(
              ...aiParsedResponse.files_to_write
                .map((f) => f.path)
                .filter(
                  (p) =>
                    p.endsWith(".ts") ||
                    p.endsWith(".tsx") ||
                    p.endsWith(".json")
                )
                .slice(0, 3)
            );
            const currentFiles = await readWorkspaceFiles(
              projectId,
              userId,
              [...new Set(filesToRead)],
              step,
              log
            );
            const debugResult = await aiDebugWithContext(
              commandErrors[0],
              currentFiles,
              taskDescription,
              step,
              log
            );
            log.info(
              `AI diagnosis (${debugResult.confidence} confidence): ${debugResult.root_cause}`
            );
            if (
              debugResult.confidence === "high" ||
              debugResult.confidence === "medium"
            ) {
              for (const fix of debugResult.fixes) {
                const fixStepId = `apply-fix-iter${iteration}-${fix.path.replace(
                  /[^a-zA-Z0-9]/g,
                  "-"
                )}`;
                await step.run(fixStepId, async () => {
                  return await SandboxService.writeFile(
                    projectId,
                    userId,
                    fix.path,
                    fix.content
                  );
                });
                workspaceState[fix.path] = fix.content;
              }
              log.info(
                `Applied ${debugResult.fixes.length} fixes. Retrying...`
              );
              continue;
            }
          }
          throw new Error(
            `Commands failed after ${iteration} iterations: ${commandErrors[0].stderr.substring(
              0,
              500
            )}`
          );
        }

        // --- PHASE 5: AI VERIFIES ITS OWN WORK ---
        const verification = await aiVerifyOwnWork(
          aiParsedResponse.files_to_write,
          workspaceState,
          taskDescription,
          step,
          log
        );

        if (verification.needsFix && iteration < MAX_ITERATIONS) {
          log.warn(
            `AI verification failed: ${verification.issues.join(
              ", "
            )}. Will retry with fixes.`
          );
          for (const fix of verification.suggestedFixes || []) {
            if (fix.file && fix.fix) {
              workspaceState[fix.file] = fix.fix;
            }
          }
          continue;
        }

        if (!verification.verified && iteration >= MAX_ITERATIONS) {
          log.error(
            `Max iterations reached but work still not verified: ${verification.issues.join(
              ", "
            )}`
          );
          stepResult.summary += ` (Warning: AI detected issues: ${verification.issues.join(
            ", "
          )})`;
        }

        // --- SUCCESS! ---
        stepSuccess = true;
        stepResult.summary = aiParsedResponse.summary;
        log.info(
          `✅ Step completed successfully after ${iteration} iteration(s)`
        );
      } // --- End of while loop ---

      if (!stepSuccess) {
        throw new Error(
          `Failed to complete step after ${MAX_ITERATIONS} autonomous iterations`
        );
      }

      // This variable is now guaranteed to be non-null if stepSuccess is true
      const finalIterationSummary = (aiParsedResponse as AiExecutionResponse)
        .summary;

      // --- Git Operations ---
      if (githubRepoUrl && githubToken) {
        await step.run(`git-ops-${stepIndex}`, async () => {
          log.info("Performing Git operations (add, commit, push)...");
          const addCheck = await SandboxService.gitAddAll(projectId, userId);
          if (!addCheck.success)
            throw new Error(`Git add failed: ${addCheck.details}`);

          const commitMsg = `feat(agent): Step ${
            stepIndex + 1
          } - ${taskDescription.substring(0, 50)} [${iteration} iteration${
            iteration > 1 ? "s" : ""
          }]`;
          const commitResult = await SandboxService.gitCommit(
            projectId,
            userId,
            commitMsg
          );

          if (
            !commitResult.success &&
            !commitResult.message.includes("nothing to commit")
          ) {
            throw new Error(`Git commit failed: ${commitResult.details}`);
          }

          if (commitResult.committed) {
            log.info(`Changes committed, pushing branch ${branchName}...`);
            const pushResult = await SandboxService.gitPushToBranch(
              projectId,
              userId,
              githubRepoUrl,
              githubToken,
              branchName
            );
            if (!pushResult.success) {
              log.error(`Git push failed: ${pushResult.message}`);
              throw new Error(`Git push failed: ${pushResult.message}`);
            } else {
              log.info("Git push successful.");
            }
          } else {
            log.info("No changes to commit or push for this step.");
          }
        });
      } else {
        log.info(
          "Skipping Git/PR operations: Repo URL or GitHub Token not provided."
        );
      }

      // --- Create GitHub Pull Request ---
      if (
        githubRepoUrl &&
        githubToken &&
        stepResult.summary?.includes("push failed") === false
      ) {
        const prUrl = await step.run(`create-pr-${stepIndex}`, async () => {
          log.info(`Creating GitHub Pull Request for branch ${branchName}...`);
          try {
            const octokit = new Octokit({ auth: githubToken });
            const project = await prisma.landingPage.findUnique({
              where: { id: projectId },
              select: { githubRepoName: true },
            });
            const repoNameFull = project?.githubRepoName;
            if (!repoNameFull)
              throw new Error("githubRepoName is missing from project data.");
            const [owner, repo] = repoNameFull.split("/");
            if (!owner || !repo)
              throw new Error(`Invalid githubRepoName format: ${repoNameFull}`);

            const prTitle = `Agent: Step ${stepIndex + 1} - ${taskDescription}`;
            const prBody = `This PR was automatically generated by the NeuraLaunch AI agent.
**Task:**
${taskDescription}
**Summary:**
${finalIterationSummary}
**Autonomous Execution:**
✅ Completed after ${iteration} self-correction iteration${
              iteration > 1 ? "s" : ""
            }
${
  iteration > 1
    ? `\n🔄 Agent debugged and fixed issues ${iteration - 1} time${
        iteration > 2 ? "s" : ""
      }`
    : ""
}
A Vercel preview deployment should be available here shortly.`;

            const { data: existingPRs } = await octokit.rest.pulls.list({
              owner,
              repo,
              head: `${owner}:${branchName}`,
              state: "open",
            });

            if (existingPRs.length > 0) {
              log.warn(
                `PR for branch ${branchName} already exists. Updating...`
              );
              await octokit.rest.pulls.update({
                owner,
                repo,
                pull_number: existingPRs[0].number,
                body: prBody,
              });
              return existingPRs[0].html_url;
            }

            const { data: newPR } = await octokit.rest.pulls.create({
              owner,
              repo,
              title: prTitle,
              body: prBody,
              head: branchName,
              base: "main",
            });
            log.info(`Pull Request created: ${newPR.html_url}`);
            return newPR.html_url;
          } catch (prError) {
            log.error(
              "Failed to create GitHub Pull Request:",
              prError instanceof Error ? prError : undefined
            );
            stepResult.summary += " (Warning: Failed to create Pull Request)";
            return null;
          }
        });

        stepResult.prUrl = prUrl;
        if (prUrl) {
          stepResult.summary = `${finalIterationSummary} View [Pull Request & Preview](${prUrl})`;
        } else {
          stepResult.summary = finalIterationSummary;
        }
      } else {
        stepResult.summary = finalIterationSummary;
      }

      // --- Mark Step as Success ---
      stepResult.status = "success";
      stepResult.endTime = new Date().toISOString();
      if (stepResult.metadata) {
        stepResult.metadata.totalIterations = iteration;
        stepResult.metadata.selfCorrections = iteration - 1;
      }
      log.info(
        `Step ${stepIndex} completed successfully after ${iteration} iteration(s).`
      );

      const finalDbUpdateResult = await step.run(
        "update-db-success",
        async () => {
          const finalProjectState = await prisma.landingPage.findUnique({
            where: { id: projectId, userId: userId },
            select: { agentPlan: true },
          });

          // ✅ FIX 5: Use correct ActionableTask type
          const plan = finalProjectState?.agentPlan as ActionableTask[] | null;
          const totalSteps = plan?.length ?? stepIndex + 1;
          const isComplete = stepIndex + 1 >= totalSteps;
          const finalAgentStatus = isComplete
            ? "COMPLETE"
            : "PAUSED_FOR_PREVIEW";

          return await prisma.landingPage.update({
            where: { id: projectId },
            data: {
              agentStatus: finalAgentStatus,
              agentCurrentStep: stepIndex + 1,
              agentExecutionHistory: [
                ...currentHistory,
                stepResult as StepResultWithMetadata, // Use the typed variable
              ] as unknown as Prisma.InputJsonValue,
              sandboxLastAccessedAt: new Date(),
            },
            select: { agentStatus: true },
          });
        }
      );
      log.info(
        `Database updated. Final status: ${finalDbUpdateResult.agentStatus}`
      );

      return {
        event,
        body: {
          message: `Step ${stepIndex + 1} completed`,
          status: finalDbUpdateResult.agentStatus,
          prUrl: stepResult.prUrl,
        },
      };
    } catch (error) {
      // --- Error Handling ---
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown execution error occurred";
      log.error(
        `Error during step ${stepIndex} execution: ${errorMessage}`,
        error instanceof Error ? error : undefined
      );

      stepResult.status = "error";
      stepResult.endTime = new Date().toISOString();
      stepResult.errorMessage = errorMessage.substring(0, 1000);
      stepResult.errorDetails =
        error instanceof Error ? error.stack?.substring(0, 2000) : undefined;

      try {
        await step.run("update-db-error", async () => {
          const errorProjectState = await prisma.landingPage.findUnique({
            where: { id: projectId },
            select: { agentExecutionHistory: true },
          });
          const errorHistory =
            (errorProjectState?.agentExecutionHistory as
              | StepResultWithMetadata[]
              | null) || [];

          return await prisma.landingPage.update({
            where: { id: projectId },
            data: {
              agentStatus: "ERROR",
              agentExecutionHistory: [
                ...errorHistory,
                stepResult as StepResultWithMetadata,
              ] as unknown as Prisma.InputJsonValue,
            },
          });
        });
        log.info("Database updated with ERROR status for project " + projectId);
      } catch (dbError) {
        log.error(
          "CRITICAL: Failed to update database status to ERROR after execution failure:",
          dbError instanceof Error ? dbError : undefined
        );
      }
      throw error;
    }
  }
);
