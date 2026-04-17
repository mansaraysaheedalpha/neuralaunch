// src/lib/roadmap/service-packager/context-helpers.ts
//
// Pure helpers that the task-level generate route uses to assemble
// the pre-populated ServiceContext before invoking the context-
// confirmation agent. Splitting these out keeps the route thin and
// keeps the digest logic unit-testable in isolation.

import { safeParseResearchSession } from '@/lib/roadmap/research-tool';
import type { ServiceContext } from './schemas';

/**
 * Digest a task's researchSession (passthrough JSONB) into a string
 * suitable for the ServiceContext.researchFindings field. Picks only
 * the finding types relevant to packaging (competitor, business,
 * datapoint) and renders them compactly.
 *
 * Returns null when no session exists or no relevant findings are
 * present — in that case the generation agent falls back to its own
 * research tools.
 */
export function digestResearchSessionForPackager(value: unknown): string | null {
  const session = safeParseResearchSession(value);
  if (!session?.report) return null;

  const competitor = session.report.findings.filter(f => f.type === 'competitor');
  const business   = session.report.findings.filter(f => f.type === 'business');
  const datapoint  = session.report.findings.filter(f => f.type === 'datapoint');

  if (competitor.length + business.length + datapoint.length === 0) return null;

  const lines: string[] = [];
  if (competitor.length > 0) {
    lines.push(`COMPETITORS (${competitor.length}):`);
    for (const c of competitor.slice(0, 6)) {
      lines.push(`- ${c.title}: ${c.description}${c.location ? ` [${c.location}]` : ''}`);
    }
  }
  if (business.length > 0) {
    lines.push(`POTENTIAL CLIENTS (${business.length}):`);
    for (const b of business.slice(0, 6)) {
      lines.push(`- ${b.title}: ${b.description}${b.location ? ` [${b.location}]` : ''}`);
    }
  }
  if (datapoint.length > 0) {
    lines.push(`MARKET DATA POINTS (${datapoint.length}):`);
    for (const d of datapoint.slice(0, 6)) {
      lines.push(`- ${d.title}: ${d.description}`);
    }
  }
  return lines.join('\n');
}

/**
 * Build the initial ServiceContext from the inputs the task-level
 * generate route has on hand at the first context exchange. Pure —
 * no I/O. The agent then confirms or adjusts before generation.
 */
export function buildPrePopulatedContextFromTask(input: {
  taskTitle:             string;
  taskDescription:       string;
  beliefState: {
    geographicMarket?:     string | null;
    availableTimePerWeek?: string | null;
    availableBudget?:      string | null;
  };
  recommendationSummary: string | null;
  researchSession:       unknown;
}): ServiceContext {
  const { taskTitle, taskDescription, beliefState, recommendationSummary } = input;
  const researchFindings = digestResearchSessionForPackager(input.researchSession);

  // The serviceSummary opens with the recommendation summary and the
  // task framing so the agent can reason about what's being packaged.
  // The targetMarket starts from the geographic market and gets refined
  // by the agent based on the recommendation specifics.
  const serviceSummary = recommendationSummary
    ? `Task: ${taskTitle}. ${taskDescription}\n\nRecommendation context: ${recommendationSummary}`
    : `Task: ${taskTitle}. ${taskDescription}`;

  // Extract the research query for the UI badge (safeParseResearchSession
  // is already used by digestResearchSessionForPackager; re-parse here
  // to grab the query string without duplicating the digest logic).
  const rsObj = input.researchSession as Record<string, unknown> | undefined;
  const researchQuery = rsObj && typeof rsObj === 'object' && typeof rsObj['query'] === 'string'
    ? rsObj['query'] as string
    : undefined;

  return {
    serviceSummary,
    targetMarket:          beliefState.geographicMarket ?? '',
    availableHoursPerWeek: beliefState.availableTimePerWeek ?? undefined,
    founderCosts:          beliefState.availableBudget ?? undefined,
    taskContext:           taskDescription,
    researchFindings:      researchFindings ?? undefined,
    researchQuery,
  };
}

/**
 * Build the initial ServiceContext for a standalone session — only
 * belief state and recommendation context are available. The agent
 * fills in serviceSummary and targetMarket based on the founder's
 * description.
 */
export function buildPrePopulatedContextStandalone(input: {
  beliefState: {
    geographicMarket?:     string | null;
    availableTimePerWeek?: string | null;
    availableBudget?:      string | null;
  };
  recommendationSummary: string | null;
}): ServiceContext {
  const { beliefState, recommendationSummary } = input;
  return {
    serviceSummary:        recommendationSummary
      ? `Recommendation context: ${recommendationSummary}`
      : '',
    targetMarket:          beliefState.geographicMarket ?? '',
    availableHoursPerWeek: beliefState.availableTimePerWeek ?? undefined,
    founderCosts:          beliefState.availableBudget ?? undefined,
  };
}
