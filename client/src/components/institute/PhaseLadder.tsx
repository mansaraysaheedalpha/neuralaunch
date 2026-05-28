import type { ReactNode } from 'react';

/**
 * Institute phase ladder.
 *
 * Horizontal step ladder rendered at the top of a stage column —
 * Discovery's Orientation · Goals · Constraints · Conviction ·
 * Synthesis, but generic over any ordered phase list. Visual grammar:
 * discovery-a.html .ladder.
 *
 * Per node:
 *   • done    → filled accent dot
 *   • current → filled accent dot with a 4px outer glow ring + --fg label
 *   • pending → open hairline ring + --muted label
 *
 * Reuse contract — drops into No-Idea stages and the Stuck-founder
 * diagnostic (PR 09) unchanged: pass that pipeline's own phase labels
 * and the active index.
 */

export interface PhaseLadderProps {
  /** Ordered phase labels, left → right. */
  phases: string[];
  /**
   * Zero-based index of the current phase. Nodes before it render
   * "done", the node at it renders "current", nodes after render
   * "pending". Pass phases.length to mark every node done (terminal).
   */
  currentIndex: number;
  /** Optional className appended to the root. */
  className?: string;
}

export function PhaseLadder({ phases, currentIndex, className }: PhaseLadderProps): ReactNode {
  return (
    <div
      className={[
        'flex flex-wrap items-center gap-x-7 gap-y-3',
        'font-mono text-[11px] uppercase tracking-[0.14em] text-muted',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      {phases.map((label, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <div key={`${label}-${i}`} className="flex items-center gap-7">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={[
                  'inline-block size-2 rounded-full border',
                  done || current ? 'border-accent bg-accent' : 'border-rule-strong',
                ].join(' ')}
                style={
                  current
                    ? { boxShadow: '0 0 0 4px rgba(255,90,60,0.16)' }
                    : undefined
                }
              />
              <span className={current ? 'text-fg' : undefined}>{label}</span>
            </div>
            {i < phases.length - 1 && (
              <span aria-hidden="true" className="h-px w-6 bg-rule" />
            )}
          </div>
        );
      })}
    </div>
  );
}
