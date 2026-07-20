'use client';

import type { StoredRoadmapPhase } from '@/lib/roadmap/checkin-types';

/**
 * PhaseRail — vertical phase navigator (left sticky column). Distinct
 * from the horizontal interview <PhaseLadder>. Roman index + phase
 * name + completion %; active phase gets an accent left-border. Visual
 * grammar: roadmap.html .phase-rail.
 */
export interface PhaseRailProps {
  phases: StoredRoadmapPhase[];
  /** Currently-selected phase number. */
  selected: number;
  onSelect: (phase: number) => void;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export function PhaseRail({ phases, selected, onSelect }: PhaseRailProps) {
  return (
    <nav className="lg:sticky lg:top-14 lg:self-start" aria-label="Phases">
      <label htmlFor="mobile-phase-select" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted lg:hidden">
        Phases
      </label>
      <select
        id="mobile-phase-select"
        value={selected}
        onChange={(event) => onSelect(Number(event.target.value))}
        className="min-h-11 w-full border border-rule-strong bg-bg px-3 font-mono text-[11px] uppercase tracking-[0.1em] text-fg lg:hidden"
      >
        {phases.map((phase, index) => (
          <option key={phase.phase} value={phase.phase}>
            {ROMAN[index] ?? phase.phase}. {phase.title}
          </option>
        ))}
      </select>
      <div className="mb-[18px] hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted lg:block">
        Phases
      </div>
      <ol className="hidden gap-0.5 lg:grid">
        {phases.map((p, i) => {
          const total = p.tasks.length;
          const done = p.tasks.filter((t) => t.status === 'completed').length;
          const pct = total === 0 ? 0 : Math.round((done / total) * 100);
          const active = p.phase === selected;
          return (
            <li key={p.phase}>
              <button
                type="button"
                onClick={() => onSelect(p.phase)}
                aria-current={active ? 'true' : undefined}
                className={[
                  'flex w-full items-center gap-3.5 px-3.5 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.12em] transition-colors',
                  active
                    ? 'border-l-2 border-accent bg-accent/5 pl-3 text-fg'
                    : 'text-muted hover:text-fg',
                ].join(' ')}
              >
                <span className="font-serif text-[16px] not-italic [font-style:italic] normal-case text-accent">
                  {ROMAN[i] ?? p.phase}.
                </span>
                <span className="truncate normal-case tracking-normal">{p.title}</span>
                <span className="ml-auto text-[9px] text-muted-2">{pct}%</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
