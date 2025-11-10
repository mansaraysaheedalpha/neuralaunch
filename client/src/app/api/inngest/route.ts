// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  orchestratorRunFunction,
  orchestratorResumeFunction,
} from "@/inngest/functions/orchestrator-functions";
import { backendAgentFunction } from "@/inngest/functions/backend-agent-function";
import { frontendAgentFunction } from "@/inngest/functions/frontend-agent-function";
import { testingAgentFunction } from "@/inngest/functions/testing-agent-function";
import { criticAgentFunction } from "@/inngest/functions/critic-agent-function";
import { waveStartFunction } from "@/inngest/functions/wave-start-function";
import { waveCompleteFunction } from "@/inngest/functions/wave-complete-function";
import { integrationAgentFunction } from "@/inngest/functions/integration-agent-function";
// ✅ ADD THIS:
import { infrastructureAgentFunction } from "@/inngest/functions/infrastructure-agent-function";
import { documentationAgentFunction } from "@/inngest/functions/documentation-agent-function";
import { deployAgentFunction } from "@/inngest/functions/deploy-agent-function";
import {
  monitoringAgentFunction,
  continuousMonitoringFunction,
} from "@/inngest/functions/monitoring-agent-function";
import { optimizationAgentFunction } from "@/inngest/functions/optimization-agent-function";
import { fixCriticalIssuesFunction } from "@/inngest/functions/fix-critical-issues-function"; // ✅ NEW
import { env } from "@/lib/env";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    orchestratorRunFunction,
    orchestratorResumeFunction,
    backendAgentFunction,
    frontendAgentFunction,
    testingAgentFunction,
    criticAgentFunction,
    waveStartFunction,
    waveCompleteFunction,
    integrationAgentFunction,
    infrastructureAgentFunction, // ✅ ADD THIS
    documentationAgentFunction,
    deployAgentFunction,
    monitoringAgentFunction,
    continuousMonitoringFunction,
    optimizationAgentFunction,
    fixCriticalIssuesFunction,
  ],
  signingKey:
    process.env.NODE_ENV !== "development"
      ? env.INNGEST_SIGNING_KEY
      : undefined,
});
