// src/inngest/client.ts

import { Inngest, EventSchemas } from "inngest";
import type { PlanStep } from "@/types/agent"; // Import PlanStep if needed for event data typing

// Define the events and their expected data payloads
export type AgentEvents = {
  // Event sent FROM the API route TO Inngest to trigger execution
  "agent/execute.step.requested": {
    data: {
      projectId: string;
      userId: string;
      stepIndex: number;
      taskDescription: string;
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

  // Example: You could add more events later
  // "agent/deployment.requested": { data: { projectId: string; userId: string; vercelToken: string } }
  // "agent/sandbox.cleanup.needed": { data: { projectId: string } }
};

// Create the Inngest client
// It automatically reads INNGEST_EVENT_KEY from process.env
// Ensure INNGEST_SIGNING_KEY is also set in production environments for security
export const inngest = new Inngest({
  id: "neuralaunch-agent", // Unique ID for your app in Inngest
  schemas: new EventSchemas().fromRecord<AgentEvents>(), // Optional: for stronger type safety
});
