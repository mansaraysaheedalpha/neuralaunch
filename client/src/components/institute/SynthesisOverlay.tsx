'use client';

import type { ReactNode } from 'react';

/**
 * Institute synthesis overlay.
 *
 * Absolutely-positioned overlay rendered on top of a stage column when
 * a pipeline reaches its terminal "generating the output" state —
 * Discovery synthesising the recommendation, No-Idea Stage 5 synthesis,
 * Stuck-founder closing. Backdrop-blurred 94%-opacity bg; centred panel
 * with a mono stamp, a serif-italic headline, one body line, and a
 * mono-bullet step list. Visual grammar: discovery-a.html .synth-overlay.
 *
 * The overlay covers ONLY its positioned parent — mount it inside the
 * stage column so the belief rail keeps showing its final state.
 *
 * Reuse contract — generic over the step list + copy, so the three
 * synthesis surfaces share one component.
 */

export type SynthesisStepState = 'done' | 'active' | 'pending';

export interface SynthesisStep {
  /** Step label, e.g. "Final synthesis · Opus 4.6". */
  label: string;
  state: SynthesisStepState;
}

export interface SynthesisOverlayProps {
  /** When false, the overlay is not rendered. */
  open: boolean;
  /** Mono stamp above the headline. Default "Synthesising". */
  stamp?: string;
  /** Headline — ReactNode for italic-serif accents. */
  heading: ReactNode;
  /** One body line beneath the headline. */
  body?: ReactNode;
  /** Ordered progress steps. */
  steps: SynthesisStep[];
}

export function SynthesisOverlay({
  open,
  stamp = 'Synthesising',
  heading,
  body,
  steps,
}: SynthesisOverlayProps) {
  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-md"
      style={{ background: 'rgba(10,10,12,0.94)' }}
    >
      <div className="max-w-[480px] px-6 text-center">
        <p className="mb-[18px] font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
          {stamp}
        </p>
        <h3 className="mb-3.5 font-sans text-[34px] font-medium leading-[1.1] tracking-[-0.02em] text-fg [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
          {heading}
        </h3>
        {body && <p className="mb-[22px] text-fg-2">{body}</p>}
        <div className="grid gap-2 text-left font-mono text-[12px] text-muted">
          {steps.map((step, i) => (
            <div
              key={`${step.label}-${i}`}
              className={[
                'flex items-center gap-2.5',
                step.state === 'done' || step.state === 'active' ? 'text-fg' : '',
              ].filter(Boolean).join(' ')}
            >
              <span
                aria-hidden="true"
                className={[
                  'inline-flex size-3 items-center justify-center',
                  step.state === 'pending' ? 'text-muted' : 'text-accent',
                ].join(' ')}
              >
                {step.state === 'pending' ? '○' : '●'}
              </span>
              <span
                className={
                  step.state === 'active' ? 'animate-pulse' : undefined
                }
                style={step.state === 'active' ? { animationDuration: '1.4s' } : undefined}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
