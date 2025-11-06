// src/types/agent.ts

export interface Question {
  id: string;
  text: string;
  options?: string[] | null;
  allowAgentDecision?: boolean | null;
  defaultChoice?: string | null;
  priority?: "required" | "optional" | null;
}

export interface StepResult {
  startTime: string;
  endTime?: string;
  taskIndex: number;
  taskDescription: string;
  status: "success" | "error";
  filesWritten: Array<{
    path: string;
    success: boolean;
    message?: string;
  }>;
  commandsRun: Array<{
    command: string;
    attempt: number;
    exitCode: number;
    stdout: string;
    stderr: string;
    correctedCommand?: string;
  }>;
  summary: string;
  errorMessage?: string;
  errorDetails?: string;
  prUrl?: string | null;
  metadata?: {
    totalIterations: number;
    selfCorrections: number;
    autonomousMode: boolean;
  };
}

export interface PlanStep {
  task: string;
}

export interface AccountInfo {
  provider: string;
  providerAccountId: string;
}

// 🆕 NEW: Architect Preferences
export interface ArchitectPreferences {
  mode: "default" | "custom";
  framework?: string | null;
  uiLibrary?: string | null;
  authentication?: string | null;
  database?: string | null;
  deployment?: string | null;
  additionalContext?: string | null;
}

export interface ProjectAgentData {
  id: string;
  title: string;

  // 🆕 NEW: Platform Selection
  projectPlatform: string | null;
  projectPrimaryLanguage: string | null;

  // 🆕 NEW: Architect Preferences
  agentArchitectPreferences: ArchitectPreferences | null;
  agentArchitecturePlan: unknown | null; // Complex nested structure

  // Existing fields
  agentPlan: PlanStep[] | null;
  agentClarificationQuestions: Question[] | null;
  agentUserResponses: Record<string, string> | null;
  agentCurrentStep: number | null;
  agentStatus: string | null;
  agentExecutionHistory: StepResult[] | null;
  agentRequiredEnvKeys: string[] | null;
  githubRepoUrl: string | null;
  githubRepoName: string | null;
  vercelProjectId: string | null;
  vercelProjectUrl: string | null;
  vercelDeploymentUrl: string | null;
  accounts: AccountInfo[];
}
