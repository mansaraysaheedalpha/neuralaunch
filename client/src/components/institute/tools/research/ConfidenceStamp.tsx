// src/components/institute/tools/research/ConfidenceStamp.tsx
//
// Per-finding confidence chip. Mono caps + filled dot + thin border.
// Dot colours match the continuation evidence ledger's signal palette
// so the three trust levels read the same across the app.

import type { ConfidenceLevel } from '@/lib/roadmap/research-tool/constants';

export interface ConfidenceStampProps {
  level: ConfidenceLevel;
}

const VARIANT: Record<ConfidenceLevel, { dot: string; text: string; border: string }> = {
  verified:   { dot: 'bg-success', text: 'text-success', border: 'border-success/40'   },
  likely:     { dot: 'bg-amber',   text: 'text-amber',   border: 'border-amber/40'     },
  unverified: { dot: 'bg-muted',   text: 'text-muted',   border: 'border-rule-strong'  },
};

const LABEL: Record<ConfidenceLevel, string> = {
  verified:   'Verified',
  likely:     'Likely',
  unverified: 'Unverified',
};

export function ConfidenceStamp({ level }: ConfidenceStampProps) {
  const v = VARIANT[level];
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 border px-[9px] py-[5px] font-mono text-[9px] uppercase tracking-[0.14em]',
        v.border,
        v.text,
      ].join(' ')}
    >
      <span aria-hidden="true" className={['size-1.5 rounded-full', v.dot].join(' ')} />
      {LABEL[level]}
    </span>
  );
}
