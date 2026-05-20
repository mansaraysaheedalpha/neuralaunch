'use client';

import { RadarIcon, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <section className="space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Layer A — agent research</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Four dimensions, ~30 seconds. I research market signal, customer reachability, willingness to pay, and rough size.
          </p>
        </div>
        {!readOnly && onDerive && (
          <Button
            type="button"
            size="sm"
            onClick={() => void onDerive()}
            disabled={deriving}
          >
            {deriving ? (
              <>
                <RefreshCw className="size-3 mr-1 animate-spin" />
                Researching…
              </>
            ) : research === null ? (
              <>
                <RadarIcon className="size-3 mr-1" />
                Run research
              </>
            ) : (
              <>
                <RefreshCw className="size-3 mr-1" />
                Re-run
              </>
            )}
          </Button>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
