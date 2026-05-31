'use client';

import { Check, X, AlertTriangle, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  const variantFor = (v: OpportunityVerdict) => current === v ? 'default' : 'outline';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {OPPORTUNITY_VERDICTS.map(v => (
        <Button
          key={v}
          type="button"
          variant={variantFor(v)}
          size="sm"
          disabled={disabled}
          onClick={() => handle(v)}
          aria-pressed={current === v}
        >
          {iconFor(v)}
          {VERDICT_SHORT_LABELS[v]}
        </Button>
      ))}
    </div>
  );
}

function iconFor(v: OpportunityVerdict) {
  if (v === 'pursue')              return <Check          className="size-3 mr-1" />;
  if (v === 'pursue_with_caveats') return <AlertTriangle  className="size-3 mr-1" />;
  if (v === 'needs_more_evidence') return <HelpCircle     className="size-3 mr-1" />;
  return                                  <X              className="size-3 mr-1" />;
}
