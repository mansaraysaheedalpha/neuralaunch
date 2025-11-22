// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  orchestratorRunFunction,
  orchestratorResumeFunction,
  orchestratorVisionFunction,
  orchestratorBlueprintFunction,
} from "@/inngest/functions/orchestrator-functions";
// ✅ Unified Execution Agent (consolidates frontend/backend/infrastructure)
import { unifiedExecutionAgentFunction } from "@/inngest/functions/unified-execution-agent-function";
// Database agent remains separate (external API provisioning)
import { databaseAgentFunction } from "@/inngest/functions/database-agent-function";
// Quality agents
import { testingAgentFunction } from "@/inngest/functions/testing-agent-function";
import { criticAgentFunction } from "@/inngest/functions/critic-agent-function";
import { integrationAgentFunction } from "@/inngest/functions/integration-agent-function";
import { fixCriticalIssuesFunction } from "@/inngest/functions/fix-critical-issues-function";
// Wave management
import { waveStartFunction } from "@/inngest/functions/wave-start-function";
import { waveCompleteFunction } from "@/inngest/functions/wave-complete-function";
// Other agents
import { documentationAgentFunction } from "@/inngest/functions/documentation-agent-function";
import { deployAgentFunction } from "@/inngest/functions/deploy-agent-function";
import {
  monitoringAgentFunction,
  continuousMonitoringFunction,
} from "@/inngest/functions/monitoring-agent-function";
import { optimizationAgentFunction } from "@/inngest/functions/optimization-agent-function";
import { cleanupStuckTasks } from "@/inngest/functions/cleanup-stuck-tasks";
import { env } from "@/lib/env";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // ✅ Orchestrator functions
    orchestratorRunFunction,
    orchestratorResumeFunction,
    orchestratorVisionFunction,
    orchestratorBlueprintFunction,

    // ✅ Unified Execution Agent (frontend/backend/infrastructure)
    unifiedExecutionAgentFunction,

    // Database agent (separate - external API provisioning)
    databaseAgentFunction,

    // Quality agents
    testingAgentFunction,
    criticAgentFunction,
    integrationAgentFunction,
    fixCriticalIssuesFunction,

    // Wave management
    waveStartFunction,
    waveCompleteFunction,

    // Deployment & Documentation
    documentationAgentFunction,
    deployAgentFunction,

    // Monitoring & Optimization
    monitoringAgentFunction,
    continuousMonitoringFunction,
    optimizationAgentFunction,
    cleanupStuckTasks,
  ],
  signingKey:
    env.NODE_ENV !== "development" ? env.INNGEST_SIGNING_KEY : undefined,
});

