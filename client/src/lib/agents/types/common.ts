// src/lib/agents/types/common.ts
/**
 * Common types used across agent system
 */

export interface TechStack {
  language?: string;
  frontend?: {
    framework?: string;
    uiLibrary?: string;
  };
  backend?: {
    framework?: string;
    runtime?: string;
  };
  database?: {
    type?: string;
    name?: string;
  };
  styling?: string;
  deployment?: string;
  authentication?: string;
  payments?: string;
  [key: string]: unknown;
}

export interface FileWrite {
  path: string;
  success: boolean;
  message?: string;
}

export interface CommandRun {
  command: string;
  attempt: number;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  correctedCommand?: string;
}

export interface SearchResult {
  title: string;
  description: string;
  url?: string;
}

export interface CodeError {
  file: string;
  line: number;
  message: string;
  severity?: string;
}

export interface ProjectContext {
  techStack?: TechStack;
  architecture?: unknown;
  _memoryContext?: string;
  _existingFiles?: Record<string, string>;
  _projectStructure?: unknown;
  _dependencies?: unknown;
  _configuration?: unknown;
  _errorSolution?: string;
  _typeErrors?: string;
  [key: string]: unknown;
}

export interface AgentOutputData {
  explanation?: string;
  deploymentUrl?: string;
  filesCreated?: Array<FileWrite | string>;
  commandsRun?: Array<CommandRun | string>;
  [key: string]: unknown;
}
