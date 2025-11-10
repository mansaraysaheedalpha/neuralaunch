import { SandboxService } from "@/lib/services/sandbox-service";
import { z } from "zod";

import { logger } from "@/lib/logger";

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


