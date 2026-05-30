'use client';
// src/components/institute/no-idea/StructuralBlocker.tsx
//
// Right-rail panel that surfaces when too many demanded-Strong skills
// sit below adequate across the founder + teammates. Amber stamp,
// honest copy, three path choices as hairline buttons. Visual grammar:
// stage-2.html .blocker.
//
// The choices are presentational defaults — the consumer wires them
// to whatever branching path the existing Stage 2 supports (calibration
// chat seed message, teammate add flow, etc.). When no `onChoose` is
// passed, the buttons are visible but inert.

export type StructuralBlockerChoice = 'teammate' | 'use_strengths' | 'build_skills';

export interface StructuralBlockerProps {
  /**
   * Count of critical demanded-Strong skills where the
   * across-team-strongest tier is below adequate (i.e. bad or unknown).
   * Renders nothing when 0.
   */
  count: number;
  onChoose?: (choice: StructuralBlockerChoice) => void;
}

const CHOICES = [
  { id: 'teammate'      as const, label: 'Bring on a teammate',                              key: 'i'   },
  { id: 'use_strengths' as const, label: 'Pick a path that uses your existing strengths',   key: 'ii'  },
  { id: 'build_skills'  as const, label: 'Build the missing skills — slower start',          key: 'iii' },
];

export function StructuralBlocker({ count, onChoose }: StructuralBlockerProps) {
  if (count <= 0) return null;
  return (
    <div className="border border-rule bg-bg-2 px-5 py-[18px]">
      <div className="mb-3.5 flex justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        <span>Structural blocker</span>
        <span className="text-amber">Detected</span>
      </div>
      <p className="mb-3.5 text-[13px] leading-[1.55] text-fg-2">
        <b className="font-medium text-amber">
          {count} demanded-Strong skill{count === 1 ? '' : 's'} below adequate.
        </b>{' '}
        This is the structural mismatch we&rsquo;ll plan around in Stage III. Three honest paths from here —
      </p>
      <div className="grid gap-1.5">
        {CHOICES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChoose?.(c.id)}
            disabled={!onChoose}
            className="flex items-center justify-between border border-rule-strong px-3 py-2.5 text-left text-[12px] text-fg-2 transition-colors hover:border-accent hover:text-fg disabled:hover:border-rule-strong disabled:hover:text-fg-2"
          >
            <span>{c.label}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">{c.key}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
