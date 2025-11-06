import { z } from "zod";

// ============================================
// CORRECTED VERSION
// ============================================

// 1. Define the DETAILED, ACTIONABLE plan step schema first.
// This is the schema the AI is generating in `configure/route.ts`.
export const actionableTaskSchema = z.object({
  task: z.string().describe("A precise, actionable task description."),
  files: z
    .array(z.string())
    .describe("An array of exact file paths this task will modify or create."),
  pattern: z
    .string()
    .describe("Specific pattern, library, or function to use."),
  rationale: z.string().describe("A one-sentence reason for this approach."),
  dependencies: z
    .array(z.number())
    .describe("List of 0-based indices of tasks that must be completed first."),
  verification: z.object({
    commands: z.array(z.string()),
    successCriteria: z.string(),
  }),
  uiDetails: z
    .string()
    .nullable()
    .describe("Specific UI/UX requirements, or null if not user-facing."),
  security: z.array(z.string()),
  estimatedComplexity: z.enum(["low", "medium", "high"]),
});

// 2. Define other simple/atomic schemas
export const questionSchema = z.object({
  id: z.string(),
  text: z.string(),
  options: z.array(z.string()).optional().nullable(),
  allowAgentDecision: z.boolean().optional().nullable(),
  defaultChoice: z.string().optional().nullable(),
  priority: z.enum(["required", "optional"]).optional().nullable(),
});

export const accountInfoSchema = z.object({
  provider: z.string(),
  providerAccountId: z.string(),
});

// 3. Define file write result schema
export const fileWriteResultSchema = z.object({
  path: z.string(),
  success: z.boolean(),
  message: z.string().optional(),
});

// 4. Define command run result schema
export const commandRunResultSchema = z.object({
  command: z.string(),
  attempt: z.number(),
  exitCode: z.number(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  correctedCommand: z.string().optional(),
});

// 5. Define step result schema (for execution history)
export const stepResultSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  taskIndex: z.number(),
  taskDescription: z.string(),
  status: z.enum(["success", "error"]),
  summary: z.string(),
  filesWritten: z.array(fileWriteResultSchema).optional().nullable(),
  commandsRun: z.array(commandRunResultSchema).optional().nullable(),
  errorMessage: z.string().optional().nullable(),
  errorDetails: z.string().optional().nullable(),
  prUrl: z.string().optional().nullable(),
});

// 6. Architect Preferences Schema
export const architectPreferencesSchema = z.object({
  mode: z.enum(["default", "custom"]),
  framework: z.string().optional().nullable(),
  uiLibrary: z.string().optional().nullable(),
  authentication: z.string().optional().nullable(),
  database: z.string().optional().nullable(),
  deployment: z.string().optional().nullable(),
  additionalContext: z.string().optional().nullable(),
});

// 7. Finally, define the main project schema
export const projectAgentDataSchema = z.object({
  id: z.string(),
  title: z.string(),

  // Platform and Language
  projectPlatform: z.string().nullable().default(null),
  projectPrimaryLanguage: z.string().nullable().default(null),

  // Architect Preferences
  agentArchitectPreferences: architectPreferencesSchema
    .nullable()
    .default(null),
  agentArchitecturePlan: z.any().nullable().default(null), // Full architectural plan (raw AI output)

  // ------------------------------------------------------------------
  // ✅ THE FIX IS HERE:
  // `agentPlan` now uses the detailed `actionableTaskSchema`.
  // ------------------------------------------------------------------
  agentPlan: z.array(actionableTaskSchema).nullable().default(null),

  agentClarificationQuestions: z.array(questionSchema).nullable().default(null),
  agentUserResponses: z.record(z.string(), z.string()).nullable().default(null),
  agentCurrentStep: z.number().nullable().default(null),
  agentStatus: z.string().nullable().default(null),
  agentExecutionHistory: z.array(stepResultSchema).nullable().default(null),
  agentRequiredEnvKeys: z.array(z.string()).nullable().default(null),

  // GitHub & Vercel
  githubRepoUrl: z.string().nullable().default(null),
  githubRepoName: z.string().nullable().default(null),
  vercelProjectId: z.string().nullable().default(null),
  vercelProjectUrl: z.string().nullable().default(null),
  vercelDeploymentUrl: z.string().nullable().default(null),

  // Connected Accounts
  accounts: z.array(accountInfoSchema).default([]),
});

// Export the inferred type
export type ValidatedProjectAgentData = z.infer<typeof projectAgentDataSchema>;

// Export individual types for convenience
export type ActionableTask = z.infer<typeof actionableTaskSchema>; // 👈 Renamed for clarity
export type Question = z.infer<typeof questionSchema>;
export type StepResult = z.infer<typeof stepResultSchema>;
export type AccountInfo = z.infer<typeof accountInfoSchema>;
export type ArchitectPreferences = z.infer<typeof architectPreferencesSchema>;
