// src/inngest/client.ts

import { Inngest, EventSchemas } from "inngest";

// Define the events and their expected data payloads
export type AgentEvents = {
  // Event sent FROM the API route TO Inngest to trigger execution
  "agent/execute.step.requested": {
    data: {
      projectId: string;
      userId: string;
      stepIndex: number;
      taskDescription: string;
      taskId?: string;
      // Pass context needed by the execution function
      blueprintSummary: string; // Keep it concise
      userResponses: Record<string, string> | null;
      // Pass sensitive tokens directly in the event data
      // Inngest encrypts event data at rest and in transit
      githubToken: string | null; // Null if not connected or not needed
      githubRepoUrl: string | null; // Null if no repo linked
      // Include current history length for context prompt generation (optional)
      currentHistoryLength: number;
      // Include full plan if needed (or fetch in function) - consider payload size
      // agentPlan?: PlanStep[] | null;
    };
    // Optional: Add user context for Inngest dashboard visibility
    user?: {
      id: string;
    };
  };

  "agent/orchestrator.run": {
    data: {
      projectId: string;
      userId: string;
      conversationId: string;
      blueprint: string;
    };
    user?: {
      id: string;
    };
  };
  "agent/orchestrator.resume": {
    data: {
      projectId: string;
      userId: string;
      conversationId: string;
    };
    user?: {
      id: string;
    };
  };
  
  // Vision-based orchestration (from Agentic Interface)
  "agent/orchestrator.vision": {
    data: {
      projectId: string;
      userId: string;
      sourceType: "vision";
      visionText: string;
      projectName: string;
      techPreferences?: {
        frontend?: string;
        backend?: string;
        database?: string;
        deployment?: string;
      };
    };
    user?: {
      id: string;
    };
  };
  
  // Blueprint-based orchestration (from SprintDashboard)
  "agent/orchestrator.blueprint": {
    data: {
      projectId: string;
      userId: string;
      conversationId: string;
      sourceType: "blueprint";
      blueprint: string;
      sprintData?: {
        completedTasks?: Array<{ title?: string; id: string; status: string }>;
        analytics?: { completionRate?: number };
        validationResults?: { features?: string[] };
      };
    };
    user?: {
      id: string;
    };
  };

   // ==========================================
  // EXECUTION AGENT EVENTS
  // ==========================================
  
  "agent/execution.backend": {
    data: {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId: string;
      taskInput: unknown;
      priority: number;
      waveNumber?: number;
    };
    user?: {
      id: string;
    };
  };

  "agent/execution.frontend": {
    data: {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId: string;
      taskInput: unknown;
      priority: number;
      waveNumber?: number;
    };
    user?: {
      id: string;
    };
  };

  "agent/execution.infrastructure": {
    data: {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId: string;
      taskInput: unknown;
      priority: number;
      waveNumber?: number;
    };
    user?: {
      id: string;
    };
  };

  "agent/execution.database": {
    data: {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId: string;
      taskInput: unknown;
      priority: number;
    };
    user?: {
      id: string;
    };
  };

  // ==========================================
  // QUALITY AGENT EVENTS
  // ==========================================

  "agent/quality.start": {
    data: {
      projectId: string;
    };
  };

  "agent/quality.integration": {
    data: {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId: string;
      taskInput: unknown;
      priority: number;
    };
  };

  "agent/quality.testing": {
    data: {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId: string;
      taskInput: unknown;
      priority?: number;
    };
  };

  "agent/quality.critic": {
    data: {
      projectId: string;
      userId: string;
      conversationId: string;
      taskId?: string;
      taskInput?: unknown;
    };
  };

  // ==========================================
  // DEPLOYMENT AGENT EVENTS
  // ==========================================

  "agent/deployment.start": {
    data: {
      projectId: string;
      userId: string;
      conversationId: string;
      environment: 'staging' | 'production';
    };
  };

  "agent/documentation.generate": {
    data: {
      projectId: string;
      userId: string;
      conversationId: string;
      taskId?: string;
      taskInput?: unknown;
    };
  };

  // ==========================================
  // WAVE MANAGEMENT EVENTS
  // ==========================================

  "agent/wave.start": {
    data: {
      projectId: string;
      userId: string;
      conversationId: string;
      waveNumber: number;
    };
    user?: {
      id: string;
    };
  };

  "agent/wave.complete": {
    data: {
      projectId: string;
      userId: string;
      conversationId: string;
      waveNumber: number;
    };
    user?: {
      id: string;
    };
  };

  // ==========================================
  // COMPLETION EVENTS
  // ==========================================

  // ✅ NEW: Task completion event for sequential execution
  "agent/task.complete": {
    data: {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId: string;
      waveNumber?: number;
      agentName: string;
      success: boolean;
      error?: string;
    };
  };

  "agent/execution.backend.complete": {
    data: {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId: string;
      success: boolean;
      output?: unknown;
      error?: string;
    };
  };

  "agent/execution.frontend.complete": {
    data: {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId: string;
      success: boolean;
      output?: unknown;
      error?: string;
    };
  };

  "agent/execution.infrastructure.complete": {
    data: {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId: string;
      success: boolean;
      output?: unknown;
      error?: string;
    };
  };

  "agent/execution.generic": {
    data: {
      taskId: string;
      projectId: string;
      userId: string;
      conversationId: string;
      taskInput: unknown;
      priority: number;
    };
  };

  "agent/execution.generic.complete": {
    data: {
      taskId: string;
      projectId: string;
      success: boolean;
      output?: unknown;
      error?: string;
    };
  };

  "agent/quality.testing.complete": {
    data: {
      taskId: string;
      projectId: string;
      success: boolean;
      testResults?: unknown;
      error?: string;
    };
  };

  "agent/quality.critic.complete": {
    data: {
      taskId: string;
      projectId: string;
      success: boolean;
      approved?: boolean;
      score?: number;
      issues?: unknown[];
      error?: string;
    };
  };

  "agent/quality.integration.complete": {
    data: {
      taskId: string;
      projectId: string;
      success: boolean;
      output?: unknown;
      error?: string;
    };
  };

  "agent/quality.fix-issues": {
    data: {
      projectId: string;
      userId: string;
      conversationId: string;
      waveNumber: number;
      issues: unknown[];
      attempt: number;
      criticResult?: unknown;
      maxRetries?: number;
    };
  };

  "agent/quality.fix-issues.complete": {
    data: {
      projectId: string;
      waveNumber: number;
      success: boolean;
      fixedIssues?: unknown[];
      remainingIssues?: unknown[];
      error?: string;
    };
  };

  "agent/deployment.deploy": {
    data: {
      projectId: string;
      userId: string;
      conversationId: string;
      environment: 'staging' | 'production' | 'preview';
      waveNumber?: number;
      taskId?: string;
      taskInput?: unknown;
    };
  };

  "agent/deployment.deploy.complete": {
    data: {
      projectId: string;
      success: boolean;
      deploymentUrl?: string;
      error?: string;
    };
  };

  "agent/documentation.generate.complete": {
    data: {
      projectId: string;
      success: boolean;
      output?: unknown;
      error?: string;
    };
  };

  "agent/infrastructure.setup": {
    data: {
      projectId: string;
      userId: string;
      conversationId: string;
      taskId?: string;
      taskInput?: unknown;
    };
  };

  "agent/infrastructure.setup.complete": {
    data: {
      projectId: string;
      success: boolean;
      output?: unknown;
      error?: string;
    };
  };

  "agent/monitoring.start": {
    data: {
      projectId: string;
      userId: string;
      conversationId: string;
      taskId?: string;
      taskInput?: unknown;
    };
  };

  "agent/monitoring.complete": {
    data: {
      projectId: string;
      success: boolean;
      metrics?: unknown;
      error?: string;
    };
  };

  "agent/optimization.start": {
    data: {
      projectId: string;
      userId: string;
      conversationId: string;
      taskId?: string;
      taskInput?: unknown;
    };
  };

  "agent/optimization.complete": {
    data: {
      projectId: string;
      success: boolean;
      optimizations?: unknown;
      error?: string;
    };
  };
};

// Create the Inngest client
// It automatically reads INNGEST_EVENT_KEY from process.env
// Ensure INNGEST_SIGNING_KEY is also set in production environments for security
export const inngest = new Inngest({
  id: "neuralaunch-agent", // Unique ID for your app in Inngest
  schemas: new EventSchemas().fromRecord<AgentEvents>(), // Optional: for stronger type safety
});
