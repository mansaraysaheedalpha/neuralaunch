// src/components/institute/no-idea/ReservesLedger.tsx
//
// Stage 5 reserves ledger. Lists the four un-chosen Stage 4
// opportunities held for continuation — each carries a roman index, an
// italic-serif name + source pain, and a validation-strength stamp
// colour-coded by Layer B strength. The reserves don't run synthesis
// now; they wait, and the continuation brief surfaces them as forks.

import type { ReserveOpportunity } from '@/lib/ideation/stage5-handoff/schema';
import { VALIDATION_STRENGTH_LABELS } from '@/components/ideation/stage4/labels';

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi'];

const STRENGTH_GLYPH: Record<string, string> = {
  strong:        '●●●●',
  mixed:         '●●●○',
  weak:          '●●○○',
  contradictory: '●○○○',
};
const STRENGTH_TONE: Record<string, string> = {
  strong:        'text-success',
  mixed:         'text-amber',
  weak:          'text-muted',
  contradictory: 'text-muted',
};

export interface ReservesLedgerProps {
  reserves: ReadonlyArray<ReserveOpportunity>;
}

export function ReservesLedger({ reserves }: ReservesLedgerProps) {
  // Sort by rank (1 = top reserve) — schema doesn't guarantee insertion
  // order matches rank, so sort defensively.
  const sorted = [...reserves].sort((a, b) => a.rank - b.rank);
  return (
    <aside className="pt-2">
      <div className="mb-[18px] flex justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        <span>Held for continuation · {sorted.length}</span>
        <span className="text-accent">Snapshotted</span>
      </div>
      <h3 className="mb-[18px] font-serif text-[24px] font-normal italic leading-[1.2] tracking-[-0.015em] text-fg [&_em]:text-accent">
        The <em>{sorted.length === 1 ? 'one' : sorted.length === 2 ? 'two' : sorted.length === 3 ? 'three' : 'four'} reserves.</em>
      </h3>

      {sorted.length === 0 ? (
        <p className="border-t border-rule pt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          No reserves — every Stage 4 opportunity was either advanced or dropped.
        </p>
      ) : (
        <div className="grid border-t border-rule">
          {sorted.map((r, i) => {
            const strength = r.layerBSummary?.validationStrength;
            const glyph = strength ? STRENGTH_GLYPH[strength] ?? '○○○○' : '○○○○';
            const label = strength ? VALIDATION_STRENGTH_LABELS[strength] : 'Not run';
            const tone = strength ? STRENGTH_TONE[strength] ?? 'text-muted' : 'text-muted';
            return (
              <div
                key={r.id}
                className={`grid grid-cols-[auto_1fr_auto] items-baseline gap-3.5 py-[18px] ${i === sorted.length - 1 ? '' : 'border-b border-rule'}`}
              >
                <span className="font-serif text-[20px] italic leading-none tracking-[-0.01em] text-accent">
                  {ROMAN[i] ?? String(i + 1)}.
                </span>
                <span className="font-serif text-[18px] italic leading-[1.25] text-fg">
                  {r.painPointSummary}
                  <span className="mt-1 block font-mono text-[9px] not-italic uppercase tracking-[0.14em] text-muted">
                    From: {truncate(r.painPointSummary, 60)}
                  </span>
                </span>
                <span className={`font-mono text-[10px] uppercase tracking-[0.14em] ${tone}`}>
                  {glyph} {label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-[18px] font-mono text-[10.5px] leading-[1.6] tracking-[0.04em] text-muted">
        Held in the continuation brief — surfaced as forks when Cycle I
        ends. Reserves do not run synthesis now; they wait.
      </p>
    </aside>
  );
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}
