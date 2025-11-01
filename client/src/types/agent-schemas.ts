// src/lib/types/agent-schemas.ts
import { z } from "zod";

// ============================================
// FIXED VERSION - Proper schema order matters!
// ============================================

// 1. Define simple/atomic schemas first (no dependencies)
export const planStepSchema = z.object({
  task: z.string(),
});

export const questionSchema = z.object({
  id: z.string(),
  text: z.string(),
  options: z.array(z.string()).optional().nullable(),
  allowAgentDecision: z.boolean().optional().nullable(),
});

export const accountInfoSchema = z.object({
  provider: z.string(),
  providerAccountId: z.string(),
});

// 2. Define file write result schema
export const fileWriteResultSchema = z.object({
  path: z.string(),
  success: z.boolean(),
  message: z.string().optional(),
});

// 3. Define command run result schema
export const commandRunResultSchema = z.object({
  command: z.string(),
  attempt: z.number(),
  exitCode: z.number(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  correctedCommand: z.string().optional(),
});

// 4. Now define step result schema using the above schemas
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

// 5. Finally, define the main project schema
export const projectAgentDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  agentPlan: z.array(planStepSchema).nullable().default(null),
  agentClarificationQuestions: z.array(questionSchema).nullable().default(null),
  agentUserResponses: z.record(z.string(), z.string()).nullable().default(null),
  agentCurrentStep: z.number().nullable().default(null),
  agentStatus: z.string().nullable().default(null),
  agentExecutionHistory: z.array(stepResultSchema).nullable().default(null),
  agentRequiredEnvKeys: z.array(z.string()).nullable().default(null),
  githubRepoUrl: z.string().nullable().default(null),
  githubRepoName: z.string().nullable().default(null),
  vercelProjectId: z.string().nullable().default(null),
  vercelProjectUrl: z.string().nullable().default(null),
  vercelDeploymentUrl: z.string().nullable().default(null),
  accounts: z.array(accountInfoSchema).default([]),
});

// Export the inferred type
export type ValidatedProjectAgentData = z.infer<typeof projectAgentDataSchema>;

// Export individual types for convenience
export type PlanStep = z.infer<typeof planStepSchema>;
export type Question = z.infer<typeof questionSchema>;
export type StepResult = z.infer<typeof stepResultSchema>;
export type AccountInfo = z.infer<typeof accountInfoSchema>;
