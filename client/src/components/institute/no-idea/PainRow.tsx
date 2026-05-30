'use client';
// src/components/institute/no-idea/PainRow.tsx
//
// One row in the unified pain ledger. 4-col grid:
//   [60px index/source] [statement + meta] [200px scores] [80px verdict]
//
// The statement's type weight is driven by signalWeight(pp) — heavy
// pains read louder on the page than light ones. The verdict badge is
// derived from painVerdict (all axes ≥ 3 → ● Viable; ≤ 2 → — too light;
// mixed → ○ Rate). Founder-final scores drive the verdict; agent
// suggestions are not promoted automatically.

import type { PainPoint } from '@/lib/ideation/stage3-opportunities/schema';
import { DotScore } from './DotScore';
import { FOUNDER_CONTEXT_LABELS } from '@/components/ideation/stage3/labels';
import {
  getScores,
  painVerdict,
  signalGlyph,
  signalWeight,
} from './signalWeight';

export interface PainRowProps {
  pp:    PainPoint;
  /** Roman numeral for the row index (e.g. "i.", "ii."). */
  roman: string;
  /** Founder edits the row by clicking dots. */
  onScore: (input: { id: string; intensity: number; frequency: number; nicheSpecificity: number }) => void;
  onRemove: (id: string) => void;
  readOnly?: boolean;
}

export function PainRow({ pp, roman, onScore, onRemove, readOnly }: PainRowProps) {
  const verdict = painVerdict(pp);
  const weight = signalWeight(pp);
  const scores = getScores(pp) ?? { intensity: 0, frequency: 0, nicheSpecificity: 0 };

  const setAxis = (axis: 'intensity' | 'frequency' | 'nicheSpecificity', next: number) => {
    if (readOnly) return;
    onScore({
      id:               pp.id,
      intensity:        axis === 'intensity'        ? next : (pp.founderFinalScores?.intensity        ?? scores.intensity),
      frequency:        axis === 'frequency'        ? next : (pp.founderFinalScores?.frequency        ?? scores.frequency),
      nicheSpecificity: axis === 'nicheSpecificity' ? next : (pp.founderFinalScores?.nicheSpecificity ?? scores.nicheSpecificity),
    });
  };

  const sourceLabel =
    pp.source === 'agent'
      ? 'Scout'
      : `You · ${(pp.founderContext && FOUNDER_CONTEXT_LABELS[pp.founderContext]) ?? 'personal obs.'}`;

  const metaBits: string[] = [];
  if (pp.source === 'agent') {
    if (pp.communityOrigin) metaBits.push(pp.communityOrigin);
    if (pp.evidenceUrl)     metaBits.push('+ source');
  } else {
    metaBits.push('founder-added');
    if (pp.founderContext && FOUNDER_CONTEXT_LABELS[pp.founderContext]) {
      metaBits.push(FOUNDER_CONTEXT_LABELS[pp.founderContext].toLowerCase());
    }
  }

  const glyphTone = weight === 'light' ? 'text-muted' : 'text-accent';

  return (
    <article
      className={[
        'grid grid-cols-[40px_1fr] items-center gap-3 border-b border-rule py-4 transition-colors',
        'lg:grid-cols-[60px_1fr_200px_80px] lg:gap-5 lg:py-[18px]',
        verdict === 'viable' ? 'bg-[rgba(255,90,60,0.03)]' : 'hover:bg-[rgba(255,255,255,0.02)]',
      ].join(' ')}
    >
      {/* Index / source */}
      <div className="flex flex-col items-start gap-0.5">
        <span className="font-serif text-[24px] italic leading-none tracking-[-0.01em] text-accent">
          {roman}
        </span>
        <span className="hidden font-mono text-[9px] uppercase tracking-[0.14em] text-muted lg:block">
          {sourceLabel}
        </span>
      </div>

      {/* Statement + meta */}
      <div className="grid gap-2">
        <span
          className={[
            'font-sans font-medium leading-[1.3] tracking-[-0.005em] text-fg',
            weight === 'heavy' ? 'text-[21px]' : '',
            weight === 'medium' ? 'text-[17px]' : '',
            weight === 'light' ? 'font-serif text-[15px] italic font-normal text-fg-2' : '',
          ].join(' ')}
        >
          {pp.description}
        </span>
        <div className="flex flex-wrap items-center gap-3.5 font-mono text-[10px] tracking-[0.04em] text-muted">
          {metaBits.map((m, i) => <span key={i}>{m}</span>)}
          <span className={glyphTone}>{signalGlyph(pp)}</span>
        </div>
      </div>

      {/* Scores — three axes of dots */}
      <div className="grid gap-1.5 lg:col-start-3">
        <DotScore label="Intensity" value={scores.intensity}        onChange={(n) => setAxis('intensity',        n)} disabled={readOnly} />
        <DotScore label="Frequency" value={scores.frequency}        onChange={(n) => setAxis('frequency',        n)} disabled={readOnly} />
        <DotScore label="Niche"     value={scores.nicheSpecificity} onChange={(n) => setAxis('nicheSpecificity', n)} disabled={readOnly} />
      </div>

      {/* Verdict */}
      <div className="flex items-center justify-end gap-3 lg:col-start-4 lg:flex-col lg:items-end lg:gap-1.5">
        <VerdictBadge verdict={verdict} />
        {!readOnly && (
          <button
            type="button"
            onClick={() => onRemove(pp.id)}
            className="font-mono text-[9px] uppercase tracking-[0.04em] text-muted-2 transition-colors hover:text-accent"
          >
            remove
          </button>
        )}
      </div>
    </article>
  );
}

function VerdictBadge({ verdict }: { verdict: 'viable' | 'rate' | 'too_light' }) {
  if (verdict === 'viable') {
    return (
      <span className="inline-block border border-accent bg-accent/[0.06] px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-accent">
        ● Viable
      </span>
    );
  }
  if (verdict === 'too_light') {
    return (
      <span className="inline-block border border-rule-strong px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-2">
        — too light
      </span>
    );
  }
  return (
    <span className="inline-block border border-rule-strong px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
      ○ Rate
    </span>
  );
}
