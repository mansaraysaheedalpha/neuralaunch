'use client';

import { RadarIcon, RefreshCw } from 'lucide-react';
import type { LayerAResearch } from '@/lib/ideation/stage4-opportunities/schema';
import { LAYER_A_DIMENSIONS } from '@/lib/ideation/stage4-opportunities/constants';
import { DimensionFindingCard } from './DimensionFindingCard';

export interface LayerASectionProps {
  research:     LayerAResearch | null;
  deriving:     boolean;
  readOnly?:    boolean;
  onDerive?:    () => Promise<void>;
}

/**
 * Layer A research surface for one opportunity. Four DimensionFinding
 * cards in a 2-column grid + a Run / Re-run button. The Run button is
 * the founder's path to firing /derive-opportunity-research for this
 * opportunity. When research is in flight, the founder sees a
 * deriving state with a clear "this takes ~30 seconds" hint.
 */
export function LayerASection({ research, deriving, readOnly, onDerive }: LayerASectionProps) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Layer A · agent research
          </p>
          <p className="max-w-[640px] text-[13px] leading-[1.55] text-fg-2">
            Four dimensions · ~30 seconds. We research market signal, customer reachability, willingness to pay, and rough size.
          </p>
        </div>
        {!readOnly && onDerive && (
          <button
            type="button"
            onClick={() => void onDerive()}
            disabled={deriving}
            className="inline-flex items-center gap-2 border border-rule-strong px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {deriving
              ? <><RefreshCw aria-hidden="true" className="size-3 animate-spin" />Researching…</>
              : research === null
                ? <><RadarIcon aria-hidden="true" className="size-3" />Run research</>
                : <><RefreshCw aria-hidden="true" className="size-3" />Re-run</>}
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {LAYER_A_DIMENSIONS.map(d => (
          <DimensionFindingCard
            key={d}
            dimension={d}
            finding={research?.[d] ?? null}
          />
        ))}
      </div>
    </section>
  );
}
