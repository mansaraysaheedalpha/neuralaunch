// Shared type definitions for the AI Agent Builder feature

export interface PlanStep {
  task: string;
}

export interface Question {
  id: string;
  text: string;
}

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
  errorDetails?: string;
}

export interface AccountInfo {
  provider: string;
  providerAccountId: string;
}

export interface ProjectAgentData {
  id: string;
  title: string;
  agentPlan: PlanStep[] | null;
  agentClarificationQuestions: Question[] | null;
  agentUserResponses: Record<string, string> | null;
  agentCurrentStep: number | null;
  agentStatus: string | null;
  agentExecutionHistory: StepResult[] | null;
  githubRepoUrl: string | null;
  githubRepoName: string | null;
  vercelProjectId: string | null;
  vercelProjectUrl: string | null;
  vercelDeploymentUrl: string | null;
  accounts: AccountInfo[];
}
