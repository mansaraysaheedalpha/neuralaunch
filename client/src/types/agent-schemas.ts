// src/lib/types/agent-schemas.ts
import { z } from "zod";

// Define base schemas first
export const stepResultSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  taskIndex: z.number(),
  taskDescription: z.string(),
  status: z.enum(["success", "error"]),
  summary: z.string(),
  filesWritten: z
    .array(
      z.object({
        path: z.string(),
        success: z.boolean(),
        message: z.string().optional(),
      })
    )
    .optional()
    .nullable(),
  commandsRun: z
    .array(
      z.object({
        command: z.string(),
        attempt: z.number(),
        exitCode: z.number(),
        stdout: z.string().optional(),
        stderr: z.string().optional(),
        correctedCommand: z.string().optional(),
      })
    )
    .optional()
    .nullable(),
  errorMessage: z.string().optional().nullable(),
  errorDetails: z.string().optional().nullable(),
  prUrl: z.string().nullable().optional(),
});

export const questionSchema = z.object({
  id: z.string(),
  text: z.string(),
  options: z.array(z.string()).nullable().optional(),
  allowAgentDecision: z.boolean().nullable().optional(),
});

// Define the main schema that uses the others
export const projectAgentDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  agentPlan: z
    .array(z.object({ task: z.string() }))
    .nullable()
    .default([]),
  agentClarificationQuestions: z.array(questionSchema).nullable().default([]),
  agentUserResponses: z.record(z.string(), z.string()).nullable(),
  agentCurrentStep: z.number().nullable(),
  agentStatus: z.string().nullable(),
  agentExecutionHistory: z.array(stepResultSchema).nullable().default([]),
  agentRequiredEnvKeys: z.array(z.string()).nullable().default([]),
  githubRepoUrl: z.string().nullable(),
  githubRepoName: z.string().nullable(),
  vercelProjectId: z.string().nullable(),
  vercelProjectUrl: z.string().nullable(),
  vercelDeploymentUrl: z.string().nullable(),
  accounts: z
    .array(
      z.object({
        provider: z.string(),
        providerAccountId: z.string(),
      })
    )
    .default([]),
});

// Export the inferred type
export type ValidatedProjectAgentData = z.infer<typeof projectAgentDataSchema>;
