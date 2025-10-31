// src/app/api/inngest/route.ts

import { serve } from "inngest/next";
import { inngest } from "@/inngest/client"; // Ensure AgentEvents is exported if using schemas
import { executeAgentStep } from "@/inngest/functions";

// Serve the Inngest client and register background functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    executeAgentStep,
    // Add other functions here later if needed
  ],
  // In production, ensure INNGEST_SIGNING_KEY is set for security
  signingKey:
    process.env.NODE_ENV !== "development"
      ? process.env.INNGEST_SIGNING_KEY
      : undefined,
});
