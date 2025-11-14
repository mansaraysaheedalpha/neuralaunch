// src/types/component-props.ts
/**
 * Common type definitions for component props
 */

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETE" | "completed" | "ERROR" | "error" | "FAILED" | "failed" | "in_progress";
  agentName?: string;
  output?: TaskOutput;
  input?: {
    title?: string;
    description?: string;
    [key: string]: unknown;
  };
  phase?: string;
  complexity?: string;
  startedAt?: Date | string;
  completedAt?: Date | string;
  createdAt?: Date | string;
  error?: string;
  [key: string]: unknown;
}

export interface TaskOutput {
  files?: string[];
  filesCreated?: FileWrite[];
  filesModified?: string[];
  testsRun?: number;
  commands?: CommandRun[];
  explanation?: string;
  error?: string;
  [key: string]: unknown;
}

export interface FileWrite {
  path: string;
  success: boolean;
  message?: string;
}

export interface CommandRun {
  command: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  attempt?: number;
}

export interface CriticalFailure {
  id: string;
  projectId: string;
  agentName: string;
  attemptNumber: number;
  issuesFound: Issue[];
  issuesRemaining: Issue[];
  resolution: string | null;
  resolvedAt: Date | string | null;
  attemptHistory: FixAttempt[];
  status: string;
  severity?: string;
  totalAttempts?: number;
  createdAt: Date | string;
  context?: FailureContext;
}

export interface Issue {
  type: string;
  severity: string;
  description: string;
  file?: string;
  line?: number;
  [key: string]: unknown;
}

export interface FixAttempt {
  attemptNumber: number;
  timestamp: Date | string;
  issuesAddressed: number;
  issuesRemaining: number;
  success: boolean;
  [key: string]: unknown;
}

export interface FailureContext {
  taskId?: string;
  wave?: number;
  [key: string]: unknown;
}

export interface Wave {
  number: number;
  status: string;
  tasks?: Task[];
  startedAt?: Date | string;
  completedAt?: Date | string;
  [key: string]: unknown;
}

export interface AgentStats {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  failed: number;
  [key: string]: unknown;
}
