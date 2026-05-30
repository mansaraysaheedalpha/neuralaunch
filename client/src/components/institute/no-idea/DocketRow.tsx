'use client';
// src/components/institute/no-idea/DocketRow.tsx
//
// One row in the Stage 4 opportunity docket. 6-column grid:
//   [50px roman] [1.6fr name+pain] [130px Layer A] [180px Layer B]
//   [140px verdicts] [50px arrow]
//
// Featured row gets the accent vertical bar + gradient bg — the
// "winner is visible without clicking" affordance.

import type { OpportunityEvaluation } from '@/lib/ideation/stage4-opportunities/schema';
import type { OpportunityVerdict } from '@neuralaunch/constants';
import { VERDICT_SHORT_LABELS } from '@/components/ideation/stage4/labels';
import { layerAGlyph, layerBGlyph, isFeatured, type LayerGlyph } from './signalGlyph';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export interface DocketRowProps {
  opp:     OpportunityEvaluation;
  /** Zero-based index — drives the roman numeral. */
  index:   number;
  onOpen:  (oppId: string) => void;
}

export function DocketRow({ opp, index, onOpen }: DocketRowProps) {
  const layerA = layerAGlyph(opp);
  const layerB = layerBGlyph(opp);
  const featured = isFeatured(opp);

  const agentVerdict = verdictLabel(opp.agentVerdict);
  const founderVerdict = opp.founderVerdict ? VERDICT_SHORT_LABELS[opp.founderVerdict] : '—';

  return (
    <button
      type="button"
      onClick={() => onOpen(opp.id)}
      className={[
        'relative grid w-full grid-cols-[40px_1fr] items-center gap-3 border-b border-rule px-3 py-5 text-left transition-[background,padding] duration-200 hover:bg-[rgba(255,255,255,0.02)] hover:pl-6',
        'lg:grid-cols-[50px_1.6fr_130px_180px_140px_50px] lg:gap-[18px] lg:px-5 lg:py-[22px]',
        featured ? 'bg-[linear-gradient(90deg,rgba(255,90,60,0.05),transparent_60%)]' : '',
      ].join(' ')}
    >
      {featured && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 hidden w-0.5 bg-accent lg:block" />
      )}

      {/* Roman index */}
      <span className="font-serif text-[32px] italic leading-none tracking-[-0.01em] text-accent">
        {ROMAN[index] ?? String(index + 1)}.
      </span>

      {/* Name + source pain */}
      <div className="min-w-0">
        <h3 className="font-sans text-[18px] font-medium leading-[1.2] tracking-[-0.01em] text-fg">
          {opp.painPointSummary.length > 80 ? `${opp.painPointSummary.slice(0, 77)}…` : opp.painPointSummary}
        </h3>
        <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-[0.04em] text-muted">
          From: {opp.painPointSummary.slice(0, 60)}{opp.painPointSummary.length > 60 ? '…' : ''}
        </span>
      </div>

      {/* Layer A column */}
      <LayerCell glyph={layerA} />

      {/* Layer B column */}
      <LayerCell glyph={layerB} />

      {/* Verdicts column (hidden on mobile) */}
      <div className="hidden grid grid-flow-row gap-1 font-mono text-[10px] tracking-[0.04em] text-muted lg:grid">
        <div className="flex justify-between">
          <span>Agent</span>
          <span className={verdictTone(opp.agentVerdict, false)}>{agentVerdict}</span>
        </div>
        <div className="flex justify-between">
          <span>You</span>
          <span className={verdictTone(opp.founderVerdict, true)}>{founderVerdict}</span>
        </div>
      </div>

      {/* Arrow */}
      <span aria-hidden="true" className="hidden text-right font-sans text-[24px] text-muted transition-[transform,color] duration-200 lg:block">
        →
      </span>
    </button>
  );
}

function LayerCell({ glyph }: { glyph: LayerGlyph }) {
  const glyphColor =
    glyph.tone === 'accent' ? 'text-accent' :
    glyph.tone === 'contra' ? 'text-accent' :
                              'text-muted';
  const strengthColor =
    glyph.tone === 'accent' ? 'text-accent' :
    glyph.tone === 'contra' ? 'text-accent' :
                              'text-muted';
  return (
    <div className="flex flex-col gap-1 font-mono text-[10.5px] tracking-[0.04em] text-muted">
      <span className="text-[9px] uppercase tracking-[0.14em] text-muted-2">{glyph.label}</span>
      <span className={`text-[14px] tracking-[2px] leading-none ${glyphColor}`}>{glyph.dots}</span>
      <span className={strengthColor}>{glyph.strength}</span>
    </div>
  );
}

function verdictLabel(v: OpportunityEvaluation['agentVerdict']): string {
  if (v === 'pending') return '—';
  return VERDICT_SHORT_LABELS[v as OpportunityVerdict];
}

function verdictTone(v: string | null, isFounder: boolean): string {
  // `agentVerdict` widens to string in the schema (it carries the
  // enum + 'pending' sentinel), so the parameter accepts any string —
  // the runtime branches map both founder + agent verdicts cleanly.
  if (v === null || v === 'pending') return 'text-muted';
  if (v === 'drop') return 'text-muted';
  if (v === 'pursue_with_caveats') return 'text-amber';
  // pursue
  return isFounder ? 'text-accent uppercase tracking-[0.14em]' : 'text-fg uppercase tracking-[0.14em]';
}
