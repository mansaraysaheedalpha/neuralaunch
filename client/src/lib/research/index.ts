// src/lib/research/index.ts
//
// Public API for the shared research tool. Nothing outside this
// directory should import from internal files directly — the barrel
// is the contract surface, the same convention as lib/discovery/
// and lib/continuation/.

export type {
  ResearchAgent,
  ResearchSource,
  ResearchLogEntry,
  ResearchLog,
  ResearchFindings,
  DetectedQuery,
} from './types';
export {
  RESEARCH_AGENTS,
  ResearchSourceSchema,
  ResearchLogEntrySchema,
  ResearchLogArraySchema,
} from './types';

export {
  RESEARCH_BUDGETS,
  TAVILY_MAX_QUERY_CHARS,
  MAX_FINDINGS_CHARS,
} from './constants';

export {
  trunc,
  q,
  yearHint,
  extractCapitalisedNames,
} from './query-shaping';

export type { TavilyHit, TavilySearchResult } from './tavily-client';
export { isResearchConfigured, searchOnce } from './tavily-client';

export {
  dedupHits,
  joinAndCapFindings,
  renderQueryBlock,
  toResearchSource,
} from './prompt-rendering';

export type { RunResearchInput } from './research-tool';
export { runResearchQueries } from './research-tool';

export type {
  DetectTriggersInput,
  TriggerDetectionResult,
  TriggerExtraction,
} from './trigger-detector';
export { detectResearchTriggers, preFilterTriggers } from './trigger-detector';

export {
  MAX_RESEARCH_LOG_ENTRIES,
  safeParseResearchLog,
  appendResearchLog,
} from './log-helpers';
