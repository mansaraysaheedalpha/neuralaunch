

// src/inngest/functions/index.ts
export {
  orchestratorRunFunction,
  orchestratorResumeFunction,
  orchestratorVisionFunction,
  orchestratorBlueprintFunction,
} from "./orchestrator-functions";
export { backendAgentFunction } from "./backend-agent-function";
export { frontendAgentFunction } from "./frontend-agent-function";
export { testingAgentFunction } from "./testing-agent-function";
export { criticAgentFunction } from "./critic-agent-function";
// ✅ Wave-based execution:
export { waveStartFunction } from "./wave-start-function";
export { waveCompleteFunction } from "./wave-complete-function";
export { integrationAgentFunction } from "./integration-agent-function";
export { infrastructureExecutionAgentFunction } from "./infrastructure-execution-agent-function";
// ✅ One-time setup agents:
export { documentationAgentFunction } from "./documentation-agent-function"
export { infrastructureAgentFunction } from "./infrastructure-agent-function";
export { optimizationAgentFunction } from "./optimization-agent-function";
export { deployAgentFunction } from "./deploy-agent-function";
export { fixCriticalIssuesFunction } from "./fix-critical-issues-function"