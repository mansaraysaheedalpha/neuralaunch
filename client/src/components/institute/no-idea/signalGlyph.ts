// src/components/institute/no-idea/signalGlyph.ts
//
// Derive the docket's typographic glyph + strength word for one
// opportunity row, from Layer A presence + Layer B validation strength
// + the verdict. The glyph is the "ranking legible at a glance" device
// — it's the single source of truth for that mapping.

import type { OpportunityEvaluation } from '@/lib/ideation/stage4-opportunities/schema';
import type { ValidationStrength } from '@neuralaunch/constants';

export type GlyphTone = 'accent' | 'muted' | 'contra';

export interface LayerGlyph {
  dots:     string;        // e.g. "●●●●", "●●●○", "●○○○", "○○○○"
  tone:     GlyphTone;
  strength: string;        // e.g. "Complete", "Verified", "Contradictory", "Not run"
  label:    string;        // mono lab line — e.g. "A · 6 step"
}

/**
 * Layer A glyph. The schema's `layerAResearch` is either fully set or
 * null (the derive route writes the bundle atomically), so the gradient
 * comes from the per-dimension confidence average.
 */
export function layerAGlyph(opp: OpportunityEvaluation): LayerGlyph {
  const research = opp.layerAResearch;
  if (!research) {
    return { dots: '○○○○', tone: 'muted', strength: 'Not run', label: 'A · pending' };
  }
  // Average per-dimension confidence (0-1). Map to 1-4 dots.
  const confidences = [
    research.marketReality.confidence,
    research.customerAccess.confidence,
    research.willPeoplePay.confidence,
    research.marketSize.confidence,
  ];
  const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const filled = Math.max(1, Math.min(4, Math.round(avg * 4)));
  const dots = '●'.repeat(filled) + '○'.repeat(4 - filled);
  if (filled === 4) return { dots, tone: 'accent', strength: 'Complete', label: 'A · 6 step' };
  if (filled >= 2)  return { dots, tone: 'accent', strength: 'Mixed',    label: 'A · 6 step' };
  return                { dots, tone: 'muted',  strength: 'Thin',     label: 'A · 6 step' };
}

/**
 * Layer B glyph. Driven by the validation-strength enum the response
 * aggregator computes (strong / mixed / weak / contradictory). Pending
 * when no extracted signal exists yet.
 */
export function layerBGlyph(opp: OpportunityEvaluation): LayerGlyph {
  const sig = opp.layerBExtractedSignal;
  if (!sig) {
    return { dots: '○○○○', tone: 'muted', strength: '—', label: 'B · pending' };
  }
  const yesCount = sig.sentimentBreakdown.positive;
  const total =
    sig.sentimentBreakdown.positive +
    sig.sentimentBreakdown.neutral +
    sig.sentimentBreakdown.negative;
  const strengthMap: Record<ValidationStrength, { dots: string; tone: GlyphTone; strength: string; label: string }> = {
    strong:        { dots: '●●●●', tone: 'accent', strength: total > 0 ? `${yesCount} / ${total} yes` : 'Verified',     label: 'B · verified'      },
    mixed:         { dots: '●●●○', tone: 'accent', strength: total > 0 ? `${yesCount} / ${total} yes` : 'Likely',       label: 'B · likely'        },
    weak:          { dots: '●●○○', tone: 'muted',  strength: total > 0 ? `${yesCount} / ${total} yes` : 'Weak',         label: 'B · weak'          },
    contradictory: { dots: '●○○○', tone: 'contra', strength: total > 0 ? `${yesCount} / ${total} yes` : 'Contradictory', label: 'B · contradictory' },
  };
  return strengthMap[sig.validationStrength];
}

/**
 * Whether the row should render as the FEATURED row in the docket —
 * the accent vertical bar + gradient bg that says "this is the winner."
 * True when:
 *   - Layer A complete (avg confidence ≥ 0.75)
 *   - Layer B strong OR mixed
 *   - Founder verdict is 'pursue' (advance) OR not yet stamped but
 *     agent says pursue.
 */
export function isFeatured(opp: OpportunityEvaluation): boolean {
  const a = opp.layerAResearch;
  if (!a) return false;
  const avgConf =
    (a.marketReality.confidence + a.customerAccess.confidence +
     a.willPeoplePay.confidence + a.marketSize.confidence) / 4;
  if (avgConf < 0.75) return false;
  const sig = opp.layerBExtractedSignal;
  if (!sig || (sig.validationStrength !== 'strong' && sig.validationStrength !== 'mixed')) return false;
  const verdict = opp.founderVerdict ?? (opp.agentVerdict === 'pursue' ? 'pursue' : null);
  return verdict === 'pursue';
}

/** Count of opportunities advancing (founderVerdict in pursue / with_caveats). */
export function countAdvancing(opps: OpportunityEvaluation[]): number {
  return opps.filter((o) => o.founderVerdict === 'pursue' || o.founderVerdict === 'pursue_with_caveats').length;
}
