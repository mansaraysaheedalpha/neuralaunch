'use client';
// src/components/institute/no-idea/DotScore.tsx
//
// Five-pip interactive scorer for one scoring axis (Intensity /
// Frequency / Niche). Click a dot to set the score 1-5. Clicking the
// last "on" dot toggles down by one (the reference's UX — definitive
// + reversible without dragging).

export interface DotScoreProps {
  /** Mono-caps axis label, 60px column on the left. */
  label: string;
  /** 0 = unscored. 1-5 = founder's score. */
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}

const PIPS = [1, 2, 3, 4, 5] as const;

export function DotScore({ label, value, onChange, disabled }: DotScoreProps) {
  return (
    <div className="grid grid-cols-[60px_1fr] items-center gap-2 font-mono text-[9px] uppercase tracking-[0.04em] text-muted">
      <span>{label}</span>
      <div className="flex gap-[3px]" role="group" aria-label={`${label} score`}>
        {PIPS.map((n) => {
          const on = n <= value;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => {
                // Reference UX: clicking the highest "on" dot toggles
                // the score down by one — lets the founder reverse
                // without dragging. Clicking any other dot sets the
                // score to that pip.
                const next = on && n === value ? n - 1 : n;
                if (next !== value) onChange(next);
              }}
              aria-pressed={on}
              aria-label={`${label} ${n} of 5`}
              className={[
                'size-[9px] rounded-full border transition-all',
                on ? 'border-accent bg-accent' : 'border-rule-strong hover:border-accent',
                disabled ? 'cursor-not-allowed opacity-50' : '',
              ].join(' ')}
            />
          );
        })}
      </div>
    </div>
  );
}
