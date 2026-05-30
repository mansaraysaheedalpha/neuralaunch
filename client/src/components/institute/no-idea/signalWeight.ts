// src/components/institute/no-idea/signalWeight.ts
//
// Signal-weight derivation for Stage 3 pain ledger rows. The
// statement's typographic weight is driven by how loud the pain is
// — heavy pains render their statement at 21px sans 500, medium at
// 17px, light at 15px serif-italic-muted. This file is the single
// source of truth for that mapping plus the per-axis verdict logic.

import type { PainPoint } from '@/lib/ideation/stage3-opportunities/schema';

export type SignalWeight = 'heavy' | 'medium' | 'light';

/**
 * Pull the founder's final scores (or fall back to agent suggestions
 * pre-rating). Null when neither exists.
 */
export function getScores(pp: PainPoint): { intensity: number; frequency: number; nicheSpecificity: number } | null {
  if (pp.founderFinalScores) return pp.founderFinalScores;
  if (pp.agentSuggestedScores) {
    const { intensity, frequency, nicheSpecificity } = pp.agentSuggestedScores;
    return { intensity, frequency, nicheSpecificity };
  }
  return null;
}

/**
 * Score sum across the three axes. 0-15. Returns 0 when no scores
 * exist on either source.
 */
export function scoreSum(pp: PainPoint): number {
  const s = getScores(pp);
  if (!s) return 0;
  return s.intensity + s.frequency + s.nicheSpecificity;
}

/**
 * Signal-weight band. Identical thresholds to stage-3.html's JS:
 *   sum ≥ 12 → heavy
 *   sum ≥ 8  → medium
 *   else     → light
 *
 * Unscored agent pains fall through to 'light' until the founder
 * (or the agent's suggestion) lands enough score to lift them.
 */
export function signalWeight(pp: PainPoint): SignalWeight {
  const sum = scoreSum(pp);
  if (sum >= 12) return 'heavy';
  if (sum >= 8)  return 'medium';
  return 'light';
}

export type Verdict = 'viable' | 'rate' | 'too_light';

/**
 * Three-state verdict that drives the row badge.
 *
 *   viable     — founder's final scores exist AND each axis ≥ 3.
 *   too_light  — each axis ≤ 2.
 *   rate       — anything else (mixed or unscored).
 *
 * Founder-final-scores only (agent suggestions don't count as a
 * verdict — the founder owns the verdict).
 */
export function painVerdict(pp: PainPoint): Verdict {
  const s = pp.founderFinalScores;
  if (!s) return 'rate';
  const axes = [s.intensity, s.frequency, s.nicheSpecificity];
  if (axes.every((v) => v >= 3)) return 'viable';
  if (axes.every((v) => v <= 2)) return 'too_light';
  return 'rate';
}

/** Convenience — viable count across the active inventory. */
export function countViable(pps: PainPoint[]): number {
  return pps.filter((p) => painVerdict(p) === 'viable').length;
}

/**
 * Score-derived 5-pip glyph for the meta line ("●●●○○"). Renders
 * approximate signal strength to the reader without relying on a
 * persisted signal-count field.
 */
export function signalGlyph(pp: PainPoint): string {
  const sum = scoreSum(pp);
  // 0-15 → 0-5 dots (sum / 3 rounded).
  const dots = Math.max(0, Math.min(5, Math.round(sum / 3)));
  return '●'.repeat(dots) + '○'.repeat(5 - dots);
}
