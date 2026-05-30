'use client';
// src/components/institute/no-idea/PainLedger.tsx
//
// The unified pain ledger. Single ledger of scout + founder pains.
// Roman numerals are continuous (i. through xiv.) so scout-surfaced
// and founder-added pains are distinguished by source LABEL, not by
// being in different columns.

import type { PainPoint } from '@/lib/ideation/stage3-opportunities/schema';
import { PainRow } from './PainRow';

const ROMAN_LOWER = [
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii',
  'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv',
  'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx',
];

export interface PainLedgerProps {
  pains:   PainPoint[];
  onScore: (input: { id: string; intensity: number; frequency: number; nicheSpecificity: number }) => void;
  onRemove: (id: string) => void;
  readOnly?: boolean;
}

export function PainLedger({ pains, onScore, onRemove, readOnly }: PainLedgerProps) {
  return (
    <div>
      <div className="grid grid-cols-[40px_1fr] items-end gap-3 border-b border-rule pb-3.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted lg:grid-cols-[60px_1fr_200px_80px] lg:gap-5">
        <div>Pain · {pains.length} surfaced</div>
        <div>
          Statement · <span className="text-accent">signal strength by weight</span>
        </div>
        <div className="hidden lg:block">Intensity · Frequency · Niche</div>
        <div className="hidden text-right lg:block">Verdict</div>
      </div>
      {pains.length === 0 ? (
        <div className="border-b border-rule py-10 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          No pains yet. Run the scout or add one personally.
        </div>
      ) : (
        pains.map((pp, i) => (
          <PainRow
            key={pp.id}
            pp={pp}
            roman={`${ROMAN_LOWER[i] ?? String(i + 1)}.`}
            onScore={onScore}
            onRemove={onRemove}
            readOnly={readOnly}
          />
        ))
      )}
    </div>
  );
}
