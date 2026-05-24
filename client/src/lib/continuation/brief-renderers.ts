// src/lib/continuation/brief-renderers.ts
//
// Pure rendering and extraction helpers for the continuation brief
// generator. No LLM calls, no database access — these functions
// transform structured data into prompt-ready text blocks or aggregate
// signals from nested check-in history records.
//
// Extracted from brief-generator.ts to keep each file under the 300-line
// service/engine hard limit (CLAUDE.md §File Size Limits).

import 'server-only';
import { renderUserContent, sanitizeForPrompt } from '@/lib/validation/server-helpers';
import type { DiscoveryContext } from '@/lib/discovery/context-schema';
import type { StoredRoadmapPhase, StoredRoadmapTask } from '@/lib/roadmap/checkin-types';
import type { ReserveOpportunity } from '@/lib/ideation/stage5-handoff/schema';
import type { ParkingLot } from './parking-lot-schema';
import type { DiagnosticHistory } from './diagnostic-schema';

// ---------------------------------------------------------------------------
// Structured check-in signals
// ---------------------------------------------------------------------------
//
// Pure helper that walks the phases array and aggregates the high-value
// structured outputs the check-in agent emits. The continuation brief
// generator otherwise never sees these — they live inside individual
// CheckInEntry objects nested under each task. Aggregating them at
// the brief-prompt boundary lets the brief generator say things like
// "the agent recommended recalibrating twice" or "you needed task
// breakdowns on 4 of 7 tasks, which suggests the roadmap's
// granularity was too coarse." Those are signals that exist in the
// data but were never surfaced at the strategic level where they
// would directly inform the "What I Got Wrong" and "What the
// Evidence Says" sections.
//
// No additional LLM call. Pure iteration. Failure modes: none —
// missing fields default to zero counts and empty arrays.

export interface StructuredCheckInSignals {
  recalibrationOffersByTask: Array<{ taskTitle: string; reason: string }>;
  adjustedNextStepActions:   Array<{ taskTitle: string; rationale: string }>;
  tasksThatNeededSubSteps:   string[];
  tasksThatNeededTools:      string[];
  conversationArcs:          Array<{ taskTitle: string; arc: string }>;
}

export function extractStructuredSignals(phases: StoredRoadmapPhase[]): StructuredCheckInSignals {
  const recalibrationOffersByTask: StructuredCheckInSignals['recalibrationOffersByTask'] = [];
  const adjustedNextStepActions:   StructuredCheckInSignals['adjustedNextStepActions']   = [];
  const tasksThatNeededSubSteps:   string[] = [];
  const tasksThatNeededTools:      string[] = [];
  const conversationArcs:          StructuredCheckInSignals['conversationArcs']          = [];

  for (const phase of phases) {
    for (const task of phase.tasks as StoredRoadmapTask[]) {
      const title = task.title;
      const history = task.checkInHistory ?? [];

      // A7: per-task narrative arc — surface even when there are no
      // structured signals on individual entries.
      if (task.conversationArc) {
        conversationArcs.push({ taskTitle: title, arc: task.conversationArc });
      }

      // Aggregate per-task flags. We mark a task as "needed sub-steps"
      // or "needed tools" if ANY entry on that task carried the
      // respective field — we are interested in whether the roadmap
      // ever needed that scaffolding, not how many times.
      let recordedSubStepsForTask = false;
      let recordedToolsForTask    = false;

      for (const entry of history) {
        if (entry.recalibrationOffer && entry.recalibrationOffer.reason) {
          recalibrationOffersByTask.push({
            taskTitle: title,
            reason:    entry.recalibrationOffer.reason,
          });
        }
        if (entry.agentAction === 'adjusted_next_step') {
          // The rationale comes from the first proposedChanges entry's
          // rationale string when present, falling back to the agent
          // response text when proposedChanges is absent (shouldn't
          // happen for adjusted_next_step but defending against it).
          const rationale = entry.proposedChanges?.[0]?.rationale ?? entry.agentResponse;
          adjustedNextStepActions.push({ taskTitle: title, rationale });
        }
        if (!recordedSubStepsForTask && entry.subSteps && entry.subSteps.length > 0) {
          tasksThatNeededSubSteps.push(title);
          recordedSubStepsForTask = true;
        }
        if (!recordedToolsForTask && entry.recommendedTools && entry.recommendedTools.length > 0) {
          tasksThatNeededTools.push(title);
          recordedToolsForTask = true;
        }
      }
    }
  }

  return {
    recalibrationOffersByTask,
    adjustedNextStepActions,
    tasksThatNeededSubSteps,
    tasksThatNeededTools,
    conversationArcs,
  };
}

/**
 * Render the structured signals as a human-readable block injected
 * into the brief prompt. Returns the empty string when there is
 * nothing to surface so the prompt builder can drop it cleanly via
 * concatenation.
 */
export function renderStructuredSignals(signals: StructuredCheckInSignals): string {
  const sections: string[] = [];

  if (signals.recalibrationOffersByTask.length > 0) {
    sections.push(
      `Recalibration offers fired (${signals.recalibrationOffersByTask.length}):\n` +
      signals.recalibrationOffersByTask
        .map(o => `  - on "${sanitizeForPrompt(o.taskTitle, 200)}": ${renderUserContent(o.reason, 400)}`)
        .join('\n'),
    );
  }
  if (signals.adjustedNextStepActions.length > 0) {
    sections.push(
      `Tasks where the agent proposed adjustments to the next step (${signals.adjustedNextStepActions.length}):\n` +
      signals.adjustedNextStepActions
        .map(a => `  - "${sanitizeForPrompt(a.taskTitle, 200)}": ${renderUserContent(a.rationale, 400)}`)
        .join('\n'),
    );
  }
  if (signals.tasksThatNeededSubSteps.length > 0) {
    sections.push(
      `Tasks that needed sub-step breakdowns (${signals.tasksThatNeededSubSteps.length}) — indicates the roadmap's task granularity was too coarse for this founder:\n` +
      signals.tasksThatNeededSubSteps
        .map(t => `  - ${sanitizeForPrompt(t, 200)}`)
        .join('\n'),
    );
  }
  if (signals.tasksThatNeededTools.length > 0) {
    sections.push(
      `Tasks where the agent had to recommend specific tools (${signals.tasksThatNeededTools.length}) — indicates the roadmap did not specify tools clearly enough for this founder:\n` +
      signals.tasksThatNeededTools
        .map(t => `  - ${sanitizeForPrompt(t, 200)}`)
        .join('\n'),
    );
  }
  if (signals.conversationArcs.length > 0) {
    sections.push(
      `Per-task conversation arcs (${signals.conversationArcs.length}) — narrative trajectory of the check-in conversation on each task that ran more than one round:\n` +
      signals.conversationArcs
        .map(a => `  - "${sanitizeForPrompt(a.taskTitle, 200)}": ${renderUserContent(a.arc, 400)}`)
        .join('\n'),
    );
  }

  if (sections.length === 0) return '';
  return `STRUCTURED SIGNALS FROM CHECK-INS (use these to ground the "What I Got Wrong" and "What the Evidence Says" sections):\n${sections.join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------
// Belief state digest
// ---------------------------------------------------------------------------

export function renderBeliefDigest(context: DiscoveryContext): string {
  const fields: Array<[string, unknown]> = [
    ['Primary goal',         context.primaryGoal?.value],
    ['Situation',            context.situation?.value],
    ['Background',           context.background?.value],
    ['Geographic market',    context.geographicMarket?.value],
    ['Available time/week',  context.availableTimePerWeek?.value],
    ['Available budget',     context.availableBudget?.value],
    ['Biggest concern',      context.biggestConcern?.value],
    ['Why now',              context.whyNow?.value],
  ];
  const lines: string[] = [];
  for (const [label, value] of fields) {
    if (value == null) continue;
    const text = Array.isArray(value)
      ? (value as unknown[]).map(v => String(v)).join(', ')
      : String(value);
    if (text.trim().length === 0) continue;
    lines.push(`${label}: ${sanitizeForPrompt(text, 500)}`);
  }
  return lines.length > 0 ? lines.join('\n') : '(no belief state captured)';
}

// ---------------------------------------------------------------------------
// Phase / task execution record
// ---------------------------------------------------------------------------

export function renderPhasesWithEvidence(phases: StoredRoadmapPhase[]): string {
  const lines: string[] = [];
  for (const phase of phases) {
    lines.push(`Phase ${phase.phase}: ${sanitizeForPrompt(phase.title, 200)} — ${sanitizeForPrompt(phase.objective, 400)}`);
    phase.tasks.forEach((task: StoredRoadmapTask) => {
      const status = task.status ?? 'not_started';
      const checkInsCount = task.checkInHistory?.length ?? 0;
      lines.push(`  • [${status}] ${sanitizeForPrompt(task.title, 200)} (${checkInsCount} check-in${checkInsCount === 1 ? '' : 's'})`);
      // A7: when the per-task arc summariser produced a one-sentence
      // narrative arc, surface it BEFORE the latest message so the
      // brief generator reads the trajectory first and the endpoint
      // second. The arc captures rounds the latest-message-only
      // rendering would otherwise hide.
      if (task.conversationArc) {
        lines.push(`      arc: ${renderUserContent(task.conversationArc, 600)}`);
      }
      if (task.checkInHistory && task.checkInHistory.length > 0) {
        const last = task.checkInHistory[task.checkInHistory.length - 1];
        lines.push(`      latest check-in: ${renderUserContent(last.freeText, 600)}`);
      }
    });
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Parking lot
// ---------------------------------------------------------------------------

export function renderParkingLot(parkingLot: ParkingLot): string {
  if (parkingLot.length === 0) return '(no parking-lot items captured)';
  return parkingLot.map(item => {
    const ctx = item.taskContext ? ` (from task: ${sanitizeForPrompt(item.taskContext, 200)})` : '';
    return `- ${renderUserContent(item.idea, 400)}${ctx} [${item.surfacedFrom}, ${item.surfacedAt}]`;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Diagnostic history
// ---------------------------------------------------------------------------

export function renderDiagnosticHistory(history: DiagnosticHistory): string {
  if (history.length === 0) return '';
  const lines = ['DIAGNOSTIC CHAT (Scenario A/B exchange that led the founder to this brief):'];
  for (const entry of history) {
    const label = entry.role === 'founder' ? 'FOUNDER' : 'YOU';
    lines.push(`[${label}] ${renderUserContent(entry.message, 1500)}`);
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Stage 5 reserve opportunities
// ---------------------------------------------------------------------------
//
// Inserted between PARKING LOT and DIAGNOSTIC CHAT in the brief prompt.
// Returns '' when reserves is empty so the prompt concatenation drops
// the block cleanly — legacy Discovery-flow Recommendation rows (column
// is null / pre-Stage-5) and tenants who didn't surface reserves both
// land here without altering the prompt shape.
//
// Per-field slice budgets mirror the Stage 5 strategic-analysis renderer
// so the prompt block stays bounded at ~250-350 chars per reserve. Four
// reserves render at ~1000-1400 chars worst case — acceptable in a brief
// prompt that already runs ~6000-8000 chars of context.

const SLICE_RESERVE_PAIN_SUMMARY  = 400;
const SLICE_RESERVE_AGENT_REASON  = 400;

export function renderReserveOpportunitiesBlock(reserves: ReadonlyArray<ReserveOpportunity>): string {
  if (reserves.length === 0) return '';

  const lines: string[] = [];
  for (const r of reserves) {
    lines.push(`- Rank ${r.rank}: ${renderUserContent(r.painPointSummary, SLICE_RESERVE_PAIN_SUMMARY)}`);
    lines.push(`    Stage 5 agent verdict: ${r.agentVerdict} — ${renderUserContent(r.agentReasoning, SLICE_RESERVE_AGENT_REASON)}`);
    lines.push(`    Stage 5 founder verdict: ${r.founderVerdict ?? 'did not commit'}`);
    if (r.layerASummary) {
      const a = r.layerASummary;
      lines.push(
        `    Layer A confidence: market reality ${a.marketReality.confidence.toFixed(2)} / customer access ${a.customerAccess.confidence.toFixed(2)} / will pay ${a.willPeoplePay.confidence.toFixed(2)} / market size ${a.marketSize.confidence.toFixed(2)}`,
      );
    }
    if (r.layerBSummary) {
      const b = r.layerBSummary;
      lines.push(
        `    Layer B aggregate: community engagement ${b.validationStrength} (${b.sentimentBreakdown.positive} positive / ${b.sentimentBreakdown.neutral} neutral / ${b.sentimentBreakdown.negative} negative)`,
      );
    }
    lines.push(`    Reserve id (use as fork.sourceReserveId when pivoting to this reserve): ${r.id}`);
  }

  return `RESERVE OPPORTUNITIES (from the founder's Stage 5 evaluation):
The founder evaluated multiple opportunities in Stage 5 and chose the one
this roadmap implemented. The opportunities below are the honest
alternatives the founder ranked but did not advance. They were already
weighed against the chosen path, so a fork that pivots to a reserve is
NOT a fresh detour — it's a return to a path the founder already
considered worth keeping in view.

${lines.join('\n')}
`;
}
