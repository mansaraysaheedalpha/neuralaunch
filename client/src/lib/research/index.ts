// src/lib/research/index.ts
//
// Public API for the shared research tool. Nothing outside this
// directory should import from internal files directly — the barrel
// is the contract surface, the same convention as lib/discovery/
// and lib/continuation/.

export type {
  ResearchAgent,
  ResearchTool,
  ResearchSource,
  ResearchLogEntry,
  ResearchLog,
} from './types';
export {
  RESEARCH_AGENTS,
  RESEARCH_TOOLS,
  ResearchSourceSchema,
  ResearchLogEntrySchema,
  ResearchLogArraySchema,
} from './types';

export { RESEARCH_BUDGETS } from './constants';

export { isResearchConfigured } from './tavily-client';
export { isExaConfigured }      from './exa-client';

export type { BuildResearchToolsInput, ResearchTools } from './tools';
export {
  buildResearchTools,
  getResearchToolGuidance,
  RESEARCH_TOOL_USAGE_GUIDANCE,
} from './tools';

export type {
  RunInterviewPreResearchInput,
  InterviewPreResearchResult,
} from './interview-pre-research';
export { runInterviewPreResearch } from './interview-pre-research';

export {
  MAX_RESEARCH_LOG_ENTRIES,
  safeParseResearchLog,
  appendResearchLog,
} from './log-helpers';
