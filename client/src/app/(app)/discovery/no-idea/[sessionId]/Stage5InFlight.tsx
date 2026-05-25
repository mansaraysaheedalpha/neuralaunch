'use client';
// src/app/(app)/discovery/no-idea/[sessionId]/Stage5InFlight.tsx
//
// Polling-state UI for the Stage 5 worker. Renders the four-phase
// vertical checklist + elapsed counter + reassurance line.
//
// Copy locked in docs/stage5-copy-review.md § B. The four phase labels
// are explicit per B.2; the elapsed counter formats per B.3.
//
// No cancel button — per B.5 the worker is bounded; founders close the
// tab to "abort".

import { useEffect, useState } from 'react';
import { Check, Loader2, Clock } from 'lucide-react';
import type { Stage5JobStage } from '@/lib/ideation/stage5-handoff/use-stage5-job';

interface Stage5InFlightProps {
  stage: Stage5JobStage;
}

interface PhaseSpec {
  key:   Stage5JobStage;
  label: string;
  hint?: string;
}

// Order-of-appearance is what the founder sees as the worker progresses.
// 'queued' is rendered as the "Queued" pre-step; the worker moves to
// 'loading_inputs' as soon as it picks up the event.
const PHASES: PhaseSpec[] = [
  { key: 'queued',         label: 'Queued.' },
  { key: 'loading_inputs', label: 'Reading your Stage 1-4 evidence.' },
  { key: 'synthesizing',   label: 'Reasoning across everything you’ve built',
                           hint:  '(this is the longest step)' },
  { key: 'persisting',     label: 'Saving your recommendation.' },
];

function phaseIndex(stage: Stage5JobStage): number {
  // Terminal stages aren't shown by this component (the parent flips
  // to Stage5Success or Stage5Failure first). Defensively treat them
  // as past the last phase.
  if (stage === 'succeeded' || stage === 'failed') return PHASES.length;
  return PHASES.findIndex(p => p.key === stage);
}

/** Format seconds-elapsed for the elapsed line — singular/plural aware. */
function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe < 60) {
    return `Elapsed: ${safe} second${safe === 1 ? '' : 's'}`;
  }
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  const minutes = `${m} minute${m === 1 ? '' : 's'}`;
  if (s === 0) return `Elapsed: ${minutes}`;
  const sec = `${s} second${s === 1 ? '' : 's'}`;
  return `Elapsed: ${minutes}, ${sec}`;
}

export function Stage5InFlight({ stage }: Stage5InFlightProps) {
  const [elapsed, setElapsed] = useState<number>(0);
  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  const currentIdx = phaseIndex(stage);

  return (
    <section className="rounded-lg border border-border bg-card/40 px-4 py-5 space-y-4">
      <h2 className="text-base font-semibold text-foreground">
        Synthesizing your handoff
      </h2>

      <ul className="space-y-2">
        {PHASES.map((p, i) => {
          const isDone    = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <li key={p.key} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 shrink-0">
                {isDone ? (
                  <Check className="size-4 text-success" />
                ) : isCurrent ? (
                  <Loader2 className="size-4 text-primary animate-spin" />
                ) : (
                  <span className="block size-4 rounded-full border border-border" />
                )}
              </span>
              <span className={isDone || isCurrent ? 'text-foreground' : 'text-muted-foreground'}>
                {p.label}
                {p.hint && (
                  <span className="text-muted-foreground"> {p.hint}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border pt-3">
        <Clock className="size-3.5" />
        <span>{formatElapsed(elapsed)}</span>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        This runs on our servers — you can leave this page open or close it and come back. Your handoff will be waiting.
      </p>
    </section>
  );
}
