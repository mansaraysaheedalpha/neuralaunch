// src/lib/continuation/diagnostic-orchestration.ts
//
// Pure helpers for the diagnostic POST route. Builds the founder /
// agent turn pair from a runDiagnosticTurn response and computes
// the next continuationStatus from the agent verdict. Persistence
// and Inngest event firing happen in the route — these helpers do
// not touch the database or the queue.

import 'server-only';
import { CONTINUATION_STATUSES, type ContinuationStatus } from './constants';
import type { DiagnosticHistoryEntry, DiagnosticTurn } from './diagnostic-schema';

/**
 * Build the persisted founder + agent turn pair from a raw
 * diagnostic exchange. Pure — no IDs come from outside, both ids
 * are minted here so the route does not have to know the id format.
 */
export function buildDiagnosticTurnPair(input: {
  founderMessage: string;
  agentResponse:  DiagnosticTurn;
}): { founderTurn: DiagnosticHistoryEntry; agentTurn: DiagnosticHistoryEntry } {
  const founderTurn: DiagnosticHistoryEntry = {
    id:        `dx_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    role:      'founder',
    message:   input.founderMessage,
  };

  // Wait one millisecond's worth of clock granularity by bumping the
  // timestamp explicitly so the persisted ordering is unambiguous.
  // The two turns share the same persistence transaction; the agent
  // turn must always sort after the founder turn it responds to.
  const agentTimestamp = new Date(Date.now() + 1).toISOString();

  const agentTurn: DiagnosticHistoryEntry = {
    id:               `dx_${Date.now() + 1}_${crypto.randomUUID().slice(0, 8)}`,
    timestamp:        agentTimestamp,
    role:             'agent',
    message:          input.agentResponse.message,
    verdict:          input.agentResponse.verdict,
    ...(input.agentResponse.followUpQuestion
      ? { followUpQuestion: input.agentResponse.followUpQuestion }
      : {}),
  };

  return { founderTurn, agentTurn };
}

/**
 * Decide what continuationStatus to set after a diagnostic turn
 * lands. Today only `release_to_brief` flips the status — every
 * other verdict keeps the chat open at DIAGNOSING. The route then
 * checks the returned `nextStatus` against the current row state
 * before issuing the update.
 *
 * Returning DIAGNOSING (rather than null) for the no-op case lets
 * the route always issue the same update statement.
 */
export function nextStatusForVerdict(verdict: DiagnosticTurn['verdict']): ContinuationStatus {
  if (verdict === 'release_to_brief') return CONTINUATION_STATUSES.GENERATING_BRIEF;
  return CONTINUATION_STATUSES.DIAGNOSING;
}
