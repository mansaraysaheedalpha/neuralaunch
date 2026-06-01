'use client';
// src/components/institute/tools/research/StepTrail.tsx
//
// The signature UX of the Research Tool — a live ~25-step trail that
// makes Opus's research work visible. The engine itself doesn't emit
// step events to the client today (it runs server-side under
// stepCountIs(25) and only resolves at completion via Inngest), so
// the trail is a representative animation that paces the founder
// through the job's typical 60–120s duration.
//
// When the underlying job reaches stage='complete', the trail freezes
// at the highest step it reached, flips active → done, and the count
// switches to "{n} steps · done". Engine plumbing for real step
// events is a worth-doing follow-up — see PR 15-Research notes.
//
// The parent is responsible for KEYING this component by `query` so a
// fresh research run remounts it (and re-initialises activeIdx → 0
// naturally) without needing an effect that sets state. See
// /tools/research/page.tsx for the wiring.

import { useEffect, useRef, useState } from 'react';

export interface StepTrailProps {
  query:    string;
  /** When true, the trail freezes at the current step and shows "done". */
  complete: boolean;
  /** Approximate total step budget — drives the "/ ~25" denominator. */
  budget?:  number;
}

type Phase = 'plan' | 'web' | 'fetch' | 'extract' | 'verify' | 'gap' | 'caution' | 'score' | 'write';

interface RepStep {
  label:  string;
  phase:  Phase;
  source?: string;
}

/**
 * Representative step trail. ~25 entries paced so an average run hits
 * the score/write phase right around the time the engine emits the
 * final report. Source suffixes are generic — they don't claim to
 * name real domains the engine visited, because the engine doesn't
 * expose that to the client. Honest framing: this is a process
 * indicator, not a research log.
 */
const REP_STEPS: RepStep[] = [
  { phase: 'plan',    label: 'Decompose query into sub-questions' },
  { phase: 'plan',    label: 'Identify entities + geographic scope' },
  { phase: 'web',     label: 'Search · primary sources',     source: 'multi-provider' },
  { phase: 'web',     label: 'Search · industry references', source: 'multi-provider' },
  { phase: 'fetch',   label: 'Read · authoritative documents' },
  { phase: 'extract', label: 'Extract · entity boundaries' },
  { phase: 'web',     label: 'Search · pricing benchmarks',  source: 'multi-provider' },
  { phase: 'verify',  label: 'Cross-check · multi-source corroboration' },
  { phase: 'web',     label: 'Search · regulatory disclaimers' },
  { phase: 'fetch',   label: 'Read · primary regulation drafts' },
  { phase: 'caution', label: 'Flag · draft-vs-final uncertainty' },
  { phase: 'web',     label: 'Search · relevant act sections' },
  { phase: 'fetch',   label: 'Read · cited section in full' },
  { phase: 'verify',  label: 'Check · edge cases + exceptions' },
  { phase: 'gap',     label: 'No authoritative ruling found · partial' },
  { phase: 'web',     label: 'Search · competitor catalogue' },
  { phase: 'extract', label: 'Extract · competitive offerings' },
  { phase: 'verify',  label: 'Verify · contact info publicly available' },
  { phase: 'fetch',   label: 'Read · trade-press coverage' },
  { phase: 'extract', label: 'Extract · market signals + sentiment' },
  { phase: 'caution', label: 'Note · coverage thin in target geography' },
  { phase: 'score',   label: 'Assign · confidence labels (verified / likely / unverified)' },
  { phase: 'score',   label: 'Score · roadmap connection strength' },
  { phase: 'write',   label: 'Compose · synthesis + suggested next steps' },
  { phase: 'write',   label: 'Emit · structured findings JSON' },
];

const PHASE_LABEL: Record<Phase, string> = {
  plan: 'plan', web: 'web', fetch: 'fetch', extract: 'extract',
  verify: 'verify', gap: 'gap', caution: 'caution', score: 'score', write: 'write',
};

/** Total animation duration target — matches the typical engine run. */
const TARGET_MS = 90_000;
const STEP_MS   = Math.floor(TARGET_MS / REP_STEPS.length);

export function StepTrail({ query, complete, budget = 25 }: StepTrailProps) {
  const [activeIdx, setActiveIdx] = useState(0);

  // Live mirror of `complete` so the timer callback can read the
  // current value without depending on the effect's stale closure
  // (and without re-running the effect, which would reset the timer).
  // The ref is updated in an effect (not during render) so React's
  // strict-mode rules don't flag a render-phase mutation.
  const completeRef = useRef(complete);
  useEffect(() => { completeRef.current = complete; }, [complete]);

  // Single timer subscription — set up once on mount. The callback
  // checks completeRef each tick: if complete flipped true, it
  // advances to the last step and clears itself. This sidesteps
  // react-hooks/set-state-in-effect (no setState in an effect body
  // outside the subscription callback, which is the rule's
  // "subscribe for updates from some external system" exception).
  useEffect(() => {
    const id = setInterval(() => {
      setActiveIdx(prev => {
        if (completeRef.current) {
          // Engine reported done — jump to the last step and let the
          // outer setInterval keep ticking; below we self-clear.
          if (prev < REP_STEPS.length - 1) return REP_STEPS.length - 1;
          clearInterval(id);
          return prev;
        }
        // Stop one short of the final step so the engine's actual
        // completion advances it the last increment — feels like the
        // trail finished BECAUSE the work finished, not by timer.
        if (prev >= REP_STEPS.length - 2) {
          clearInterval(id);
          return prev;
        }
        return prev + 1;
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  // What we DISPLAY. Before completion: through activeIdx. After
  // completion: every step. Caps at budget either way (a smaller
  // budget like 10 for follow-ups still surfaces sanely).
  const displayUpTo = complete ? REP_STEPS.length - 1 : activeIdx;
  const visible = REP_STEPS.slice(0, displayUpTo + 1);

  // Header count — climbing during run, frozen at the displayed step
  // count once the engine reports complete.
  const headerCount = complete ? visible.length : Math.min(visible.length, budget);
  const headerSuffix = complete ? `${headerCount} steps · done` : `Step ${headerCount} / ~${budget}`;

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-3.5">
        <p className="max-w-[80%] truncate font-serif italic text-[18px] leading-snug text-fg">
          {query}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          {headerSuffix}
        </p>
      </div>

      <ol className="flex flex-col" aria-live="polite">
        {visible.map((s, i) => {
          const isActive = !complete && i === activeIdx;
          const isDone   = complete || i < activeIdx;
          return (
            <li
              key={i}
              className="grid grid-cols-[24px_1fr_auto] items-baseline gap-3 border-b border-rule py-[11px] animate-in fade-in slide-in-from-bottom-1 duration-300"
            >
              <Glyph active={isActive} done={isDone} />
              <span className={[
                'text-[13.5px] leading-snug',
                isDone ? 'text-fg' : 'text-fg-2',
              ].join(' ')}>
                {s.label}
                {s.source && (
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    · {s.source}
                  </span>
                )}
              </span>
              <span className={[
                'font-mono text-[9px] uppercase tracking-[0.10em]',
                isActive ? 'text-accent' : isDone ? 'text-muted' : 'text-muted-2',
              ].join(' ')}>
                {isDone && !isActive ? 'done' : PHASE_LABEL[s.phase]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Glyph({ active, done }: { active: boolean; done: boolean }) {
  if (active) {
    return (
      <span
        aria-hidden="true"
        className="inline-block font-mono text-[10px] text-accent"
        style={{ animation: 'pulse 1.2s ease-in-out infinite' }}
      >
        ◐
      </span>
    );
  }
  if (done) {
    return <span aria-hidden="true" className="inline-block font-mono text-[10px] text-accent">●</span>;
  }
  return <span aria-hidden="true" className="inline-block font-mono text-[10px] text-muted-2">○</span>;
}
