// src/lib/types/agent.ts

/**
 * Represents the result of a single step in the agent's execution plan.
 * This is stored in the `agentExecutionHistory` of the project.
 */
export interface StepResult {
  startTime: string;
  endTime: string;
  taskIndex: number;
  taskDescription: string;
  status: "success" | "error";
  summary: string;
  filesWritten?: { path: string; success: boolean; message?: string }[];
  commandsRun?: {
    command: string;
    attempt: number;
    exitCode: number;
    stdout?: string;
    stderr?: string;
    correctedCommand?: string;
  }[];
  errorMessage?: string;
  errorDetails?: string; // e.g., stack trace
}

/**
 * Represents a single step in the agent's generated plan.
 * Stored in the `agentPlan` of the project.
 */
export interface PlanStep {
  task: string;
  // Potentially add other fields like 'tool', 'estimated_time', etc.
}

/**
 * Represents a clarification question the agent asks the user.
 * Stored in the `agentClarificationQuestions` of the project.
 */
export interface ClarificationQuestion {
  id: string; // Unique ID for the question
  text: string;
}

/**
 * Represents the full agent state for a project, as fetched by the frontend.
 */
export interface ProjectAgentData {
  id: string;
  title: string;
  agentPlan: PlanStep[] | null;
  agentClarificationQuestions: ClarificationQuestion[] | null;
  agentUserResponses: Record<string, string> | null;
  agentCurrentStep: number | null;
  agentStatus: AgentStatus | null;
  agentExecutionHistory: StepResult[] | null;
  githubRepoUrl: string | null;
  githubRepoName: string | null;
  vercelProjectId: string | null;
  vercelProjectUrl: string | null;
  vercelDeploymentUrl: string | null;
  // Include connected accounts for UI checks
  accounts: {
    provider: string;
    providerAccountId: string;
  }[];
}

/**
 * Defines the possible statuses of the AI agent during its lifecycle.
 */
export type AgentStatus =
  | "PLANNING" // The agent is generating the initial plan.
  | "PENDING_USER_INPUT" // The agent is waiting for user answers to clarification questions.
  | "READY_TO_EXECUTE" // The agent is ready to start or resume execution.
  | "EXECUTING" // The agent is actively running a step.
  | "PAUSED_AFTER_STEP" // The agent has successfully completed a step and is waiting to continue.
  | "COMPLETE" // The agent has finished all steps.
  | "ERROR"; // An error occurred during execution.
