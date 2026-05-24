// src/lib/ideation/stage5-handoff/synthesis-bridge.ts
//
// Translation layer between Stage 5 (validated Stage 1-4 documents)
// and the legacy `runFinalSynthesis` input contract. NeuraLaunch's
// post-Discovery Recommendation pipeline was built for free-form
// belief-state synthesis (Sonnet summarise → Sonnet eliminate →
// Opus reason+research → Sonnet emit). Stage 5 reuses the final
// two-phase synthesis step but PRE-COMPUTES the first two by reading
// off the committed Stage 1-4 documents.
//
// Two pure renderers are stitched together into the `summary` and
// `analysis` slots; runFinalSynthesis owns Phase 1A (research +
// reasoning) and Phase 1B (structured emission) downstream.
//
// CLAUDE.md non-negotiables this file respects:
//   - DO NOT add tools + Output.object + stopWhen here — the two-phase
//     split lives inside runFinalSynthesis (commit 3f7c727). This file
//     only renders strings.
//   - Every founder-typed string is wrapped via renderUserContent in
//     the renderers; enum values stay unwrapped.
//   - audienceType is null because Ideation pre-dates the audience
//     classifier; the legacy Discovery path may set it, the Ideation
//     path cannot.
//   - lifecycleBlock is forwarded unchanged (the caller — commit #3's
//     Inngest worker — owns rendering it).

import 'server-only';
import { logger } from '@/lib/logger';
import { runFinalSynthesis } from '@/lib/discovery/synthesis-final';
import type { Recommendation } from '@/lib/discovery/recommendation-schema';
import type { ResearchLogEntry } from '@/lib/research';
import { renderFounderSummary } from './render-founder-summary';
import { renderStrategicAnalysis } from './render-strategic-analysis';
import type { OutcomeDocument } from '../stage1-outcome/schema';
import type { RequirementsDocument } from '../stage2-requirements/schema';
import type { PainInventoryDocument } from '../stage3-opportunities/schema';
import type { OpportunityEvaluationsDocument } from '../stage4-opportunities/schema';
import type {
  ChosenOpportunitySnapshot,
  ReserveOpportunity,
} from './schema';

const log = logger.child({ module: 'stage5/synthesis-bridge' });

// ---------------------------------------------------------------------------
// Public input
// ---------------------------------------------------------------------------

export interface RunStage5SynthesisBridgeArgs {
  /** Stage 1 committed document. */
  outcomeDocument:      OutcomeDocument;
  /** Stage 2 committed document. */
  requirementsDocument: RequirementsDocument;
  /** Stage 3 committed document (pain inventory). */
  painInventoryDoc:     PainInventoryDocument;
  /** Stage 4 committed document (opportunity evaluations). */
  opportunitySet:       OpportunityEvaluationsDocument;
  /** The chosen-opportunity snapshot persisted on Stage 5 authoring. */
  chosen:               ChosenOpportunitySnapshot;
  /** The ranked reserve set built by buildReserveOpportunities. */
  reserves:             ReadonlyArray<ReserveOpportunity>;
  /** Pre-rendered lifecycle block (FounderProfile + Cycle Summaries). Empty string when none. */
  lifecycleBlock?:      string;
  /** Correlation id for the synthesis research log. Use IdeationSession.id. */
  contextId:            string;
  /**
   * Per-call research accumulator. Inngest worker owns this array —
   * passes an empty array in, reads populated entries back, and
   * appends them to Recommendation.researchLog. Optional for tests.
   */
  researchAccumulator?: ResearchLogEntry[];
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Stage 5 synthesis bridge — render the Stage 1-4 evidence into the
 * legacy `summary` + `analysis` slots and delegate to the two-phase
 * runFinalSynthesis. Returns a validated Recommendation.
 *
 * Throws on:
 *   - Any input being null/undefined (defence-in-depth; the caller
 *     should have gated on readiness first)
 *   - runFinalSynthesis throwing (propagated up the call stack so the
 *     Inngest worker in commit #3 can record synthesis_failed)
 *
 * audienceType is hard-coded to null per the brief — Ideation pre-dates
 * the legacy AudienceType classifier.
 */
export async function runStage5SynthesisBridge(
  args: RunStage5SynthesisBridgeArgs,
): Promise<Recommendation> {
  // ── Defence-in-depth input checks ────────────────────────────────
  if (!args.outcomeDocument)      throw new Error('Stage 5 bridge: outcomeDocument is required');
  if (!args.requirementsDocument) throw new Error('Stage 5 bridge: requirementsDocument is required');
  if (!args.painInventoryDoc)     throw new Error('Stage 5 bridge: painInventoryDoc is required');
  if (!args.opportunitySet)       throw new Error('Stage 5 bridge: opportunitySet is required');
  if (!args.chosen)               throw new Error('Stage 5 bridge: chosen opportunity snapshot is required');
  if (!args.contextId)            throw new Error('Stage 5 bridge: contextId is required');

  const summary = renderFounderSummary({
    outcomeDocument:      args.outcomeDocument,
    requirementsDocument: args.requirementsDocument,
    painInventoryDoc:     args.painInventoryDoc,
    chosen:               args.chosen,
  });

  // Look up the full Stage 4 row for the chosen opportunity so the
  // analysis renderer can surface Q1-style citation summaries. Null
  // is acceptable — the renderer falls back to the snapshot fields.
  const chosenRow = args.opportunitySet.evaluations.find(e => e.id === args.chosen.id) ?? null;

  const analysis = renderStrategicAnalysis({
    chosen:    args.chosen,
    chosenRow,
    reserves:  args.reserves,
  });

  log.debug('stage5 bridge rendered', {
    contextId:       args.contextId,
    summaryLength:   summary.length,
    analysisLength:  analysis.length,
    reserveCount:    args.reserves.length,
  });

  return runFinalSynthesis({
    summary,
    analysis,
    audienceType:         null,
    contextId:            args.contextId,
    researchAccumulator:  args.researchAccumulator,
    lifecycleBlock:       args.lifecycleBlock,
  });
}
