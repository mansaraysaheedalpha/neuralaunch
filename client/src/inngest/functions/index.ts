// src/inngest/functions/index.ts

export {
  orchestratorRunFunction,
  orchestratorResumeFunction,
  orchestratorVisionFunction,
  orchestratorBlueprintFunction,
} from "./orchestrator-functions";

// ✅ Unified Execution Agent (consolidates frontend/backend/infrastructure)
export { unifiedExecutionAgentFunction } from "./unified-execution-agent-function";

// Database agent remains separate (external API provisioning)
export { databaseAgentFunction } from "./database-agent-function";

// Quality agents
export { testingAgentFunction } from "./testing-agent-function";
export { criticAgentFunction } from "./critic-agent-function";
export { integrationAgentFunction } from "./integration-agent-function";
export { fixCriticalIssuesFunction } from "./fix-critical-issues-function";

// ✅ Wave-based execution:
export { waveStartFunction } from "./wave-start-function";
export { waveCompleteFunction } from "./wave-complete-function";

// ✅ One-time setup agents:
export { documentationAgentFunction } from "./documentation-agent-function";
export { optimizationAgentFunction } from "./optimization-agent-function";
export { deployAgentFunction } from "./deploy-agent-function";

// NOTE: Database branch cleanup functions are disabled until schema supports metadata field
// TODO: Add 'metadata Json?' field to ExecutionWave model and re-enable
// export {
//   databaseBranchCleanupFunction,
//   scheduledBranchCleanupFunction,
// } from "./database-branch-cleanup-function";