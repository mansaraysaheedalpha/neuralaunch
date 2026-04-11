// src/lib/continuation/scenario-evaluator.ts
//
// Pure scenario evaluator for the "What's Next?" checkpoint. Reads
// roadmap progress and returns one of four scenarios per the spec
// in docs/ROADMAP_CONTINUATION.md "The What's Next? Button" section.
//
// No I/O, no LLM calls — this is the deterministic gate that decides
// whether the founder enters the diagnostic chat or goes straight to
// the continuation brief.

import { CONTINUATION_THRESHOLDS } from './constants';

export type CheckpointScenario = 'A' | 'B' | 'C' | 'D';

export interface ScenarioEvaluation {
  scenario:        CheckpointScenario;
  /** 0.0 to 1.0 — completedTasks / totalTasks (or 0 if total === 0) */
  percentComplete: number;
  /** True for Scenarios A and B — the founder enters diagnostic chat. */
  needsDiagnostic: boolean;
  /** Human-readable reason for the route to log + the client to show. */
  explanation:     string;
}

/**
 * Evaluate the checkpoint scenario from completion counts.
 *
 * Scenario A — zero tasks completed
 *   The engine does NOT proceed to continuation. Diagnostic mode
 *   identifies what is blocking the founder from starting at all.
 *
 * Scenario B — partial completion below PARTIAL_TO_BRIEF_RATIO
 *   The engine asks why the remaining tasks are unfinished before
 *   generating the brief. Not a gate, an inquiry.
 *
 * Scenario C — partial completion at or above PARTIAL_TO_BRIEF_RATIO
 *   Sufficient evidence base. Generate the full brief immediately.
 *
 * Scenario D — 100% completion
 *   Cleanest path. Generate the brief with the strongest possible
 *   evidence base.
 *
 * The function never throws; degenerate inputs (totalTasks === 0)
 * collapse to Scenario A so the caller can surface a sensible
 * diagnostic prompt rather than hitting a divide-by-zero.
 */
export function evaluateScenario(input: {
  totalTasks:     number;
  completedTasks: number;
}): ScenarioEvaluation {
  const totalTasks     = Math.max(0, Math.floor(input.totalTasks));
  const completedTasks = Math.max(0, Math.floor(input.completedTasks));

  if (totalTasks === 0 || completedTasks === 0) {
    return {
      scenario:        'A',
      percentComplete: 0,
      needsDiagnostic: true,
      explanation:     'No tasks have been completed yet — diagnostic identifies the starting blocker.',
    };
  }

  const percent = Math.min(1, completedTasks / totalTasks);

  if (percent >= 1) {
    return {
      scenario:        'D',
      percentComplete: 1,
      needsDiagnostic: false,
      explanation:     'Every task complete — full evidence base for the continuation brief.',
    };
  }

  if (percent >= CONTINUATION_THRESHOLDS.PARTIAL_TO_BRIEF_RATIO) {
    return {
      scenario:        'C',
      percentComplete: percent,
      needsDiagnostic: false,
      explanation:     `${Math.round(percent * 100)}% of tasks complete — sufficient evidence for the continuation brief.`,
    };
  }

  return {
    scenario:        'B',
    percentComplete: percent,
    needsDiagnostic: true,
    explanation:     `${Math.round(percent * 100)}% of tasks complete — diagnostic identifies why the remaining work stalled before generating the brief.`,
  };
}
