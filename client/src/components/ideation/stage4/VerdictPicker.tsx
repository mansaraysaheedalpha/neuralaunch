'use client';

import { Check, X, AlertTriangle, HelpCircle } from 'lucide-react';
import { OPPORTUNITY_VERDICTS, type OpportunityVerdict } from '@neuralaunch/constants';
import { VERDICT_SHORT_LABELS } from './labels';

export interface VerdictPickerProps {
  current?:   OpportunityVerdict | null;
  disabled?:  boolean;
  /** Returns the founder's chosen verdict for this opportunity. */
  onPick:     (verdict: OpportunityVerdict) => Promise<void>;
}

/**
 * Three-button verdict picker — pursue / pursue_with_caveats / drop.
 * Founder can change their pick freely until commit; re-clicking the
 * same verdict is a no-op at the route layer (idempotent persist).
 */
export function VerdictPicker({ current, disabled, onPick }: VerdictPickerProps) {
  const handle = (v: OpportunityVerdict) => {
    if (disabled) return;
    void onPick(v);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {OPPORTUNITY_VERDICTS.map(v => {
        const active = current === v;
        return (
          <button
            key={v}
            type="button"
            disabled={disabled}
            onClick={() => handle(v)}
            aria-pressed={active}
            className={[
              'inline-flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors disabled:opacity-50',
              active
                ? 'border-accent bg-accent text-bg'
                : 'border-rule-strong text-fg hover:border-accent hover:text-accent',
            ].join(' ')}
          >
            {iconFor(v)}
            {VERDICT_SHORT_LABELS[v]}
          </button>
        );
      })}
    </div>
  );
}

function iconFor(v: OpportunityVerdict) {
  if (v === 'pursue')              return <Check          aria-hidden="true" className="size-3" />;
  if (v === 'pursue_with_caveats') return <AlertTriangle  aria-hidden="true" className="size-3" />;
  if (v === 'needs_more_evidence') return <HelpCircle     aria-hidden="true" className="size-3" />;
  return                                  <X              aria-hidden="true" className="size-3" />;
}
